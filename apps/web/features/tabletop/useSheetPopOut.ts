import { useCallback, useLayoutEffect, useRef, useState } from 'react';

// The portal container stays the same when its document changes. React therefore
// keeps the session, selected tab, draft fields and pending operations mounted.
export function useSheetPopOut(enabled: boolean, title: string) {
  const source = useRef(document);
  const [host] = useState(() => document.createElement('div'));
  const [popup, setPopup] = useState<Window | null>(null);
  const external = useRef<Window | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const [error, setError] = useState('');

  const restore = useCallback(
    (close = true) => {
      const opened = external.current;
      if (!opened) return;
      external.current = null;
      cleanup.current();
      cleanup.current = () => {};
      source.current.body.append(host);
      setPopup(null);
      if (close && !opened.closed) opened.close();
      source.current.defaultView?.requestAnimationFrame(() => {
        host.querySelector<HTMLButtonElement>('.window-pop-out')?.focus({ preventScroll: true });
      });
    },
    [host],
  );

  useLayoutEffect(() => {
    if (!enabled) return;
    host.className = 'floating-layer tabletop-shell';
    source.current.body.append(host);
    const closeOnExit = () => restore();
    const owner = source.current.defaultView!;
    owner.addEventListener('pagehide', closeOnExit);
    return () => {
      owner.removeEventListener('pagehide', closeOnExit);
      const opened = external.current;
      external.current = null;
      cleanup.current();
      cleanup.current = () => {};
      if (opened && !opened.closed) opened.close();
      host.remove();
    };
  }, [enabled, host, restore]);

  function open() {
    if (external.current && !external.current.closed) {
      external.current.focus();
      return;
    }
    // Open synchronously from the click. No credentials or sheet data leave the
    // existing authenticated React tree, and the blank window stays same-origin.
    const opened = source.current.defaultView!.open(
      '',
      '_blank',
      'popup=yes,width=480,height=800,resizable=yes,scrollbars=yes',
    );
    if (!opened) {
      setError(
        'Não foi possível abrir a ficha em outra janela. Permita pop-ups para este site e tente novamente.',
      );
      return;
    }
    const target = opened.document;
    target.title = title + ' · WEIRS';
    target.documentElement.lang = source.current.documentElement.lang || 'pt-BR';
    const viewport = target.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1';
    const base = target.createElement('base');
    base.href = source.current.baseURI;
    target.head.append(base, viewport);
    target.body.className = 'sheet-popout-page';
    const copyStyles = () => {
      if (opened.closed) return;
      target.head.querySelectorAll('[data-weirs-popup-style]').forEach((node) => node.remove());
      source.current.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
        const copy = node.cloneNode(true) as HTMLElement;
        if (node instanceof HTMLLinkElement) (copy as HTMLLinkElement).href = node.href;
        copy.dataset.weirsPopupStyle = '';
        target.head.append(copy);
      });
    };
    copyStyles();
    const styles = new MutationObserver(copyStyles);
    styles.observe(source.current.head, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    const refresh = () => {
      if (target.visibilityState !== 'hidden')
        source.current.defaultView!.dispatchEvent(new Event('weirs:session-refresh'));
    };
    const closing = () => restore(false);
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element | null)?.closest('a[href]');
      const route = link?.getAttribute('href');
      if (!route?.startsWith('#/')) return;
      event.preventDefault();
      // Let the opener's existing navigation and pending-operation guards run.
      source.current.defaultView!.location.hash = route;
      source.current.defaultView!.focus();
    };
    opened.addEventListener('beforeunload', closing);
    opened.addEventListener('pagehide', closing);
    opened.addEventListener('online', refresh);
    opened.addEventListener('focus', refresh);
    target.addEventListener('visibilitychange', refresh);
    target.addEventListener('click', navigate);
    const timer = source.current.defaultView!.setInterval(refresh, 6000);
    // Also recover when a browser closes the popup without an unload event.
    const closed = source.current.defaultView!.setInterval(() => {
      if (opened.closed) restore(false);
    }, 400);
    cleanup.current = () => {
      styles.disconnect();
      opened.removeEventListener('beforeunload', closing);
      opened.removeEventListener('pagehide', closing);
      opened.removeEventListener('online', refresh);
      opened.removeEventListener('focus', refresh);
      target.removeEventListener('visibilitychange', refresh);
      target.removeEventListener('click', navigate);
      source.current.defaultView!.clearInterval(timer);
      source.current.defaultView!.clearInterval(closed);
    };
    external.current = opened;
    target.body.append(host);
    setError('');
    setPopup(opened);
    opened.focus();
    refresh();
  }

  return { host, popup, open, restore, error };
}
