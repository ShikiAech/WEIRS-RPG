import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { criarConteudo } from '../../packages/sheets/modelo.js';

export async function mesaFixture(extra: string[] = []) {
  const db = new PGlite();
  await db.exec(await readFile(new URL('./bootstrap.sql', import.meta.url), 'utf8'));
  for (const name of [
    '202610070001_foundation.sql',
    '202610070002_chat.sql',
    '202610070003_chat_receipts_rls.sql',
    '202610070004_mesa.sql',
    ...extra,
  ]) {
    await db.exec(
      await readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8'),
    );
  }
  const gm = crypto.randomUUID(),
    player = crypto.randomUUID(),
    outsider = crypto.randomUUID(),
    spectator = crypto.randomUUID(),
    campaign = crypto.randomUUID(),
    sheet = crypto.randomUUID();
  for (const id of [gm, player, outsider, spectator])
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [id]);
  await db.query("INSERT INTO public.campanhas(id,nome) VALUES($1,'Othans')", [campaign]);
  for (const [id, papel] of [
    [gm, 'mestre'],
    [player, 'jogador'],
    [spectator, 'espectador'],
  ])
    await db.query('INSERT INTO public.membros_campanha VALUES($1,$2,$3)', [campaign, id, papel]);
  const content = criarConteudo();
  content.combate.pvAtuais = content.combate.pvMaximos = 20;
  await db.query(
    "INSERT INTO public.fichas(id,campanha_id,proprietario_id,nome,conteudo) VALUES($1,$2,$3,'Zephira',$4)",
    [sheet, campaign, player, content],
  );
  async function user(id: string, sql: string, args: unknown[] = []) {
    await db.exec('BEGIN; SET LOCAL ROLE authenticated;');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [id]);
    try {
      const result = await db.query<any>(sql, args);
      await db.exec('COMMIT');
      return result.rows;
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    }
  }
  return { db, gm, player, outsider, spectator, campaign, sheet, user };
}
