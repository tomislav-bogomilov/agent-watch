import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Session, Milestone } from '../../parse/types';
import { LivePane } from './LivePane';
import { extractMainTrail } from './extractMainTrail';
import { subagentLabel } from './subagentLabel';
import { nextPaneStatus, remainingSeconds, type PaneState } from './paneStatus';
import { TICK_MS, CLOSING_MS } from './liveness';

type Props = {
  session: Session;
  /** Map of subagent file id → lastUpdatedAt ISO. The caller (App) feeds this from the SessionPayload subagents array. */
  subagentMtimes: Record<string, string>;
};

const containerStyle = (n: number): CSSProperties => ({
  flex: 1,
  display: 'grid',
  gridTemplateColumns: n === 1 ? '1fr' : '1fr 1fr',
  gap: 1,
  background: 'rgba(110,224,238,0.10)',
  minHeight: 0,
});

const lastSpanStyle: CSSProperties = { gridColumn: 'span 2' };

function collectSubagentTrails(root: Milestone): Map<string, Milestone[]> {
  // Each subagent_spawn's children[0] is the sub-agent's inner root.
  // The "id" we key by is matched to the subagent file id elsewhere; for now,
  // use the spawn node's id since attachSubagents already paired them.
  // We return id (spawn-node-derived) → trail (DFS of the inner subtree).
  const out = new Map<string, Milestone[]>();
  function walk(node: Milestone): void {
    if (node.kind === 'subagent_spawn' && node.children[0]) {
      const trail: Milestone[] = [];
      function inner(n: Milestone): void {
        trail.push(n);
        for (const c of n.children) inner(c);
      }
      inner(node.children[0]);
      // The id we use to look up mtime is the spawn's raw toolResult content's agentId.
      // attachSubagents has already attached by that match; here we just key by spawn id
      // and let the parent map the spawn id to a file id via session payload data.
      // For the v1 cut, we approximate: key by the first child id since spawn nodes are unique.
      const key = `spawn:${node.id}`;
      out.set(key, trail);
    }
    for (const c of node.children) walk(c);
  }
  walk(root);
  return out;
}

export function LivePanes({ session, subagentMtimes }: Props) {
  const mainTrail = useMemo(() => extractMainTrail(session.root), [session]);
  const subagentTrails = useMemo(() => collectSubagentTrails(session.root), [session]);
  const subagentKeys = useMemo(() => Array.from(subagentTrails.keys()), [subagentTrails]);

  // subagentMtimes is keyed by the on-disk file id (`agent-xxxx`). Since we
  // don't have a direct mapping from spawn-node → file id here in v1, we fall
  // back to alphabetical pairing of spawn keys with file ids. This works for
  // the common case (1 sub-agent at a time) and is correct enough until the
  // parser exposes a stable spawn→file linkage.
  const fileIds = useMemo(() => Object.keys(subagentMtimes).sort(), [subagentMtimes]);
  const keyToFileId = useMemo(() => {
    const map = new Map<string, string>();
    subagentKeys.forEach((k, i) => { if (fileIds[i]) map.set(k, fileIds[i]); });
    return map;
  }, [subagentKeys, fileIds]);

  const [statusMap, setStatusMap] = useState<Record<string, PaneState>>({});
  const [nowMs, setNowMs] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Tick the status map whenever nowMs or subagentMtimes change.
  useEffect(() => {
    setStatusMap((prev) => {
      const next: Record<string, PaneState> = {};
      for (const key of subagentKeys) {
        const fileId = keyToFileId.get(key);
        const mtimeIso = fileId ? subagentMtimes[fileId] : undefined;
        const lastUpdatedMs = mtimeIso ? new Date(mtimeIso).getTime() : nowMs;
        const prevState: PaneState = prev[key] ?? {
          status: 'active', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null,
        };
        next[key] = nextPaneStatus(prevState, lastUpdatedMs, nowMs);
      }
      return next;
    });
  }, [nowMs, subagentKeys, keyToFileId, subagentMtimes]);

  // Build the displayable pane list: MAIN always; sub-agents whose status is not 'closed'.
  const displayableKeys = subagentKeys.filter((k) => statusMap[k]?.status !== 'closed');
  const total = 1 + displayableKeys.length;

  function freezeToggle(key: string): void {
    setStatusMap((prev) => {
      const s = prev[key];
      if (!s) return prev;
      if (s.status === 'frozen') {
        // resume: convert frozenRemainingMs back into a new closingStartedAt anchored at now.
        const newClosingStartedAt = nowMs - (CLOSING_MS - (s.frozenRemainingMs ?? CLOSING_MS));
        return { ...prev, [key]: { ...s, status: 'closing', frozenAt: null, frozenRemainingMs: null, closingStartedAt: newClosingStartedAt } };
      }
      if (s.status === 'closing') {
        const elapsed = nowMs - (s.closingStartedAt ?? nowMs);
        const remaining = Math.max(0, CLOSING_MS - elapsed);
        return { ...prev, [key]: { ...s, status: 'frozen', frozenAt: nowMs, frozenRemainingMs: remaining } };
      }
      return prev;
    });
  }

  return (
    <div data-testid="live-panes-grid" data-n={total} style={containerStyle(total)}>
      <LivePane kind="main" label="MAIN" milestones={mainTrail} />
      {displayableKeys.map((key, idx) => {
        const isLastOdd = total % 2 === 1 && idx === displayableKeys.length - 1;
        const trail = subagentTrails.get(key) ?? [];
        const fileId = keyToFileId.get(key) ?? key;
        const status = statusMap[key];
        const closingSeconds = status ? remainingSeconds(status, nowMs) : null;
        const frozen = status?.status === 'frozen';
        return (
          <div key={key} style={isLastOdd ? lastSpanStyle : undefined}>
            <LivePane
              kind="subagent"
              label={subagentLabel(fileId)}
              milestones={trail}
              closingSeconds={status && (status.status === 'closing' || status.status === 'frozen') ? closingSeconds : null}
              frozen={frozen}
              onToggleFreeze={() => freezeToggle(key)}
            />
          </div>
        );
      })}
    </div>
  );
}
