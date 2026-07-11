import type { ExtensionAITool, ExtensionToolResult } from '@nimbalyst/extension-sdk';
import type { MindmapEditorAPI, MindmapOperation, NodeColor, NodeStatus } from './types';

function getAPI(context: { editorAPI?: unknown }): MindmapEditorAPI {
  const api = context.editorAPI as MindmapEditorAPI | undefined;
  if (!api) throw new Error('No mindmap editor open for this file');
  return api;
}

export const aiTools: ExtensionAITool[] = [
  {
    name: 'mindmap.get_context',
    description: 'Get the selected node (or a requested node), its ancestor path, and a bounded subtree. Prefer this over get_document when working on one branch.',
    scope: 'editor',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Optional node ID. Defaults to the selected node.' },
        depth: { type: 'number', description: 'Descendant depth to include, from 0 to 10. Defaults to 3.' },
      },
      required: [],
    },
    handler: async (args, context): Promise<ExtensionToolResult> => {
      try {
        const api = getAPI(context);
        const data = api.getContext(args.nodeId as string | undefined, args.depth as number | undefined);
        return { success: true, message: `Context for "${data.node.text}" with ${data.subtree.length} nodes`, data };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },
  },
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
        link: { type: 'string', description: 'Related URL, workspace path, or artifact reference' },
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
          link: args.link as string | undefined,
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
        link: { type: 'string', description: 'New related URL, workspace path, or artifact reference' },
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
        if (args.link !== undefined) updates.link = args.link;
        api.updateNode(args.nodeId as string, updates);
        return { success: true, message: `Updated node ${args.nodeId}` };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },
  },
  {
    name: 'mindmap.apply_operations',
    description: 'Atomically apply up to 200 add, update, delete, or move operations as one undoable change. Add operations may declare an alias; later operations can use that alias as a nodeId or parentId. Use this for branch expansion and map reorganization so partial results are never left behind.',
    scope: 'editor',
    inputSchema: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: 'Ordered operations. Each item requires type. add requires parentId and text; update/delete require nodeId; move requires nodeId and newParentId.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['add', 'update', 'delete', 'move'] },
              nodeId: { type: 'string' },
              parentId: { type: 'string' },
              newParentId: { type: 'string' },
              alias: { type: 'string' },
              text: { type: 'string' },
              note: { type: 'string' },
              link: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              color: { type: 'string', enum: ['default', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'] },
              status: { type: 'string', enum: ['none', 'idea', 'question', 'todo', 'in-progress', 'done'] },
              index: { type: 'number' },
            },
            required: ['type'],
          },
        },
      },
      required: ['operations'],
    },
    handler: async (args, context): Promise<ExtensionToolResult> => {
      try {
        const api = getAPI(context);
        const operations = args.operations as MindmapOperation[];
        if (!Array.isArray(operations)) throw new Error('operations must be an array');
        const data = api.applyOperations(operations);
        return { success: true, message: `Applied ${data.operationCount} mindmap operations atomically`, data };
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
