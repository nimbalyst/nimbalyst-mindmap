# Mindmap File Format Design

## Status: Proposed

## Problem

The current `.mindmap` format is a JSON graph structure (~980 lines for a moderate map). This causes several problems:

1. **AI can't edit it directly.** We had to build 6 custom AI tools (read_map, create_nodes, update_nodes, delete_nodes, replace_branch, replace_map). An AI model used replace_map incorrectly and deleted an entire mindmap. We simplified to 2 tools (read_map, update_map using markdown outlines), but the fundamental problem remains: the file on disk is not something an AI can naturally read or write.

2. **Git diffs are useless.** A single node text change produces a multi-line JSON diff with IDs, positions, timestamps. Impossible to review in a PR.

3. **Not human-editable.** You can't open the file in a text editor and make a quick change. You need the extension.

4. **Positions are redundant.** Our layout algorithm computes positions from tree structure. Stored positions only matter for manual drag overrides, which are rare and could be handled differently.

## Proposed Format

Standard markdown with optional inline metadata. The file extension remains `.mindmap` but the content is valid markdown.

### Example

```markdown
---
title: AI & AI Research
---

# AI & AI Research
> Major paradigms, model families, and open research areas.

## Core Paradigms {color: blue}
- Symbolic / GOFAI
  > Rules, logic, planning, expert systems.
  - Planning and search
  - Knowledge graphs and ontologies
- Statistical Machine Learning
  > Probabilistic models, kernels, graphical models.
  - Bayesian inference
  - Probabilistic graphical models
- Deep Learning
- Reinforcement Learning {status: in-progress}
  - Policy optimization
  - Model-based RL

## Model Families {color: purple}
- Transformers {tags: attention, nlp}
  > Foundation of modern LLMs.
  - LLMs and instruction tuning
  - Vision transformers
- Diffusion Models
  > Denoise into images, audio, video.
  - Image generation {status: done}
  - Video generation {status: todo}
- CNNs
- GANs
- Graph Neural Networks

## Research Fronts {color: red}
- Alignment & Safety
  > Making advanced systems behave as intended.
  - Adversarial testing {tags: safety, priority}
- Interpretability {status: in-progress}
  - Mechanistic interpretability
```

### Syntax Rules

**Tree structure** uses markdown headings and lists:

| Syntax | Mindmap level |
|--------|--------------|
| `# Heading 1` | Root node (exactly one) |
| `## Heading 2` | Depth 1 branches |
| `### Heading 3` | Depth 2 branches |
| `- List item` | Leaf nodes (indentation determines depth) |
| `  - Nested item` | Deeper leaves (2 spaces per level) |

Headings (`#`/`##`/`###`) are used for the top levels of the tree because they're visually distinct and semantically meaningful. Below depth 3, indented list items (`-`) handle arbitrary nesting.

**Notes** use blockquotes immediately following a node:

```markdown
- Some node
  > This is a note attached to "Some node".
  > It can span multiple lines.
```

Blockquotes are standard markdown, render well in any viewer, and are semantically appropriate (supplementary content about the preceding node).

**Metadata** uses inline `{key: value}` at the end of a node line:

```markdown
- Task name {status: todo, color: green, tags: frontend, urgent}
```

Supported keys:
- `color`: default, red, orange, yellow, green, blue, purple, pink
- `status`: none, idea, question, todo, in-progress, done
- `tags`: comma-separated list

The `{...}` syntax was chosen because:
- It degrades gracefully in plain markdown viewers (appears as text)
- It's visually distinct from the node text
- It doesn't conflict with any standard markdown syntax
- It's easy for AI models to read and generate

**Frontmatter** stores document-level settings:

```yaml
---
title: Map Title
---
```

Future frontmatter fields could include canvas viewport, theme preferences, or layout settings. Manual position overrides could also live here as a positions map if we need them.

## Comparison with Existing Formats

### Markmap (markmap.js.org)

The most widely used markdown-to-mindmap tool. Uses pure standard markdown with headings for hierarchy.

```markdown
# Root
## Branch A
### Leaf 1
## Branch B
```

- No metadata support (no colors, status, tags, notes)
- Read-only visualization of existing markdown files
- Not designed as an editable mindmap format

### XMindMark (xmind)

Custom markup language inspired by markdown. Purpose-built for Xmind import/export.

```
Central Topic
- Main Topic A
  - Sub Topic [1]
- Main Topic B [B1]
  - With note [N:This is a note]
  - With link [L:https://example.com]
- Related [^1](relationship label)
```

- Custom syntax: `[N:text]` for notes, `[L:url]` for links, `[B]` for boundaries
- `[1]`/`[^1]` for cross-references between nodes
- Not valid markdown -- custom parser required
- No colors or status support

### Mermaid mindmap

```
mindmap
  root((Root))
    Branch A
      Leaf 1
    Branch B
```

- Embedded in code blocks, not standalone files
- Node shapes via `(())`, `[]`, `()`
- No metadata, notes, or colors
- Read-only rendering

### Our format

| Feature | Markmap | XMindMark | Mermaid | Ours |
|---------|---------|-----------|---------|------|
| Valid markdown | yes | no | no | yes |
| Notes | no | `[N:text]` | no | `> blockquote` |
| Colors/status | no | no | no | `{color: x, status: y}` |
| Tags | no | no | no | `{tags: a, b}` |
| Cross-references | no | `[1][^1]` | no | no (future) |
| AI editable | yes | mostly | no | yes |
| Human readable | yes | mostly | somewhat | yes |
| Degrades gracefully | yes | no | no | yes |

The main thing we lack vs XMindMark is cross-references (relationships between non-adjacent nodes). We can add this later with a similar `[1]`/`[^1]` syntax or a references section in frontmatter.

## What We Gain

### AI needs zero tools

The AI reads and writes markdown natively. We can delete `aiTools.ts` entirely and remove all AI tool registrations from the manifest. The extension becomes a pure renderer/editor. Any model that can write markdown can create a mindmap.

### Git diffs are readable

```diff
 ## Research Fronts {color: red}
 - Alignment & Safety
-  - Adversarial testing
+  - Adversarial testing {status: done}
+  - Red teaming benchmarks
 - Interpretability
```

vs the current JSON diff which shows ID changes, position recalculations, timestamp updates, etc.

### Human editable

Open the file in vim, VS Code, or any text editor. Add a line. Save. The mindmap updates.

### Simpler extension

The extension becomes a markdown parser + React Flow renderer. No graph serializer, no AI tools, no echo detection for tool-based edits.

## What We Lose

### Manual position overrides

Currently nodes store `{x, y}` positions. With markdown, positions are always computed by the layout algorithm. If someone drags a node, that position is lost on the next layout pass.

**Mitigation:** We already auto-layout on load. Manual positions were fragile anyway (AI edits reset them, adding a node recomputes the tree). If needed, we could store overrides in frontmatter:

```yaml
---
positions:
  "Research Fronts": {x: 400, y: -100}
---
```

But this is probably not worth the complexity.

### Rich node IDs for AI tools

The current format gives each node a stable ID that AI tools can reference. With markdown, nodes are identified by their text content and position in the tree.

**Mitigation:** Node text + parent path is a sufficient identifier for any operation. And since the AI just edits the markdown directly, it doesn't need IDs at all.

## Implementation Plan

1. Write a markdown parser that produces our `MindmapDocument` model (tree of nodes)
2. Write a serializer that converts back to markdown
3. Update `MindmapEditor` to use the new parser/serializer via `useEditorLifecycle`
4. Delete `aiTools.ts` and remove AI tool registrations from manifest
5. Update `newFileMenu` default content to be a markdown template
6. Migrate existing `.mindmap` files (detect JSON vs markdown on load, convert)
7. Update tests

## Open Questions

- Should we support `###` (heading 3) for depth 2, or jump straight from `##` to `-` lists? Using 3 heading levels keeps the top of the tree visually prominent.
- Should the file extension change? `.mindmap` still works since it's our custom extension. Or we could use `.mindmap.md` for better editor association, but that might confuse Nimbalyst's file pattern matching.
- Do we need a migration path or is it OK to just start fresh? The current JSON format has only been used in development.
