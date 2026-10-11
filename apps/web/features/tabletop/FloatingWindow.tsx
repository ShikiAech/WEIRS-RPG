import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export function FloatingWindow({
  id,
  title,
  children,
  className = '',
  collapsed: controlled,
  onCollapse,
  toggleLabel,
  avoidKey,
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
}) {
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
    const minimumY = Math.max(50, (toolbar?.getBoundingClientRect().bottom || 46) + clearance);
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
    const resize = () =>
      setPosition((p) => {
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
  }, [collapsed]);
  const toggle = () => (onCollapse ? onCollapse(!collapsed) : setCollapsed(!collapsed));
  return (
    <div
      ref={root}
      tabIndex={-1}
      onPointerDownCapture={(e) => e.currentTarget.focus({ preventScroll: true })}
      className={'floating-window ' + className + (collapsed ? ' is-collapsed' : '')}
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="floating-titlebar"
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
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
          tabIndex={0}
          role="button"
          aria-label={'Mover ' + title}
          title="Arraste para mover. Use as setas pelo teclado."
          onKeyDown={(e) => {
            const steps: Record<string, [number, number]> = {
              ArrowLeft: [-20, 0],
              ArrowRight: [20, 0],
              ArrowUp: [0, -20],
              ArrowDown: [0, 20],
            };
            if (steps[e.key]) {
              e.preventDefault();
              const [x, y] = steps[e.key];
              save(bound(position.x + x, position.y + y));
            }
          }}
        >
          <span aria-hidden="true">⠿</span> {title}
        </span>
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
      <div
        id={'window-' + id.replace(/[^a-z0-9]/gi, '-')}
        className="floating-content"
        hidden={collapsed}
      >
        {children}
      </div>
    </div>
  );
}
