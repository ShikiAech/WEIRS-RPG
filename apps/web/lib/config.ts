export function validatePublicConfig(
  url: string,
  key: string,
): { url: string; key: string } | null {
  if (!url && !key) return null;
  const invalid = () => new Error('A configuração de acesso à mesa está incompleta ou inválida.');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw invalid();
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (
    (!local && parsed.protocol !== 'https:') ||
    !['https:', 'http:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    throw invalid();
  if (key.startsWith('sb_publishable_')) return { url: parsed.origin, key };
  try {
    const part = key.split('.')[1];
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    if (claims.role === 'anon') return { url: parsed.origin, key };
  } catch {
    /* A chave precisa ser publicável. */
  }
  throw invalid();
}

export function callbackUrl(origin: string, base: string): string {
  return new URL(`${base.replace(/\/?$/, '/')}app.html`, origin).href;
}
