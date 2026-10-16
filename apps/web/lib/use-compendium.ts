import { useEffect, useState } from 'react';
import type { CompendiumRepository } from '../../../packages/contracts/character-creation';
import type { CompendiumQuery, CompendiumSummary } from '../../../packages/contracts/compendium';
import { CompendiumError } from './compendium';
export function useCompendium(repository: CompendiumRepository, query: CompendiumQuery) {
  const [entries, setEntries] = useState<CompendiumSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(query);
  const [activeKey, setActiveKey] = useState(key);
  if (key !== activeKey) { setActiveKey(key); setCursor(undefined); setEntries([]); setNextCursor(null); }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      repository.list({ ...JSON.parse(key), cursor }, controller.signal)
        .then(page => { if (!controller.signal.aborted) { setEntries(old => cursor ? [...old, ...page.entries] : page.entries); setNextCursor(page.nextCursor); } })
        .catch(e => { if (!controller.signal.aborted) setError(e instanceof CompendiumError ? e.message : 'Não foi possível consultar o compêndio. Tente novamente.'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [repository, key, cursor, attempt]);
  return { entries, loading, error, nextCursor, more: () => setCursor(nextCursor ?? undefined), retry: () => setAttempt(n => n + 1) };
}
