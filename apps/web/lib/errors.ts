const messages = {
  CONFIGURACAO:
    'O acesso à mesa ainda não foi configurado. Você pode consultar o compêndio e experimentar uma ficha temporária.',
  SESSAO: 'Entre com sua conta para acessar as fichas salvas.',
  ACESSO: 'Esta ficha não está disponível para sua conta.',
  CONFLITO: 'Outra pessoa salvou uma versão mais recente. Baixe sua ficha antes de recarregar.',
  VALIDACAO: 'Confira os campos indicados antes de salvar.',
  REDE: 'Não foi possível conectar. Suas alterações continuam nesta página; tente novamente.',
  INDISPONIVEL: 'Não foi possível concluir a operação. Tente novamente.',
};
export class SheetError extends Error {
  constructor(
    public code: keyof typeof messages,
    public fields: { campo: string; mensagem: string }[] = [],
  ) {
    super(messages[code]);
  }
}
export function publicError(error: unknown): SheetError {
  if (error instanceof SheetError) return error;
  const e = error as { code?: string; status?: number; message?: string };
  if (e?.code === 'WF001') return new SheetError('CONFLITO');
  if (['WF002', '42501', 'PGRST116'].includes(e?.code || '')) return new SheetError('ACESSO');
  if (['WF003', '23514', '22023'].includes(e?.code || '')) return new SheetError('VALIDACAO');
  if (e?.status === 401 || e?.code === 'PGRST301') return new SheetError('SESSAO');
  if (error instanceof TypeError || /fetch|network/i.test(e?.message || ''))
    return new SheetError('REDE');
  return new SheetError('INDISPONIVEL');
}
