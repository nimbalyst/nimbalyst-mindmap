/**
 * Mindmap CollabCodec.
 *
 * The single, PURE thing the mindmap editor defines for collaboration:
 * `file bytes <-> Y.Doc shape`, no React, no host imports. Registered once in
 * `activate()` (`context.services.collab.registerContentAdapter(mindmapCodec)`)
 * and passed to the collaborative editor. Because it is pure, the host can seed
 * a shared room HEADLESSLY (Share-to-Team without the editor open, re-upload)
 * using exactly the same code the live editor uses -- which is what makes an
 * external, structured editor like mindmap work for Share-to-Team without any
 * mindmap-specific code in the host's main process.
 *
 * The type is declared structurally here (rather than imported from the SDK)
 * so this file builds against any SDK version -- the host consumes it as a
 * plain object at runtime via the collab registry.
 */

import * as Y from 'yjs';
import { seedMindmapYDoc, isMindmapYDocEmpty } from './seed';
import { getYNodes, getYMeta, readYDoc } from './yShape';
import { serializeDocument } from '../model';

/** Structural shape of the host's CollabCodec (aka CollabContentAdapter). */
export interface MindmapCollabCodec {
  documentType: string;
  fileExtensions: string[];
  mimeType?: string;
  layoutVersion: number;
  isEmpty(yDoc: Y.Doc): boolean;
  seedFromFile(yDoc: Y.Doc, source: string | Uint8Array): void;
  applyFromFile(yDoc: Y.Doc, source: string | Uint8Array): void;
  exportToFile(yDoc: Y.Doc): string;
  toPlainText(yDoc: Y.Doc): string;
}

function decodeSource(source: string | Uint8Array): string {
  if (typeof source === 'string') return source;
  try {
    return new TextDecoder().decode(source);
  } catch {
    return '';
  }
}

export const mindmapCodec: MindmapCollabCodec = {
  documentType: 'mindmap',
  fileExtensions: ['.mindmap'],
  mimeType: 'text/markdown',
  layoutVersion: 1,

  isEmpty(yDoc) {
    return isMindmapYDocEmpty(yDoc);
  },

  seedFromFile(yDoc, source) {
    // The host wraps this in a COLLAB_INIT_ORIGIN transaction. seedMindmapYDoc
    // is deterministic (content-derived stable ids), so a bootstrap race
    // between two clients merges to an identical shape.
    seedMindmapYDoc(yDoc, decodeSource(source));
  },

  applyFromFile(yDoc, source) {
    // Re-upload / overwrite: safe on a populated doc. Wipe the shared shape and
    // reseed inside one transaction so history records a single replacement.
    const text = decodeSource(source);
    // REFUSE empty source: wiping a populated shared doc because a file read
    // came back empty would destroy the room content for every client.
    if (text.trim() === '') return;
    yDoc.transact(() => {
      getYNodes(yDoc).clear();
      getYMeta(yDoc).clear();
      seedMindmapYDoc(yDoc, text);
    });
  },

  exportToFile(yDoc) {
    return serializeDocument(readYDoc(yDoc));
  },

  toPlainText(yDoc) {
    return serializeDocument(readYDoc(yDoc));
  },
};
