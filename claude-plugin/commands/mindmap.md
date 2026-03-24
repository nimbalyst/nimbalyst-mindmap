---
description: Create a new .mindmap file from a topic or description
---

# /mindmap

Create a `.mindmap` file based on the user's request. The `.mindmap` format is markdown that Nimbalyst renders as an interactive mindmap.

## Instructions

1. Determine a filename from the topic (e.g., "project-plan.mindmap", "ai-research.mindmap")
2. Write the file using the `.mindmap` markdown format (see the mindmap-format skill for syntax details)
3. Structure the content as a tree: one `#` root, `##` for main branches, `###` for sub-branches, then `-` lists for deeper nodes
4. Use `> blockquotes` for notes on important nodes
5. Use `{color: blue}`, `{status: todo}`, `{tags: x, y}` metadata where it adds value
6. Aim for 3-4 main branches with meaningful depth -- not just a flat list

## Format quick reference

```markdown
---
title: Topic Name
---

# Topic Name
> Optional root note.

## Branch One {color: blue}
- Leaf node
  - Deeper node
- Another leaf {status: todo}

## Branch Two {color: green}

### Sub-branch
- Item with note
  > This is a note on the item.
- Another item {tags: important}
```

The user said: $ARGUMENTS
