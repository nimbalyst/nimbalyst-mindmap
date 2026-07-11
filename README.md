# Nimbalyst Mindmap

Nimbalyst Mindmap is a canvas-first mindmap editor for Nimbalyst. It stores maps as markdown-based `.mindmap` files, so the same document stays readable in plain text, editable in source mode, and usable from AI tooling.

![Nimbalyst Mindmap screenshot](./mockups/mindmap-editor-screenshot.png)

## Highlights

- Freeform spatial editing on an infinite canvas
- Markdown-backed `.mindmap` files with a simple, readable structure
- Outline-style hierarchy plus node metadata, notes, tags, and status
- AI tools and Claude plugin support for creating and editing mindmaps
- Continuous keyboard capture: Enter for siblings, Tab for children, and spatial arrow navigation
- Hybrid layout that preserves manually positioned nodes, plus balanced and right-logical structures
- Focus mode, searchable notes/tags, inline note previews, related links, and live collaborator editing badges

## Keyboard workflow

- `Tab`: create and immediately edit a child
- `Enter`: commit and continue with a sibling
- `Shift+Enter`: create a sibling above (or insert a line break while editing)
- `Shift+Tab` / `Alt+Tab`: outdent / indent
- `Cmd/Ctrl+Up/Down`: reorder siblings
- Arrow keys: navigate spatially
- `Space`: collapse or expand a branch
- `Cmd/Ctrl+F`: search; Enter and Shift+Enter move through results
- `Cmd/Ctrl+.`: focus the selected branch
- `?`: show the complete shortcut reference

## AI integration

The editor publishes the selected node as Nimbalyst chat context. AI tools can read a bounded branch with `mindmap.get_context` and apply a generated or reorganized branch atomically with `mindmap.apply_operations`; aliases allow later operations in a batch to refer to nodes created earlier in that same batch.

## File Format

`.mindmap` files are standard markdown with one root heading, optional frontmatter, and nested structure built from headings and lists. Node metadata can carry colors, status, tags, related links, and pinned coordinates without making the outline opaque. See [`examples/`](./examples) and the Claude skill in [`claude-plugin/`](./claude-plugin) for format examples.

## Development

Requirements:

- Node.js 20 or newer
- A compatible Nimbalyst build
- `@nimbalyst/extension-sdk`

Local commands:

```bash
npm install
npm test
npm run build
```

This repository contains the standalone extension source. If you are working from the main Nimbalyst project, use that project's extension build and marketplace publishing workflow.

For extension-specific development notes, see [CLAUDE.md](./CLAUDE.md).

## Repository Layout

- `src/` extension source
- `examples/` sample `.mindmap` files
- `claude-plugin/` Claude command and skill definitions
- `mockups/` screenshots and visual assets

## License

Licensed under the MIT License. See [LICENSE](./LICENSE).
