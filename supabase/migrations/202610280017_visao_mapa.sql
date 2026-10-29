BEGIN;
ALTER TABLE public.cenas_mapa ADD COLUMN modo_visao text NOT NULL DEFAULT 'manual' CHECK(modo_visao IN ('manual','automatica'));
ALTER TABLE public.cenas_mapa ALTER COLUMN modo_visao SET DEFAULT 'automatica';
CREATE TABLE public.camadas_mapa (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campanha_id uuid NOT NULL REFERENCES public.campanhas ON DELETE CASCADE,
 cena_id uuid NOT NULL REFERENCES public.cenas_mapa ON DELETE CASCADE, versao integer NOT NULL DEFAULT 1,
 nome text NOT NULL CHECK(length(btrim(nome)) BETWEEN 1 AND 80), ordem integer NOT NULL DEFAULT 0,
 visivel boolean NOT NULL DEFAULT true, bloqueada boolean NOT NULL DEFAULT false,
 finalidade text CHECK(finalidade IN ('mapa','jogadores','mestre')), UNIQUE(cena_id,finalidade)
);
CREATE TABLE public.atribuicoes_mapa (
 campanha_id uuid NOT NULL REFERENCES public.campanhas ON DELETE CASCADE, usuario_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
 cena_id uuid NOT NULL REFERENCES public.cenas_mapa ON DELETE CASCADE, seguir_usuario_id uuid REFERENCES auth.users ON DELETE SET NULL,
 versao integer NOT NULL DEFAULT 1, PRIMARY KEY(campanha_id,usuario_id)
);
CREATE TABLE public.paredes_mapa (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campanha_id uuid NOT NULL REFERENCES public.campanhas ON DELETE CASCADE,
 cena_id uuid NOT NULL REFERENCES public.cenas_mapa ON DELETE CASCADE, versao integer NOT NULL DEFAULT 1,
 x1 numeric NOT NULL CHECK(x1 BETWEEN 0 AND 100), y1 numeric NOT NULL CHECK(y1 BETWEEN 0 AND 100),
 x2 numeric NOT NULL CHECK(x2 BETWEEN 0 AND 100), y2 numeric NOT NULL CHECK(y2 BETWEEN 0 AND 100),
 porta boolean NOT NULL DEFAULT false, aberta boolean NOT NULL DEFAULT false, CHECK(porta OR NOT aberta), CHECK(x1<>x2 OR y1<>y2)
);
CREATE TABLE public.objetos_mapa (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campanha_id uuid NOT NULL REFERENCES public.campanhas ON DELETE CASCADE,
 cena_id uuid NOT NULL REFERENCES public.cenas_mapa ON DELETE CASCADE, camada_id uuid REFERENCES public.camadas_mapa ON DELETE CASCADE,
 versao integer NOT NULL DEFAULT 1, nome text NOT NULL CHECK(length(btrim(nome)) BETWEEN 1 AND 120),
 x numeric NOT NULL CHECK(x BETWEEN 0 AND 100), y numeric NOT NULL CHECK(y BETWEEN 0 AND 100),
 w numeric NOT NULL CHECK(w>0 AND w<=100), h numeric NOT NULL CHECK(h>0 AND h<=100),
 imagem_id uuid REFERENCES public.arquivos_mapa, desenho jsonb, oculto boolean NOT NULL DEFAULT false,
 CHECK(imagem_id IS NOT NULL OR desenho IS NOT NULL)
);
CREATE INDEX paredes_por_cena ON public.paredes_mapa(cena_id);
CREATE INDEX camadas_por_cena ON public.camadas_mapa(cena_id);
CREATE INDEX objetos_por_cena ON public.objetos_mapa(cena_id);
ALTER TABLE public.tokens_mapa ADD COLUMN camada_id uuid REFERENCES public.camadas_mapa ON DELETE CASCADE,
 ADD COLUMN elevacao numeric NOT NULL DEFAULT 0 CHECK(elevacao BETWEEN -10000 AND 10000),
 ADD COLUMN visao boolean NOT NULL DEFAULT true, ADD COLUMN alcance_visao numeric NOT NULL DEFAULT 60 CHECK(alcance_visao BETWEEN 0 AND 1000);
ALTER TABLE public.areas_mapa ADD COLUMN camada_id uuid REFERENCES public.camadas_mapa ON DELETE CASCADE,
 ADD COLUMN ancora_dx numeric, ADD COLUMN ancora_dy numeric, ADD COLUMN acompanhar_rotacao boolean NOT NULL DEFAULT false,
 ADD COLUMN ancora_rotacao numeric NOT NULL DEFAULT 0, ADD COLUMN ancora_angulo numeric NOT NULL DEFAULT 0;
CREATE TABLE public.revisoes_mapa(campanha_id uuid PRIMARY KEY REFERENCES public.campanhas ON DELETE CASCADE, revisao bigint NOT NULL DEFAULT 1);
INSERT INTO public.revisoes_mapa SELECT id,1 FROM public.campanhas;
CREATE TABLE private.visibilidade_mapa(cena_id uuid REFERENCES public.cenas_mapa ON DELETE CASCADE, usuario_id uuid REFERENCES auth.users ON DELETE CASCADE,
 revisao bigint NOT NULL, atual text[] NOT NULL DEFAULT '{}', explorada text[] NOT NULL DEFAULT '{}', PRIMARY KEY(cena_id,usuario_id));
CREATE FUNCTION private.preparar_cena_mapa() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.camadas_mapa(campanha_id,cena_id,nome,ordem,visivel,bloqueada,finalidade) VALUES(NEW.campanha_id,NEW.id,'Mapa',0,true,true,'mapa'),(NEW.campanha_id,NEW.id,'Jogadores',1,true,false,'jogadores'),(NEW.campanha_id,NEW.id,'Mestre',2,false,false,'mestre');
 RETURN NEW;
END $$;
CREATE TRIGGER preparar_cena AFTER INSERT ON public.cenas_mapa FOR EACH ROW EXECUTE FUNCTION private.preparar_cena_mapa();
INSERT INTO public.camadas_mapa(campanha_id,cena_id,nome,ordem,visivel,bloqueada,finalidade)
 SELECT c.campanha_id,c.id,v.nome,v.ordem,v.visivel,v.bloqueada,v.finalidade FROM public.cenas_mapa c CROSS JOIN (VALUES('Mapa',0,true,true,'mapa'),('Jogadores',1,true,false,'jogadores'),('Mestre',2,false,false,'mestre')) v(nome,ordem,visivel,bloqueada,finalidade);
UPDATE public.tokens_mapa t SET camada_id=l.id FROM public.camadas_mapa l WHERE l.cena_id=t.cena_id AND l.finalidade='jogadores';
UPDATE public.areas_mapa a SET camada_id=l.id FROM public.camadas_mapa l WHERE l.cena_id=a.cena_id AND l.finalidade='jogadores';
UPDATE public.areas_mapa a SET ancora_dx=a.x-t.x,ancora_dy=a.y-t.y,ancora_rotacao=t.rotacao,ancora_angulo=a.angulo FROM public.tokens_mapa t WHERE t.id=a.token_id;
CREATE FUNCTION private.invalidar_mapa() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cid uuid;
BEGIN
 cid:=coalesce(NEW.campanha_id,OLD.campanha_id);
 PERFORM 1 FROM public.campanhas WHERE id=cid FOR UPDATE;
 INSERT INTO public.revisoes_mapa VALUES(cid,1) ON CONFLICT(campanha_id) DO UPDATE SET revisao=public.revisoes_mapa.revisao+1;
 RETURN coalesce(NEW,OLD);
END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['cenas_mapa','tokens_mapa','areas_mapa','camadas_mapa','paredes_mapa','objetos_mapa','atribuicoes_mapa','membros_campanha','fichas','arquivos_mapa','marcadores_mapa'] LOOP
 EXECUTE format('CREATE TRIGGER invalidar_visao AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.invalidar_mapa()',tab);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION private.cena_visivel(p_cena uuid,p_campanha uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.cenas_mapa c WHERE c.id=p_cena AND c.campanha_id=p_campanha AND private.papel_na_campanha(p_campanha) IS NOT NULL AND
 (private.papel_na_campanha(p_campanha)='mestre' OR (c.publicada AND c.id=coalesce((SELECT a.cena_id FROM public.atribuicoes_mapa a WHERE a.campanha_id=p_campanha AND a.usuario_id=auth.uid()),(SELECT s.id FROM public.cenas_mapa s WHERE s.campanha_id=p_campanha AND s.ativa)))))
$$;
CREATE FUNCTION private.camada_visivel(p_id uuid,p_cena uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.camadas_mapa l WHERE l.id=p_id AND l.cena_id=p_cena AND private.cena_visivel(l.cena_id,l.campanha_id) AND (l.visivel OR private.papel_na_campanha(l.campanha_id)='mestre'))
$$;
CREATE FUNCTION private.dono_token(t public.tokens_mapa,p_usuario uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT t.controlador_id=p_usuario OR EXISTS(SELECT 1 FROM public.fichas f WHERE f.id=t.ficha_id AND f.campanha_id=t.campanha_id AND f.proprietario_id=p_usuario)
$$;
CREATE FUNCTION private.celula_visivel(p_cena uuid,p_x numeric,p_y numeric) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.cenas_mapa c WHERE c.id=p_cena AND private.cena_visivel(c.id,c.campanha_id) AND (private.papel_na_campanha(c.campanha_id)='mestre' OR c.modo_visao='manual' OR EXISTS(SELECT 1 FROM private.visibilidade_mapa v JOIN public.revisoes_mapa r ON r.campanha_id=c.campanha_id WHERE v.cena_id=c.id AND v.usuario_id=auth.uid() AND v.revisao=r.revisao AND (floor(round(p_x,4))::int::text||','||floor(round(p_y,4))::int::text)=ANY(v.atual))))
$$;
CREATE FUNCTION private.token_visivel(t public.tokens_mapa) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.camada_visivel(t.camada_id,t.cena_id) AND (private.papel_na_campanha(t.campanha_id)='mestre' OR (NOT t.oculto AND ((private.papel_na_campanha(t.campanha_id)='jogador' AND coalesce(private.dono_token(t,auth.uid()),false)) OR private.celula_visivel(t.cena_id,t.x+t.tamanho/2,t.y+t.tamanho/2))))
$$;
CREATE OR REPLACE FUNCTION private.controla_token_mapa(t public.tokens_mapa) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.papel_na_campanha(t.campanha_id)='mestre' OR (private.papel_na_campanha(t.campanha_id)='jogador' AND NOT t.oculto AND NOT t.bloqueado AND private.camada_visivel(t.camada_id,t.cena_id) AND EXISTS(SELECT 1 FROM public.camadas_mapa l WHERE l.id=t.camada_id AND NOT l.bloqueada) AND coalesce(private.dono_token(t,auth.uid()),false))
$$;
CREATE OR REPLACE FUNCTION private.controla_area_mapa(a public.areas_mapa) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.area_mapa_visivel(a) AND EXISTS(SELECT 1 FROM public.camadas_mapa l WHERE l.id=a.camada_id AND l.cena_id=a.cena_id AND NOT l.bloqueada)
 AND (a.usuario_id=auth.uid() OR EXISTS(SELECT 1 FROM public.tokens_mapa t WHERE t.id=a.token_id AND t.cena_id=a.cena_id AND t.campanha_id=a.campanha_id AND private.controla_token_mapa(t)))
$$;
-- Exact cell-center coverage of the rendered primitive, after its rotation.
CREATE FUNCTION private.area_cobre(a public.areas_mapa,px numeric,py numeric) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE x double precision; y double precision; rad double precision:=a.angulo*pi()/180;
BEGIN
 x:=(px-a.x)*cos(rad)+(py-a.y)*sin(rad); y:=-(px-a.x)*sin(rad)+(py-a.y)*cos(rad);
 RETURN CASE a.forma WHEN 'circulo' THEN x*x+y*y<=a.tamanho*a.tamanho WHEN 'quadrado' THEN abs(x)<=a.tamanho/2 AND abs(y)<=a.tamanho/2 WHEN 'linha' THEN x BETWEEN 0 AND a.tamanho AND abs(y)<=a.largura/2 ELSE x BETWEEN 0 AND a.tamanho AND abs(y)<=x/2 END;
END $$;
-- Anchor offsets reveal the source position; linked effects inherit source visibility.
CREATE OR REPLACE FUNCTION private.area_mapa_visivel(a public.areas_mapa) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.camada_visivel(a.camada_id,a.cena_id) AND (a.token_id IS NULL OR EXISTS(SELECT 1 FROM public.tokens_mapa t WHERE t.id=a.token_id AND private.token_visivel(t))) AND
 (private.papel_na_campanha(a.campanha_id)='mestre' OR EXISTS(SELECT 1 FROM public.cenas_mapa c WHERE c.id=a.cena_id AND (c.modo_visao='manual' OR EXISTS(SELECT 1 FROM private.visibilidade_mapa v JOIN public.revisoes_mapa r ON r.campanha_id=c.campanha_id CROSS JOIN unnest(v.atual) cell WHERE v.cena_id=c.id AND v.usuario_id=auth.uid() AND v.revisao=r.revisao AND private.area_cobre(a,split_part(cell,',',1)::numeric+.5,split_part(cell,',',2)::numeric+.5)))))
$$;
CREATE FUNCTION private.objeto_visivel(o public.objetos_mapa) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.camada_visivel(o.camada_id,o.cena_id) AND (private.papel_na_campanha(o.campanha_id)='mestre' OR (NOT o.oculto AND EXISTS(SELECT 1 FROM public.cenas_mapa c WHERE c.id=o.cena_id AND (c.modo_visao='manual' OR EXISTS(SELECT 1 FROM private.visibilidade_mapa v JOIN public.revisoes_mapa r ON r.campanha_id=c.campanha_id CROSS JOIN unnest(v.atual) cell WHERE v.cena_id=c.id AND v.usuario_id=auth.uid() AND v.revisao=r.revisao AND split_part(cell,',',1)::numeric+.5 BETWEEN o.x AND o.x+o.w AND split_part(cell,',',2)::numeric+.5 BETWEEN o.y AND o.y+o.h)))))
$$;
CREATE FUNCTION private.arquivo_visivel(a public.arquivos_mapa) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.papel_na_campanha(a.campanha_id) IS NOT NULL AND (a.estado='pronto' OR a.usuario_id=auth.uid() OR private.papel_na_campanha(a.campanha_id)='mestre') AND (private.papel_na_campanha(a.campanha_id)='mestre' OR (a.visibilidade='campanha' AND
 ((NOT EXISTS(SELECT 1 FROM public.tokens_mapa t WHERE t.imagem_id=a.id) AND NOT EXISTS(SELECT 1 FROM public.objetos_mapa o WHERE o.imagem_id=a.id) AND NOT EXISTS(SELECT 1 FROM public.cenas_mapa c WHERE c.fundo_id=a.id)) OR
 EXISTS(SELECT 1 FROM public.tokens_mapa t WHERE t.imagem_id=a.id AND private.token_visivel(t)) OR EXISTS(SELECT 1 FROM public.objetos_mapa o WHERE o.imagem_id=a.id AND private.objeto_visivel(o)) OR EXISTS(SELECT 1 FROM public.cenas_mapa c WHERE c.fundo_id=a.id AND private.cena_visivel(c.id,c.campanha_id)))))
$$;
DROP POLICY cenas_leitura ON public.cenas_mapa;
CREATE POLICY cenas_leitura ON public.cenas_mapa FOR SELECT TO authenticated USING(private.cena_visivel(id,campanha_id));
DROP POLICY tokens_leitura ON public.tokens_mapa;
CREATE POLICY tokens_leitura ON public.tokens_mapa FOR SELECT TO authenticated USING(private.token_visivel(tokens_mapa));
DROP POLICY arquivos_leitura ON public.arquivos_mapa;
CREATE POLICY arquivos_leitura ON public.arquivos_mapa FOR SELECT TO authenticated USING(private.arquivo_visivel(arquivos_mapa));
-- Keep upload/delete rules, replacing the download predicate with current entity access.
ALTER FUNCTION private.arquivo_storage(text,text) RENAME TO arquivo_storage_anterior;
CREATE FUNCTION private.arquivo_storage(p_caminho text,p_acao text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.arquivo_storage_anterior(p_caminho,p_acao) AND (p_acao<>'ler' OR EXISTS(SELECT 1 FROM public.arquivos_mapa a WHERE a.caminho=p_caminho AND private.arquivo_visivel(a)))
$$;
DROP POLICY weirs_arquivos_download ON storage.objects;
CREATE POLICY weirs_arquivos_download ON storage.objects FOR SELECT TO authenticated USING(bucket_id='weirs-mesa' AND private.arquivo_storage(name,'ler'));
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['camadas_mapa','atribuicoes_mapa','paredes_mapa','objetos_mapa','revisoes_mapa'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
 END LOOP;
END $$;
CREATE POLICY camadas_leitura ON public.camadas_mapa FOR SELECT TO authenticated USING(private.camada_visivel(id,cena_id));
CREATE POLICY atribuicoes_leitura ON public.atribuicoes_mapa FOR SELECT TO authenticated USING(private.papel_na_campanha(campanha_id)='mestre' OR (usuario_id=auth.uid() AND private.papel_na_campanha(campanha_id) IS NOT NULL));
CREATE POLICY paredes_leitura ON public.paredes_mapa FOR SELECT TO authenticated USING(private.papel_na_campanha(campanha_id)='mestre');
CREATE POLICY objetos_leitura ON public.objetos_mapa FOR SELECT TO authenticated USING(private.objeto_visivel(objetos_mapa));
CREATE POLICY revisoes_leitura ON public.revisoes_mapa FOR SELECT TO authenticated USING(private.papel_na_campanha(campanha_id) IS NOT NULL);
-- Only revision notifications are published: no private row contents, including DELETE old rows.
DO $$ DECLARE tab text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
 FOR tab IN SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename IN ('cenas_mapa','tokens_mapa','areas_mapa','arquivos_mapa','marcadores_mapa') LOOP EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I',tab); END LOOP;
 ALTER PUBLICATION supabase_realtime ADD TABLE public.revisoes_mapa;
 END IF;
END $$;
CREATE FUNCTION private.segmentos_intersectam(ax numeric,ay numeric,bx numeric,b_y numeric,cx numeric,cy numeric,dx numeric,dy numeric) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE a numeric; b numeric; c numeric; d numeric;
BEGIN
 ax:=round(ax,4);ay:=round(ay,4);bx:=round(bx,4);b_y:=round(b_y,4);cx:=round(cx,4);cy:=round(cy,4);dx:=round(dx,4);dy:=round(dy,4);
 a:=(bx-ax)*(cy-ay)-(b_y-ay)*(cx-ax);b:=(bx-ax)*(dy-ay)-(b_y-ay)*(dx-ax);c:=(dx-cx)*(ay-cy)-(dy-cy)*(ax-cx);d:=(dx-cx)*(b_y-cy)-(dy-cy)*(bx-cx);
 RETURN (a*b<0 AND c*d<0) OR (a=0 AND cx BETWEEN least(ax,bx) AND greatest(ax,bx) AND cy BETWEEN least(ay,b_y) AND greatest(ay,b_y)) OR (b=0 AND dx BETWEEN least(ax,bx) AND greatest(ax,bx) AND dy BETWEEN least(ay,b_y) AND greatest(ay,b_y)) OR (c=0 AND ax BETWEEN least(cx,dx) AND greatest(cx,dx) AND ay BETWEEN least(cy,dy) AND greatest(cy,dy)) OR (d=0 AND bx BETWEEN least(cx,dx) AND greatest(cx,dx) AND b_y BETWEEN least(cy,dy) AND greatest(cy,dy));
END $$;
CREATE FUNCTION public.ler_mapa_visivel(p_campanha uuid,p_cena uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cenas_mapa; rev bigint; dono uuid:=auth.uid(); papel text; cells text[]:='{}'; explored text[]:='{}'; fontes integer:=0;
BEGIN
 PERFORM 1 FROM public.campanhas WHERE id=p_campanha FOR UPDATE;
 papel:=private.papel_na_campanha(p_campanha);
 IF NOT coalesce(private.cena_visivel(p_cena,p_campanha),false) THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Cena indisponível.'; END IF;
 SELECT * INTO c FROM public.cenas_mapa WHERE id=p_cena;
 SELECT revisao INTO rev FROM public.revisoes_mapa WHERE campanha_id=p_campanha;
 IF papel='espectador' THEN SELECT seguir_usuario_id INTO dono FROM public.atribuicoes_mapa WHERE campanha_id=p_campanha AND usuario_id=auth.uid(); END IF;
 IF papel='espectador' AND NOT EXISTS(SELECT 1 FROM public.cenas_mapa sc WHERE sc.id=p_cena AND sc.id=coalesce((SELECT a.cena_id FROM public.atribuicoes_mapa a WHERE a.campanha_id=p_campanha AND a.usuario_id=dono),(SELECT active.id FROM public.cenas_mapa active WHERE active.campanha_id=p_campanha AND active.ativa))) THEN dono:=NULL; END IF;
 IF dono IS NOT NULL AND EXISTS(SELECT 1 FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=dono AND m.papel='jogador') THEN
 SELECT count(*) INTO fontes FROM public.tokens_mapa t JOIN public.camadas_mapa l ON l.id=t.camada_id WHERE t.cena_id=p_cena AND NOT t.oculto AND l.visivel AND t.visao AND coalesce(private.dono_token(t,dono),false);
 SELECT coalesce(array_agg(key ORDER BY yy,xx),'{}') INTO cells FROM (
 SELECT DISTINCT gx xx,gy yy,gx::text||','||gy::text key FROM public.tokens_mapa t JOIN public.camadas_mapa l ON l.id=t.camada_id
 CROSS JOIN LATERAL generate_series(greatest(0,ceil(round(t.x+t.tamanho/2,4)-t.alcance_visao/c.unidade-.5)::int),least(c.largura-1,floor(round(t.x+t.tamanho/2,4)+t.alcance_visao/c.unidade-.5)::int)) gx
 CROSS JOIN LATERAL generate_series(greatest(0,ceil(round(t.y+t.tamanho/2,4)-t.alcance_visao/c.unidade-.5)::int),least(c.altura-1,floor(round(t.y+t.tamanho/2,4)+t.alcance_visao/c.unidade-.5)::int)) gy
 WHERE t.cena_id=p_cena AND NOT t.oculto AND l.visivel AND t.visao AND coalesce(private.dono_token(t,dono),false)
 AND power(gx+.5-(round(t.x+t.tamanho/2,4)),2)+power(gy+.5-(round(t.y+t.tamanho/2,4)),2)<=power(t.alcance_visao/c.unidade,2)
 AND NOT EXISTS(SELECT 1 FROM public.paredes_mapa w WHERE w.cena_id=p_cena AND NOT w.aberta
 AND greatest(round(w.x1,4),round(w.x2,4))>=least(round(t.x+t.tamanho/2,4),gx+.5) AND least(round(w.x1,4),round(w.x2,4))<=greatest(round(t.x+t.tamanho/2,4),gx+.5)
 AND greatest(round(w.y1,4),round(w.y2,4))>=least(round(t.y+t.tamanho/2,4),gy+.5) AND least(round(w.y1,4),round(w.y2,4))<=greatest(round(t.y+t.tamanho/2,4),gy+.5)
 AND private.segmentos_intersectam(round(t.x+t.tamanho/2,4),round(t.y+t.tamanho/2,4),gx+.5,gy+.5,w.x1,w.y1,w.x2,w.y2))) visible;
 END IF;
 SELECT coalesce(array_agg(DISTINCT cell),'{}') INTO explored FROM (SELECT unnest(cells) cell UNION SELECT unnest(v.explorada) FROM private.visibilidade_mapa v WHERE v.cena_id=p_cena AND v.usuario_id=auth.uid()) q WHERE split_part(cell,',',1)::int<c.largura AND split_part(cell,',',2)::int<c.altura;
 INSERT INTO private.visibilidade_mapa VALUES(p_cena,auth.uid(),rev,cells,explored) ON CONFLICT(cena_id,usuario_id) DO UPDATE SET revisao=EXCLUDED.revisao,atual=EXCLUDED.atual,explorada=EXCLUDED.explorada;
 RETURN jsonb_build_object('cena',to_jsonb(c),'revisao',rev,'atual',cells,'explorada',explored,'sem_fonte',fontes=0 AND papel<>'mestre',
 'tokens',(SELECT coalesce(jsonb_agg(t),'[]') FROM public.tokens_mapa t WHERE t.cena_id=p_cena AND private.token_visivel(t)),
 'areas',(SELECT coalesce(jsonb_agg(a),'[]') FROM public.areas_mapa a WHERE a.cena_id=p_cena AND private.area_mapa_visivel(a)),
 'objetos',(SELECT coalesce(jsonb_agg(o),'[]') FROM public.objetos_mapa o WHERE o.cena_id=p_cena AND private.objeto_visivel(o)),
 'camadas',(SELECT coalesce(jsonb_agg(l ORDER BY l.ordem),'[]') FROM public.camadas_mapa l WHERE l.cena_id=p_cena AND private.camada_visivel(l.id,l.cena_id)),
 'paredes',(SELECT coalesce(jsonb_agg(w),'[]') FROM public.paredes_mapa w WHERE w.cena_id=p_cena AND papel='mestre'),
 'atribuicoes',(SELECT coalesce(jsonb_agg(a),'[]') FROM public.atribuicoes_mapa a WHERE a.campanha_id=p_campanha AND (papel='mestre' OR a.usuario_id=auth.uid())),
 'assets',(SELECT coalesce(jsonb_agg(a),'[]') FROM public.arquivos_mapa a WHERE a.campanha_id=p_campanha AND private.arquivo_visivel(a)));
END $$;
-- Keep map helpers private without changing permissions used by other features' RLS.
REVOKE ALL ON FUNCTION
 private.preparar_cena_mapa(),private.invalidar_mapa(),private.cena_visivel(uuid,uuid),
 private.camada_visivel(uuid,uuid),private.dono_token(public.tokens_mapa,uuid),
 private.celula_visivel(uuid,numeric,numeric),private.token_visivel(public.tokens_mapa),
 private.controla_token_mapa(public.tokens_mapa),private.controla_area_mapa(public.areas_mapa),
 private.area_cobre(public.areas_mapa,numeric,numeric),private.area_mapa_visivel(public.areas_mapa),
 private.objeto_visivel(public.objetos_mapa),private.arquivo_visivel(public.arquivos_mapa),
 private.arquivo_storage(text,text),private.arquivo_storage_anterior(text,text),
 private.segmentos_intersectam(numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.camada_visivel(uuid,uuid),private.token_visivel(public.tokens_mapa),private.objeto_visivel(public.objetos_mapa),private.arquivo_visivel(public.arquivos_mapa),private.arquivo_storage(text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.ler_mapa_visivel(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ler_mapa_visivel(uuid,uuid) TO authenticated;
COMMIT;
