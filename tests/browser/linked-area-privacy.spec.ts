import { test, expect } from '@playwright/test';
import { backend, campaignId, ownerId } from './backend';
import { chatBackend } from './chat-backend';
import { tabletopBackend, tokenId, otherTokenId } from './tabletop-backend';

for (const readonly of [false, true]) {
  test(`${readonly ? 'following spectator' : 'player'} drops orphan anchors before snapshot state and rendering`, async ({
    page,
  }) => {
    const sheets = await backend(page, { readonly });
    const chat = await chatBackend(page, undefined, { readonly });
    const maps = await tabletopBackend(page, sheets, chat, undefined, { readonly });
    const scene = maps.scenes[0];
    scene.modo_visao = 'automatica';
    let sourceVisible = true;
    const linked = {
      id: 'linked-effect',
      campanha_id: campaignId,
      cena_id: scene.id,
      versao: 1,
      usuario_id: ownerId,
      token_id: otherTokenId,
      nome: 'Efeito vinculado',
      forma: 'circulo',
      x: 3,
      y: 3,
      tamanho: 1,
      largura: 1,
      angulo: 0,
      cor: '#ffffff',
      ancora_dx: -4,
      ancora_dy: 0,
      ancora_rotacao: 0,
      ancora_angulo: 0,
      acompanhar_rotacao: false,
    };
    const owned = {
      ...linked,
      id: 'owned-effect',
      token_id: tokenId,
      ancora_dx: 0,
      nome: 'Efeito próprio',
    };
    const unlinked = {
      ...linked,
      id: 'unlinked-effect',
      token_id: null,
      ancora_dx: null,
      ancora_dy: null,
      nome: 'Efeito independente',
    };
    // Deliberately inconsistent transport response: the real repository must
    // reject an area whose source is absent, even if the server sends one.
    await page.route('https://weirs-test.supabase.co/rest/v1/rpc/ler_mapa_visivel', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          cena: scene,
          revisao: sourceVisible ? 1 : 2,
          atual: ['3,3'],
          explorada: ['3,3'],
          sem_fonte: false,
          tokens: maps.tokens.filter(
            (row) => row.id === tokenId || (sourceVisible && row.id === otherTokenId),
          ),
          areas: [linked, owned, unlinked],
          camadas: [],
          paredes: [],
          objetos: [],
          atribuicoes: [],
          assets: [],
        }),
      }),
    );
    await page.goto('app.html#/chat');
    if (test.info().project.name === 'mobile')
      await page.getByRole('button', { name: 'Mapa', exact: true }).click();
    await expect(page.locator('[data-area-id="linked-effect"]')).toHaveCount(1);
    sourceVisible = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByRole('button', { name: 'Token Guarda', exact: true })).toHaveCount(0);
    // Inspect the production repository boundary used to populate both snapshot
    // and area state; DOM-only clipping would not satisfy this assertion.
    const current = await page.evaluate(
      async ({ campaign, sceneId }) => {
        const base = '/WEIRS-RPG/apps/web/lib/';
        const { createTabletopRepository } = await import(/* @vite-ignore */ base + 'tabletop.ts');
        const { supabase } = await import(/* @vite-ignore */ base + 'supabase.ts');
        return createTabletopRepository(supabase).snapshot(campaign, sceneId);
      },
      { campaign: campaignId, sceneId: scene.id },
    );
    expect(current.areas.map((row: { id: string }) => row.id).sort()).toEqual([
      'owned-effect',
      'unlinked-effect',
    ]);
    expect(JSON.stringify(current)).not.toContain(otherTokenId);
    await expect(page.locator('[data-area-id="linked-effect"]')).toHaveCount(0);
    await expect(page.locator('[data-area-id="owned-effect"]')).toHaveCount(1);
    await expect(page.locator('[data-area-id="unlinked-effect"]')).toHaveCount(1);
  });
}
