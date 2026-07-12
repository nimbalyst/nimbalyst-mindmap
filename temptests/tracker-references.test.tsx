import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@nimbalyst/extension-sdk', () => ({
  TrackerReferenceChip: ({ referenceKey, variant }: { referenceKey: string; variant?: string }) => (
    <span data-testid="tracker-chip" data-reference-key={referenceKey} data-variant={variant}>{referenceKey}</span>
  ),
}));

import { LinkPicker, trackerLink, trackerReferenceFromLink, workspaceRelativePath } from '../src/LinkPicker';
import { MindmapNodeComponent, type MindmapNodeData } from '../src/MindmapNode';
import { createEmptyDocument } from '../src/model';

afterEach(() => {
  delete window.electronAPI;
});

describe('unified mindmap links', () => {
  it('uses one canonical link for tracker items', () => {
    expect(trackerLink('NIM-20')).toBe('nimbalyst://NIM-20');
    expect(trackerReferenceFromLink('nimbalyst://NIM-20')).toBe('NIM-20');
    expect(trackerReferenceFromLink('docs/plan.md')).toBeNull();
  });

  it('renders a canonical tracker link as a compact live-reference chip', () => {
    const node = { ...createEmptyDocument().nodes.node_root, link: 'nimbalyst://NIM-20' };
    const data: MindmapNodeData = {
      node,
      isRoot: true,
      isSelected: false,
      isCollapsed: false,
      isLeftSide: false,
      childCount: 0,
      remoteEditors: [],
      onToggleCollapse: vi.fn(),
      onSelect: vi.fn(),
    };

    render(
      <ReactFlowProvider>
        <MindmapNodeComponent id={node.id} data={data} type="mindmap" selected={false} dragging={false} zIndex={0} isConnectable={false} positionAbsoluteX={0} positionAbsoluteY={0} />
      </ReactFlowProvider>,
    );

    expect(screen.getByTestId('tracker-chip').getAttribute('data-reference-key')).toBe('NIM-20');
    expect(screen.getByTestId('tracker-chip').getAttribute('data-variant')).toBe('default');
  });

  it('autocompletes tracker items and writes them through the same link value', async () => {
    const onChange = vi.fn();
    window.electronAPI = {
      invoke: vi.fn().mockResolvedValue([
        { id: 'tracker-1', issueKey: 'NIM-22', title: 'Fix login', type: 'bug', status: 'todo' },
      ]),
      buildQuickOpenCache: vi.fn().mockResolvedValue({ success: true, fileCount: 1 }),
      searchWorkspaceFileNames: vi.fn().mockResolvedValue([]),
    };
    render(<LinkPicker value="" workspacePath="/tracker-workspace" onChange={onChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'login' } });
    const option = await screen.findByRole('option', { name: /Fix login/ });
    fireEvent.click(option);

    expect(onChange).toHaveBeenLastCalledWith('nimbalyst://NIM-22');
  });

  it('autocompletes workspace paths and stores them relative to the workspace', async () => {
    const onChange = vi.fn();
    const searchWorkspaceFileNames = vi.fn().mockResolvedValue([
      { path: '/workspace/docs/architecture.md', type: 'file' },
    ]);
    window.electronAPI = {
      invoke: vi.fn().mockResolvedValue([]),
      buildQuickOpenCache: vi.fn().mockResolvedValue({ success: true, fileCount: 1 }),
      searchWorkspaceFileNames,
    };
    render(<LinkPicker value="" workspacePath="/workspace" onChange={onChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'arch' } });

    await waitFor(() => expect(window.electronAPI?.buildQuickOpenCache).toHaveBeenCalledWith('/workspace'));
    await waitFor(() => expect(searchWorkspaceFileNames).toHaveBeenCalledWith('/workspace', 'arch'));
    const menu = await screen.findByRole('listbox');
    expect(menu.parentElement).toBe(document.body);
    expect(Number.parseFloat(menu.style.width)).toBeGreaterThanOrEqual(500);
    fireEvent.click(await screen.findByRole('option', { name: /architecture\.md/ }));
    expect(onChange).toHaveBeenLastCalledWith('docs/architecture.md');
    expect(workspaceRelativePath('/workspace/docs/architecture.md', '/workspace')).toBe('docs/architecture.md');
  });

  it('renders a bounded document pill that opens the workspace file', () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    window.electronAPI = { invoke };
    const node = { ...createEmptyDocument().nodes.node_root, link: 'docs/a-very-long-architecture-document-name.md' };
    const data: MindmapNodeData = {
      node,
      workspacePath: '/workspace',
      isRoot: true,
      isSelected: false,
      isCollapsed: false,
      isLeftSide: false,
      childCount: 0,
      remoteEditors: [],
      onToggleCollapse: vi.fn(),
      onSelect: vi.fn(),
    };
    const { container } = render(
      <ReactFlowProvider>
        <MindmapNodeComponent id={node.id} data={data} type="mindmap" selected={false} dragging={false} zIndex={0} isConnectable={false} positionAbsoluteX={0} positionAbsoluteY={0} />
      </ReactFlowProvider>,
    );

    const pill = container.querySelector<HTMLAnchorElement>('.mindmap-node-link-pill.document');
    expect(pill?.textContent).toContain('a-very-long-architecture-document-name.md');
    fireEvent.click(pill!);
    expect(invoke).toHaveBeenCalledWith('workspace:open-file', {
      workspacePath: '/workspace',
      filePath: '/workspace/docs/a-very-long-architecture-document-name.md',
    });
  });
});
