BEGIN;

CREATE TABLE public.mensagens_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  sequencia bigint NOT NULL CHECK (sequencia > 0),
  autor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  autor_nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('texto','rolagem','acao')),
  texto text NOT NULL DEFAULT '',
  rotulo text NOT NULL DEFAULT '',
  resultado jsonb,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(campanha_id,sequencia)
);
CREATE INDEX mensagens_chat_autor_tempo ON public.mensagens_chat(campanha_id,autor_id,criado_em DESC);
ALTER TABLE public.mensagens_chat ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_membros_leem ON public.mensagens_chat FOR SELECT TO authenticated
  USING (private.papel_na_campanha(campanha_id) IS NOT NULL);
REVOKE ALL ON public.mensagens_chat FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mensagens_chat TO authenticated;

-- Recibos não são publicados nem expostos pela API: somente a RPC acessa esta tabela.
CREATE TABLE private.comandos_chat (
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL,
  campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  comando jsonb NOT NULL,
  mensagem_id uuid NOT NULL REFERENCES public.mensagens_chat(id) ON DELETE CASCADE,
  PRIMARY KEY(usuario_id,pedido_id)
);
-- Sem políticas para clientes: o acesso normal é negado por padrão.
-- A RPC SECURITY DEFINER acessa os recibos como proprietária da tabela.
ALTER TABLE private.comandos_chat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.comandos_chat FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.inteiro_chat(valor jsonb, minimo int, maximo int)
RETURNS int LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE numero int;
BEGIN
  IF jsonb_typeof(valor) IS DISTINCT FROM 'number' OR (valor #>> '{}') !~ '^-?[0-9]{1,10}$' THEN
    RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Valor numérico inválido.';
  END IF;
  numero := (valor #>> '{}')::int;
  IF numero < minimo OR numero > maximo THEN
    RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Valor fora do limite.';
  END IF;
  RETURN numero;
END $$;

CREATE FUNCTION private.rolar_dados(expressao text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  expr text := lower(regexp_replace(expressao,'[[:space:]]','','g'));
  item text[]; dado text[]; n int; faces int; manter int; modo text; sinal int;
  quantidade int := 0; valores int[]; selecionados int[]; subtotal int; total int := 0;
  termos jsonb := '[]'; amostra bigint; limite bigint; i int;
BEGIN
  IF expressao IS NULL OR length(expressao)>120 OR expr !~ '^[+-]?([0-9]{1,3}d[0-9]{1,4}(k[hl][0-9]{1,3})?|[0-9]{1,4})([+-]([0-9]{1,3}d[0-9]{1,4}(k[hl][0-9]{1,3})?|[0-9]{1,4}))*$' THEN
    RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Expressão de dados inválida.';
  END IF;
  FOR item IN SELECT regexp_matches(expr,'([+-]?)([0-9]{1,3}d[0-9]{1,4}(?:k[hl][0-9]{1,3})?|[0-9]{1,4})','g') LOOP
    sinal := CASE WHEN item[1]='-' THEN -1 ELSE 1 END;
    dado := regexp_match(item[2],'^([0-9]+)d([0-9]+)(?:k([hl])([0-9]+))?$');
    IF dado IS NULL THEN
      subtotal := sinal * item[2]::int;
      termos := termos || jsonb_build_array(jsonb_build_object('sinal',sinal,'valor',item[2]::int,'subtotal',subtotal));
    ELSE
      n:=dado[1]::int; faces:=dado[2]::int; modo:=coalesce(dado[3],'h'); manter:=coalesce(dado[4]::int,n);
      quantidade := quantidade + n;
      IF n<1 OR quantidade>100 OR faces<2 OR faces>1000 OR manter<1 OR manter>n THEN
        RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Limite de dados excedido.';
      END IF;
      valores := '{}'; limite := 4294967296 - (4294967296 % faces);
      FOR i IN 1..n LOOP
        LOOP
          -- Os primeiros 4 bytes são aleatórios; bits de versão/variante ficam em outros bytes.
          -- Rejeitar a cauda evita viés de módulo. gen_random_uuid usa pg_strong_random.
          amostra := ('x' || substr(gen_random_uuid()::text,1,8))::bit(32)::bigint;
          EXIT WHEN amostra < limite;
        END LOOP;
        valores := array_append(valores,(amostra % faces)::int+1);
      END LOOP;
      SELECT array_agg(idx ORDER BY idx) INTO selecionados FROM (
        SELECT ord::int AS idx FROM unnest(valores) WITH ORDINALITY AS v(valor,ord)
        ORDER BY (CASE WHEN modo='l' THEN -valor ELSE valor END) DESC,ord LIMIT manter
      ) AS escolhidos;
      SELECT sinal * sum(valores[idx]) INTO subtotal FROM unnest(selecionados) AS s(idx);
      termos := termos || jsonb_build_array(jsonb_build_object('sinal',sinal,'faces',faces,'dados',valores,'selecionados',selecionados,'subtotal',subtotal));
    END IF;
    total:=total+subtotal;
  END LOOP;
  RETURN jsonb_build_object('expressao',expr,'termos',termos,'total',total,'regras',1);
END $$;

CREATE FUNCTION private.acao_chat(campanha uuid, usuario uuid, papel text, comando jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  ficha public.fichas; entrada jsonb; perfil jsonb; atributo jsonb; classe jsonb;
  acao text := comando->>'acao'; modo text := comando->>'modo';
  bonus int; cd int; nivel int:=0; prof int; modificador int; expr text; resultado jsonb;
  prefixo text; origem jsonb;
BEGIN
  IF modo IS NULL OR modo NOT IN ('normal','vantagem','desvantagem') OR acao IS NULL OR acao NOT IN ('ataque','dano','magia','magia_ataque') THEN
    RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Ação inválida.';
  END IF;
  -- O bloqueio protege o snapshot contra edição enquanto a ação é resolvida.
  SELECT * INTO ficha FROM public.fichas WHERE id=(comando->>'ficha_id')::uuid AND campanha_id=campanha FOR SHARE;
  IF NOT FOUND OR (papel <> 'mestre' AND ficha.proprietario_id<>usuario) THEN
    RAISE EXCEPTION USING ERRCODE='WC002',MESSAGE='Ficha indisponível.';
  END IF;
  IF ficha.versao<>private.inteiro_chat(comando->'versao',1,2147483647) THEN
    RAISE EXCEPTION USING ERRCODE='WC005',MESSAGE='A ficha foi alterada. Recarregue a versão salva.';
  END IF;
  prefixo := CASE modo WHEN 'vantagem' THEN '2d20kh1' WHEN 'desvantagem' THEN '2d20kl1' ELSE '1d20' END;
  IF acao IN ('ataque','dano') THEN
    SELECT value INTO entrada FROM jsonb_array_elements(ficha.conteudo->'ataques') WHERE value->>'id'=comando->>'entrada_id';
    IF entrada IS NULL THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Ataque inexistente.'; END IF;
    IF acao='dano' THEN
      IF modo<>'normal' THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Dano não usa vantagem.'; END IF;
      expr:=entrada->>'dano';
    ELSIF entrada->>'tipo'='cd' THEN
      IF modo<>'normal' THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='CD não usa vantagem.'; END IF;
      cd:=private.inteiro_chat(entrada->'valor',0,9999);
    ELSIF entrada->>'tipo'='bonus' THEN
      bonus:=private.inteiro_chat(entrada->'valor',-9999,9999);
      expr:=prefixo || CASE WHEN bonus>=0 THEN '+' ELSE '' END || bonus;
    ELSE RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Tipo de ataque inválido.';
    END IF;
  ELSE
    SELECT value INTO entrada FROM jsonb_array_elements(ficha.conteudo->'magias') WHERE value->>'id'=comando->>'entrada_id';
    IF entrada IS NULL THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Magia inexistente.'; END IF;
    SELECT value INTO perfil FROM jsonb_array_elements(ficha.conteudo#>'{conjuracao,perfis}') WHERE value->>'id'=entrada->>'perfilId';
    IF perfil IS NOT NULL THEN
      FOR classe IN SELECT value FROM jsonb_array_elements(ficha.conteudo->'classes') LOOP
        nivel:=nivel+private.inteiro_chat(classe->'nivel',1,20);
      END LOOP;
      IF nivel<1 OR nivel>20 THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Nível inválido.'; END IF;
      prof:=2+floor((nivel-1)/4.0)::int+private.inteiro_chat(ficha.conteudo#>'{combate,ajusteProficiencia}',-999,999);
      atributo:=ficha.conteudo->'atributos'->(perfil->>'atributo');
      modificador:=floor((private.inteiro_chat(atributo->'valor',1,100)-10)/2.0)::int
        +private.inteiro_chat(atributo->'ajusteModificador',-999,999)+private.inteiro_chat(perfil->'ajusteModificador',-999,999);
      bonus:=prof+modificador+private.inteiro_chat(perfil->'ajusteAtaque',-999,999);
      cd:=8+prof+modificador+private.inteiro_chat(perfil->'ajusteCd',-999,999);
    END IF;
    IF acao='magia_ataque' THEN
      IF perfil IS NULL THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Vincule um perfil de conjuração.'; END IF;
      expr:=prefixo || CASE WHEN bonus>=0 THEN '+' ELSE '' END || bonus;
    ELSIF modo<>'normal' THEN
      RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Conjuração não usa vantagem.';
    END IF;
  END IF;
  IF jsonb_typeof(entrada->'nome') IS DISTINCT FROM 'string' OR length(entrada->>'nome')>120 THEN
    RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Nome de ação inválido.';
  END IF;
  origem:=jsonb_build_object('ficha_id',ficha.id,'ficha_nome',ficha.nome,'versao',ficha.versao,'entrada_id',entrada->>'id','acao',acao,'modo',modo);
  IF expr IS NOT NULL THEN resultado:=private.rolar_dados(expr);
  ELSE resultado:=jsonb_strip_nulls(jsonb_build_object('cd',cd,'regras',1)); END IF;
  RETURN jsonb_build_object('rotulo',ficha.nome || ' · ' || coalesce(nullif(entrada->>'nome',''),'Ação'), 'resultado',resultado || jsonb_build_object('origem',origem));
END $$;

CREATE FUNCTION public.enviar_chat(p_campanha uuid,p_pedido uuid,p_comando jsonb)
RETURNS public.mensagens_chat LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  usuario uuid:=auth.uid(); papel text; recibo private.comandos_chat; mensagem public.mensagens_chat;
  tipo text; texto text:=''; rotulo text:=''; resultado jsonb; acao jsonb; nome text; seq bigint;
BEGIN
  SELECT m.papel INTO papel FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=usuario FOR SHARE;
  IF usuario IS NULL OR papel IS NULL OR papel NOT IN ('jogador','mestre') THEN
    RAISE EXCEPTION USING ERRCODE='WC002',MESSAGE='Sem permissão para enviar nesta campanha.';
  END IF;
  IF p_pedido IS NULL OR jsonb_typeof(p_comando) IS DISTINCT FROM 'object' OR octet_length(p_comando::text)>16384 THEN
    RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Comando inválido.';
  END IF;
  -- Ordem constante dos bloqueios e sequência por campanha: não existem commits fora de ordem.
  PERFORM pg_advisory_xact_lock(hashtextextended(usuario::text || p_pedido::text,0));
  SELECT * INTO recibo FROM private.comandos_chat WHERE usuario_id=usuario AND pedido_id=p_pedido;
  IF FOUND THEN
    IF recibo.campanha_id<>p_campanha OR recibo.comando<>p_comando THEN
      RAISE EXCEPTION USING ERRCODE='WC004',MESSAGE='Identificador de tentativa já utilizado.';
    END IF;
    SELECT * INTO mensagem FROM public.mensagens_chat WHERE id=recibo.mensagem_id;
    RETURN mensagem;
  END IF;
  PERFORM 1 FROM public.campanhas WHERE id=p_campanha FOR UPDATE;
  IF (SELECT count(*) FROM public.mensagens_chat WHERE campanha_id=p_campanha AND autor_id=usuario AND criado_em>clock_timestamp()-interval '10 seconds')>=30 THEN
    RAISE EXCEPTION USING ERRCODE='WC006',MESSAGE='Aguarde alguns segundos antes de enviar novamente.';
  END IF;
  tipo:=p_comando->>'tipo';
  IF tipo='texto' THEN
    IF p_comando-ARRAY['tipo','texto']<>'{}'::jsonb OR jsonb_typeof(p_comando->'texto') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Texto inválido.';
    END IF;
    texto:=btrim(p_comando->>'texto',E' \t\n\r');
    IF length(texto)<1 OR length(texto)>2000 THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Texto deve ter 1 a 2000 caracteres.'; END IF;
  ELSIF tipo='rolagem' THEN
    IF p_comando-ARRAY['tipo','expressao','rotulo']<>'{}'::jsonb OR jsonb_typeof(p_comando->'expressao') IS DISTINCT FROM 'string' OR (p_comando ? 'rotulo' AND jsonb_typeof(p_comando->'rotulo') IS DISTINCT FROM 'string') THEN
      RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Rolagem inválida.';
    END IF;
    rotulo:=btrim(coalesce(p_comando->>'rotulo','Rolagem livre'));
    IF length(rotulo)>120 THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Rótulo muito longo.'; END IF;
    resultado:=private.rolar_dados(p_comando->>'expressao');
  ELSIF tipo='acao' THEN
    IF p_comando-ARRAY['tipo','ficha_id','versao','entrada_id','acao','modo']<>'{}'::jsonb OR jsonb_typeof(p_comando->'ficha_id') IS DISTINCT FROM 'string' OR jsonb_typeof(p_comando->'entrada_id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Ação inválida.';
    END IF;
    acao:=private.acao_chat(p_campanha,usuario,papel,p_comando);
    rotulo:=acao->>'rotulo'; resultado:=acao->'resultado';
  ELSE RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Tipo de comando inválido.';
  END IF;
  SELECT coalesce(nullif(btrim(nome_exibicao),''),'Jogador') INTO nome FROM public.perfis WHERE id=usuario;
  SELECT coalesce(max(sequencia),0)+1 INTO seq FROM public.mensagens_chat WHERE campanha_id=p_campanha;
  INSERT INTO public.mensagens_chat(campanha_id,sequencia,autor_id,autor_nome,tipo,texto,rotulo,resultado)
    VALUES(p_campanha,seq,usuario,left(coalesce(nome,'Jogador'),120),tipo,texto,rotulo,resultado) RETURNING * INTO mensagem;
  INSERT INTO private.comandos_chat VALUES(usuario,p_pedido,p_campanha,p_comando,mensagem.id);
  RETURN mensagem;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN
  RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Comando inválido.';
END $$;

REVOKE ALL ON FUNCTION private.inteiro_chat(jsonb,int,int),private.rolar_dados(text),private.acao_chat(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enviar_chat(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_chat(uuid,uuid,jsonb) TO authenticated;

-- Supabase hospedado já possui a publicação. PostgreSQL de teste pode não ter Realtime.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(
    SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='mensagens_chat'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens_chat;
  END IF;
END $$;
COMMIT;
