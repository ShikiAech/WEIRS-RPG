import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSheetPopOut } from './useSheetPopOut';

export function FloatingWindow({
  id,
  title,
  children,
  className = '',
  collapsed: controlled,
  onCollapse,
  toggleLabel,
  avoidKey,
  popOut = false,
  initial = { x: 20, y: 100 },
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  toggleLabel?: string;
  initial?: { x: number; y: number };
  avoidKey?: string;
  popOut?: boolean;
}) {
  const detached = useSheetPopOut(popOut, title);
  const root = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('weirs:window:' + id) || 'null');
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y))
        return saved as { x: number; y: number };
    } catch {
      /* Preferência local opcional. */
    }
    return initial;
  });
  const [localCollapsed, setCollapsed] = useState(false);
  const preferred = useRef(position),
    avoided = useRef(false);
  const collapsed = controlled ?? localCollapsed;
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  function bound(x: number, y: number) {
    const rect = root.current?.getBoundingClientRect();
    const toolbar =
      document.querySelector('.session-toolbar') || document.querySelector('.app-header');
    // No celular, deixe o título e a paginação do chat acima da janela de dados.
    const clearance = innerWidth <= 760 && className.includes('dice-floating') ? 84 : 4;
    const minimumY = popOut
      ? 4
      : Math.max(50, (toolbar?.getBoundingClientRect().bottom || 46) + clearance);
    return {
      x: Math.max(4, Math.min(x, innerWidth - (rect?.width || 300) - 4)),
      y: Math.max(minimumY, Math.min(y, innerHeight - (rect?.height || 40) - 4)),
    };
  }
  function save(next: { x: number; y: number }) {
    preferred.current = next;
    setPosition(next);
    try {
      localStorage.setItem('weirs:window:' + id, JSON.stringify(next));
    } catch {
      /* Sem armazenamento local. */
    }
  }
  useLayoutEffect(() => {
    if (avoidKey === undefined || innerWidth > 760) return;
    const other = document.querySelector('.session-floating:not(.is-collapsed)');
    if (other) {
      avoided.current = true;
      setPosition((p) => bound(p.x, other.getBoundingClientRect().bottom + 8));
    } else if (avoided.current) {
      avoided.current = false;
      setPosition(bound(preferred.current.x, preferred.current.y));
    }
  }, [avoidKey]);
  useEffect(() => {
    if (detached.popup) return;
    const resize = () =>
      setPosition((p) => {
        if (root.current?.ownerDocument !== document) return p;
        const next = bound(p.x, p.y);
        return next.x === p.x && next.y === p.y ? p : next;
      });
    const observer = new ResizeObserver(resize);
    if (root.current) observer.observe(root.current);
    resize();
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [collapsed, detached.popup]);
  const toggle = () => (onCollapse ? onCollapse(!collapsed) : setCollapsed(!collapsed));
  const content = (
    <div
      ref={root}
      tabIndex={-1}
      onPointerDownCapture={(e) => e.currentTarget.focus({ preventScroll: true })}
      className={
        'floating-window ' +
        className +
        (collapsed ? ' is-collapsed' : '') +
        (detached.popup ? ' is-popped-out' : '')
      }
      style={detached.popup ? undefined : { left: position.x, top: position.y }}
    >
      <div
        className="floating-titlebar"
        onPointerDown={(e) => {
          if (detached.popup || e.button !== 0 || (e.target as HTMLElement).closest('button'))
            return;
          drag.current = { x: e.clientX, y: e.clientY, left: position.x, top: position.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) setPosition(bound(d.left + e.clientX - d.x, d.top + e.clientY - d.y));
        }}
        onPointerUp={(e) => {
          if (drag.current) {
            drag.current = null;
            save(bound(position.x, position.y));
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <span
          className="window-grip"
          tabIndex={detached.popup ? undefined : 0}
          role={detached.popup ? undefined : 'button'}
          aria-label={detached.popup ? undefined : 'Mover ' + title}
          title={detached.popup ? undefined : 'Arraste para mover. Use as setas pelo teclado.'}
          onKeyDown={(e) => {
            const steps: Record<string, [number, number]> = {
              ArrowLeft: [-20, 0],
              ArrowRight: [20, 0],
              ArrowUp: [0, -20],
              ArrowDown: [0, 20],
            };
            if (!detached.popup && steps[e.key]) {
              e.preventDefault();
              const [x, y] = steps[e.key];
              save(bound(position.x + x, position.y + y));
            }
          }}
        >
          <span aria-hidden="true">⠿</span> {title}
        </span>
        {popOut && (
          <button
            className="window-pop-out"
            type="button"
            onClick={() => (detached.popup ? detached.restore() : detached.open())}
            aria-label={detached.popup ? 'Trazer ficha de volta' : 'Pop Out'}
            title={
              detached.popup
                ? 'Trazer ficha de volta para a mesa'
                : 'Abrir ficha em uma nova janela'
            }
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M11 3h6v6M17 3l-8 8M8 4H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4" />
            </svg>
            <span>{detached.popup ? 'Voltar à mesa' : 'Pop Out'}</span>
          </button>
        )}
        <button
          className="window-collapse"
          type="button"
          aria-label={toggleLabel || (collapsed ? 'Expandir ' : 'Recolher ') + title}
          aria-expanded={!collapsed}
          aria-controls={'window-' + id.replace(/[^a-z0-9]/gi, '-')}
          onClick={toggle}
        >
          {collapsed ? '+' : '−'}
        </button>
      </div>
      {detached.error && (
        <p className="notice error window-popup-error" role="alert">
          {detached.error}
        </p>
      )}
      <div
        id={'window-' + id.replace(/[^a-z0-9]/gi, '-')}
        className="floating-content"
        hidden={collapsed}
      >
        {children}
      </div>
    </div>
  );
  if (!popOut) return content;
  return (
    <>
      {createPortal(content, detached.host)}
      {detached.popup &&
        createPortal(
          <div className="floating-layer tabletop-shell">
            <aside
              className="floating-window session-floating floating-return"
              style={{ left: position.x, top: position.y }}
              aria-label="Ficha em outra janela"
            >
              <strong>{title}</strong>
              <p>A ficha está aberta em outra janela.</p>
              <button className="text-button" type="button" onClick={() => detached.popup?.focus()}>
                Ver janela da ficha
              </button>
              <button className="button secondary" type="button" onClick={() => detached.restore()}>
                Trazer ficha de volta
              </button>
            </aside>
          </div>,
          document.body,
        )}
    </>
  );
}
