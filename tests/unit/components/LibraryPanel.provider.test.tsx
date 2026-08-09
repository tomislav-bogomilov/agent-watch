import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SessionMeta } from '../../../src/parse/types';

const sessions: SessionMeta[] = [
  {
    provider: 'claude', projectId: 'claude-project', sessionId: 'legacy-id', cwd: 'D:/shared/app',
    startedAt: '2026-08-08T00:00:00Z', lastUpdatedAt: '2026-08-08T00:00:00Z', sizeBytes: 10,
  },
  {
    provider: 'codex', projectId: 'codex-project', sessionId: 'codex-id', cwd: 'D:/shared/app',
    startedAt: '2026-08-08T01:00:00Z', lastUpdatedAt: '2026-08-08T01:00:00Z', sizeBytes: 20,
  },
];
vi.mock('../../../src/api/hooks', () => ({
  useSessionList: () => ({
    data: { sessions, warnings: [{ provider: 'codex', message: 'one malformed rollout was skipped' }] },
    isLoading: false, error: null,
  }),
  usePromptList: () => ({ data: [], isLoading: false, error: null }),
  isLiveMeta: () => false,
}));

import { LibraryPanel, type Selection } from '../../../src/components/library/LibraryPanel';

beforeEach(() => localStorage.clear());

function renderPanel(onSelect = vi.fn<(selection: Selection) => void>()) {
  render(<LibraryPanel
    selected={null}
    onSelect={onSelect}
    collapsed={false}
    onToggleCollapsed={() => {}}
    width={280}
    onResize={() => {}}
    mode="sessions"
    usageRows={[]}
    usageProjectId="all"
    usageCutoffDay="2026-08-01"
    usageFamily="all"
    onUsageFamilyChange={() => {}}
  />);
  return onSelect;
}

describe('mixed-provider library', () => {
  it('groups Claude and Codex by cwd, shows warnings, and selects with provider identity', async () => {
    const onSelect = renderPanel();
    expect(screen.getByTestId('project-header-shared/app').textContent).toContain('(2)');
    expect(screen.getByTestId('provider-warning-codex').textContent).toContain('one malformed rollout');
    const codexBadge = await screen.findByTestId('provider-badge-codex/codex-project/codex-id');
    fireEvent.click(codexBadge.closest('li')!);
    expect(onSelect).toHaveBeenCalledWith({
      kind: 'session', provider: 'codex', projectId: 'codex-project', sessionId: 'codex-id',
    });
  });

  it('reads a legacy Claude title but saves edits under the provider-qualified key', async () => {
    localStorage.setItem('tg.session.titles', JSON.stringify({ 'legacy-id': 'Old title' }));
    renderPanel();
    const title = await screen.findByText('Old title');
    fireEvent.doubleClick(title);
    const input = screen.getByTestId('session-rename-legacy-id');
    fireEvent.change(input, { target: { value: 'New title' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('tg.session.titles') ?? '{}');
      expect(stored['claude/claude-project/legacy-id']).toBe('New title');
      expect(stored['legacy-id']).toBeUndefined();
    });
  });
});
