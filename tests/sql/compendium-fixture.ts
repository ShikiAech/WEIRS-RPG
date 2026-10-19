import { readFile, readdir } from 'node:fs/promises';
import { mesaFixture } from './mesa-fixture';

export async function compendiumFixture() {
  const fixture = await mesaFixture(['202610110005_rolagens_secretas.sql']);
  try {
    await fixture.db.exec(
      await readFile(new URL('./storage-bootstrap.sql', import.meta.url), 'utf8'),
    );
    for (const name of (await readdir(new URL('../../supabase/migrations/', import.meta.url)))
      .filter(
        (name) =>
          name >= '202610110006' && name <= '202610160011_compendio.sql' && name.endsWith('.sql'),
      )
      .sort()) {
      await fixture.db.exec(
        await readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8'),
      );
    }
    // Explicit read: the first RED run must fail if migration 011 does not exist.
    await readFile(
      new URL('../../supabase/migrations/202610160011_compendio.sql', import.meta.url),
      'utf8',
    );
    // This metadata upgrade is independent of creation storage (migration 012).
    await fixture.db.exec(
      await readFile(
        new URL('../../supabase/migrations/202610170013_compendio_metadados.sql', import.meta.url),
        'utf8',
      ),
    );
    await fixture.db.exec(
      await readFile(
        new URL(
          '../../supabase/migrations/202610190014_compendio_leitura_seletiva.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await fixture.db.query('INSERT INTO public.administradores(usuario_id) VALUES($1)', [
      fixture.outsider,
    ]);
    const sourceId = crypto.randomUUID();
    await fixture.db.query(
      `INSERT INTO public.compendio_fontes(id,titulo,edicao,idioma,origem)
      VALUES($1,'Fonte de teste','2024','pt-BR','homebrew')`,
      [sourceId],
    );

    async function draft(kind = 'especie', name = 'Espécie de teste') {
      const recordId = crypto.randomUUID(),
        revisionId = crypto.randomUUID();
      await fixture.db.query(
        'INSERT INTO public.compendio_registros(id,tipo,slug) VALUES($1,$2,$3)',
        [recordId, kind, recordId],
      );
      await fixture.db.query(
        `INSERT INTO public.compendio_revisoes
        (id,registro_id,numero,conjunto_regras_codigo,fonte_id,nome_pt,descricao_pt)
        VALUES($1,$2,1,'dnd-5e-2024',$3,$4,'Descrição completa de teste.')`,
        [revisionId, recordId, sourceId, name],
      );
      return { recordId, revisionId };
    }
    async function species(name = 'Espécie de teste') {
      const row = await draft('especie', name);
      await fixture.db.query('INSERT INTO public.compendio_especies(revisao_id) VALUES($1)', [
        row.revisionId,
      ]);
      await fixture.db.query(
        `INSERT INTO public.compendio_deslocamentos(revisao_id,modo,distancia,unidade)
        VALUES($1,'terrestre',9,'metros')`,
        [row.revisionId],
      );
      return row;
    }
    async function anonymous(sql: string, args: unknown[] = []) {
      await fixture.db.exec('BEGIN; SET LOCAL ROLE anon;');
      try {
        const result = await fixture.db.query<any>(sql, args);
        await fixture.db.exec('COMMIT');
        return result.rows;
      } catch (error) {
        await fixture.db.exec('ROLLBACK');
        throw error;
      }
    }
    const publish = (revisionId: string) =>
      fixture.user(fixture.outsider, 'SELECT * FROM public.publicar_compendio($1)', [revisionId]);
    return { ...fixture, admin: fixture.outsider, sourceId, draft, species, anonymous, publish };
  } catch (error) {
    await fixture.db.close();
    throw error;
  }
}
