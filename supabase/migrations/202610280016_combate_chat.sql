BEGIN;

-- Colunas opcionais: fontes antigas continuam válidas.
DO $$ BEGIN
 IF to_regclass('public.compendio_magias') IS NOT NULL THEN
  ALTER TABLE public.compendio_magias ADD COLUMN bonus_ataque integer CHECK(bonus_ataque BETWEEN -9999 AND 9999);
  ALTER TABLE public.compendio_magias ADD COLUMN cd integer CHECK(cd BETWEEN 0 AND 9999);
 END IF;
END $$;

-- Estende a transação original, incluindo o recibo original, sem rolar no cliente.
DO $migration$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.operar_mesa(uuid,uuid,jsonb)'::regprocedure);
 definition:=replace(definition,'mensagem text; resposta jsonb;', 'resultado_pv jsonb; mensagem text; resposta jsonb;');
 definition:=replace(definition, 'valor:=private.inteiro_chat(p_comando->''valor'',0,9999); total:=',
 $patch$IF p_comando ? 'expressao' THEN
     IF jsonb_typeof(p_comando->'expressao') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Expressão de PV inválida.'; END IF;
     resultado_pv:=private.rolar_dados(p_comando->>'expressao');
     valor:=private.inteiro_chat(resultado_pv->'total',0,9999);
    ELSE valor:=private.inteiro_chat(p_comando->'valor',0,9999); END IF; total:=$patch$);
 definition:=replace(definition, 'WHEN ''temporarios'' THEN temp:=greatest(temp,valor);',
 'WHEN ''temporarios'' THEN temp:=greatest(temp,valor); WHEN ''temporarios_definir'' THEN temp:=valor;');
 definition:=replace(definition, 'WHEN ''ajustar'' THEN',
 $patch$WHEN 'dano','cura','temporarios','temporarios_definir' THEN
     SELECT value,ordinality::int-1 INTO x,idx FROM jsonb_array_elements(lista) WITH ORDINALITY WHERE value->>'id'=p_comando->>'id';
     IF x IS NULL OR x ? 'ficha_id' THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Use a ficha para alterar o personagem.'; END IF;
     IF p_comando ? 'expressao' THEN
      IF jsonb_typeof(p_comando->'expressao') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='WM003',MESSAGE='Expressão de PV inválida.'; END IF;
      resultado_pv:=private.rolar_dados(p_comando->>'expressao'); valor:=private.inteiro_chat(resultado_pv->'total',0,9999);
     ELSE valor:=private.inteiro_chat(p_comando->'valor',0,9999); END IF;
     hp:=(x->>'pvAtuais')::int; temp:=coalesce((x->>'pvTemporarios')::int,0);
     CASE p_comando->>'acao'
      WHEN 'dano' THEN hp:=greatest(0,hp-greatest(0,valor-temp)); temp:=greatest(0,temp-valor);
      WHEN 'cura' THEN hp:=least((x->>'pvMaximos')::int,hp+valor);
      WHEN 'temporarios' THEN temp:=greatest(temp,valor);
      WHEN 'temporarios_definir' THEN temp:=valor;
     END CASE;
     x:=x||jsonb_build_object('pvAtuais',hp,'pvTemporarios',temp);
     lista:=jsonb_set(lista,ARRAY[idx::text],x); mensagem:=(x->>'nome')||' · '||(p_comando->>'acao')||' '||valor||' · PV '||hp||'/'||(x->>'pvMaximos');
    WHEN 'ajustar' THEN$patch$);
 definition:=replace(definition, 'SELECT nome_exibicao INTO nome FROM public.perfis WHERE id=u;', 'IF resultado_pv IS NOT NULL THEN mensagem:=mensagem||'' · ''||(resultado_pv->>''expressao'')||'' = ''||(resultado_pv->>''total''); END IF; SELECT nome_exibicao INTO nome FROM public.perfis WHERE id=u;');
 definition:=replace(definition, 'IF f.id IS NOT NULL THEN resposta:=',
 'IF resultado_pv IS NOT NULL THEN resposta:=resposta||jsonb_build_object(''resultado'',resultado_pv||jsonb_build_object(''alvo_id'',coalesce(p_comando->>''ficha_id'',p_comando->>''id''))); END IF; IF f.id IS NOT NULL THEN resposta:=');
 IF definition NOT LIKE '%resultado_pv:=private.rolar_dados%' OR definition NOT LIKE '%WHEN ''temporarios_definir'' THEN temp:=valor%' THEN
  RAISE EXCEPTION 'Definição inesperada da transação de PV.';
 END IF;
 EXECUTE definition;
END $migration$;

-- Sobrescritas opcionais também determinam o dado efetivamente rolado.
DO $migration$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('private.acao_chat_basica(uuid,uuid,text,jsonb)'::regprocedure);
 definition:=replace(definition,'IF acao=''magia_ataque'' THEN',
 $patch$IF entrada ? 'bonusAtaque' THEN bonus:=private.inteiro_chat(entrada->'bonusAtaque',-9999,9999); END IF;
    IF entrada ? 'cd' THEN cd:=private.inteiro_chat(entrada->'cd',0,9999); END IF;
    IF acao='magia_ataque' THEN$patch$);
 definition:=replace(definition,'IF perfil IS NULL THEN RAISE EXCEPTION', 'IF perfil IS NULL AND NOT entrada ? ''bonusAtaque'' THEN RAISE EXCEPTION');
 IF strpos(definition,'bonus:=private.inteiro_chat(entrada->''bonusAtaque''')=0 THEN RAISE EXCEPTION 'Definição inesperada do ataque de magia.'; END IF;
 EXECUTE definition;
END $migration$;

-- Resolve textos e metadados da ficha autorizada, nunca do payload do cliente.
DO $$ BEGIN
 EXECUTE replace(pg_get_functiondef('private.acao_chat(uuid,uuid,text,jsonb)'::regprocedure),
  'CREATE OR REPLACE FUNCTION private.acao_chat(', 'CREATE OR REPLACE FUNCTION private.acao_chat_combate_anterior(');
END $$;
CREATE OR REPLACE FUNCTION private.acao_chat(campanha uuid,usuario uuid,papel text,comando jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE f public.fichas; e jsonb; item jsonb; perfil jsonb; saida jsonb; resultado jsonb; texto text; nome text; caminho text; atributo text; bonus int; cd int; prof int; nivel int; acao text:=comando->>'acao'; chave text:=comando->>'entrada_id';
BEGIN
 IF acao LIKE 'descricao_%' OR acao IN ('magia','magia_ataque','magia_dano') THEN
  SELECT * INTO f FROM public.fichas WHERE id=(comando->>'ficha_id')::uuid AND campanha_id=campanha FOR UPDATE;
  IF NOT FOUND OR (papel<>'mestre' AND f.proprietario_id<>usuario) THEN RAISE EXCEPTION USING ERRCODE='WC002',MESSAGE='Ficha indisponível.'; END IF;
  IF f.versao<>private.inteiro_chat(comando->'versao',1,2147483647) THEN RAISE EXCEPTION USING ERRCODE='WC005',MESSAGE='A ficha foi alterada.'; END IF;
 END IF;
 IF acao LIKE 'descricao_%' THEN
  IF comando->>'modo' IS DISTINCT FROM 'normal' THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Descrição não usa vantagem.'; END IF;
  caminho:=CASE acao WHEN 'descricao_magia' THEN 'magias' WHEN 'descricao_ataque' THEN 'ataques' WHEN 'descricao_caracteristica' THEN 'caracteristicas' WHEN 'descricao_traco' THEN 'tracos' WHEN 'descricao_talento' THEN 'talentos' WHEN 'descricao_pericia' THEN 'pericias' END;
  IF caminho IS NULL THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Descrição inválida.'; END IF;
  IF caminho='pericias' THEN
   e:=f.conteudo->caminho->chave;
   nome:='{"acrobacia":"Acrobacia","adestrarAnimais":"Adestrar Animais","arcanismo":"Arcanismo","atletismo":"Atletismo","atuacao":"Atuação","enganacao":"Enganação","furtividade":"Furtividade","historia":"História","intimidacao":"Intimidação","intuicao":"Intuição","investigacao":"Investigação","medicina":"Medicina","natureza":"Natureza","percepcao":"Percepção","persuasao":"Persuasão","prestidigitacao":"Prestidigitação","religiao":"Religião","sobrevivencia":"Sobrevivência"}'::jsonb->>chave;
  ELSE
   SELECT value INTO e FROM jsonb_array_elements(f.conteudo->caminho) WHERE value->>'id'=chave;
   nome:=e->>'nome';
  END IF;
  IF e IS NULL OR nome IS NULL THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Entrada removida ou indisponível.'; END IF;
  texto:=coalesce(e->>'descricao','');
  IF caminho='ataques' THEN
   SELECT value INTO item FROM jsonb_array_elements(f.conteudo#>'{inventario,itens}') WHERE value->>'id'=e->>'itemId';
   texto:=concat_ws(E'\n\n',nullif(btrim(e->>'observacoes'),''),nullif(btrim(item->>'descricao'),''));
  END IF;
  IF (caminho='ataques' AND (length(coalesce(e->>'observacoes',''))>10000 OR length(coalesce(item->>'descricao',''))>10000)) OR (caminho<>'ataques' AND length(texto)>10000) THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Descrição excede o limite de 10000 caracteres.'; END IF;
  RETURN jsonb_build_object('rotulo',f.nome||' · '||nome,'resultado',jsonb_build_object('regras',1,'descricao',jsonb_build_object('nome',nome,'texto',texto,'semDescricao',btrim(texto)=''),'origem',jsonb_build_object('ficha_id',f.id,'ficha_nome',f.nome,'versao',f.versao,'entrada_id',chave,'acao',acao,'modo','normal')));
 END IF;
 saida:=private.acao_chat_combate_anterior(campanha,usuario,papel,comando);
 IF acao IN ('magia','magia_ataque','magia_dano') THEN
  SELECT value INTO e FROM jsonb_array_elements(f.conteudo->'magias') WHERE value->>'id'=chave;
  SELECT value INTO perfil FROM jsonb_array_elements(f.conteudo#>'{conjuracao,perfis}') WHERE value->>'id'=e->>'perfilId';
  IF perfil IS NOT NULL THEN
   SELECT sum((value->>'nivel')::int) INTO nivel FROM jsonb_array_elements(f.conteudo->'classes');
   prof:=2+floor((nivel-1)/4.0)::int+(f.conteudo#>>'{combate,ajusteProficiencia}')::int;
   atributo:=perfil->>'atributo';
   bonus:=floor(((f.conteudo->'atributos'->atributo->>'valor')::int-10)/2.0)::int+(f.conteudo->'atributos'->atributo->>'ajusteModificador')::int+(perfil->>'ajusteModificador')::int+prof;
   cd:=8+bonus+(perfil->>'ajusteCd')::int; bonus:=bonus+(perfil->>'ajusteAtaque')::int;
  END IF;
  IF e ? 'bonusAtaque' THEN bonus:=private.inteiro_chat(e->'bonusAtaque',-9999,9999); END IF;
  IF e ? 'cd' THEN cd:=private.inteiro_chat(e->'cd',0,9999); END IF;
  IF e ? 'salvaguardaAtributo' AND e->>'salvaguardaAtributo' NOT IN ('','for','des','con','int','sab','car') THEN RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Atributo de salvaguarda inválido.'; END IF;
  resultado:=saida->'resultado'||jsonb_strip_nulls(jsonb_build_object('bonusAtaque',bonus,'cd',cd,'salvaguardaAtributo',nullif(e->>'salvaguardaAtributo','')));
  RETURN jsonb_set(saida,'{resultado}',resultado);
 END IF;
 RETURN saida;
END $$;
REVOKE ALL ON FUNCTION private.acao_chat_combate_anterior(uuid,uuid,text,jsonb),private.acao_chat(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;

-- Recibos antigos não devem devolver ações privadas depois de perder acesso à ficha.
DO $migration$
DECLARE definition text; needle text:='SELECT * INTO mensagem FROM public.mensagens_chat WHERE id=recibo.mensagem_id;';
BEGIN
 definition:=pg_get_functiondef('public.enviar_chat(uuid,uuid,jsonb)'::regprocedure);
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'Definição inesperada do recibo de chat.'; END IF;
 definition:=replace(definition,needle,$patch$IF comando->>'tipo'='acao' THEN
     PERFORM 1 FROM public.fichas WHERE id=(comando->>'ficha_id')::uuid AND campanha_id=p_campanha AND (papel='mestre' OR proprietario_id=usuario);
     IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='WC002',MESSAGE='Acesso à ficha encerrado.'; END IF;
    END IF;
    SELECT * INTO mensagem FROM public.mensagens_chat WHERE id=recibo.mensagem_id;$patch$);
 EXECUTE definition;
END $migration$;
COMMIT;
