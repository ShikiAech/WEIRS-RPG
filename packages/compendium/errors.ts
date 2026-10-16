export class CompendiumError extends Error {
  constructor(public code: 'UNAVAILABLE' | 'NOT_FOUND' | 'INVALID_QUERY') {
    super(
      code === 'NOT_FOUND'
        ? 'A revisão do compêndio não está disponível.'
        : code === 'INVALID_QUERY'
          ? 'Os parâmetros da consulta do compêndio são inválidos.'
          : 'Não foi possível consultar o compêndio. Tente novamente.',
    );
    this.name = 'CompendiumError';
  }
}
