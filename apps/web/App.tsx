import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { asset, legacyUrl } from './lib/paths';
import { supabase, configurationError, completeOAuth, signIn } from './lib/supabase';
import { Compendium } from './features/Compendium';
import { Campaigns } from './features/Campaigns';
import { Sheets } from './features/Sheets';
import { Chat } from './features/Chat';
import { DiceProvider } from './features/dice/Dice3D';
import { clearCreationDrafts } from './features/character-creation/useCreationDraft';

export function App() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || '/campanhas');
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [authError, setAuthError] = useState(configurationError);
  useEffect(() => {
    const change = (event: HashChangeEvent) => {
      const next = window.location.hash.slice(1) || '/campanhas';
      if (
        next !== route &&
        !window.dispatchEvent(new Event('weirs:before-navigation', { cancelable: true }))
      ) {
        window.history.replaceState(null, '', new URL(event.oldURL).hash || `#${route}`);
        return;
      }
      setRoute(next);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, [route]);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let previousAccount: string|null=null;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextAccount=session?.user.id??null;
      if (_event==='SIGNED_OUT'||previousAccount!==null&&previousAccount!==nextAccount) clearCreationDrafts();
      previousAccount=nextAccount;
      if (active) setUser(session?.user || null);
    });
    completeOAuth()
      .then(async () => {
        const { data, error } = await supabase!.auth.getSession();
        if (active) {
          if (error) setAuthError('Não foi possível recuperar sua sessão. Entre novamente.');
          setUser(data.session?.user || null);
          setRoute(window.location.hash.slice(1) || '/campanhas');
        }
      })
      .catch((error) => {
        if (active) setAuthError(error.message);
      })
      .finally(() => {
        if (active) {
          setRoute(window.location.hash.slice(1) || '/campanhas');
          setAuthReady(true);
        }
      });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  async function account() {
    if (!window.dispatchEvent(new Event('weirs:before-account-change', { cancelable: true })))
      return;
    try {
      if (user) {
        const { error } = await supabase!.auth.signOut();
        if (error) throw new Error('Não foi possível sair da conta. Tente novamente.');
      } else await signIn();
      setAuthError('');
    } catch (error) {
      setAuthError((error as Error).message);
    }
  }
  const section = route.startsWith('/fichas')
    ? 'fichas'
    : route.startsWith('/chat')
      ? 'chat'
      : route.startsWith('/compendio')
        ? 'compendio'
        : 'campanhas';
  return (
    <DiceProvider key={(user?.id || 'visitante') + ':' + route}>
      <div className={'app-shell ' + (section === 'chat' && user ? 'tabletop-shell' : '')}>
        <a
          className="skip-link"
          href="#main-content"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('main-content')?.focus();
          }}
        >
          Pular para o conteúdo
        </a>
        <header className="app-header">
          <a className="brand" href="#/campanhas">
            <span>WEIRS</span>
            <small>Crônicas & personagens</small>
          </a>
          <nav aria-label="Navegação principal">
            {[
              ['campanhas', 'Campanhas'],
              ['fichas', 'Fichas'],
              ['chat', 'Chat'],
              ['compendio', 'Compêndio'],
            ].map(([key, label]) => (
              <a key={key} href={`#/${key}`} aria-current={section === key ? 'page' : undefined}>
                {label}
              </a>
            ))}
            <a className="legacy-link" href={legacyUrl('/WEIRS-RPG/index.html')}>
              Site original ↗
            </a>
          </nav>
          <div className="account">
            {user && <span>{user.user_metadata.full_name || 'Jogador'}</span>}
            <button
              className="button secondary"
              disabled={!supabase || !authReady}
              onClick={account}
            >
              {user ? 'Sair' : 'Entrar com Google'}
            </button>
          </div>
        </header>
        {authError && (
          <div role="alert" className="notice error">
            {authError}
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
          {section === 'campanhas' && (
            <Campaigns
              key={user?.id || 'visitante'}
              user={user}
              authReady={authReady}
              onLogin={account}
            />
          )}
          {section === 'compendio' && <Compendium />}
          {section === 'fichas' && (
            <Sheets key={user?.id || 'visitante'} route={route} user={user} authReady={authReady} />
          )}
          {section === 'chat' && (
            <Chat key={user?.id || 'visitante'} user={user} authReady={authReady} route={route} />
          )}
        </main>
        <footer className="app-footer">
          <span>WEIRS RPG</span>
          <span>Um mundo, muitas histórias.</span>
          <a href={asset('pages/mundo.html')}>Conhecer o mundo ↗</a>
        </footer>
      </div>
    </DiceProvider>
  );
}
