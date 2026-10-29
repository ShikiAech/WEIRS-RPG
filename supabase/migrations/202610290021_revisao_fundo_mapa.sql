BEGIN;

-- Recipient notifications contain revision stamps only. Token/vision changes do
-- not revoke the already authorized scene backdrop; scene/audience/asset changes do.
ALTER TABLE public.invalidacoes_mapa
 ADD COLUMN revisao_fundo bigint NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION private.invalidar_mapa() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 cid uuid;
 stamp bigint;
 invalidate_background boolean;
BEGIN
 cid:=coalesce(NEW.campanha_id,OLD.campanha_id);
 PERFORM 1 FROM public.campanhas WHERE id=cid FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.campanhas WHERE id=cid) THEN RETURN coalesce(NEW,OLD); END IF;

 INSERT INTO public.revisoes_mapa VALUES(cid,1)
 ON CONFLICT(campanha_id) DO UPDATE SET revisao=public.revisoes_mapa.revisao+1
 RETURNING revisao INTO stamp;

 invalidate_background:=TG_TABLE_NAME IN
  ('arquivos_mapa','atribuicoes_mapa','membros_campanha');
 IF TG_TABLE_NAME='cenas_mapa' THEN
  IF TG_OP='UPDATE' THEN
   invalidate_background:=OLD.fundo_id IS DISTINCT FROM NEW.fundo_id
    OR OLD.publicada IS DISTINCT FROM NEW.publicada
    OR OLD.ativa IS DISTINCT FROM NEW.ativa
    OR OLD.campanha_id IS DISTINCT FROM NEW.campanha_id;
  ELSE
   invalidate_background:=true;
  END IF;
 END IF;
 INSERT INTO public.invalidacoes_mapa(campanha_id,usuario_id,revisao,revisao_fundo)
 SELECT cid,m.usuario_id,1,CASE WHEN invalidate_background THEN stamp ELSE 1 END
 FROM public.membros_campanha m WHERE m.campanha_id=cid
 ON CONFLICT(campanha_id,usuario_id) DO UPDATE
 SET revisao=public.invalidacoes_mapa.revisao+1,
     revisao_fundo=CASE WHEN invalidate_background THEN EXCLUDED.revisao_fundo
                       ELSE public.invalidacoes_mapa.revisao_fundo END;

 -- The removed recipient must still receive a content-free revocation notice.
 IF TG_TABLE_NAME='membros_campanha' AND TG_OP='DELETE' THEN
  INSERT INTO public.invalidacoes_mapa(campanha_id,usuario_id,revisao,revisao_fundo)
  VALUES(cid,OLD.usuario_id,1,stamp)
  ON CONFLICT(campanha_id,usuario_id) DO UPDATE
  SET revisao=public.invalidacoes_mapa.revisao+1,revisao_fundo=EXCLUDED.revisao_fundo;
 END IF;
 RETURN coalesce(NEW,OLD);
END $$;

COMMIT;
