---
name: mindmap-format
description: How to create, read, and edit .mindmap files. Use this skill when the user asks to create a mindmap, brainstorm visually, map out ideas, or when working with existing .mindmap files.
---

# Mindmap File Format

`.mindmap` files are standard markdown that Nimbalyst renders as an interactive mindmap. You can create and edit them directly -- no special tools needed.

## Syntax

### Tree structure

| Syntax | Mindmap level |
|--------|--------------|
| `# Heading` | Root node (exactly one per file) |
| `## Heading` | Depth 1 branches |
| `### Heading` | Depth 2 branches |
| `- List item` | Deeper nodes (indentation = depth) |
| `  - Nested item` | 2 spaces per indent level |

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
- `link`: related URL, workspace path, or artifact reference
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

## Engineering {color: green}
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
