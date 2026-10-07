import { createClient } from '@supabase/supabase-js';
import { validatePublicConfig, callbackUrl } from './config';

let config: ReturnType<typeof validatePublicConfig> = null;
export let configurationError = '';
try {
  config = validatePublicConfig(
    import.meta.env.VITE_SUPABASE_URL || '',
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  );
} catch (error) {
  configurationError = (error as Error).message;
}
export const supabase = config
  ? createClient(config.url, config.key, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'weirs-rpg-auth',
      },
    })
  : null;
let callback: Promise<void> | undefined;
export function completeOAuth(): Promise<void> {
  if (callback) return callback;
  const url = new URL(window.location.href);
  callback = (async () => {
    if (
      !url.searchParams.has('code') &&
      !url.searchParams.has('error') &&
      !new URLSearchParams(url.hash.slice(1)).has('error')
    )
      return;
    try {
      if (
        !supabase ||
        url.searchParams.has('error') ||
        new URLSearchParams(url.hash.slice(1)).has('error')
      )
        throw new Error('O login foi cancelado ou não pôde ser concluído. Tente novamente.');
      const { error } = await supabase.auth.exchangeCodeForSession(url.searchParams.get('code')!);
      if (error) throw new Error('Não foi possível concluir o login. Tente entrar novamente.');
    } finally {
      window.history.replaceState(null, '', `${url.pathname}#/fichas`);
    }
  })();
  return callback;
}
export async function signIn() {
  if (!supabase) throw new Error('O acesso à mesa ainda não foi configurado.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl(window.location.origin, import.meta.env.BASE_URL) },
  });
  if (error) throw new Error('Não foi possível iniciar o login com Google. Tente novamente.');
}
