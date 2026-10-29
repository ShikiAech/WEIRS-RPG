import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'onFocus'
> & {
  value: string | number;
  onCommit: (value: string) => unknown;
};

// Entity revisions update the value, not the input's identity. Keep an active edit
// intact while unrelated changes arrive, and reconcile idle fields in place.
export function MapDraftInput({ value, onCommit, ...props }: Props) {
  const current = String(value);
  const [draft, setDraft] = useState(current);
  const focused = useRef(false),
    dirty = useRef(false),
    edit = useRef(0),
    latest = useRef(current);
  latest.current = current;
  useLayoutEffect(() => {
    if (!focused.current && !dirty.current) setDraft(current);
  }, [current]);
  return (
    <input
      {...props}
      value={draft}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => {
        edit.current++;
        dirty.current = event.currentTarget.value !== current;
        setDraft(event.currentTarget.value);
      }}
      onBlur={async (event) => {
        focused.current = false;
        // A permission change or pending operation may disable an ancestor fieldset.
        // Losing focus in that state must never submit an outstanding edit.
        if (event.currentTarget.matches(':disabled')) return;
        const next = event.currentTarget.value;
        const commit = dirty.current && next !== current;
        if (!commit) {
          dirty.current = false;
          setDraft(current);
          return;
        }
        const submittedEdit = ++edit.current;
        try {
          const saved = await onCommit(next);
          // Failed saves remain drafts. Neither their response nor a successful older
          // save may replace a newer edit typed while the request was pending.
          if (!saved || edit.current !== submittedEdit) return;
          dirty.current = false;
          if (!focused.current && latest.current !== current) setDraft(latest.current);
        } catch {
          // The caller reports the error; keep the input available for correction.
        }
      }}
    />
  );
}
