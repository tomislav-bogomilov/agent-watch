import { useMemo, useState } from 'react';
import { useMemoryList, useCreateMemory } from '../api/hooks';
import type { Selection } from '../components/library/LibraryPanel';
import { MemoryDetail } from './MemoryDetail';
import { MemoryStats } from './MemoryStats';
import { MemoryGraph } from './MemoryGraph';
import { MemoryEditor } from './MemoryEditor';
import { deriveInsights } from './insights';

type View = 'detail' | 'graph' | 'stats';

type Props = {
  selected: Selection | null;
  onSelectMemory: (scopeKey: string, name: string) => void;
  onJumpToSession: (sessionId: string) => void;
  creatingScope: string | null;
  onCreateDone: () => void;
  knownSessionIds: Set<string>;
};

export function MemoryPage({ selected, onSelectMemory, onJumpToSession, creatingScope, onCreateDone, knownSessionIds }: Props) {
  const { data, isLoading, error } = useMemoryList();
  const [view, setView] = useState<View>('graph');
  const create = useCreateMemory();

  const memories = data?.memories ?? [];
  const selectedMemory = selected?.kind === 'memory'
    ? memories.find((m) => m.scopeKey === selected.scopeKey && m.name === selected.name) ?? null
    : null;
  const insights = useMemo(() => deriveInsights(memories, Date.now()), [memories]);

  return (
    <div style={styles.page} data-testid="memory-page">
      <div style={styles.chrome}>
        <div style={styles.title}>MEMORY</div>
        <div style={styles.tabs}>
          {(['detail', 'graph', 'stats'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              data-testid={`memory-view-${v}`}
              onClick={() => setView(v)}
              style={{ ...styles.tab, ...(view === v ? styles.tabOn : null) }}
              aria-pressed={view === v}
            >{v.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {isLoading && <div style={styles.muted}>LOADING…</div>}
      {error && <div style={styles.error}>FAILED TO LOAD MEMORIES: {(error as Error).message}</div>}

      {!isLoading && !error && (
        <div style={styles.body}>
          {view === 'detail' && (
            creatingScope
              ? <MemoryEditor
                  mode="create"
                  initial={{ name: '', description: '', type: 'project', body: '' }}
                  knownNames={memories.map((m) => m.name)}
                  onCancel={onCreateDone}
                  onSave={async (v) => {
                    await create.mutateAsync({ scopeKey: creatingScope, name: v.name, description: v.description, type: v.type, body: v.body });
                  }}
                  onSaved={(v) => {
                    // select first, then clear creatingScope, so the detail view
                    // lands on the new memory without a "SELECT A MEMORY" flash
                    onSelectMemory(creatingScope, v.name);
                    onCreateDone();
                  }}
                />
              : selectedMemory
              ? <MemoryDetail
                  memory={selectedMemory}
                  knownNames={new Set(memories.map((m) => m.name))}
                  backlinks={insights.backlinks.get(selectedMemory.name) ?? []}
                  onNavigate={(name: string) => {
                    const target = memories.find((m) => m.name === name);
                    if (target) onSelectMemory(target.scopeKey, target.name);
                  }}
                  onJumpToSession={onJumpToSession}
                  knownSessionIds={knownSessionIds}
                />
              : <div style={styles.muted}>SELECT A MEMORY</div>
          )}
          {view === 'graph' && (
            <MemoryGraph
              memories={memories}
              selectedName={selectedMemory?.name ?? null}
              onSelect={(name: string) => {
                const target = memories.find((m) => m.name === name);
                if (target) onSelectMemory(target.scopeKey, target.name);
              }}
              getBacklinks={(name: string) => insights.backlinks.get(name) ?? []}
              knownSessionIds={knownSessionIds}
              onJumpToSession={onJumpToSession}
              now={Date.now()}
            />
          )}
          {view === 'stats' && <MemoryStats insights={insights} />}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { flex: 1, minHeight: 0, display: 'flex' as const, flexDirection: 'column' as const, gap: 8, padding: '12px 16px', overflow: 'hidden' as const },
  chrome: { display: 'flex' as const, alignItems: 'center' as const, gap: 12, flexShrink: 0 },
  title: { fontSize: 11, letterSpacing: 3, color: 'var(--edge-trail)', fontFamily: 'ui-monospace, monospace' },
  tabs: { display: 'flex' as const, gap: 6, marginLeft: 'auto' as const },
  tab: { background: 'rgba(5,8,13,0.85)', borderWidth: 1, borderStyle: 'solid' as const, borderColor: 'rgba(110,224,238,0.6)', color: 'var(--text)', fontSize: 10, letterSpacing: 2, padding: '4px 12px', fontFamily: 'ui-monospace, monospace', cursor: 'pointer' as const },
  tabOn: { background: 'rgba(0,229,255,0.10)', color: 'var(--edge-trail)', borderColor: 'var(--edge-trail)' },
  body: { flex: 1, minHeight: 0, overflow: 'auto' as const, border: '1px solid rgba(0,229,255,0.55)', background: 'rgba(5,8,13,0.6)' },
  muted: { padding: 24, color: 'var(--text-dim)', letterSpacing: 4, fontFamily: 'ui-monospace, monospace' },
  error: { padding: 24, color: 'var(--node-failed)', fontFamily: 'ui-monospace, monospace' },
};
