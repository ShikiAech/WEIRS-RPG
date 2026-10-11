BEGIN;
CREATE TABLE public.mesas (
  campanha_id uuid PRIMARY KEY REFERENCES public.campanhas(id) ON DELETE CASCADE,
  versao integer NOT NULL DEFAULT 0,
  estado jsonb NOT NULL DEFAULT '{"combate":{"ativo":false,"rodada":1,"turno":"","participantes":[]},"loja":{"aberta":false,"nome":"Loja da campanha","ofertas":[]}}',
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY mesas_leitura ON public.mesas FOR SELECT TO authenticated
 USING(private.papel_na_campanha(campanha_id) IS NOT NULL);
REVOKE ALL ON public.mesas FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mesas TO authenticated;
CREATE TABLE private.operacoes_mesa (
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL, campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  comando jsonb NOT NULL, resposta jsonb NOT NULL, criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(usuario_id,pedido_id)
);
ALTER TABLE private.operacoes_mesa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.operacoes_mesa FROM PUBLIC,anon,authenticated;
CREATE INDEX operacoes_mesa_limite ON private.operacoes_mesa(usuario_id,campanha_id,criado_em);

CREATE FUNCTION private.ordenar_combate(c jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_set(c,'{participantes}',coalesce((SELECT jsonb_agg(x ORDER BY (x->>'iniciativa')::int DESC,x->>'id') FROM jsonb_array_elements(c->'participantes') x),'[]'::jsonb))
$$;

CREATE FUNCTION public.ler_mesa(p_campanha uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.mesas; participantes jsonb:='[]'; p jsonb; f public.fichas;
BEGIN
 IF auth.uid() IS NULL OR private.papel_na_campanha(p_campanha) IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='WM002',MESSAGE='Acesso à mesa indisponível.';
 END IF;
 SELECT * INTO m FROM public.mesas WHERE campanha_id=p_campanha;
 IF NOT FOUND THEN RETURN jsonb_build_object('campanha_id',p_campanha,'versao',0,'estado','{"combate":{"ativo":false,"rodada":1,"turno":"","participantes":[]},"loja":{"aberta":false,"nome":"Loja da campanha","ofertas":[]}}'::jsonb); END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(m.estado#>'{combate,participantes}') LOOP
  IF nullif(p->>'ficha_id','') IS NOT NULL THEN
   SELECT * INTO f FROM public.fichas WHERE id=(p->>'ficha_id')::uuid AND campanha_id=p_campanha;
   IF FOUND THEN
    p:=p||jsonb_build_object('nome',f.nome,'pvAtuais',f.conteudo#>'{combate,pvAtuais}','pvMaximos',f.conteudo#>'{combate,pvMaximos}','pvTemporarios',f.conteudo#>'{combate,pvTemporarios}','ca',f.conteudo#>'{combate,ca}','condicoes',f.conteudo#>'{combate,condicoes}','concentracao',f.conteudo#>'{combate,concentracaoAtiva}');
   END IF;
  END IF;
  participantes:=participantes||jsonb_build_array(p);
 END LOOP;
 RETURN jsonb_build_object('campanha_id',p_campanha,'versao',m.versao,'estado',jsonb_set(m.estado,'{combate,participantes}',participantes));
END $$;

CREATE FUNCTION public.operar_mesa(p_campanha uuid,p_pedido uuid,p_comando jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 u uuid:=auth.uid(); papel text; m public.mesas; f public.fichas; r private.operacoes_mesa;
 t text:=p_comando->>'tipo'; c jsonb; combate jsonb; loja jsonb; itens jsonb; lista jsonb; x jsonb; oferta jsonb; item jsonb; moedas jsonb;
 n int; idx int; pos int; gastos int; total int; estoque int; hp int; temp int; valor int; quantidade int; saldo bigint:=0; custo bigint; chave text;
 mensagem text; resposta jsonb; chat public.mensagens_chat; nome text;
BEGIN
 SELECT membro.papel INTO papel FROM public.membros_campanha membro WHERE membro.campanha_id=p_campanha AND membro.usuario_id=u FOR SHARE;
 IF u IS NULL OR papel IS NULL OR papel='espectador' THEN RAISE EXCEPTION USING ERRCODE='WM002',MESSAGE='Sem permissão para esta operação.'; END IF;
 IF p_pedido IS NULL OR jsonb_typeof(p_comando) IS DISTINCT FROM 'object' OR octet_length(p_comando::text)>32768 THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Operação inválida.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text||p_pedido::text,0));
 SELECT * INTO r FROM private.operacoes_mesa WHERE usuario_id=u AND pedido_id=p_pedido;
 IF FOUND THEN
  IF r.campanha_id<>p_campanha OR r.comando<>p_comando THEN RAISE EXCEPTION USING ERRCODE='WM004',MESSAGE='Tentativa já utilizada.'; END IF;
  IF t IN ('combate','loja') AND papel<>'mestre' THEN RAISE EXCEPTION USING ERRCODE='WM002',MESSAGE='Permissão de mestre encerrada.'; END IF;
  IF r.resposta ? 'ficha' THEN
   PERFORM 1 FROM public.fichas WHERE id=(r.resposta#>>'{ficha,id}')::uuid AND campanha_id=p_campanha AND (papel='mestre' OR proprietario_id=u);
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='WM002',MESSAGE='Acesso à ficha encerrado.'; END IF;
  END IF;
  RETURN r.resposta;
 END IF;
 PERFORM 1 FROM public.campanhas WHERE id=p_campanha FOR UPDATE;
 IF (SELECT count(*) FROM private.operacoes_mesa WHERE usuario_id=u AND campanha_id=p_campanha AND criado_em>clock_timestamp()-interval '10 seconds')>=40 THEN RAISE EXCEPTION USING ERRCODE='WM006',MESSAGE='Aguarde antes de enviar novas operações.'; END IF;
 INSERT INTO public.mesas(campanha_id) VALUES(p_campanha) ON CONFLICT DO NOTHING;
 SELECT * INTO m FROM public.mesas WHERE campanha_id=p_campanha FOR UPDATE;
 combate:=m.estado->'combate'; loja:=m.estado->'loja';
 IF t IN ('combate','loja') THEN
  IF papel<>'mestre' THEN RAISE EXCEPTION USING ERRCODE='WM002',MESSAGE='Somente o mestre administra a mesa.'; END IF;
  IF private.inteiro_chat(p_comando->'versao',0,2147483647)<>m.versao THEN RAISE EXCEPTION USING ERRCODE='WM001',MESSAGE='A mesa foi alterada.'; END IF;
  IF t='loja' THEN
   IF jsonb_typeof(p_comando->'aberta') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_comando->'ofertas') IS DISTINCT FROM 'array' OR length(btrim(p_comando->>'nome')) NOT BETWEEN 1 AND 120 OR p_comando->>'nome' IS NULL OR jsonb_array_length(p_comando->'ofertas')>200 THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Loja inválida.'; END IF;
   lista:='[]';
   FOR x IN SELECT value FROM jsonb_array_elements(p_comando->'ofertas') LOOP
    IF x->>'id' IS NULL OR length(btrim(x->>'nome')) NOT BETWEEN 1 AND 120 OR x->>'nome' IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(lista) e WHERE e->>'id'=x->>'id') THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Oferta inválida.'; END IF;
    PERFORM (x->>'id')::uuid;
    total:=private.inteiro_chat(x->'preco',0,100000000); valor:=private.inteiro_chat(x->'venda',0,total); quantidade:=private.inteiro_chat(x->'estoque',0,9999);
    lista:=lista||jsonb_build_array(jsonb_build_object('id',x->>'id','nome',btrim(x->>'nome'),'preco',total,'venda',valor,'estoque',quantidade));
   END LOOP;
   loja:=jsonb_build_object('aberta',p_comando->'aberta','nome',btrim(p_comando->>'nome'),'ofertas',lista);
   mensagem:=CASE WHEN (loja->>'aberta')::boolean THEN 'A loja está aberta: ' ELSE 'A loja foi fechada: ' END||(loja->>'nome');
  ELSE
   lista:=combate->'participantes';
   CASE p_comando->>'acao'
    WHEN 'adicionar' THEN
     IF jsonb_array_length(lista)>=100 OR p_comando->>'nome' IS NULL OR length(btrim(p_comando->>'nome')) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Combatente inválido.'; END IF;
     total:=private.inteiro_chat(p_comando->'pvMaximos',1,999999); hp:=private.inteiro_chat(p_comando->'pvAtuais',0,total);
     x:=jsonb_build_object('id',gen_random_uuid(),'nome',btrim(p_comando->>'nome'),'iniciativa',private.inteiro_chat(p_comando->'iniciativa',-999,999),'ca',private.inteiro_chat(p_comando->'ca',0,999),'pvMaximos',total,'pvAtuais',hp,'pvTemporarios',0,'condicoes','[]'::jsonb);
     lista:=lista||jsonb_build_array(x); mensagem:=(x->>'nome')||' entrou no encontro.';
    WHEN 'remover' THEN
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lista) e WHERE e->>'id'=p_comando->>'id') THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Combatente inexistente.'; END IF;
     SELECT ordinality::int-1 INTO pos FROM jsonb_array_elements(lista) WITH ORDINALITY WHERE value->>'id'=p_comando->>'id';
     SELECT coalesce(jsonb_agg(e),'[]') INTO lista FROM jsonb_array_elements(lista) e WHERE e->>'id'<>p_comando->>'id';
     IF combate->>'turno'=p_comando->>'id' THEN
      IF pos>=jsonb_array_length(lista) THEN
       pos:=0;
       IF jsonb_array_length(lista)>0 AND combate->>'ativo'='true' THEN combate:=jsonb_set(combate,'{rodada}',to_jsonb((combate->>'rodada')::int+1)); END IF;
      END IF;
      combate:=jsonb_set(combate,'{turno}',coalesce(lista->pos->'id','""'));
     END IF;
     IF jsonb_array_length(lista)=0 THEN combate:=jsonb_set(combate,'{ativo}','false'); END IF;
     mensagem:='Um combatente foi removido.';
    WHEN 'ajustar' THEN
     SELECT value,ordinality::int-1 INTO x,idx FROM jsonb_array_elements(lista) WITH ORDINALITY WHERE value->>'id'=p_comando->>'id';
     IF x IS NULL OR x ? 'ficha_id' THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Use a ficha para alterar o personagem.'; END IF;
     x:=jsonb_set(x,'{pvAtuais}',to_jsonb(private.inteiro_chat(p_comando->'pvAtuais',0,(x->>'pvMaximos')::int)));
     lista:=jsonb_set(lista,ARRAY[idx::text],x); mensagem:=(x->>'nome')||' está com '||(x->>'pvAtuais')||' PV.';
    WHEN 'iniciar' THEN
     IF jsonb_array_length(lista)=0 THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Adicione combatentes primeiro.'; END IF;
     combate:=combate||jsonb_build_object('ativo',true,'rodada',1,'turno',lista->0->>'id'); mensagem:='O combate começou.';
    WHEN 'avancar' THEN
     IF combate->>'ativo'<>'true' OR jsonb_array_length(lista)=0 THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Não há combate em andamento.'; END IF;
     SELECT ordinality::int INTO pos FROM jsonb_array_elements(lista) WITH ORDINALITY WHERE value->>'id'=combate->>'turno';
     pos:=coalesce(pos,0); IF pos>=jsonb_array_length(lista) THEN pos:=0; combate:=jsonb_set(combate,'{rodada}',to_jsonb((combate->>'rodada')::int+1)); END IF;
     combate:=jsonb_set(combate,'{turno}',lista->pos->'id'); mensagem:='Rodada '||(combate->>'rodada')||' · Turno de '||(lista->pos->>'nome');
    WHEN 'encerrar' THEN combate:=combate||'{"ativo":false,"turno":""}'::jsonb; mensagem:='O combate foi encerrado.';
    ELSE RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Operação de combate inválida.';
   END CASE;
   combate:=private.ordenar_combate(jsonb_set(combate,'{participantes}',lista));
  END IF;
 ELSE
  SELECT * INTO f FROM public.fichas WHERE id=(p_comando->>'ficha_id')::uuid AND campanha_id=p_campanha FOR UPDATE;
  IF NOT FOUND OR (papel<>'mestre' AND f.proprietario_id<>u) THEN RAISE EXCEPTION USING ERRCODE='WM002',MESSAGE='Ficha indisponível.'; END IF;
  IF f.versao<>private.inteiro_chat(p_comando->'versao',1,2147483647) THEN RAISE EXCEPTION USING ERRCODE='WM001',MESSAGE='A ficha foi alterada.'; END IF;
  c:=f.conteudo;
  CASE t
   WHEN 'pv' THEN
    valor:=private.inteiro_chat(p_comando->'valor',0,9999); total:=private.inteiro_chat(c#>'{combate,pvMaximos}',1,9999); hp:=greatest(0,private.inteiro_chat(c#>'{combate,pvAtuais}',-9999,9999)); temp:=private.inteiro_chat(c#>'{combate,pvTemporarios}',0,9999);
    CASE p_comando->>'acao'
     WHEN 'dano' THEN hp:=greatest(0,hp-greatest(0,valor-temp)); temp:=greatest(0,temp-valor);
     WHEN 'cura' THEN hp:=least(total,hp+valor);
     WHEN 'temporarios' THEN temp:=greatest(temp,valor);
     ELSE RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Alteração de PV inválida.';
    END CASE;
    c:=jsonb_set(jsonb_set(c,'{combate,pvAtuais}',to_jsonb(hp)),'{combate,pvTemporarios}',to_jsonb(temp));
    IF hp>0 THEN c:=jsonb_set(jsonb_set(c,'{combate,sucessosMorte}','0'),'{combate,falhasMorte}','0'); END IF;
    mensagem:=f.nome||' · '||(p_comando->>'acao')||' '||valor||' · PV '||hp||'/'||total;
   WHEN 'condicao' THEN
    nome:=btrim(p_comando->>'nome'); IF nome IS NULL OR length(nome) NOT BETWEEN 1 AND 120 OR jsonb_typeof(p_comando->'ativa') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Condição inválida.'; END IF;
    SELECT coalesce(jsonb_agg(e),'[]') INTO lista FROM jsonb_array_elements(c#>'{combate,condicoes}') e WHERE lower(e->>'nome')<>lower(nome);
    IF (p_comando->>'ativa')::boolean THEN lista:=lista||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'nome',nome)); END IF;
    IF jsonb_array_length(lista)>100 THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Condições demais.'; END IF;
    c:=jsonb_set(c,'{combate,condicoes}',lista); mensagem:=f.nome||' · condição: '||nome||CASE WHEN (p_comando->>'ativa')::boolean THEN ' aplicada.' ELSE ' removida.' END;
   WHEN 'concentracao' THEN
    IF jsonb_typeof(p_comando->'nome') IS DISTINCT FROM 'string' OR length(p_comando->>'nome')>120 THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Concentração inválida.'; END IF;
    c:=jsonb_set(c,'{combate,concentracaoAtiva}',p_comando->'nome'); mensagem:=f.nome||' · concentração: '||coalesce(nullif(p_comando->>'nome',''),'encerrada');
   WHEN 'gasto' THEN
    valor:=private.inteiro_chat(p_comando->'delta',-1,1); IF valor=0 THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Gasto inválido.'; END IF;
    chave:=p_comando->>'caminho';
    IF chave='pacto' THEN
     x:=c#>'{conjuracao,pacto}';
    ELSE
     lista:=CASE chave WHEN 'espaco' THEN c#>'{conjuracao,espacos}' WHEN 'recurso' THEN c->'recursos' WHEN 'item' THEN c#>'{inventario,itens}' ELSE NULL END;
     IF lista IS NULL THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Recurso inválido.'; END IF;
     SELECT value,ordinality::int-1 INTO x,idx FROM jsonb_array_elements(lista) WITH ORDINALITY WHERE
      CASE WHEN chave='espaco' THEN value->>'circulo'=p_comando->>'circulo' ELSE value->>'id'=p_comando->>'entrada_id' END;
    END IF;
    IF x IS NULL THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Recurso inexistente.'; END IF;
    IF chave='item' THEN
     quantidade:=private.inteiro_chat(x->'quantidade',0,9999)-valor;
     IF quantidade NOT BETWEEN 0 AND 9999 THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Quantidade do item fora do limite.'; END IF;
     x:=jsonb_set(x,'{quantidade}',to_jsonb(quantidade));
    ELSE
     total:=private.inteiro_chat(coalesce(x->'maximo',x->'total'),0,9999); gastos:=private.inteiro_chat(x->'gastos',0,total)+valor;
     IF gastos<0 OR gastos>total THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Limite do recurso excedido.'; END IF;
     x:=jsonb_set(x,'{gastos}',to_jsonb(gastos));
    END IF;
    IF chave='pacto' THEN c:=jsonb_set(c,'{conjuracao,pacto}',x);
    ELSE lista:=jsonb_set(lista,ARRAY[idx::text],x); c:=jsonb_set(c,CASE chave WHEN 'espaco' THEN ARRAY['conjuracao','espacos'] WHEN 'recurso' THEN ARRAY['recursos'] ELSE ARRAY['inventario','itens'] END,lista); END IF;
    mensagem:=f.nome||' atualizou '||coalesce(x->>'nome','espaços de magia')||'.';
   WHEN 'descanso' THEN
    IF p_comando->>'descanso' IS NULL OR p_comando->>'descanso' NOT IN ('curto','longo') THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Descanso inválido.'; END IF;
    IF (c#>>'{combate,pvAtuais}')::int<=0 OR (c#>>'{combate,falhasMorte}')::int>=3 THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Recupere PV antes de iniciar um descanso.'; END IF;
    SELECT coalesce(jsonb_agg(CASE WHEN e->>'recuperacao'='curto' OR (p_comando->>'descanso'='longo' AND e->>'recuperacao'='longo') THEN jsonb_set(e,'{gastos}','0') ELSE e END),'[]') INTO lista FROM jsonb_array_elements(c->'recursos') e;
    c:=jsonb_set(c,'{recursos}',lista); c:=jsonb_set(c,'{conjuracao,pacto,gastos}','0');
    IF p_comando->>'descanso'='longo' THEN
     c:=jsonb_set(c,'{combate,pvAtuais}',c#>'{combate,pvMaximos}'); c:=jsonb_set(c,'{combate,pvTemporarios}','0'); c:=jsonb_set(jsonb_set(c,'{combate,sucessosMorte}','0'),'{combate,falhasMorte}','0');
     SELECT jsonb_agg(jsonb_set(e,'{gastos}','0')) INTO lista FROM jsonb_array_elements(c#>'{conjuracao,espacos}') e;
     c:=jsonb_set(c,'{conjuracao,espacos}',lista);
     chave:=coalesce(p_comando->>'recuperacao_dados','todos');
     IF chave NOT IN ('todos','metade','nenhum') THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Recuperação de dados de vida inválida.'; END IF;
     SELECT CASE chave WHEN 'todos' THEN coalesce(sum((e->>'maximo')::int),0)::int WHEN 'metade' THEN greatest(1,floor(sum((e->>'maximo')::int)/2.0)::int) ELSE 0 END INTO n FROM jsonb_array_elements(c#>'{combate,dadosVida}') e;
     lista:='[]'; FOR x IN SELECT value FROM jsonb_array_elements(c#>'{combate,dadosVida}') LOOP gastos:=(x->>'gastos')::int; valor:=least(coalesce(n,0),gastos); n:=n-valor; lista:=lista||jsonb_build_array(jsonb_set(x,'{gastos}',to_jsonb(gastos-valor))); END LOOP;
     c:=jsonb_set(c,'{combate,dadosVida}',lista);
     c:=jsonb_set(c,'{combate,exaustao}',to_jsonb(greatest(0,(c#>>'{combate,exaustao}')::int-1)));
    END IF;
    mensagem:=f.nome||' realizou descanso '||(p_comando->>'descanso')||'.';
   WHEN 'comprar','vender' THEN
    IF loja->>'aberta'<>'true' THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='A loja está fechada.'; END IF;
    SELECT value,ordinality::int-1 INTO oferta,idx FROM jsonb_array_elements(loja->'ofertas') WITH ORDINALITY WHERE value->>'id'=p_comando->>'oferta_id';
    IF oferta IS NULL THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Oferta inexistente.'; END IF;
    IF private.inteiro_chat(p_comando->'preco_unitario',0,100000000)<>(CASE t WHEN 'comprar' THEN (oferta->>'preco')::int ELSE (oferta->>'venda')::int END) THEN RAISE EXCEPTION USING ERRCODE='WM001',MESSAGE='O preço foi alterado; revise a oferta atual.'; END IF;
    quantidade:=private.inteiro_chat(p_comando->'quantidade',1,9999); moedas:=c#>'{inventario,moedas}';
    FOREACH chave IN ARRAY ARRAY['pc','pp','pe','po','pl'] LOOP saldo:=saldo+private.inteiro_chat(moedas->chave,0,999999999)::bigint*CASE chave WHEN 'pp' THEN 10 WHEN 'pe' THEN 50 WHEN 'po' THEN 100 WHEN 'pl' THEN 1000 ELSE 1 END; END LOOP;
    itens:=c#>'{inventario,itens}';
    IF t='comprar' THEN
     custo:=(oferta->>'preco')::bigint*quantidade;
     IF (oferta->>'estoque')::int<quantidade OR saldo<custo OR jsonb_array_length(itens)>=1000 THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Saldo ou estoque insuficiente.'; END IF;
     saldo:=saldo-custo; total:=(oferta->>'estoque')::int-quantidade;
     item:=jsonb_build_object('id',gen_random_uuid(),'nome',oferta->>'nome','quantidade',quantidade,'peso',0,'equipado',false,'cargasMaximas',0,'cargasGastas',0,'observacoes','Comprado em '||(loja->>'nome'));
     itens:=itens||jsonb_build_array(item);
    ELSE
     SELECT value,ordinality::int-1 INTO item,pos FROM jsonb_array_elements(itens) WITH ORDINALITY WHERE value->>'id'=p_comando->>'item_id';
     IF item IS NULL OR item->>'nome'<>oferta->>'nome' OR (item->>'quantidade')::int<quantidade OR (oferta->>'estoque')::int+quantidade>9999 THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Item ou quantidade indisponível para venda.'; END IF;
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(c#>'{inventario,sintonizados}') e WHERE e->>'itemId'=item->>'id') THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Remova a sintonização antes de vender.'; END IF;
     saldo:=saldo+(oferta->>'venda')::bigint*quantidade; total:=(oferta->>'estoque')::int+quantidade;
     IF (item->>'quantidade')::int=quantidade THEN itens:=itens-pos; ELSE itens:=jsonb_set(itens,ARRAY[pos::text,'quantidade'],to_jsonb((item->>'quantidade')::int-quantidade)); END IF;
    END IF;
    estoque:=total; moedas:='{}';
    FOREACH chave IN ARRAY ARRAY['pl','po','pe','pp','pc'] LOOP
     n:=CASE chave WHEN 'pl' THEN 1000 WHEN 'po' THEN 100 WHEN 'pe' THEN 50 WHEN 'pp' THEN 10 ELSE 1 END;
     total:=least(999999999::bigint,saldo/n)::int;
     moedas:=moedas||jsonb_build_object(chave,total); saldo:=saldo-total::bigint*n;
    END LOOP;
    IF saldo<>0 THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Saldo acima do limite da ficha.'; END IF;
    c:=jsonb_set(jsonb_set(c,'{inventario,itens}',itens),'{inventario,moedas}',moedas);
    loja:=jsonb_set(loja,ARRAY['ofertas',idx::text,'estoque'],to_jsonb(estoque));
    mensagem:=f.nome||CASE t WHEN 'comprar' THEN ' comprou ' ELSE ' vendeu ' END||quantidade||' × '||(oferta->>'nome')||'.';
   ELSE RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Operação desconhecida.';
  END CASE;
  UPDATE public.fichas SET conteudo=c,versao=versao+1 WHERE id=f.id RETURNING * INTO f;
 END IF;
 UPDATE public.mesas SET estado=jsonb_build_object('combate',combate,'loja',loja),versao=versao+1,atualizado_em=now() WHERE campanha_id=p_campanha;
 SELECT nome_exibicao INTO nome FROM public.perfis WHERE id=u;
 INSERT INTO public.mensagens_chat(campanha_id,sequencia,autor_id,autor_nome,tipo,texto,rotulo)
  SELECT p_campanha,coalesce(max(sequencia),0)+1,u,coalesce(nullif(nome,''),'Jogador'),'texto',mensagem,'' FROM public.mensagens_chat WHERE campanha_id=p_campanha RETURNING * INTO chat;
 resposta:=jsonb_build_object('mesa',public.ler_mesa(p_campanha),'mensagem',to_jsonb(chat));
 IF f.id IS NOT NULL THEN resposta:=resposta||jsonb_build_object('ficha',to_jsonb(f)); END IF;
 INSERT INTO private.operacoes_mesa(usuario_id,pedido_id,campanha_id,comando,resposta) VALUES(u,p_pedido,p_campanha,p_comando,resposta);
 RETURN resposta;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR SQLSTATE 'WC003' THEN
 RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Confira valores e limites da operação.';
END $$;

-- Preservar a identidade da função existente também atualiza chamadas já preparadas.
DO $$ BEGIN
 EXECUTE replace(pg_get_functiondef('private.acao_chat(uuid,uuid,text,jsonb)'::regprocedure),
  'CREATE OR REPLACE FUNCTION private.acao_chat(',
  'CREATE OR REPLACE FUNCTION private.acao_chat_basica(');
END $$;
CREATE OR REPLACE FUNCTION private.acao_chat(campanha uuid,usuario uuid,papel text,comando jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE f public.fichas; c jsonb; e jsonb; a jsonb; m public.mesas; acao text:=comando->>'acao'; chave text:=comando->>'entrada_id'; modo text:=comando->>'modo'; bonus int:=0; nivel int; prof int; valor int; total int; idx int; dados jsonb; origem jsonb; rotulo text;
BEGIN
 IF acao IN ('ataque','dano','magia','magia_ataque') THEN RETURN private.acao_chat_basica(campanha,usuario,papel,comando); END IF;
 IF acao IS NULL OR acao NOT IN ('atributo','resistencia','pericia','iniciativa','morte','magia_dano','dado_vida') OR modo IS NULL OR modo NOT IN ('normal','vantagem','desvantagem') THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Ação inválida.'; END IF;
 SELECT * INTO f FROM public.fichas WHERE id=(comando->>'ficha_id')::uuid AND campanha_id=campanha FOR UPDATE;
 IF NOT FOUND OR (papel<>'mestre' AND f.proprietario_id<>usuario) THEN RAISE EXCEPTION USING ERRCODE='WC002',MESSAGE='Ficha indisponível.'; END IF;
 IF f.versao<>private.inteiro_chat(comando->'versao',1,2147483647) THEN RAISE EXCEPTION USING ERRCODE='WC005',MESSAGE='A ficha foi alterada.'; END IF;
 c:=f.conteudo;
 SELECT sum(private.inteiro_chat(value->'nivel',1,20))::int INTO nivel FROM jsonb_array_elements(c->'classes');
 IF nivel IS NULL OR nivel NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Nível inválido.'; END IF;
 prof:=2+floor((nivel-1)/4.0)::int+private.inteiro_chat(c#>'{combate,ajusteProficiencia}',-999,999);
 rotulo:=coalesce('{"for":"Força","des":"Destreza","con":"Constituição","int":"Inteligência","sab":"Sabedoria","car":"Carisma","acrobacia":"Acrobacia","adestrarAnimais":"Adestrar Animais","arcanismo":"Arcanismo","atletismo":"Atletismo","atuacao":"Atuação","enganacao":"Enganação","furtividade":"Furtividade","historia":"História","intimidacao":"Intimidação","intuicao":"Intuição","investigacao":"Investigação","medicina":"Medicina","natureza":"Natureza","percepcao":"Percepção","persuasao":"Persuasão","prestidigitacao":"Prestidigitação","religiao":"Religião","sobrevivencia":"Sobrevivência"}'::jsonb->>chave,chave);
 IF acao='resistencia' THEN rotulo:='Resistência de '||rotulo; END IF;
 IF acao='magia_dano' THEN
  SELECT value INTO e FROM jsonb_array_elements(c->'magias') WHERE value->>'id'=chave;
  IF e IS NULL OR modo<>'normal' THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Magia inválida.'; END IF;
  dados:=private.rolar_dados(e->>'dano'); rotulo:=e->>'nome';
 ELSIF acao='dado_vida' THEN
  SELECT value,ordinality::int-1 INTO e,idx FROM jsonb_array_elements(c#>'{combate,dadosVida}') WITH ORDINALITY WHERE value->>'id'=chave;
  IF e IS NULL OR modo<>'normal' OR (e->>'gastos')::int>=(e->>'maximo')::int OR e->>'dado' NOT IN ('d6','d8','d10','d12') THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Dado de vida indisponível.'; END IF;
  a:=c#>'{atributos,con}'; bonus:=floor(((a->>'valor')::int-10)/2.0)::int+(a->>'ajusteModificador')::int;
  dados:=private.rolar_dados('1'||(e->>'dado')||CASE WHEN bonus>=0 THEN '+' ELSE '' END||bonus);
  c:=jsonb_set(c,ARRAY['combate','dadosVida',idx::text,'gastos'],to_jsonb((e->>'gastos')::int+1));
  c:=jsonb_set(c,'{combate,pvAtuais}',to_jsonb(least((c#>>'{combate,pvMaximos}')::int,(c#>>'{combate,pvAtuais}')::int+greatest(0,(dados->>'total')::int))));
  rotulo:='Dado de vida';
 ELSE
  IF acao IN ('iniciativa','morte') THEN chave:=CASE acao WHEN 'iniciativa' THEN 'des' ELSE 'con' END;
  ELSIF acao='pericia' THEN e:=c->'pericias'->chave; chave:=e->>'atributo'; IF e IS NULL THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Perícia inválida.'; END IF;
  END IF;
  a:=c->'atributos'->chave; IF a IS NULL THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Atributo inválido.'; END IF;
  bonus:=floor((private.inteiro_chat(a->'valor',1,100)-10)/2.0)::int+private.inteiro_chat(a->'ajusteModificador',-999,999);
  CASE acao
   WHEN 'resistencia' THEN bonus:=bonus+CASE WHEN (a->>'resistenciaProficiente')::boolean THEN prof ELSE 0 END+private.inteiro_chat(a->'ajusteResistencia',-999,999);
   WHEN 'pericia' THEN
    IF e->>'grau' NOT IN ('nenhuma','meia','proficiente','especializacao') THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Proficiência inválida.'; END IF;
    bonus:=bonus+CASE e->>'grau' WHEN 'meia' THEN floor(prof/2.0)::int WHEN 'proficiente' THEN prof WHEN 'especializacao' THEN prof*2 ELSE 0 END+private.inteiro_chat(e->'ajuste',-999,999);
   WHEN 'iniciativa' THEN bonus:=bonus+private.inteiro_chat(c#>'{combate,ajusteIniciativa}',-999,999); rotulo:='Iniciativa';
   WHEN 'morte' THEN
    IF modo<>'normal' OR (c#>>'{combate,pvAtuais}')::int<>0 OR (c#>>'{combate,sucessosMorte}')::int>=3 OR (c#>>'{combate,falhasMorte}')::int>=3 THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Teste de morte indisponível.'; END IF;
    bonus:=0; rotulo:='Teste de morte';
   ELSE NULL;
  END CASE;
  dados:=private.rolar_dados(CASE modo WHEN 'vantagem' THEN '2d20kh1' WHEN 'desvantagem' THEN '2d20kl1' ELSE '1d20' END||CASE WHEN bonus>=0 THEN '+' ELSE '' END||bonus);
  IF acao='morte' THEN
   valor:=(dados#>>'{termos,0,dados,0}')::int;
   IF valor=20 THEN c:=jsonb_set(jsonb_set(jsonb_set(c,'{combate,pvAtuais}','1'),'{combate,sucessosMorte}','0'),'{combate,falhasMorte}','0');
   ELSE chave:=CASE WHEN valor>=10 THEN 'sucessosMorte' ELSE 'falhasMorte' END; c:=jsonb_set(c,ARRAY['combate',chave],to_jsonb(least(3,(c->'combate'->>chave)::int+CASE WHEN valor=1 THEN 2 ELSE 1 END))); END IF;
  END IF;
 END IF;
 IF acao IN ('morte','dado_vida') THEN UPDATE public.fichas SET conteudo=c,versao=versao+1 WHERE id=f.id; END IF;
 IF acao='iniciativa' THEN
  INSERT INTO public.mesas(campanha_id) VALUES(campanha) ON CONFLICT DO NOTHING;
  SELECT * INTO m FROM public.mesas WHERE campanha_id=campanha FOR UPDATE;
  SELECT coalesce(jsonb_agg(value),'[]') INTO e FROM jsonb_array_elements(m.estado#>'{combate,participantes}') WHERE value->>'ficha_id' IS DISTINCT FROM f.id::text;
  IF jsonb_array_length(e)>=100 THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Combatentes demais.'; END IF;
  e:=e||jsonb_build_array(jsonb_build_object('id',f.id,'ficha_id',f.id,'nome',f.nome,'iniciativa',dados->'total'));
  UPDATE public.mesas SET estado=jsonb_set(estado,'{combate}',private.ordenar_combate(jsonb_set(estado->'combate','{participantes}',e))),versao=versao+1,atualizado_em=now() WHERE campanha_id=campanha;
 END IF;
 origem:=jsonb_build_object('ficha_id',f.id,'ficha_nome',f.nome,'versao',f.versao,'entrada_id',comando->>'entrada_id','acao',acao,'modo',modo);
 RETURN jsonb_build_object('rotulo',f.nome||' · '||rotulo,'resultado',dados||jsonb_build_object('origem',origem));
END $$;

REVOKE ALL ON FUNCTION private.ordenar_combate(jsonb),private.acao_chat(uuid,uuid,text,jsonb),private.acao_chat_basica(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ler_mesa(uuid),public.operar_mesa(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ler_mesa(uuid),public.operar_mesa(uuid,uuid,jsonb) TO authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='mesas') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.mesas; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fichas') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.fichas; END IF;
 END IF;
END $$;
COMMIT;
