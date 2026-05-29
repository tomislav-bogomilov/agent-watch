// tests/unit/memory/MemoryEditor.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryEditor } from '../../../src/memory/MemoryEditor';

describe('MemoryEditor', () => {
  it('submits edited description, type, and body', () => {
    const onSave = vi.fn();
    render(
      <MemoryEditor
        mode="edit"
        initial={{ name: 'alpha', description: 'old', type: 'project', body: 'old body' }}
        knownNames={['alpha', 'beta']}
        onSave={onSave}
        onCancel={() => {}}
        pending={false}
      />
    );
    fireEvent.change(screen.getByTestId('editor-description'), { target: { value: 'new desc' } });
    fireEvent.change(screen.getByTestId('editor-type'), { target: { value: 'feedback' } });
    fireEvent.change(screen.getByTestId('editor-body'), { target: { value: 'new body' } });
    fireEvent.click(screen.getByTestId('editor-save'));
    expect(onSave).toHaveBeenCalledWith({ name: 'alpha', description: 'new desc', type: 'feedback', body: 'new body' });
  });

  it('in create mode requires a valid kebab name', () => {
    const onSave = vi.fn();
    render(
      <MemoryEditor mode="create" initial={{ name: '', description: '', type: 'project', body: '' }}
        knownNames={[]} onSave={onSave} onCancel={() => {}} pending={false} />
    );
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: 'Bad Name' } });
    fireEvent.click(screen.getByTestId('editor-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('editor-name-error')).toBeDefined();
  });
});
