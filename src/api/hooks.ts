import { useQuery } from '@tanstack/react-query';
import { fetchPromptList, fetchSessionList, fetchSessionPayload } from './client';
import { parseSession } from '../parse';
import type { Session } from '../parse/types';
import { POLL_MS } from '../components/live/liveness';

export function useSessionList() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessionList,
    refetchInterval: POLL_MS,
  });
}

export function usePromptList() {
  return useQuery({
    queryKey: ['prompts'],
    queryFn: fetchPromptList,
  });
}

export function useSession(projectId: string | null, sessionId: string | null, live: boolean = false) {
  return useQuery<Session>({
    queryKey: ['session', projectId, sessionId],
    queryFn: async () => {
      const payload = await fetchSessionPayload(projectId!, sessionId!);
      return parseSession(payload);
    },
    enabled: !!projectId && !!sessionId,
    refetchInterval: live ? POLL_MS : false,
    // TanStack Query's default structural sharing deep-walks the result and
    // preserves old refs for equal subtrees. For our Milestone tree that
    // breaks LIVE refresh: when a sub-agent emits a new milestone, the
    // unchanged ancestor chain keeps its OLD reference, so React's useMemo
    // chains downstream (layoutTree, extractSubagentPaneRoot, GraphCanvas
    // visibleNodes) skip the work and the pane never repaints. Opt out:
    // each poll produces a fresh tree by design — parseSession is fast.
    structuralSharing: false,
  });
}

export { isLiveMeta } from '../components/live/liveness';
