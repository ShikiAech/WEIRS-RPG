import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

export function useDropdownLayout(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
): CSSProperties {
  const [layout, setLayout] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!anchor.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upward = below < 240 && above > below;
      const maxHeight = Math.max(
        96,
        Math.min(384, window.innerHeight * 0.48, upward ? above : below),
      );
      setLayout((previous) => {
        const next = { top: upward ? 'auto' : '100%', bottom: upward ? '100%' : 'auto', maxHeight };
        return previous.top === next.top && previous.maxHeight === maxHeight ? previous : next;
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (anchor.current) observer.observe(anchor.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor]);
  return layout;
}
