import type { Page } from '@playwright/test';
import { fixture } from '../fixtures/creation';
import { backend, ownerId } from './backend';
import { validateCreationRequest, canonicalJson } from '../../packages/character-creation/server';
import type { SheetRecord } from '../../packages/contracts/sheets';
export async function creationBackend(page: Page) {
  const state = await backend(page, { empty: true }),
    f = fixture(),
    c = f.catalog;
  f.species.name = 'Espécie de teste';
  f.background.name = 'Origem de teste';
  f.cls.name = 'Classe de teste';
  const records = c.entries.map((e) => ({
    id: e.ref.revisionId,
    revisao_id: e.ref.revisionId,
    registro_id: e.ref.recordId,
    tipo: e.kind,
    slug: e.slug,
    nome_pt: e.name,
    nome_original: e.originalName,
    conjunto_regras_codigo: c.ruleSetId,
    automacao: 'completa',
    revisado_2024: true,
    fonte_id: e.sourceId,
    fonte_titulo: e.sourceTitle,
    descricao_pt: e.description,
    aliases: [],
    legados: [],
    fonte: {
      id: e.sourceId,
      titulo: e.sourceTitle,
      edicao: '2024',
      idioma: 'pt-BR',
      origem: 'homebrew',
    },
  }));
  const raw = {
    records,
    references: [],
    tables: {
      compendio_classes: [{ revisao_id: f.cls.ref.revisionId, dado_vida: 8, pv_fixo: 5 }],
      compendio_classe_atributos: [
        { revisao_id: f.cls.ref.revisionId, papel: 'primario', atributo_codigo: 'for' },
      ],
      compendio_antecedentes: [
        {
          revisao_id: f.background.ref.revisionId,
          distribuicao_atributos: '2-1-ou-1-1-1',
          limite_atributo: 20,
        },
      ],
      compendio_antecedente_atributos: ['for', 'des', 'con'].map((a) => ({
        revisao_id: f.background.ref.revisionId,
        atributo_codigo: a,
      })),
      compendio_especies: [
        {
          revisao_id: f.species.ref.revisionId,
          tipo_criatura_codigo: 'humanoide',
          tamanho_codigo: 'medio',
        },
      ],
      compendio_especie_tamanhos: [
        {
          revisao_id: f.species.ref.revisionId,
          tamanho_codigo: 'medio',
          forma_codigo: '',
          padrao: true,
        },
      ],
      compendio_deslocamentos: [
        {
          id: '00000000-0000-4000-8000-000000000050',
          revisao_id: f.species.ref.revisionId,
          modo: 'terrestre',
          distancia: 30,
          unidade: 'pes',
          forma_codigo: '',
          condicao_pt: '',
          pairar: false,
        },
      ],
    },
  };
  await page.route('**/rest/v1/rpc/buscar_compendio', (route) => {
    const q = route.request().postDataJSON();
    return route.fulfill({
      json: records.filter((r) => (!q.p_tipo || r.tipo === q.p_tipo) && !q.p_pai),
    });
  });
  await page.route(/\/rest\/v1\/rpc\/obter_compendio(?:_seletivo)?(?:\?.*)?$/, (route) =>
    route.fulfill({ json: raw }),
  );
  const control = {
    state,
    raw: raw as { records: unknown[]; tables: Record<string, any[]> },
    failAcknowledgement: true,
    requests: [] as any[],
    pending: null as Promise<void> | null,
  };
  const receipts = new Map<string, { input: string; record: SheetRecord }>();
  await page.route('**/functions/v1/criar-personagem', async (route) => {
    const body = route.request().postDataJSON();
    control.requests.push(body);
    try {
      const canonical = validateCreationRequest(c, body);
      let receipt = receipts.get(body.requestId);
      if (receipt && receipt.input !== canonicalJson(body))
        return route.fulfill({ status: 409, json: { code: 'DIVERGED' } });
      if (!receipt) {
        const record: SheetRecord = {
          id: body.requestId,
          campanha_id: body.campaignId,
          proprietario_id: ownerId,
          nome: body.name,
          conteudo: canonical.content,
          versao_esquema: 1,
          versao: 1,
          criado_em: '2026-10-16T00:00:00Z',
          atualizado_em: '2026-10-16T00:00:00Z',
        };
        receipt = { input: canonicalJson(body), record };
        receipts.set(body.requestId, receipt);
        state.rows.push(record);
      }
      if (control.pending) await control.pending;
      if (control.failAcknowledgement) {
        control.failAcknowledgement = false;
        return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } });
      }
      return route.fulfill({ json: { record: receipt.record } });
    } catch (error) {
      return route.fulfill({
        status: 400,
        json: { code: 'INVALID', problems: [{ field: 'criacao', message: String(error) }] },
      });
    }
  });
  return control;
}
