import { useQuery } from '@tanstack/react-query';
import { fetchPromptList, fetchSessionList, fetchSessionPayload } from './client';
import { parseSession } from '../parse';
import type { Session } from '../parse/types';

export function useSessionList() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessionList,
  });
}

export function usePromptList() {
  return useQuery({
    queryKey: ['prompts'],
    queryFn: fetchPromptList,
  });
}

export function useSession(projectId: string | null, sessionId: string | null) {
  return useQuery<Session>({
    queryKey: ['session', projectId, sessionId],
    queryFn: async () => {
      const payload = await fetchSessionPayload(projectId!, sessionId!);
      return parseSession(payload);
    },
    enabled: !!projectId && !!sessionId,
  });
}
