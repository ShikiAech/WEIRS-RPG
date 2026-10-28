import { test, expect } from '@playwright/test';
import { creationBackend } from './creation-backend';

test('linhagens opcionais usam consulta própria, distinguem erro de vazio e reutilizam consultas ao voltar', async ({
  page,
}) => {
  const control = await creationBackend(page);
  let calls = 0,
    catalogCalls = 0,
    fail = true,
    release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const species = (control.raw.records as any[]).find((r) => r.tipo === 'especie');
  const lineage = {
    ...species,
    registro_id: '00000000-0000-4000-8000-000000005501',
    revisao_id: '00000000-0000-4000-8000-000000005502',
    nome_pt: 'Variante opcional',
    tipo: 'linhagem',
  };
  await page.route('**/rest/v1/rpc/buscar_compendio', async (route) => {
    const q = route.request().postDataJSON();
    if (q.p_tipo === 'linhagem') {
      calls++;
      await delayed;
      return fail
        ? route.fulfill({ status: 503, json: { message: 'offline' } })
        : route.fulfill({ json: [lineage] });
    }
    return route.fulfill({
      json: (control.raw.records as any[]).filter((r) => r.tipo === q.p_tipo),
    });
  });
  await page.route('**/rest/v1/rpc/obter_compendio', (route) => {
    catalogCalls++;
    return route.fulfill({ json: control.raw });
  });
  await page.goto('app.html#/fichas/nova');
  await page.getByRole('button', { name: '2 Espécie', exact: true }).click();
  await page.getByRole('combobox', { name: 'Espécie', exact: true }).fill(species.nome_pt);
  await page
    .getByRole('option', { name: `${species.nome_pt} · ${species.fonte_titulo}`, exact: true })
    .click();
  await expect(page.getByText('Consultando linhagens…', { exact: true })).toBeVisible();
  release();
  await expect(
    page.getByText('Não foi possível consultar as linhagens.', { exact: false }),
  ).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Linhagem (quando houver)', exact: true }),
  ).toBeVisible();
  const count = calls,
    catalogs = catalogCalls;
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await page.getByRole('button', { name: '2 Espécie', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Linhagem (quando houver)', exact: true }),
  ).toBeVisible();
  expect(calls).toBe(count);
  expect(catalogCalls).toBe(catalogs);
});
