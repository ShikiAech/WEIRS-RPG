import type { Page } from '@playwright/test';
import { campaignId, ownerId, type backend } from './backend';
import type { chatBackend } from './chat-backend';
import type { AssetRecord, SceneRecord, TokenRecord } from '../../packages/contracts/tabletop';

export const sceneId = '70000000-0000-4000-a000-000000000001';
export const tokenId = '71000000-0000-4000-a000-000000000001';
export const hiddenTokenId = '71000000-0000-4000-a000-000000000002';
export const otherTokenId = '71000000-0000-4000-a000-000000000003';

export function tabletopState() {
  const scene: SceneRecord = {
    id: sceneId,
    campanha_id: campaignId,
    nome: 'Ruínas de Othans',
    versao: 1,
    largura: 24,
    altura: 16,
    unidade: 5,
    grade: true,
    publicada: true,
    ativa: true,
    fundo_id: null,
    nevoa: false,
    revelacoes: [],
    desenhos: [],
  };
  const token = (id: string, extra: Partial<TokenRecord>): TokenRecord => ({
    id,
    campanha_id: campaignId,
    cena_id: sceneId,
    versao: 1,
    nome: 'Zephira',
    x: 3,
    y: 3,
    tamanho: 1,
    cor: '#d4af37',
    rotacao: 0,
    oculto: false,
    bloqueado: false,
    ficha_id: '30000000-0000-4000-a000-000000000001',
    controlador_id: ownerId,
    imagem_id: null,
    combate_id: null,
    ...extra,
  });
  return {
    scenes: [scene] as SceneRecord[],
    tokens: [
      token(tokenId, {}),
      token(hiddenTokenId, {
        nome: 'Emboscada secreta',
        x: 9,
        y: 4,
        oculto: true,
        ficha_id: null,
        controlador_id: null,
      }),
      token(otherTokenId, { nome: 'Guarda', x: 7, y: 3, ficha_id: null, controlador_id: null }),
    ] as TokenRecord[],
    assets: [] as AssetRecord[],
    assetOwners: new Map<string, string>(),
    pings: [] as {
      id: string;
      campanha_id: string;
      cena_id: string;
      usuario_id: string;
      nome: string;
      x: number;
      y: number;
      criado_em: string;
    }[],
    objects: new Map<string, { body: Buffer; mime: string }>(),
    receipts: new Map<string, { command: unknown; response: any }>(),
    operations: [] as { pedido: string; command: any }[],
    lost: false,
    denied: false,
    uploadFailure: false,
    delay: null as Promise<void> | null,
    beforeOperation: null as (() => void) | null,
  };
}

// O mock mantém o SDK Supabase real no navegador. As permissões finais, SQL e
// Storage/RLS são exercitados no PostgreSQL por tests/tabletop.test.ts.
export async function tabletopBackend(
  page: Page,
  sheets: Awaited<ReturnType<typeof backend>>,
  chat?: Awaited<ReturnType<typeof chatBackend>>,
  shared?: ReturnType<typeof tabletopState>,
  options: { master?: boolean; readonly?: boolean } = {},
) {
  const state = shared || tabletopState();
  const readableScene = (id: string) =>
    state.scenes.some((s) => s.id === id && (options.master || s.publicada));
  const controlled = (t: TokenRecord) =>
    options.master ||
    (!options.readonly &&
      (t.controlador_id === ownerId ||
        sheets.rows.some((f) => f.id === t.ficha_id && f.proprietario_id === ownerId)));
  const respond = (route: any, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const publish = (table: string, record: any, type = 'UPDATE') => {
    for (const socket of chat?.sockets || []) {
      if (table === 'tokens_mapa' && record.oculto && !socket.master) continue;
      if (table === 'cenas_mapa' && !record.publicada && !socket.master) continue;
      if (table === 'arquivos_mapa' && record.visibilidade === 'mestre' && !socket.master) continue;
      if (
        record.cena_id &&
        !socket.master &&
        !state.scenes.some((s) => s.id === record.cena_id && s.publicada)
      )
        continue;
      const ids = socket.filters
        .filter(
          (f) =>
            f.schema === 'public' && f.table === table && (f.event === '*' || f.event === type),
        )
        .map((f) => f.id);
      if (!socket.topic || !ids.length) continue;
      socket.ws.send(
        JSON.stringify([
          socket.join,
          null,
          socket.topic,
          'postgres_changes',
          {
            ids,
            data: {
              schema: 'public',
              table,
              type,
              commit_timestamp: new Date().toISOString(),
              columns: [],
              record,
              old_record: type === 'DELETE' ? { id: record.id } : {},
              errors: null,
            },
          },
        ]),
      );
    }
  };
  for (const table of ['cenas_mapa', 'tokens_mapa', 'arquivos_mapa', 'marcadores_mapa']) {
    await page.route(`https://weirs-test.supabase.co/rest/v1/${table}**`, async (route) => {
      if (state.denied) return respond(route, { code: 'WV002' }, 403);
      const params = new URL(route.request().url()).searchParams;
      let rows: any[] =
        table === 'cenas_mapa'
          ? state.scenes.filter((s) => options.master || s.publicada)
          : table === 'tokens_mapa'
            ? state.tokens.filter((t) => readableScene(t.cena_id) && (options.master || !t.oculto))
            : table === 'marcadores_mapa'
              ? state.pings.filter(
                  (p) => readableScene(p.cena_id) && Date.parse(p.criado_em) > Date.now() - 6000,
                )
              : state.assets.filter((a) => options.master || a.visibilidade === 'campanha');
      for (const key of ['id', 'cena_id', 'campanha_id', 'estado']) {
        const filter = params.get(key);
        if (filter?.startsWith('eq.'))
          rows = rows.filter((r) => String(r[key]) === filter.slice(3));
      }
      return respond(route, rows);
    });
  }
  await page.route('https://weirs-test.supabase.co/rest/v1/rpc/marcar_mapa', async (route) => {
    const { p_cena, p_x, p_y } = route.request().postDataJSON();
    if (state.denied || options.readonly || !readableScene(p_cena))
      return respond(route, { code: 'WV002' }, 403);
    const ping = {
      id: crypto.randomUUID(),
      campanha_id: campaignId,
      cena_id: p_cena,
      usuario_id: ownerId,
      nome: 'Jogador da mesa',
      x: p_x,
      y: p_y,
      criado_em: new Date().toISOString(),
    };
    state.pings = [
      ...state.pings.filter((p) => p.cena_id !== p_cena || p.usuario_id !== ownerId),
      ping,
    ];
    publish('marcadores_mapa', ping, 'INSERT');
    return respond(route, ping);
  });
  await page.route('https://weirs-test.supabase.co/storage/v1/object/**', async (route) => {
    const request = route.request();
    const pathname = decodeURIComponent(new URL(request.url()).pathname);
    const path = pathname.replace(/^\/storage\/v1\/object\/(authenticated\/)?weirs-mesa\//, '');
    const method = request.method();
    if (method === 'POST') {
      if (state.uploadFailure) return respond(route, { message: 'upload indisponível' }, 503);
      const asset = state.assets.find((a) => a.caminho === path);
      if (!asset || asset.estado !== 'pendente' || state.assetOwners.get(asset.id) !== ownerId)
        return respond(route, { message: 'denied' }, 403);
      const contentType = request.headers()['content-type'] || 'application/octet-stream';
      if (contentType.startsWith('multipart/form-data')) {
        const payload = new Uint8Array(request.postDataBuffer()!).buffer;
        const form = await new Response(payload, {
          headers: { 'Content-Type': contentType },
        }).formData();
        const file = [...form.values()].find((value) => typeof value !== 'string');
        if (!file || typeof file === 'string') throw new Error('Upload Supabase sem arquivo');
        state.objects.set(path, { body: Buffer.from(await file.arrayBuffer()), mime: file.type });
      } else state.objects.set(path, { body: request.postDataBuffer()!, mime: contentType });
      return respond(route, { Key: 'weirs-mesa/' + path });
    }
    if (method === 'DELETE') {
      const prefixes = request.postDataJSON()?.prefixes || [];
      if (
        prefixes.some(
          (prefix: string) =>
            state.assets.find((a) => a.caminho === prefix)?.estado !== 'excluindo',
        )
      )
        return respond(route, { message: 'arquivo em uso' }, 403);
      for (const prefix of prefixes) state.objects.delete(prefix);
      return respond(route, []);
    }
    const object = state.objects.get(path);
    if (!object) return respond(route, { message: 'not found' }, 404);
    const asset = state.assets.find((a) => a.caminho === path);
    if (!asset || asset.estado !== 'pronto' || (!options.master && asset.visibilidade === 'mestre'))
      return respond(route, { message: 'denied' }, 403);
    return route.fulfill({ contentType: object.mime, body: object.body });
  });
  await page.route('https://weirs-test.supabase.co/rest/v1/rpc/operar_mapa', async (route) => {
    const { p_pedido, p_comando: c } = route.request().postDataJSON();
    state.operations.push({ pedido: p_pedido, command: structuredClone(c) });
    await state.delay;
    const before = state.beforeOperation;
    state.beforeOperation = null;
    before?.();
    if (state.denied || options.readonly) return respond(route, { code: 'WV002' }, 403);
    const isToken = c.tipo.startsWith('token_');
    const isAsset = c.tipo.startsWith('arquivo_');
    const currentToken = state.tokens.find((t) => t.id === c.id);
    const currentAsset = state.assets.find((a) => a.id === c.id);
    if (
      !options.master &&
      isAsset &&
      (c.visibilidade === 'mestre' ||
        (currentAsset &&
          (currentAsset.visibilidade === 'mestre' ||
            state.assetOwners.get(currentAsset.id) !== ownerId)))
    )
      return respond(route, { code: 'WV002' }, 403);
    if (
      !options.master &&
      !isAsset &&
      (!isToken ||
        c.tipo !== 'token_atualizar' ||
        !currentToken ||
        !controlled(currentToken) ||
        currentToken.oculto ||
        currentToken.bloqueado)
    )
      return respond(route, { code: 'WV002' }, 403);
    const prior = state.receipts.get(p_pedido);
    if (prior) {
      if (JSON.stringify(prior.command) !== JSON.stringify(c))
        return respond(route, { code: 'WV004' }, 409);
      return respond(route, prior.response);
    }
    let response: any;
    if (c.tipo === 'cena_criar') {
      const scene: SceneRecord = {
        ...state.scenes[0],
        id: crypto.randomUUID(),
        nome: c.nome,
        largura: c.largura,
        altura: c.altura,
        unidade: c.unidade || 5,
        grade: c.grade ?? true,
        versao: 1,
        publicada: c.publicada ?? false,
        ativa: false,
        fundo_id: c.fundo_id || null,
        nevoa: false,
        revelacoes: [],
        desenhos: [],
      };
      state.scenes.push(scene);
      response = { cena: scene };
      publish('cenas_mapa', scene, 'INSERT');
    } else if (c.tipo.startsWith('cena_')) {
      const scene = state.scenes.find((s) => s.id === c.id);
      if (!scene || scene.versao !== c.versao) return respond(route, { code: 'WV001' }, 409);
      if (c.tipo === 'cena_excluir') {
        state.scenes = state.scenes.filter((s) => s !== scene);
        state.tokens = state.tokens.filter((t) => t.cena_id !== scene.id);
        response = { excluido: scene.id };
        publish('cenas_mapa', scene, 'DELETE');
      } else {
        if (c.tipo === 'cena_ativar') {
          state.scenes.forEach((s) => {
            s.ativa = false;
          });
          scene.ativa = true;
          scene.publicada = true;
        } else Object.assign(scene, c.patch);
        scene.versao++;
        response = { cena: scene };
        publish('cenas_mapa', scene);
      }
    } else if (c.tipo === 'token_criar') {
      const token: TokenRecord = {
        id: crypto.randomUUID(),
        campanha_id: campaignId,
        cena_id: c.cena_id,
        versao: 1,
        nome: c.nome,
        x: c.x,
        y: c.y,
        tamanho: c.tamanho,
        cor: c.cor,
        rotacao: c.rotacao || 0,
        oculto: !!c.oculto,
        bloqueado: !!c.bloqueado,
        ficha_id: c.ficha_id || null,
        controlador_id: c.controlador_id || null,
        imagem_id: c.imagem_id || null,
        combate_id: c.combate_id || null,
      };
      state.tokens.push(token);
      response = { token };
      publish('tokens_mapa', token, 'INSERT');
    } else if (c.tipo.startsWith('token_')) {
      if (!currentToken || currentToken.versao !== c.versao)
        return respond(route, { code: 'WV001' }, 409);
      if (
        !options.master &&
        Object.keys(c.patch || {}).some((key) => !['x', 'y', 'rotacao'].includes(key))
      )
        return respond(route, { code: 'WV002' }, 403);
      if (c.tipo === 'token_excluir') {
        state.tokens = state.tokens.filter((t) => t !== currentToken);
        response = { excluido: currentToken.id };
        publish('tokens_mapa', currentToken, 'DELETE');
      } else {
        Object.assign(currentToken, c.patch);
        currentToken.versao++;
        response = { token: currentToken };
        publish('tokens_mapa', currentToken);
      }
    } else if (c.tipo === 'arquivo_registrar') {
      const asset: AssetRecord = {
        id: c.id,
        campanha_id: campaignId,
        nome: c.nome,
        mime: c.mime,
        tamanho: c.tamanho,
        visibilidade: c.visibilidade,
        estado: 'pendente',
        caminho: `${campaignId}/${c.id}`,
      };
      state.assets.push(asset);
      state.assetOwners.set(asset.id, ownerId);
      response = { asset };
    } else if (c.tipo === 'arquivo_finalizar') {
      const asset = state.assets.find((a) => a.id === c.id)!;
      if (!asset || asset.estado === 'excluindo' || !state.objects.has(asset.caminho))
        return respond(route, { code: 'WV003' }, 400);
      asset.estado = 'pronto';
      response = { asset };
      publish('arquivos_mapa', asset, 'INSERT');
    } else if (c.tipo === 'arquivo_preparar_exclusao') {
      if (!currentAsset) return respond(route, { code: 'WV002' }, 403);
      if (
        state.scenes.some((s) => s.fundo_id === c.id) ||
        state.tokens.some((t) => t.imagem_id === c.id)
      )
        return respond(route, { code: 'WV003' }, 400);
      currentAsset.estado = 'excluindo';
      response = { asset: currentAsset };
      publish('arquivos_mapa', currentAsset);
    } else if (c.tipo === 'arquivo_excluir') {
      if (
        currentAsset &&
        (currentAsset.estado !== 'excluindo' || state.objects.has(currentAsset.caminho))
      )
        return respond(route, { code: 'WV003' }, 400);
      state.assets = state.assets.filter((a) => a.id !== c.id);
      state.assetOwners.delete(c.id);
      response = { excluido: c.id };
    } else return respond(route, { code: 'WV003' }, 400);
    state.receipts.set(p_pedido, {
      command: structuredClone(c),
      response: structuredClone(response),
    });
    if (state.lost) {
      state.lost = false;
      return respond(route, { message: 'offline' }, 503);
    }
    return respond(route, response);
  });
  return state;
}
