// src/memory/MemoryEditor.tsx
import { useEffect, useRef, useState } from 'react';
import type { MemoryType } from '../api/client';
import '../theme/memory-editor.css';

const TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference'];

/** How long the SAVED ✓ confirmation lingers before the editor hands back to
 *  the parent (which closes / navigates). Exported so tests can advance past it. */
export const SUCCESS_HOLD_MS = 900;

export type EditorValue = { name: string; description: string; type: MemoryType; body: string };

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

type Props = {
  mode: 'create' | 'edit';
  initial: EditorValue;
  knownNames: string[];
  /** Performs the write. May be async; reject to surface a failure to the user. */
  onSave: (v: EditorValue) => void | Promise<void>;
  onCancel: () => void;
  /** Called after the success animation, once it's safe to close / navigate. */
  onSaved?: (v: EditorValue) => void;
};

export function MemoryEditor({ mode, initial, knownNames, onSave, onCancel, onSaved }: Props) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [type, setType] = useState<MemoryType>(initial.type);
  const [body, setBody] = useState(initial.body);
  const [nameError, setNameError] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Don't fire onSaved after the editor has been unmounted.
  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

  async function submit() {
    if (status === 'saving') return;
    if (mode === 'create' && !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      setNameError('Name must be a kebab slug (lowercase, digits, hyphens).');
      return;
    }
    const value: EditorValue = { name, description, type, body };
    setStatus('saving');
    setSaveError(null);
    try {
      await onSave(value);
      setStatus('success');
      holdTimer.current = setTimeout(() => onSaved?.(value), SUCCESS_HOLD_MS);
    } catch (e) {
      setStatus('error');
      setSaveError((e as Error)?.message || 'Save failed — please try again.');
    }
  }

  // Lightweight [[ ]] autocomplete: show suggestions when the caret-preceding
  // text ends with an open `[[frag`.
  const openMatch = body.match(/\[\[([a-z0-9-]*)$/);
  const suggestions = openMatch
    ? knownNames.filter((n) => n.startsWith(openMatch[1])).slice(0, 6)
    : [];

  function applySuggestion(s: string) {
    setBody(body.replace(/\[\[[a-z0-9-]*$/, `[[${s}]]`));
  }

  const saveLabel = status === 'saving' ? 'SAVING…'
    : status === 'success' ? 'SAVED'
    : status === 'error' ? 'RETRY'
    : 'SAVE';

  return (
    <div style={styles.wrap} data-testid="memory-editor">
      {mode === 'create' && (
        <div style={styles.field}>
          <label style={styles.label}>name (slug)</label>
          <input data-testid="editor-name" style={styles.input} value={name}
            onChange={(e) => { setName(e.target.value); setNameError(null); }} />
          {nameError && <div data-testid="editor-name-error" style={styles.err}>{nameError}</div>}
        </div>
      )}
      <div style={styles.field}>
        <label style={styles.label}>description</label>
        <input data-testid="editor-description" style={styles.input} value={description}
          onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div style={styles.field}>
        <label style={styles.label}>type</label>
        <select data-testid="editor-type" style={styles.input} value={type}
          onChange={(e) => setType(e.target.value as MemoryType)}>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div style={styles.field}>
        <label style={styles.label}>body · markdown</label>
        <textarea data-testid="editor-body" style={{ ...styles.input, minHeight: 160, resize: 'vertical' }}
          value={body} onChange={(e) => setBody(e.target.value)} />
        {suggestions.length > 0 && (
          <div style={styles.suggest} data-testid="editor-suggestions">
            {suggestions.map((s) => (
              <button key={s} type="button" style={styles.suggestItem} onClick={() => applySuggestion(s)}>{s}</button>
            ))}
          </div>
        )}
      </div>

      {saveError && (
        <div className="me-error" role="alert" data-testid="editor-error">
          <span aria-hidden>⚠</span><span>{saveError}</span>
        </div>
      )}

      <div style={styles.actions}>
        <button
          type="button"
          className="me-save"
          data-status={status}
          data-testid="editor-save"
          disabled={status === 'saving'}
          onClick={submit}
        >
          <span className="me-charge" aria-hidden />
          <span className="me-glyph" aria-hidden>
            {status === 'saving' && (
              <svg className="me-ring" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /></svg>
            )}
            {status === 'success' && (
              <svg className="me-check" viewBox="0 0 16 16"><path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" /></svg>
            )}
            {status === 'error' && <span className="me-err-x">!</span>}
          </span>
          <span className="me-label">{saveLabel}</span>
        </button>
        <button data-testid="editor-cancel" style={styles.cancel} onClick={onCancel}>CANCEL</button>
      </div>
    </div>
  );
}

const styles = {
  wrap: { padding: 16, display: 'flex' as const, flexDirection: 'column' as const, gap: 10 },
  field: { display: 'flex' as const, flexDirection: 'column' as const, gap: 4, position: 'relative' as const },
  label: { fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', textTransform: 'uppercase' as const },
  input: { background: '#05080d', border: '1px solid rgba(0,229,255,0.3)', borderRadius: 3, color: 'var(--text)', padding: '6px 8px', fontFamily: 'ui-monospace, monospace', fontSize: 12 },
  err: { color: 'var(--node-failed)', fontSize: 11 },
  suggest: { display: 'flex' as const, gap: 4, flexWrap: 'wrap' as const, marginTop: 4 },
  suggestItem: { background: 'rgba(0,229,255,0.08)', border: '1px solid var(--edge-trail)', color: 'var(--edge-trail)', borderRadius: 10, fontSize: 10, padding: '2px 8px', cursor: 'pointer' },
  actions: { display: 'flex' as const, gap: 8, alignItems: 'center' as const },
  cancel: { background: 'transparent', border: '1px solid var(--edge-idle)', color: 'var(--text)', padding: '6px 16px', cursor: 'pointer', fontFamily: 'ui-monospace, monospace', letterSpacing: 2 },
};
