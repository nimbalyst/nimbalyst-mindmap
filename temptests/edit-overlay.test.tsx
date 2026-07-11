import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { EditOverlay } from '../src/EditOverlay';

describe('EditOverlay', () => {
  it('renders nothing when not editing', () => {
    const { container } = render(
      <EditOverlay
        editing={null}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container.querySelector('.edit-overlay')).toBeNull();
  });

  it('shows editable text when editing starts', () => {
    const { container } = render(
      <EditOverlay
        editing={{
          nodeId: 'n1',
          text: 'Hello',
          rect: { x: 100, y: 50, width: 160, height: 48 },
          initialKey: null,
          isRoot: false,
        }}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const overlay = container.querySelector('.edit-overlay') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.textContent).toBe('Hello');
    expect(overlay.getAttribute('contenteditable')).toBe('true');
  });

  it('replaces text with initialKey when provided', () => {
    const { container } = render(
      <EditOverlay
        editing={{
          nodeId: 'n1',
          text: 'Hello',
          rect: { x: 100, y: 50, width: 160, height: 48 },
          initialKey: 'a',
          isRoot: false,
        }}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const overlay = container.querySelector('.edit-overlay') as HTMLElement;
    expect(overlay.textContent).toBe('a');
  });

  it('allows typing multiple characters without losing focus', async () => {
    const onCommit = vi.fn();
    const { container } = render(
      <EditOverlay
        editing={{
          nodeId: 'n1',
          text: 'Hello',
          rect: { x: 100, y: 50, width: 160, height: 48 },
          initialKey: 'a',
          isRoot: false,
        }}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />
    );
    const overlay = container.querySelector('.edit-overlay') as HTMLElement;

    // Simulate typing more characters by appending to textContent
    // (jsdom doesn't fully support contentEditable input events, so we simulate)
    overlay.textContent = 'abc';

    // Verify it retained the text (no React re-render clobbered it)
    expect(overlay.textContent).toBe('abc');

    // Commit with Enter
    fireEvent.keyDown(overlay, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('n1', 'abc', 'sibling');
  });

  it('cancels on Escape without committing', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <EditOverlay
        editing={{
          nodeId: 'n1',
          text: 'Hello',
          rect: { x: 100, y: 50, width: 160, height: 48 },
          initialKey: null,
          isRoot: false,
        }}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
    const overlay = container.querySelector('.edit-overlay') as HTMLElement;
    fireEvent.keyDown(overlay, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits on blur', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <EditOverlay
        editing={{
          nodeId: 'n1',
          text: 'Hello',
          rect: { x: 100, y: 50, width: 160, height: 48 },
          initialKey: null,
          isRoot: false,
        }}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />
    );
    const overlay = container.querySelector('.edit-overlay') as HTMLElement;
    overlay.textContent = 'Updated';
    fireEvent.blur(overlay);
    expect(onCommit).toHaveBeenCalledWith('n1', 'Updated', 'done');
  });

  it('uses Tab to commit and continue with a child', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <EditOverlay
        editing={{
          nodeId: 'n1',
          text: 'Draft',
          rect: { x: 0, y: 0, width: 120, height: 40 },
          initialKey: null,
          isRoot: false,
        }}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );
    const overlay = container.querySelector('.edit-overlay') as HTMLElement;
    overlay.textContent = 'Branch';
    fireEvent.keyDown(overlay, { key: 'Tab' });
    expect(onCommit).toHaveBeenCalledWith('n1', 'Branch', 'child');
  });

  it('allows Shift+Enter to insert multiline content without committing', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <EditOverlay
        editing={{
          nodeId: 'n1',
          text: 'Draft',
          rect: { x: 0, y: 0, width: 120, height: 40 },
          initialKey: null,
          isRoot: false,
        }}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.keyDown(container.querySelector('.edit-overlay') as HTMLElement, { key: 'Enter', shiftKey: true });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not get affected by parent re-renders during editing', () => {
    const onCommit = vi.fn();

    function Wrapper() {
      const [counter, setCounter] = React.useState(0);
      return (
        <div>
          <button onClick={() => setCounter(c => c + 1)}>rerender</button>
          <span data-testid="counter">{counter}</span>
          <EditOverlay
            editing={{
              nodeId: 'n1',
              text: 'Hello',
              rect: { x: 100, y: 50, width: 160, height: 48 },
              initialKey: 'x',
              isRoot: false,
            }}
            onCommit={onCommit}
            onCancel={vi.fn()}
          />
        </div>
      );
    }

    const { container } = render(<Wrapper />);
    const overlay = container.querySelector('.edit-overlay') as HTMLElement;
    expect(overlay.textContent).toBe('x');

    // Simulate user typing
    overlay.textContent = 'xyz';

    // Trigger parent re-render
    fireEvent.click(screen.getByText('rerender'));

    // The overlay text should NOT be clobbered by re-render
    expect(overlay.textContent).toBe('xyz');
    expect(screen.getByTestId('counter').textContent).toBe('1');

    // Trigger another re-render
    fireEvent.click(screen.getByText('rerender'));
    expect(overlay.textContent).toBe('xyz');

    // Commit should still work
    fireEvent.keyDown(overlay, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('n1', 'xyz', 'sibling');
  });
});
