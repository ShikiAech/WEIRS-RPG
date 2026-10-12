import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { CampaignAccess } from '../../../../packages/contracts/sheets';
import { createRepository } from '../../lib/repository';
import { publicError } from '../../lib/errors';
import { supabase } from '../../lib/supabase';

export function CampaignParticipation({
  user,
  authReady,
  onLogin,
}: {
  user: User | null;
  authReady: boolean;
  onLogin: () => void;
}) {
  const repository = useMemo(() => (supabase ? createRepository(supabase) : null), []);
  const [access, setAccess] = useState<CampaignAccess | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState('');
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    setAccess(null);
    setError('');
    if (user && repository)
      repository
        .availableCampaigns()
        .then((data) => {
          if (alive.current) setAccess(data);
        })
        .catch(() => {
          if (alive.current)
            setError('Não foi possível carregar sua participação. Tente novamente.');
        });
    return () => {
      alive.current = false;
    };
  }, [user?.id, repository, retry]);
  async function join(id: string) {
    if (busy.current || !repository) return;
    busy.current = true;
    setPending(id);
    setError('');
    try {
      const member = await repository.joinCampaign(id);
      if (!alive.current) return;
      setAccess(
        (data) =>
          data && {
            ...data,
            memberships: [
              ...data.memberships.filter(
                (m) =>
                  !(m.usuario_id === member.usuario_id && m.campanha_id === member.campanha_id),
              ),
              member,
            ],
          },
      );
    } catch (e) {
      if (alive.current)
        setError(
          publicError(e).code === 'SESSAO'
            ? 'Entre novamente para participar da campanha.'
            : 'Não foi possível confirmar sua entrada. Tente o mesmo botão novamente.',
        );
    } finally {
      busy.current = false;
      if (alive.current) setPending('');
    }
  }
  return (
    <section className="campaign-participation" aria-labelledby="participation-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Jogue com a mesa</p>
          <h2 id="participation-title">Participar de uma campanha</h2>
        </div>
      </div>
      {!authReady ? (
        <p role="status">Recuperando sua sessão…</p>
      ) : !repository ? (
        <p className="muted">
          A participação será liberada quando o acesso à mesa estiver configurado.
        </p>
      ) : !user ? (
        <>
          <p>Entre com Google e escolha uma campanha para participar como jogador.</p>
          <button className="button" onClick={onLogin}>
            Entrar para participar
          </button>
        </>
      ) : (
        <>
          <p>
            {access?.admin
              ? 'Você é administrador e tem acesso de mestre a todas as campanhas.'
              : 'Escolha sua mesa. Como jogador, você pode criar e editar seus personagens.'}
          </p>
          {error && (
            <div className="notice error" role="alert">
              <p>{error}</p>
              {!access && (
                <button className="button secondary" onClick={() => setRetry((v) => v + 1)}>
                  Carregar participação novamente
                </button>
              )}
            </div>
          )}
          {!access && !error && <p role="status">Consultando campanhas…</p>}
          {access && !access.campaigns.length && (
            <p className="notice">Ainda não há campanhas disponíveis para participar.</p>
          )}
          <div className="participation-grid">
            {access?.campaigns.map((campaign) => {
              const role = access.memberships.find(
                (m) => m.usuario_id === user.id && m.campanha_id === campaign.id,
              )?.papel;
              return (
                <article
                  className="participation-card"
                  key={campaign.id}
                  aria-label={'Participação em ' + campaign.nome}
                >
                  <h3>{campaign.nome}</h3>
                  <p role="status">
                    {access.admin
                      ? 'Acesso de administrador.'
                      : role === 'mestre'
                        ? 'Você participa como mestre.'
                        : role === 'jogador'
                          ? 'Você participa como jogador.'
                          : role === 'espectador'
                            ? 'Você acompanha como espectador.'
                            : 'Disponível para jogadores.'}
                  </p>
                  <div className="participation-actions">
                    {!role ? (
                      <button
                        className="button"
                        disabled={!!pending}
                        aria-label={'Entrar como jogador em ' + campaign.nome}
                        onClick={() => void join(campaign.id)}
                      >
                        {pending === campaign.id ? 'Confirmando entrada…' : 'Entrar como jogador'}
                      </button>
                    ) : (
                      <>
                        <a className="button secondary" href={'#/chat/' + campaign.id}>
                          Abrir mesa
                        </a>
                        {role !== 'espectador' && (
                          <a className="button" href={'#/fichas/nova?campanha=' + campaign.id}>
                            Criar personagem nesta campanha
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
