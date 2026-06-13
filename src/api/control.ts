import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { POLL_MS } from '../components/live/liveness';
import type { ControlSnapshot } from '../../server/control-state';
import type { InstallResult } from '../../server/hook-installer';

export type { ControlSnapshot, HeldInfo } from '../../server/control-state';

export type ControlStateResponse = { installed: boolean; control: ControlSnapshot };
export type ControlTarget = 'all' | 'main' | string;

async function fetchControlState(projectId: string, sessionId: string): Promise<ControlStateResponse> {
  const res = await fetch(`/api/control/state?projectId=${encodeURIComponent(projectId)}&sessionId=${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`control state failed: ${res.status}`);
  return (await res.json()) as ControlStateResponse;
}

async function postControl(path: 'pause' | 'resume', body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/control/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
}

async function postInstallHook(): Promise<InstallResult> {
  const res = await fetch('/api/control/install-hook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error(`install failed: ${res.status}`);
  return (await res.json()) as InstallResult;
}

export function useControlState(projectId: string, sessionId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['control', projectId, sessionId],
    queryFn: () => fetchControlState(projectId, sessionId),
    enabled: enabled && !!projectId && !!sessionId,
    refetchInterval: POLL_MS,
  });
}

function useControlMutation(projectId: string, sessionId: string) {
  const qc = useQueryClient();
  return { invalidate: () => qc.invalidateQueries({ queryKey: ['control', projectId, sessionId] }) };
}

export function usePauseTarget(projectId: string, sessionId: string) {
  const { invalidate } = useControlMutation(projectId, sessionId);
  return useMutation({
    mutationFn: (target: ControlTarget) => postControl('pause', { projectId, sessionId, target }),
    onSuccess: invalidate,
  });
}

export function useResumeTarget(projectId: string, sessionId: string) {
  const { invalidate } = useControlMutation(projectId, sessionId);
  return useMutation({
    mutationFn: (v: { target: ControlTarget; note: string | null }) =>
      postControl('resume', { projectId, sessionId, target: v.target, ...(v.note ? { note: v.note } : {}) }),
    onSuccess: invalidate,
  });
}

export function useInstallGateHook(projectId: string, sessionId: string) {
  const { invalidate } = useControlMutation(projectId, sessionId);
  return useMutation({ mutationFn: postInstallHook, onSuccess: invalidate });
}
