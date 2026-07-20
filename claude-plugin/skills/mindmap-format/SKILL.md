---
name: mindmap-format
description: How to create, read, and edit .mindmap files. Use this skill when the user asks to create a mindmap, brainstorm visually, map out ideas, or when working with existing .mindmap files.
---
# Mindmap File Format

`.mindmap` files are standard markdown that Nimbalyst renders as an interactive mindmap. There are two ways to work with them:

- **Writing a file directly** (Write/Edit) -- best for creating a new mindmap from scratch, or bulk-rewriting one that is not currently open. Use the markdown syntax documented below.
- **The `mindmap.*` AI tools** -- best for editing a mindmap that is **open in the editor**. They make surgical, node-level, undoable changes and preserve editor-managed state (pinned `x`/`y` canvas positions, node IDs) that a full-file rewrite would clobber. See "Editing an open mindmap" below.

When a mindmap is already open and you are changing part of it, prefer the tools over rewriting the file.

## Editing an open mindmap (the `mindmap.*` tools)

These tools are `editor`-scoped -- they only work when the target `.mindmap` file is the open/active editor. All node references are by node **ID**, so read the current structure first.

| Tool | Use it to |
| --- | --- |
| `mindmap.get_document` | Read the whole map (title + all nodes with IDs, hierarchy, colors, statuses, tags, notes). Start here to learn node IDs before editing. |
| `mindmap.get_context` | Read one branch: a node, its ancestor path, and a bounded subtree (`depth`, default 3). Prefer over `get_document` when working on a single branch of a large map. |
| `mindmap.add_node` | Add one child node under `parentId` (with optional color/status/tags/note/link/index). Returns the new node ID. |
| `mindmap.update_node` | Change fields on one node. Only provided fields change; `tags` and `note` **replace** existing values. |
| `mindmap.move_node` | Reparent a node under `newParentId` (optional sibling `index`). Cannot move the root. |
| `mindmap.delete_node` | Delete a node and all its descendants. Cannot delete the root. |
| `mindmap.apply_operations` | Apply up to 200 add/update/delete/move ops **atomically as one undoable change**. Use for branch expansion or reorganizing the map so partial results are never left behind. |

Guidance:
- **Read before you write.** Call `get_document` (or `get_context` for one branch) to get node IDs; every mutating tool needs them.
- **Batch multi-node changes** with `mindmap.apply_operations` rather than many single calls -- it is atomic and produces a single undo step. In an `add` op you can set an `alias`, then reference that alias as a `parentId`/`nodeId` in later ops within the same batch to build a subtree in one shot.
- Field values match the markdown metadata: `color` = default/red/orange/yellow/green/blue/purple/pink; `status` = none/idea/question/todo/in-progress/done.

## Syntax

### Tree structure

| Syntax | Mindmap level |
| --- | --- |
| `# Heading` | Root node (exactly one per file) |
| `## Heading` | Depth 1 branches |
| `### Heading` | Depth 2 branches |
| `- List item` | Deeper nodes (indentation = depth) |
| `- Nested item` | 2 spaces per indent level |

Headings define the top 3 levels. Below that, indented list items handle arbitrary nesting.

### Notes

Blockquotes immediately after a node become that node's note:

```markdown
## Branch Name
> This note is attached to "Branch Name".
> It can span multiple lines.
```

### Metadata

Inline `{key: value}` at the end of a node line:

```markdown
- Task name {color: green, status: todo, tags: frontend, urgent}
```

Supported keys:
- `color`: default, red, orange, yellow, green, blue, purple, pink
- `status`: none, idea, question, todo, in-progress, done
- `tags`: comma-separated list
- `link`: one related workspace document, URL, or tracker item; tracker items use a canonical link such as `nimbalyst://NIM-123`
- `pinned`: `true` when a manual canvas position should survive hybrid layout
- `x`, `y`: pinned canvas coordinates (written automatically by the editor)

### Frontmatter

YAML frontmatter stores the document title:

```yaml
---
title: My Mindmap
---
```

## Complete example

```markdown
---
title: Project Plan
layout: balanced
---

# Project Plan
> High-level roadmap for Q2.

## Research {color: blue}
- User interviews {status: done}
- Competitive analysis {status: in-progress}
  - Feature comparison
  - Pricing analysis

## Design {color: purple}

### Wireframes
- Homepage {status: done}
- Dashboard {tags: priority}

### Prototypes
- Interactive prototype {status: todo}

## Engineering {color: green, link: nimbalyst://NIM-123}
- API design
  > RESTful endpoints for the core product.
  - Authentication
  - Data models
- Frontend
  - Component library
  - State management
```

## Rules

1. Exactly one `#` heading (the root node)
2. `##` and `###` for the top levels, then `-` lists for deeper nesting
3. 2 spaces per indent level for list items
4. Metadata `{...}` goes at the end of the node line, not on a separate line
5. Notes `> ...` go on the line(s) immediately after the node they belong to
6. Blank lines between sections improve readability but are optional
7. The file extension is `.mindmap` (not `.md`)
8. Frontmatter `layout` may be `balanced` or `right`
