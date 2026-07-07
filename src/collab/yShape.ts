/**
 * Shape of the Mindmap collaborative document on the Y.Doc.
 *
 *   Y.Doc
 *   ├── nodes: Y.Map<nodeId, Y.Map>
 *   │     each value Y.Map:
 *   │       text:     string
 *   │       note:     string
 *   │       parentId: string | null
 *   │       color:    NodeColor
 *   │       status:   NodeStatus
 *   │       posX:     number
 *   │       posY:     number
 *   │       childIds: Y.Array<string>
 *   │       tags:     Y.Array<string>
 *   └── meta: Y.Map { title: string; rootId: string }
 *
 * Why this shape:
 *
 * - `nodes` as Y.Map (top-level key per node) lets concurrent additions to
 *   different nodes commute without conflicting on a shared list. Top-level
 *   Y.Maps with thousands of entries get expensive memory-wise, but mindmaps
 *   are small (typically <500 nodes) so this is fine.
 * - `childIds` as Y.Array<string> inside each node Y.Map gives proper CRDT
 *   ordering for child sequences. A concurrent reorder by two users does NOT
 *   produce duplicates because Y.Array merges by position rather than by
 *   replacing the whole array.
 * - `tags` as Y.Array<string> for the same reason: concurrent tag adds from
 *   different users converge without clobbering each other.
 * - `position.x/y` as flat numeric keys (`posX`, `posY`) rather than a
 *   nested Y.Map. Position is a scalar pair; CRDT merge on a flat key
 *   reduces to last-writer-wins, which is the correct semantic for drag
 *   end-points -- last person to release the mouse wins.
 *
 * Bootstrap-race safety: node ids are content-derived (`node_root` for the
 * root, and the file-provided ids for everything else from `parseDocument`).
 * Two clients racing through `seed()` produce CRDT updates whose merged
 * shape is identical to either single client's output. See
 * `docs/COLLABORATION_GUIDE.md` in the main repo.
 */

import * as Y from 'yjs';
import type {
  MindmapDocument,
  MindmapNode,
  NodeColor,
  NodeStatus,
} from '../types';

export const Y_NODES = 'nodes';
export const Y_META = 'meta';

export const META_TITLE = 'title';
export const META_ROOT_ID = 'rootId';

export const NODE_TEXT = 'text';
export const NODE_NOTE = 'note';
export const NODE_PARENT_ID = 'parentId';
export const NODE_COLOR = 'color';
export const NODE_STATUS = 'status';
export const NODE_POS_X = 'posX';
export const NODE_POS_Y = 'posY';
export const NODE_CHILD_IDS = 'childIds';
export const NODE_TAGS = 'tags';

export interface YNodeView {
  // Convenience accessors live in helpers below; this type just documents
  // what each node Y.Map exposes through `get(...)`.
  text: string;
  note: string;
  parentId: string | null;
  color: NodeColor;
  status: NodeStatus;
  posX: number;
  posY: number;
  childIds: Y.Array<string>;
  tags: Y.Array<string>;
}

export function getYNodes(yDoc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return yDoc.getMap<Y.Map<unknown>>(Y_NODES);
}

export function getYMeta(yDoc: Y.Doc): Y.Map<unknown> {
  return yDoc.getMap<unknown>(Y_META);
}

/** Build a Y.Map representing a single node from a plain MindmapNode. */
export function createYNode(node: MindmapNode): Y.Map<unknown> {
  const yNode = new Y.Map<unknown>();
  yNode.set(NODE_TEXT, node.text);
  yNode.set(NODE_NOTE, node.note);
  yNode.set(NODE_PARENT_ID, node.parentId);
  yNode.set(NODE_COLOR, node.color);
  yNode.set(NODE_STATUS, node.status);
  yNode.set(NODE_POS_X, node.position.x);
  yNode.set(NODE_POS_Y, node.position.y);

  const yChildIds = new Y.Array<string>();
  if (node.childIds.length > 0) yChildIds.push(node.childIds.slice());
  yNode.set(NODE_CHILD_IDS, yChildIds);

  const yTags = new Y.Array<string>();
  if (node.tags.length > 0) yTags.push(node.tags.slice());
  yNode.set(NODE_TAGS, yTags);

  return yNode;
}

/** Project a single Y.Map node back into a plain MindmapNode. */
export function readYNode(id: string, yNode: Y.Map<unknown>): MindmapNode {
  const childIdsArr = yNode.get(NODE_CHILD_IDS) as Y.Array<string> | undefined;
  const tagsArr = yNode.get(NODE_TAGS) as Y.Array<string> | undefined;
  return {
    id,
    text: String(yNode.get(NODE_TEXT) ?? ''),
    note: String(yNode.get(NODE_NOTE) ?? ''),
    parentId: (yNode.get(NODE_PARENT_ID) as string | null | undefined) ?? null,
    color: (yNode.get(NODE_COLOR) as NodeColor | undefined) ?? 'default',
    status: (yNode.get(NODE_STATUS) as NodeStatus | undefined) ?? 'none',
    position: {
      x: Number(yNode.get(NODE_POS_X) ?? 0),
      y: Number(yNode.get(NODE_POS_Y) ?? 0),
    },
    childIds: childIdsArr ? childIdsArr.toArray() : [],
    tags: tagsArr ? tagsArr.toArray() : [],
  };
}

/** Project the whole shared document into a MindmapDocument snapshot. */
export function readYDoc(yDoc: Y.Doc): MindmapDocument {
  const yNodes = getYNodes(yDoc);
  const yMeta = getYMeta(yDoc);
  const nodes: Record<string, MindmapNode> = {};
  for (const id of yNodes.keys()) {
    const yNode = yNodes.get(id);
    if (yNode) nodes[id] = readYNode(id, yNode);
  }
  const rootId = (yMeta.get(META_ROOT_ID) as string | undefined) ?? 'node_root';
  const title = (yMeta.get(META_TITLE) as string | undefined) ?? 'Untitled map';
  const now = new Date().toISOString();
  return {
    version: 1,
    title,
    rootId,
    nodes,
    metadata: {
      createdAt: now,
      updatedAt: now,
      canvas: { viewport: { x: 0, y: 0, zoom: 1 } },
    },
  };
}
