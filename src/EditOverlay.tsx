import React, { useRef, useEffect, useCallback } from 'react';

export interface EditOverlayProps {
  editing: {
    nodeId: string;
    text: string;
    rect: { x: number; y: number; width: number; height: number };
    initialKey: string | null;
    isRoot: boolean;
  } | null;
  onCommit: (nodeId: string, text: string, intent: 'done' | 'sibling' | 'child') => void;
  onCancel: () => void;
}

export function EditOverlay({ editing, onCommit, onCancel }: EditOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;

  // On mount or when editing starts, set text and focus
  const initializedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editing || !ref.current) {
      initializedRef.current = null;
      return;
    }

    // Only initialize once per editing session (identified by nodeId)
    if (initializedRef.current === editing.nodeId) return;
    initializedRef.current = editing.nodeId;

    const el = ref.current;

    if (editing.initialKey) {
      el.textContent = editing.initialKey;
    } else {
      el.textContent = editing.text;
    }

    el.focus();

    // Place cursor at end (for initialKey) or select all (for F2/double-click)
    const range = document.createRange();
    range.selectNodeContents(el);
    if (editing.initialKey) {
      range.collapse(false); // cursor at end
    }
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  const commit = useCallback((intent: 'done' | 'sibling' | 'child' = 'done') => {
    const e = editingRef.current;
    if (!e || !ref.current) return;
    const trimmed = (ref.current.textContent || '').trim();
    if (trimmed) {
      onCommit(e.nodeId, trimmed, intent);
    } else {
      onCancel();
    }
  }, [onCommit, onCancel]);

  const handleKeyDown = useCallback(
    (ev: React.KeyboardEvent) => {
      ev.stopPropagation(); // never let keys escape to parent handlers
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        commit('sibling');
      } else if (ev.key === 'Tab') {
        ev.preventDefault();
        commit('child');
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        onCancel();
      }
    },
    [commit, onCancel]
  );

  const handleBlur = useCallback(() => {
    commit('done');
  }, [commit]);

  if (!editing) return null;

  const { rect, isRoot } = editing;

  return (
    <div
      ref={ref}
      className={`edit-overlay ${isRoot ? 'edit-overlay-root' : ''}`}
      contentEditable
      suppressContentEditableWarning
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        minHeight: rect.height,
        zIndex: 1000,
      }}
    />
  );
}
