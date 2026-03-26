import type { ExtensionAITool, ExtensionToolResult } from '@nimbalyst/extension-sdk';
import type { MindmapEditorAPI, NodeColor, NodeStatus } from './types';

function getAPI(context: { editorAPI?: unknown }): MindmapEditorAPI {
  const api = context.editorAPI as MindmapEditorAPI | undefined;
  if (!api) throw new Error('No mindmap editor open for this file');
  return api;
}

export const aiTools: ExtensionAITool[] = [
  {
    name: 'mindmap.get_document',
    description: 'Get the full mindmap document structure including all nodes, their hierarchy, text, colors, statuses, tags, and notes. Use this to understand the current state of the mindmap before making changes.',
    scope: 'editor',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async (_args, context): Promise<ExtensionToolResult> => {
      try {
        const api = getAPI(context);
        const doc = api.getDocument();
        return { success: true, message: `Mindmap "${doc.title}" with ${Object.keys(doc.nodes).length} nodes`, data: doc };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },
  },
  {
    name: 'mindmap.add_node',
    description: 'Add a new node to the mindmap as a child of an existing node. Returns the new node ID. Use mindmap.get_document first to find the parent node ID.',
    scope: 'editor',
    inputSchema: {
      type: 'object',
      properties: {
        parentId: { type: 'string', description: 'ID of the parent node to attach to' },
        text: { type: 'string', description: 'Text content of the new node' },
        color: { type: 'string', enum: ['default', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'], description: 'Node color' },
        status: { type: 'string', enum: ['none', 'idea', 'question', 'todo', 'in-progress', 'done'], description: 'Node status' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for the node' },
        note: { type: 'string', description: 'Note text attached to the node' },
        index: { type: 'number', description: 'Position among siblings (0-based). Appends to end if omitted.' },
      },
      required: ['parentId', 'text'],
    },
    handler: async (args, context): Promise<ExtensionToolResult> => {
      try {
        const api = getAPI(context);
        const newId = api.addNode(args.parentId as string, args.text as string, {
          color: args.color as NodeColor | undefined,
          status: args.status as NodeStatus | undefined,
          tags: args.tags as string[] | undefined,
          note: args.note as string | undefined,
          index: args.index as number | undefined,
        });
        return { success: true, message: `Created node "${args.text}" (${newId})`, data: { nodeId: newId } };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },
  },
  {
    name: 'mindmap.update_node',
    description: 'Update properties of an existing mindmap node (text, color, status, tags, note). Only provided fields are changed.',
    scope: 'editor',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'ID of the node to update' },
        text: { type: 'string', description: 'New text content' },
        color: { type: 'string', enum: ['default', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'], description: 'New color' },
        status: { type: 'string', enum: ['none', 'idea', 'question', 'todo', 'in-progress', 'done'], description: 'New status' },
        tags: { type: 'array', items: { type: 'string' }, description: 'New tags (replaces existing)' },
        note: { type: 'string', description: 'New note text (replaces existing)' },
      },
      required: ['nodeId'],
    },
    handler: async (args, context): Promise<ExtensionToolResult> => {
      try {
        const api = getAPI(context);
        const updates: Record<string, unknown> = {};
        if (args.text !== undefined) updates.text = args.text;
        if (args.color !== undefined) updates.color = args.color;
        if (args.status !== undefined) updates.status = args.status;
        if (args.tags !== undefined) updates.tags = args.tags;
        if (args.note !== undefined) updates.note = args.note;
        api.updateNode(args.nodeId as string, updates);
        return { success: true, message: `Updated node ${args.nodeId}` };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },
  },
  {
    name: 'mindmap.delete_node',
    description: 'Delete a node and all its descendants from the mindmap. Cannot delete the root node.',
    scope: 'editor',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'ID of the node to delete' },
      },
      required: ['nodeId'],
    },
    handler: async (args, context): Promise<ExtensionToolResult> => {
      try {
        const api = getAPI(context);
        api.deleteNode(args.nodeId as string);
        return { success: true, message: `Deleted node ${args.nodeId}` };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },
  },
  {
    name: 'mindmap.move_node',
    description: 'Move a node to become a child of a different parent node. Cannot move the root node.',
    scope: 'editor',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'ID of the node to move' },
        newParentId: { type: 'string', description: 'ID of the new parent node' },
        index: { type: 'number', description: 'Position among new siblings (0-based). Appends to end if omitted.' },
      },
      required: ['nodeId', 'newParentId'],
    },
    handler: async (args, context): Promise<ExtensionToolResult> => {
      try {
        const api = getAPI(context);
        api.moveNode(args.nodeId as string, args.newParentId as string, args.index as number | undefined);
        return { success: true, message: `Moved node ${args.nodeId} under ${args.newParentId}` };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },
  },
];
