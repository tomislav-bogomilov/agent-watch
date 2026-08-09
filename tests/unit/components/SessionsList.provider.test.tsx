import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SessionsList, sessionDisplayTitle } from '../../../src/components/library/SessionsList';
import type { SessionMeta } from '../../../src/parse/types';

const claude: SessionMeta = {
  provider: 'claude', projectId: 'p', sessionId: 'same', cwd: 'D:/project',
  startedAt: '2026-08-08T00:00:00Z', lastUpdatedAt: '2026-08-08T00:00:00Z', sizeBytes: 100,
};
const codex: SessionMeta = { ...claude, provider: 'codex', projectId: 'c' };

describe('provider-aware session rows', () => {
  it('keeps provider identity distinct and shows a badge for each row', () => {
    const onSelect = vi.fn();
    render(<SessionsList
      items={[claude, codex]}
      selectedSessionKey="codex/c/same"
      titles={{ same: 'Legacy Claude title' }}
      onSelect={onSelect}
      onRename={() => {}}
    />);
    expect(screen.getByTestId('provider-badge-claude/p/same').textContent).toBe('CLAUDE');
    expect(screen.getByTestId('provider-badge-codex/c/same').textContent).toBe('CODEX');
    expect(screen.getByText('Legacy Claude title')).toBeTruthy();
    expect(screen.getByText('project')).toBeTruthy();
    fireEvent.click(screen.getAllByTestId('session-item-same')[1]);
    expect(onSelect).toHaveBeenCalledWith(codex);
  });

  it('prefers provider-qualified titles while lazily reading legacy Claude titles', () => {
    expect(sessionDisplayTitle(claude, { same: 'Legacy' })).toBe('Legacy');
    expect(sessionDisplayTitle(codex, { same: 'Legacy' })).toBe('project');
    expect(sessionDisplayTitle(claude, { same: 'Legacy', 'claude/p/same': 'Qualified' })).toBe('Qualified');
  });
});
