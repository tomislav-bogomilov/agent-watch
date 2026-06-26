// tests/unit/memory/MemoryEditor.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryEditor, SUCCESS_HOLD_MS } from '../../../src/memory/MemoryEditor';

afterEach(() => vi.useRealTimers());

describe('MemoryEditor', () => {
  it('submits edited description, type, and body', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryEditor
        mode="edit"
        initial={{ name: 'alpha', description: 'old', type: 'project', body: 'old body' }}
        knownNames={['alpha', 'beta']}
        onSave={onSave}
        onCancel={() => {}}
      />
    );
    fireEvent.change(screen.getByTestId('editor-description'), { target: { value: 'new desc' } });
    fireEvent.change(screen.getByTestId('editor-type'), { target: { value: 'feedback' } });
    fireEvent.change(screen.getByTestId('editor-body'), { target: { value: 'new body' } });
    fireEvent.click(screen.getByTestId('editor-save'));
    expect(onSave).toHaveBeenCalledWith({ name: 'alpha', description: 'new desc', type: 'feedback', body: 'new body' });
    // let the awaited save settle so the success state update lands inside act()
    await waitFor(() => expect(screen.getByTestId('editor-save').textContent ?? '').toMatch(/saved/i));
  });

  it('in create mode requires a valid kebab name', () => {
    const onSave = vi.fn();
    render(
      <MemoryEditor mode="create" initial={{ name: '', description: '', type: 'project', body: '' }}
        knownNames={[]} onSave={onSave} onCancel={() => {}} />
    );
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: 'Bad Name' } });
    fireEvent.click(screen.getByTestId('editor-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('editor-name-error')).toBeDefined();
  });

  it('surfaces a save failure instead of silently doing nothing', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('memory store offline'));
    const onSaved = vi.fn();
    render(
      <MemoryEditor mode="edit"
        initial={{ name: 'alpha', description: 'old', type: 'project', body: 'old body' }}
        knownNames={['alpha']} onSave={onSave} onSaved={onSaved} onCancel={() => {}} />
    );
    fireEvent.click(screen.getByTestId('editor-save'));

    // The rejection must be shown — not swallowed.
    const err = await screen.findByTestId('editor-error');
    expect(err.textContent ?? '').toMatch(/memory store offline/i);
    // Editor stays open and offers a retry; we never navigated away.
    const saveBtn = screen.getByTestId('editor-save') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    expect(saveBtn.textContent ?? '').toMatch(/retry/i);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows a success state, then calls onSaved after the hold', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();
    render(
      <MemoryEditor mode="edit"
        initial={{ name: 'alpha', description: 'old', type: 'project', body: 'old body' }}
        knownNames={['alpha']} onSave={onSave} onSaved={onSaved} onCancel={() => {}} />
    );
    fireEvent.click(screen.getByTestId('editor-save'));

    // flush the awaited save → success state appears, but we hold before closing
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByTestId('editor-save').textContent ?? '').toMatch(/saved/i);
    expect(onSaved).not.toHaveBeenCalled();

    // after the success hold, the parent is told to close/navigate
    await act(async () => { await vi.advanceTimersByTimeAsync(SUCCESS_HOLD_MS); });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith({ name: 'alpha', description: 'old', type: 'project', body: 'old body' });
  });
});
