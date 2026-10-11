import { useEffect, useState } from 'react';
import {
  favoriteKey,
  parseFavorites,
  sameFavorite,
  toggleFavorite,
  type FavoriteReference,
} from './action-favorites';

const eventName = 'weirs:action-favorites';
const read = (key: string) => {
  try {
    return parseFavorites(localStorage.getItem(key));
  } catch {
    return [];
  }
};
export function useActionFavorites(userId: string, campaignId: string, sheetId: string) {
  const key = favoriteKey(userId, campaignId, sheetId);
  const [state, setState] = useState<{ key: string; references: FavoriteReference[] }>(() => ({
    key,
    references: read(key),
  }));
  useEffect(() => {
    setState({ key, references: read(key) });
    const update = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== key) return;
      if (event instanceof CustomEvent && event.detail?.key !== key) return;
      const references =
        event instanceof CustomEvent
          ? parseFavorites(JSON.stringify(event.detail.references))
          : read(key);
      setState({ key, references });
    };
    window.addEventListener('storage', update);
    window.addEventListener(eventName, update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener(eventName, update);
    };
  }, [key]);
  const references = state.key === key ? state.references : read(key);
  return {
    references,
    has: (reference: FavoriteReference) => references.some((r) => sameFavorite(r, reference)),
    toggle(reference: FavoriteReference) {
      const next = toggleFavorite(references, reference);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* Preferências continuam disponíveis nesta sessão. */
      }
      setState({ key, references: next });
      window.dispatchEvent(new CustomEvent(eventName, { detail: { key, references: next } }));
    },
  };
}
