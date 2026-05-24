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
  });
}

export { isLiveMeta } from '../components/live/liveness';
