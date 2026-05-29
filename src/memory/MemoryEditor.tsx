// src/memory/MemoryEditor.tsx
import { useState } from 'react';
import type { MemoryType } from '../api/client';

const TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference'];

export type EditorValue = { name: string; description: string; type: MemoryType; body: string };

type Props = {
  mode: 'create' | 'edit';
  initial: EditorValue;
  knownNames: string[];
  onSave: (v: EditorValue) => void;
  onCancel: () => void;
  pending: boolean;
};

export function MemoryEditor({ mode, initial, knownNames, onSave, onCancel, pending }: Props) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [type, setType] = useState<MemoryType>(initial.type);
  const [body, setBody] = useState(initial.body);
  const [nameError, setNameError] = useState<string | null>(null);

  function submit() {
    if (mode === 'create' && !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      setNameError('Name must be a kebab slug (lowercase, digits, hyphens).');
      return;
    }
    onSave({ name, description, type, body });
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
      <div style={styles.actions}>
        <button data-testid="editor-save" style={styles.save} disabled={pending} onClick={submit}>
          {pending ? 'SAVING…' : 'SAVE'}
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
  actions: { display: 'flex' as const, gap: 8 },
  save: { background: 'rgba(0,229,255,0.10)', border: '1px solid var(--edge-trail)', color: 'var(--edge-trail)', padding: '6px 16px', cursor: 'pointer', fontFamily: 'ui-monospace, monospace', letterSpacing: 2 },
  cancel: { background: 'transparent', border: '1px solid var(--edge-idle)', color: 'var(--text)', padding: '6px 16px', cursor: 'pointer', fontFamily: 'ui-monospace, monospace', letterSpacing: 2 },
};
