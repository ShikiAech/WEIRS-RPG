import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { CampaignParticipation } from './campaigns/CampaignParticipation';
import type { CampaignContent } from '../../../packages/contracts/content';
import { asset, legacyHtml, legacyUrl } from '../lib/paths';

export function Campaigns({
  user,
  authReady,
  onLogin,
}: {
  user: User | null;
  authReady: boolean;
  onLogin: () => void;
}) {
  const [campaigns, setCampaigns] = useState<CampaignContent[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(asset('content/generated/campaigns.json'), { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setCampaigns)
      .catch((e) => {
        if (e.name !== 'AbortError')
          setError('Não foi possível carregar as campanhas. Recarregue a página.');
      });
    return () => controller.abort();
  }, []);
  const campaign = campaigns.find((c) => c.id === selected);
  return (
    <div className="page">
      <section className="campaign-hero">
        <div>
          <p className="eyebrow">As crônicas continuam</p>
          <h1>
            Seu próximo capítulo
            <br />
            <em>começa aqui.</em>
          </h1>
          <p>
            Reencontre suas histórias, prepare seus personagens
            <br className="desktop-only" /> e reúna a mesa no mundo de Weirs.
          </p>
          <a className="button" href="#/fichas">
            Preparar personagem <span>→</span>
          </a>
        </div>
        <img src={asset('img/weirs2.logo.png')} alt="Símbolo de Weirs RPG" />
      </section>
      <CampaignParticipation user={user} authReady={authReady} onLogin={onLogin} />
      <div className="section-heading">
        <div>
          <p className="eyebrow">Histórias compartilhadas</p>
          <h2>Campanhas da mesa</h2>
        </div>
        <a href={asset('pages/mundo.html')}>Explorar o mundo ↗</a>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!campaigns.length && !error && <p role="status">Abrindo as crônicas…</p>}
      <div className="campaign-grid">
        {campaigns.map((c, i) => (
          <article className={`campaign-card campaign-${c.slug}`} key={c.id}>
            <div className="campaign-number">0{i + 1}</div>
            <p className="eyebrow">
              {c.sessions.length}{' '}
              {c.sessions.length === 1 ? 'sessão registrada' : 'sessões registradas'}
            </p>
            <h3>
              <button aria-pressed={selected === c.id} onClick={() => setSelected(c.id)}>
                {c.name}
              </button>
            </h3>
            <p>{c.biographies.length} personagens · Crônicas de campanha</p>
            <div className="campaign-card-bottom">
              <a href={legacyUrl(c.sourceUrl)}>Página original ↗</a>
              <button onClick={() => setSelected(c.id)} aria-label={`Abrir ${c.name}`}>
                →
              </button>
            </div>
          </article>
        ))}
      </div>
      {campaign && (
        <section className="chronicles" aria-label={`Histórico de ${campaign.name}`}>
          <div className="section-heading">
            <h2>{campaign.name}</h2>
            <button className="button secondary" onClick={() => setSelected('')}>
              Fechar crônicas
            </button>
          </div>
          <div
            className="rich-text"
            dangerouslySetInnerHTML={{ __html: legacyHtml(campaign.descriptionHtml) }}
          />
          {campaign.sessions.map((session) => (
            <details key={session.id} className="session">
              <summary>
                <h3>{session.title}</h3>
                <p>{session.preview}</p>
              </summary>
              <div
                className="rich-text"
                dangerouslySetInnerHTML={{ __html: legacyHtml(session.descriptionHtml) }}
              />
            </details>
          ))}
          <h3 className="biographies-title">Personagens destas crônicas</h3>
          <div className="biography-grid">
            {campaign.biographies.map((bio) => (
              <details className="session" key={bio.id}>
                <summary>{bio.name}</summary>
                <div
                  className="rich-text"
                  dangerouslySetInnerHTML={{ __html: legacyHtml(bio.descriptionHtml) }}
                />
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
