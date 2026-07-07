import { MindmapEditor } from './MindmapEditor';
import { aiTools } from './aiTools';
import { mindmapCodec } from './collab/codec';
import './styles.css';

export { aiTools };
export { mindmapCodec };

export const components = {
  MindmapEditor,
};

/**
 * Minimal structural view of the host-provided activation context. Declared
 * loosely so this builds against any SDK version; the host supplies the real
 * `services.collab.registerContentAdapter` at runtime.
 */
interface ActivateContext {
  services?: {
    collab?: {
      registerContentAdapter?: (codec: unknown) => { dispose(): void };
    };
  };
}

export function activate(context?: ActivateContext) {
  // Register the pure collab codec so the host can seed/read/re-upload/export
  // a shared mindmap HEADLESSLY (Share-to-Team without the editor open) using
  // the same code the live editor uses. Without this, sharing an external
  // structured editor failed with "No collab content adapter is registered for
  // document type 'mindmap'".
  context?.services?.collab?.registerContentAdapter?.(mindmapCodec);
}

export function deactivate() {
  // console.log('Nimbalyst Mindmap extension deactivated');
}
