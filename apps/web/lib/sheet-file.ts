import { validarFicha } from '../../../packages/sheets/modelo.js';
import { sincronizarEquipamentos } from '../../../packages/sheets/equipamentos.js';
import type { SheetContent } from '../../../packages/contracts/sheets';
import { SheetError } from './errors';

export function readSheetFile(source: string): { name: string; content: SheetContent } {
  try {
    if (new TextEncoder().encode(source).length > 262144) throw Error();
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error();
    const errors = validarFicha(parsed);
    if (errors.length) throw new SheetError('VALIDACAO', errors);
    // Permissões, dono, versão de gravação e campanha pertencem à mesa atual.
    const content = sincronizarEquipamentos(parsed.conteudo);
    const normalizedErrors = validarFicha({ ...parsed, conteudo: content });
    if (normalizedErrors.length) throw new SheetError('VALIDACAO', normalizedErrors);
    return { name: parsed.nome.trim(), content };
  } catch (error) {
    if (error instanceof SheetError) throw error;
    throw new SheetError('VALIDACAO', [
      { campo: 'arquivo', mensagem: 'Escolha uma cópia JSON válida da ficha, de até 256 KiB.' },
    ]);
  }
}
