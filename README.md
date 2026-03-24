# Nimbalyst Mindmap

Nimbalyst Mindmap is a spatial mindmap editor extension for Nimbalyst. It stores maps as markdown-based `.mindmap` files and provides a visual editor, outline-style structure, and AI-friendly plain-text format.

This repository is prepared for public release under the MIT license. Copyright (c) 2026 Nimbalyst, Inc.

## Highlights

- Markdown-backed `.mindmap` documents that remain readable in plain text
- Visual node-and-edge editing for freeform mindmaps
- Claude plugin support for creating and editing `.mindmap` files
- Example content and parser tests for the document format

## Requirements

- Node.js 20 or newer
- A compatible Nimbalyst build
- `@nimbalyst/extension-sdk` version `^0.1.0`

The SDK dependency is configured for npm distribution. If the package is not published yet in your environment, temporarily point that dependency at a local checkout before running `npm install`.

## Development

```bash
npm install
npm test
npm run build
```

For development inside Nimbalyst, see [CLAUDE.md](./CLAUDE.md) for the extension-specific workflow and tooling.

## Repository Layout

- `src/` extension source code
- `claude-plugin/` Claude command and skill definitions
- `examples/` sample `.mindmap` files
- `plans/` design and research documents
- `dist/` built extension output

## License

Licensed under the MIT License. See [LICENSE](./LICENSE).
