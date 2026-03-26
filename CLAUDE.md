# Nimbalyst Mindmap -- Nimbalyst Extension

This is a **Nimbalyst extension** project. Nimbalyst is an extensible, AI-native workspace and code editor. Extensions add custom editors, AI tools, panels, themes, and more.

- **Extension ID**: `com.nimbalyst.mindmap`
- **Template**: `custom-editor`
- **File patterns**: `*.example`

## Build and Development Workflow

Extensions are built with Vite and installed into the running Nimbalyst app using MCP tools. **Do not run ****`npm run build`**** manually** -- always use the MCP tools so the extension is installed in one step.

| Action | MCP Tool |
| --- | --- |
| Build | `mcp__nimbalyst-extension-dev__extension_build` |
| Install | `mcp__nimbalyst-extension-dev__extension_install` |
| Build + reinstall (hot reload) | `mcp__nimbalyst-extension-dev__extension_reload` |
| Check status | `mcp__nimbalyst-extension-dev__extension_get_status` |
| Uninstall | `mcp__nimbalyst-extension-dev__extension_uninstall` |

**Typical iteration loop:**
1. Edit source files
2. Run `extension_reload` with `extensionId: "com.nimbalyst.mindmap"` and `path` set to this project root
3. Test in Nimbalyst immediately

**First-time setup:**
1. `npm install` in this directory
2. `extension_build` then `extension_install`

### Debugging

- Check extension load status: `extension_get_status` with `extensionId: "com.nimbalyst.mindmap"`
- Main process logs: `mcp__nimbalyst-extension-dev__get_main_process_logs` (filter by component: "EXTENSION")
- Renderer logs: `mcp__nimbalyst-extension-dev__get_renderer_debug_logs`
- Verify the result visually: `mcp__nimbalyst-mcp__capture_editor_screenshot`

## Project Structure

```
manifest.json      # Extension manifest -- declares capabilities, contributions, permissions
package.json       # NPM package with build script
vite.config.ts     # Vite build config (uses @nimbalyst/extension-sdk/vite helper)
tsconfig.json      # TypeScript config
src/
  index.ts         # Entry point -- exports components, aiTools, activate(), deactivate()
  *Editor.tsx      # Custom editor React component
  aiTools.ts       # AI tool definitions
dist/              # Build output (do not edit)
```

## Manifest (`manifest.json`)

The manifest declares what the extension contributes to Nimbalyst. Key fields:

- **`contributions.customEditors`** -- Register editors for file patterns
- **`contributions.aiTools`** -- List AI tool names (must match the `name` field in your tool definitions)
- **`contributions.newFileMenu`** -- Add entries to File > New menu
- **`contributions.fileIcons`** -- Custom icons for file types
- **`contributions.panels`** -- Sidebar or bottom panels
- **`contributions.commands`** -- Commands with optional keybindings
- **`contributions.themes`** -- Color themes
- **`contributions.claudePlugin`** -- Claude Code agent skills and slash commands (see below)
- **`permissions`** -- Request `filesystem`, `ai`, or `network` access

## EditorHost Contract

Custom editors receive an `EditorHost` via props and **must** follow this contract:

```typescript
import type { EditorHostProps } from '@nimbalyst/extension-sdk';

function MyEditor({ host }: EditorHostProps) {
  // 1. Load content on mount -- do NOT expect a content prop
  useEffect(() => { host.loadContent().then(setContent); }, [host]);

  // 2. Save when the host asks (autosave / Cmd+S)
  useEffect(() => host.onSaveRequested(async () => {
    await host.saveContent(content);
    host.setDirty(false);
  }), [host, content]);

  // 3. Handle external file changes (AI edits, other processes)
  useEffect(() => host.onFileChanged((newContent) => {
    setContent(newContent);
    host.setDirty(false);
  }), [host]);

  // 4. Mark dirty when the user edits
  const onChange = (val: string) => { setContent(val); host.setDirty(true); };
}
```

**Key rules:**
- The editor owns its content state. The parent never stores or passes content.
- Never depend on the parent re-rendering your component.
- Use `host.theme` and `host.onThemeChanged()` for theme-aware rendering.
- Use `host.storage` for persisting editor-specific state (workspace-scoped or global).

## AI Tools

AI tools let Claude interact with your extension programmatically. Define tools in `src/aiTools.ts` (or `src/index.ts` for ai-tool template) and export them as `aiTools`.

```typescript
import type { ExtensionAITool, ExtensionToolResult } from '@nimbalyst/extension-sdk';

export const aiTools: ExtensionAITool[] = [
  {
    name: 'myext.do_something',     // prefix.action_name
    description: 'Describe what it does -- Claude reads this to decide when to use it',
    scope: 'global',                // 'global' = always available, 'editor' = only when file is open
    inputSchema: {
      type: 'object',
      properties: { /* JSON Schema */ },
      required: [],
    },
    handler: async (args, context): Promise<ExtensionToolResult> => {
      // context.activeFilePath -- current file
      // context.workspacePath -- workspace root
      // context.extensionContext.services.filesystem -- read/write files
      return { success: true, message: 'Done', data: { /* structured result */ } };
    },
  },
];
```

**Best practices:**
- Prefix tool names with your extension name to avoid collisions
- Write specific descriptions -- Claude uses them to decide when to call the tool
- Return structured data in `data`, not just messages
- Return errors as `{ success: false, error: '...' }` -- do not throw
- Every tool listed in `manifest.json contributions.aiTools` must have a matching handler

## Claude Agent Skills (`claudePlugin`)

Extensions can bundle **Claude Code skills** -- slash commands and agent context that enhance the AI agent's capabilities within Nimbalyst.

### Directory structure

```
claude-plugin/
  .claude-plugin/
    plugin.json          # Plugin metadata
  commands/
    my-command.md        # Slash command (user types /my-command)
  skills/
    my-skill/
      SKILL.md           # Skill definition (auto-triggered by agent)
```

### Register in manifest.json

```json
{
  "contributions": {
    "claudePlugin": {
      "path": "claude-plugin",
      "displayName": "Nimbalyst Mindmap",
      "description": "What the plugin provides to the agent",
      "enabledByDefault": true,
      "commands": [
        { "name": "my-command", "description": "What /my-command does" }
      ]
    }
  }
}
```

### plugin.json

```json
{
  "name": "com-nimbalyst-mindmap",
  "version": "1.0.0",
  "description": "Claude Code plugin for Nimbalyst Mindmap",
  "keywords": []
}
```

### Slash command (`commands/my-command.md`)

```markdown
---
description: Short description shown in command palette
---

# /my-command

Detailed instructions for Claude when the user invokes /my-command.

The user said: $ARGUMENTS
```

### Skill (`skills/my-skill/SKILL.md`)

Skills are automatically loaded when their description matches the task. They provide domain context and tool usage instructions.

```markdown
---
name: my-skill
description: When and why the agent should use this skill (be specific so it triggers correctly)
---

# Skill Name

Instructions for the agent, including which MCP tools to use and in what order.
```

## CSS Theming

Use Nimbalyst's CSS custom properties for theme-consistent styling:

| Variable | Usage |
| --- | --- |
| `--nim-bg` | Primary background |
| `--nim-bg-secondary` | Secondary background (panels, inputs) |
| `--nim-bg-tertiary` | Tertiary background (hover states) |
| `--nim-bg-hover` | Hover background |
| `--nim-text` | Primary text |
| `--nim-text-muted` | Secondary text |
| `--nim-text-faint` | Tertiary text |
| `--nim-border` | Borders |
| `--nim-primary` | Accent / primary actions |
| `--nim-success` / `--nim-warning` / `--nim-error` | Status colors |

Always use these variables instead of hardcoded colors so the extension works with all themes.

## SDK Reference

The `@nimbalyst/extension-sdk` package provides all types and the Vite build helper.

Key imports:
```typescript
import type {
  EditorHostProps,      // Props for custom editor components
  ExtensionAITool,      // AI tool definition
  AIToolContext,         // Context passed to tool handlers
  ExtensionToolResult,  // Return type for tool handlers
  ExtensionContext,      // Passed to activate()
  PanelHostProps,        // Props for panel components
  ExtensionStorage,      // Workspace and global key-value storage
} from '@nimbalyst/extension-sdk';

import { createExtensionConfig } from '@nimbalyst/extension-sdk/vite';
```