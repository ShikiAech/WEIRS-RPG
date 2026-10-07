import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { criarConteudo } from '../packages/sheets/modelo.js';

test('PostgreSQL protege campanhas, papéis, propriedade e versões de ficha', async () => {
  const db = new PGlite();
  const a = '10000000-0000-4000-a000-000000000001';
  const b = '10000000-0000-4000-a000-000000000002';
  const gm = '10000000-0000-4000-a000-000000000003';
  const outsider = '10000000-0000-4000-a000-000000000004';
  const c1 = '20000000-0000-4000-a000-000000000001';
  const c2 = '20000000-0000-4000-a000-000000000002';
  const sheet = '30000000-0000-4000-a000-000000000001';
  async function asUser(user: string, sql: string, values: unknown[] = []) {
    await db.exec('BEGIN; SET LOCAL ROLE authenticated;');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [user]);
    try {
      const result = await db.query(sql, values);
      await db.exec('COMMIT');
      return result;
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  }
  try {
    await db.exec(await readFile(new URL('./sql/bootstrap.sql', import.meta.url), 'utf8'));
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202610070001_foundation.sql', import.meta.url),
        'utf8',
      ),
    );
    const seed = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8');
    await db.exec(seed);
    await db.exec(seed);
    assert.equal((await db.query('SELECT * FROM public.campanhas')).rows.length, 3);
    for (const id of [a, b, gm, outsider])
      await db.query('INSERT INTO auth.users(id,raw_user_meta_data) VALUES($1,$2)', [
        id,
        { full_name: 'Ímpio', papel: 'mestre' },
      ]);
    await db.query('INSERT INTO public.campanhas(id,nome) VALUES($1,$2),($3,$4)', [
      c1,
      'Othans',
      c2,
      'EPM',
    ]);
    await db.query(
      "INSERT INTO public.membros_campanha(campanha_id,usuario_id,papel) VALUES($1,$2,'jogador'),($1,$3,'jogador'),($1,$4,'mestre'),($5,$6,'mestre')",
      [c1, a, b, gm, c2, outsider],
    );
    const content = criarConteudo();
    const result = await asUser(
      a,
      'INSERT INTO public.fichas(id,campanha_id,nome,conteudo) VALUES($1,$2,$3,$4) RETURNING *',
      [sheet, c1, '  Zephira  ', content],
    );
    assert.equal((result.rows[0] as { nome: string }).nome, 'Zephira');
    assert.equal((await asUser(b, 'SELECT * FROM public.fichas')).rows.length, 0);
    assert.equal((await asUser(outsider, 'SELECT * FROM public.fichas')).rows.length, 0);
    assert.equal((await asUser(gm, 'SELECT * FROM public.fichas')).rows.length, 1);
    assert.equal((await asUser(a, 'SELECT * FROM public.campanhas')).rows.length, 1);
    assert.equal((await asUser(a, 'SELECT * FROM public.membros_campanha')).rows.length, 3);
    await assert.rejects(
      asUser(outsider, 'INSERT INTO public.fichas(campanha_id,nome,conteudo) VALUES($1,$2,$3)', [
        c1,
        'Invasor',
        content,
      ]),
    );
    await assert.rejects(
      asUser(a, "UPDATE public.membros_campanha SET papel='mestre' WHERE usuario_id=$1", [a]),
    );
    await assert.rejects(
      asUser(a, 'UPDATE public.fichas SET proprietario_id=$1 WHERE id=$2', [b, sheet]),
    );
    await assert.rejects(
      asUser(a, 'UPDATE public.fichas SET campanha_id=$1 WHERE id=$2', [c2, sheet]),
    );
    await assert.rejects(
      asUser(b, 'SELECT public.salvar_ficha($1,1,$2,$3,1)', [sheet, 'Roubo', content]),
      (e: unknown) => (e as { code: string }).code === 'WF002',
    );
    const saved = await asUser(gm, 'SELECT * FROM public.salvar_ficha($1,1,$2,$3,1)', [
      sheet,
      'Zephira atualizada',
      content,
    ]);
    assert.equal((saved.rows[0] as { versao: number }).versao, 2);
    await assert.rejects(
      asUser(a, 'SELECT public.salvar_ficha($1,1,$2,$3,1)', [sheet, 'Antiga', content]),
      (e: unknown) => (e as { code: string }).code === 'WF001',
    );
    assert.equal(
      (await asUser(gm, 'DELETE FROM public.fichas WHERE id=$1 RETURNING id', [sheet])).rows.length,
      0,
    );
    await assert.rejects(
      asUser(a, 'SELECT public.salvar_ficha($1,2,$2,$3,2)', [sheet, 'Inválida', content]),
    );
    await assert.rejects(
      asUser(a, 'SELECT public.salvar_ficha($1,2,$2,$3,1)', [
        sheet,
        'Enorme',
        { ...content, historia: { ...content.historia, anotacoes: 'a'.repeat(270000) } },
      ]),
    );
    await assert.rejects(
      asUser(a, 'INSERT INTO public.fichas(campanha_id,nome,conteudo,versao) VALUES($1,$2,$3,5)', [
        c1,
        'Versão falsa',
        content,
      ]),
    );
    await db.exec('BEGIN; SET LOCAL ROLE anon;');
    await assert.rejects(db.query('SELECT * FROM public.fichas'));
    await db.exec('ROLLBACK');
    await db.query('DELETE FROM public.membros_campanha WHERE campanha_id=$1 AND usuario_id=$2', [
      c1,
      a,
    ]);
    assert.equal((await asUser(a, 'SELECT * FROM public.fichas')).rows.length, 0);
    await assert.rejects(
      asUser(a, 'SELECT public.salvar_ficha($1,2,$2,$3,1)', [sheet, 'Sem convite', content]),
    );
    await db.query(
      "INSERT INTO public.membros_campanha(campanha_id,usuario_id,papel) VALUES($1,$2,'jogador')",
      [c1, a],
    );
    assert.equal(
      (await asUser(a, 'DELETE FROM public.fichas WHERE id=$1 RETURNING id', [sheet])).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
