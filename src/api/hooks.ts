import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPromptList, fetchSessionList, fetchSessionPayload, fetchTokenUsage, fetchMemory, createMemory, updateMemory, deleteMemory, fetchNarrative, startNarrative, tickNarrative, refreshNarrative } from './client';
import type { TokenUsageResponse, MemoryResponse, MemoryType, NarratorInput } from './client';
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

export function useTokenUsage() {
  return useQuery<TokenUsageResponse>({
    queryKey: ['token-usage'],
    queryFn: fetchTokenUsage,
    staleTime: 60_000,
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

export function useMemoryList() {
  return useQuery<MemoryResponse>({ queryKey: ['memory'], queryFn: fetchMemory });
}

export function useCreateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scopeKey: string; name: string; description: string; type: MemoryType; body: string }) =>
      createMemory(v.scopeKey, { name: v.name, description: v.description, type: v.type, body: v.body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory'] }),
  });
}

export function useUpdateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scopeKey: string; name: string; description: string; type: MemoryType; body: string }) =>
      updateMemory(v.scopeKey, v.name, { description: v.description, type: v.type, body: v.body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory'] }),
  });
}

export function useDeleteMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scopeKey: string; name: string }) => deleteMemory(v.scopeKey, v.name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory'] }),
  });
}

export function useNarrative(
  projectId: string | null, sessionId: string | null, enabled: boolean, live: boolean,
) {
  return useQuery({
    queryKey: ['narrative', projectId, sessionId],
    queryFn: () => fetchNarrative(projectId!, sessionId!),
    enabled: enabled && !!projectId && !!sessionId,
    refetchInterval: live ? POLL_MS : false,
    structuralSharing: false,
  });
}

export function useStartNarrative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { projectId: string; sessionId: string; milestones: NarratorInput[] }) =>
      startNarrative(v.projectId, v.sessionId, v.milestones),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['narrative', v.projectId, v.sessionId] }),
  });
}

export function useTickNarrative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { projectId: string; sessionId: string; milestones: NarratorInput[] }) =>
      tickNarrative(v.projectId, v.sessionId, v.milestones),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['narrative', v.projectId, v.sessionId] }),
  });
}

export function useRefreshNarrative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { projectId: string; sessionId: string; milestones: NarratorInput[] }) =>
      refreshNarrative(v.projectId, v.sessionId, v.milestones),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['narrative', v.projectId, v.sessionId] }),
  });
}
