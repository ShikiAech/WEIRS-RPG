-- Gerado pelo importador a partir das páginas originais. Executar como administrador após a migração.
-- Não altera nomes já cadastrados e não concede acesso a nenhuma conta.
INSERT INTO public.campanhas (id,nome) VALUES
  ('508cdfdb-e6c0-8aac-ab86-dd036a4234d3','Crônicas de Othans'),
  ('6400a630-0781-8129-ad1a-424ae39fc615','EPM - Escola de Príncipios Místicos'),
  ('17931442-e319-8d9e-aac6-e15c953d7341','A TAVERNA DE JUNGLE JACK')
ON CONFLICT (id) DO NOTHING;
