BEGIN;
ALTER TABLE public.mensagens_chat ADD COLUMN secreta boolean NOT NULL DEFAULT false;
ALTER TABLE public.mensagens_chat ADD COLUMN revelada_id uuid REFERENCES public.mensagens_chat(id);
ALTER TABLE public.mensagens_chat ADD CONSTRAINT segredo_sem_resultado CHECK (NOT secreta OR resultado IS NULL);

CREATE TABLE private.rolagens_secretas (
  mensagem_id uuid PRIMARY KEY REFERENCES public.mensagens_chat(id) ON DELETE CASCADE,
  campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  rotulo text NOT NULL,
  resultado jsonb NOT NULL,
  revelada_id uuid REFERENCES public.mensagens_chat(id)
);
ALTER TABLE private.rolagens_secretas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.rolagens_secretas FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.enviar_chat(p_campanha uuid,p_pedido uuid,p_comando jsonb)
RETURNS public.mensagens_chat LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  usuario uuid:=auth.uid(); papel text; recibo private.comandos_chat; mensagem public.mensagens_chat;
  tipo text; texto text:=''; rotulo text:=''; resultado jsonb; acao jsonb; nome text; seq bigint;
  segredo boolean:=false; comando jsonb;
BEGIN
  SELECT m.papel INTO papel FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=usuario FOR SHARE;
  IF usuario IS NULL OR papel IS NULL OR papel NOT IN ('jogador','mestre') THEN
    RAISE EXCEPTION USING ERRCODE='WC002',MESSAGE='Sem permissão para enviar nesta campanha.';
  END IF;
  IF p_pedido IS NULL OR jsonb_typeof(p_comando) IS DISTINCT FROM 'object' OR octet_length(p_comando::text)>16384 THEN
    RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Comando inválido.';
  END IF;
  IF p_comando ? 'secreta' THEN
    IF jsonb_typeof(p_comando->'secreta') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Visibilidade inválida.';
    END IF;
    segredo:=(p_comando->>'secreta')::boolean;
  END IF;
  IF segredo AND papel<>'mestre' THEN
    RAISE EXCEPTION USING ERRCODE='WC002',MESSAGE='Somente mestres podem rolar em segredo.';
  END IF;
  comando:=p_comando-'secreta'; tipo:=comando->>'tipo';
  -- Estas ações alteram estado público (iniciativa/PV). O segredo não pode ser usado
  -- para ocultar o resultado no chat enquanto ele vaza pela mesa ou ficha.
  IF segredo AND (tipo='texto' OR (tipo='acao' AND comando->>'acao' IN ('iniciativa','morte','dado_vida'))) THEN
    RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Esta ação altera a mesa e deve ser pública.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(usuario::text || p_pedido::text,0));
  SELECT * INTO recibo FROM private.comandos_chat WHERE usuario_id=usuario AND pedido_id=p_pedido;
  IF FOUND THEN
    IF recibo.campanha_id<>p_campanha OR recibo.comando<>p_comando THEN
      RAISE EXCEPTION USING ERRCODE='WC004',MESSAGE='Identificador de tentativa já utilizado.';
    END IF;
    SELECT * INTO mensagem FROM public.mensagens_chat WHERE id=recibo.mensagem_id;
    IF mensagem.secreta THEN
      SELECT s.rotulo,s.resultado INTO mensagem.rotulo,mensagem.resultado
        FROM private.rolagens_secretas s WHERE s.mensagem_id=mensagem.id;
    END IF;
    RETURN mensagem;
  END IF;
  PERFORM 1 FROM public.campanhas WHERE id=p_campanha FOR UPDATE;
  IF (SELECT count(*) FROM public.mensagens_chat WHERE campanha_id=p_campanha AND autor_id=usuario AND criado_em>clock_timestamp()-interval '10 seconds')>=30 THEN
    RAISE EXCEPTION USING ERRCODE='WC006',MESSAGE='Aguarde alguns segundos antes de enviar novamente.';
  END IF;
  IF tipo='texto' THEN
    IF comando-ARRAY['tipo','texto']<>'{}'::jsonb OR jsonb_typeof(comando->'texto') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Texto inválido.';
    END IF;
    texto:=btrim(comando->>'texto',E' \t\n\r');
    IF length(texto)<1 OR length(texto)>2000 THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Texto deve ter 1 a 2000 caracteres.'; END IF;
  ELSIF tipo='rolagem' THEN
    IF comando-ARRAY['tipo','expressao','rotulo']<>'{}'::jsonb OR jsonb_typeof(comando->'expressao') IS DISTINCT FROM 'string' OR (comando ? 'rotulo' AND jsonb_typeof(comando->'rotulo') IS DISTINCT FROM 'string') THEN
      RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Rolagem inválida.';
    END IF;
    rotulo:=btrim(coalesce(comando->>'rotulo','Rolagem livre'));
    IF length(rotulo)>120 THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Rótulo muito longo.'; END IF;
    resultado:=private.rolar_dados(comando->>'expressao');
  ELSIF tipo='acao' THEN
    IF comando-ARRAY['tipo','ficha_id','versao','entrada_id','acao','modo']<>'{}'::jsonb OR jsonb_typeof(comando->'ficha_id') IS DISTINCT FROM 'string' OR jsonb_typeof(comando->'entrada_id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Ação inválida.';
    END IF;
    acao:=private.acao_chat(p_campanha,usuario,papel,comando);
    rotulo:=acao->>'rotulo'; resultado:=acao->'resultado';
  ELSE RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Tipo de comando inválido.';
  END IF;
  SELECT coalesce(nullif(btrim(nome_exibicao),''),'Jogador') INTO nome FROM public.perfis WHERE id=usuario;
  SELECT coalesce(max(sequencia),0)+1 INTO seq FROM public.mensagens_chat WHERE campanha_id=p_campanha;
  INSERT INTO public.mensagens_chat(campanha_id,sequencia,autor_id,autor_nome,tipo,texto,rotulo,resultado,secreta)
    VALUES(p_campanha,seq,usuario,left(coalesce(nome,'Jogador'),120),tipo,
      CASE WHEN segredo THEN 'O mestre realizou uma rolagem secreta.' ELSE texto END,
      CASE WHEN segredo THEN 'Rolagem secreta' ELSE rotulo END,
      CASE WHEN segredo THEN NULL ELSE resultado END,segredo) RETURNING * INTO mensagem;
  IF segredo THEN
    INSERT INTO private.rolagens_secretas(mensagem_id,campanha_id,rotulo,resultado) VALUES(mensagem.id,p_campanha,rotulo,resultado);
    -- Apenas a resposta privada da RPC recebe estes campos. Nunca são gravados na
    -- linha pública nem enviados na publicação Realtime.
    mensagem.rotulo:=rotulo; mensagem.resultado:=resultado;
  END IF;
  INSERT INTO private.comandos_chat VALUES(usuario,p_pedido,p_campanha,p_comando,mensagem.id);
  RETURN mensagem;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN
  RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Comando inválido.';
END $$;

CREATE FUNCTION public.ler_segredos_chat(p_campanha uuid,p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE papel text; resultado jsonb;
BEGIN
  SELECT m.papel INTO papel FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=auth.uid() FOR SHARE;
  IF papel IS NULL THEN RAISE EXCEPTION USING ERRCODE='WC002',MESSAGE='Campanha indisponível.'; END IF;
  IF papel<>'mestre' THEN RETURN '[]'::jsonb; END IF;
  IF p_ids IS NULL OR cardinality(p_ids)>100 THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Consulta inválida.'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.mensagem_id,'rotulo',s.rotulo,'resultado',s.resultado,'revelada_id',s.revelada_id)),'[]'::jsonb)
    INTO resultado FROM private.rolagens_secretas s WHERE s.campanha_id=p_campanha AND s.mensagem_id=ANY(p_ids);
  RETURN resultado;
END $$;

CREATE FUNCTION public.revelar_rolagem(p_campanha uuid,p_mensagem uuid)
RETURNS public.mensagens_chat LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE papel text; segredo private.rolagens_secretas; original public.mensagens_chat; mensagem public.mensagens_chat; seq bigint;
BEGIN
  SELECT m.papel INTO papel FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=auth.uid() FOR SHARE;
  IF papel IS DISTINCT FROM 'mestre' THEN RAISE EXCEPTION USING ERRCODE='WC002',MESSAGE='Somente mestres podem revelar.'; END IF;
  PERFORM 1 FROM public.campanhas WHERE id=p_campanha FOR UPDATE;
  SELECT * INTO segredo FROM private.rolagens_secretas WHERE mensagem_id=p_mensagem AND campanha_id=p_campanha FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Rolagem indisponível.'; END IF;
  IF segredo.revelada_id IS NOT NULL THEN
    SELECT * INTO mensagem FROM public.mensagens_chat WHERE id=segredo.revelada_id;
    RETURN mensagem;
  END IF;
  SELECT * INTO original FROM public.mensagens_chat WHERE id=p_mensagem;
  SELECT coalesce(max(sequencia),0)+1 INTO seq FROM public.mensagens_chat WHERE campanha_id=p_campanha;
  -- Uma nova sequência garante a recuperação da revelação por clientes offline.
  INSERT INTO public.mensagens_chat(campanha_id,sequencia,autor_id,autor_nome,tipo,texto,rotulo,resultado)
    VALUES(p_campanha,seq,original.autor_id,original.autor_nome,original.tipo,'Resultado revelado pelo mestre.',segredo.rotulo,segredo.resultado) RETURNING * INTO mensagem;
  UPDATE private.rolagens_secretas SET revelada_id=mensagem.id WHERE mensagem_id=p_mensagem;
  UPDATE public.mensagens_chat SET revelada_id=mensagem.id WHERE id=p_mensagem;
  RETURN mensagem;
END $$;

REVOKE ALL ON FUNCTION public.ler_segredos_chat(uuid,uuid[]), public.revelar_rolagem(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ler_segredos_chat(uuid,uuid[]), public.revelar_rolagem(uuid,uuid) TO authenticated;
COMMIT;
