import type { CreationCatalog, CreationDraft } from '../contracts/character-creation';
import type { SheetContent } from '../contracts/sheets';
import { validarFicha, UUID } from '../sheets/modelo.js';
import { validCreationDraft } from './validation.js';
import { resolveCreation } from './resolve';
export interface CreationRequest {
  campaignId: string;
  name: string;
  requestId: string;
  draft: CreationDraft;
  expectedSheet: SheetContent | null;
}
export class CreationError extends Error {
  constructor(
    public code: 'INVALID' | 'DIVERGED' | 'UNAVAILABLE' | 'ACCESS',
    message: string,
    public problems: { field: string; message: string }[] = [],
  ) {
    super(message);
  }
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonicalJson(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function validCreationRequest(request: unknown): request is CreationRequest {
  const r = request as CreationRequest;
  return (
    !!r &&
    typeof r === 'object' &&
    UUID.test(r.campaignId) &&
    UUID.test(r.requestId) &&
    typeof r.name === 'string' &&
    r.name.trim().length > 0 &&
    r.name.trim().length <= 120 &&
    validCreationDraft(r.draft) &&
    !!r.expectedSheet
  );
}
export function validateCreationRequest(catalog: CreationCatalog, request: unknown) {
  if (!validCreationRequest(request))
    throw new CreationError('INVALID', 'Revise os dados de criação.');
  const preview = resolveCreation(catalog, request.draft);
  if (preview.problems.length || !preview.sheet)
    throw new CreationError('INVALID', 'Resolva as pendências antes de criar.', preview.problems);
  if (canonicalJson(preview.sheet) !== canonicalJson(request.expectedSheet))
    throw new CreationError(
      'DIVERGED',
      'A prévia mudou. Atualize o compêndio e revise os valores.',
    );
  const snapshot = {
    schemaVersion: 1 as const,
    draft: structuredClone(request.draft),
    contributions: preview.contributions,
  };
  const content: SheetContent = { ...preview.sheet, criacao: snapshot };
  const errors = validarFicha({ nome: request.name, versao_esquema: 1, conteudo: content });
  if (errors.length)
    throw new CreationError(
      'INVALID',
      'A ficha excede seus limites ou possui valores inválidos.',
      errors.map((e) => ({ field: e.campo, message: e.mensagem })),
    );
  return { content, snapshot, preview };
}
