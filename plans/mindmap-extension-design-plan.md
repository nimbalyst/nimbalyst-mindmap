---
planStatus:
  planId: plan-20260314-mindmap-extension-design
  title: Mindmap Extension Design Plan
  status: in-development
  planType: implementation
  priority: high
  owner: ghinkle
  stakeholders: []
  tags:
    - extension
    - mindmap
    - design
    - ai
    - ux
  created: "2026-03-14"
  updated: "2026-03-14T22:35:00.000Z"
  progress: 95
  startDate: "2026-03-14"
---
# Objective

Design a Nimbalyst-native mindmapping extension that is equally strong at:

1. Brainstorming
2. Outlining
3. AI-assisted editing

The editor should open as a blank freeform board, let users spatially shape ideas, preserve a parent-child graph for structure, and give AI permission to directly rewrite large parts of the map when asked.

# User decisions captured

These decisions now define the plan:

- V1 must support brainstorming, outlining, and AI editing together rather than choosing one as the lead workflow.
- The visual editor should be a freeform map, not a rigid auto-layout tree.
- Connections stay parent-child only in V1.
- Dragging can reparent branches.
- The file format source of truth should be graph JSON.
- File extension: `.mindmap`.
- Outline behavior should follow canvas order.
- New maps should start from a blank freeform board.
- AI large rewrites should apply immediately by default.
- Nodes should support text, metadata, and visual color in V1.
- AI should use Nimbalyst's native chat with registered extension tools (no custom panel).
- Node placement uses auto-layout by default, with manual repositioning allowed afterward.
- Node text editing: double-click for inline title edit on canvas, inspector for notes/tags/details.
- Connectors: curved Bezier lines between parent and child nodes.
- Rendering: React Flow as the canvas interaction layer.

# Product direction

## Core decision

Build **a freeform spatial mindmap editor backed by a structured graph model**.

That means:

- users can place nodes freely on the board
- the graph still has explicit parent-child structure
- each parent stores ordered children so the outline can be generated deterministically
- AI tools edit the same graph model instead of raw text blobs

This is not a whiteboard with arbitrary shapes and lines. It is a freeform **mindmap** editor with semantic structure.

## Node placement strategy

The canvas is freeform -- users can drag nodes anywhere. But programmatic node creation (keyboard, AI, paste) needs a deterministic placement strategy so nodes don't pile up at (0,0).

**Auto-layout as the placement engine:**

- When nodes are created (Tab, Enter, AI batch, paste), positions are computed by a layout algorithm (Reingold-Tilford variant or similar balanced tree layout).
- The layout only applies to **newly created nodes** and their immediate neighbors, not the entire map. Existing manually-positioned nodes are not disturbed.
- After placement, the user can drag nodes freely. Manual positions are "sticky" -- they override the layout suggestion.
- An on-demand **"Auto-layout" command** re-applies the layout algorithm to the entire map (or selected subtree), repositioning all nodes. This is the "tidy up" escape hatch.

**Placement rules by trigger:**

| Trigger | Placement behavior |
|---|---|
| Tab (new child) | Position near parent using layout algorithm |
| Enter (new sibling) | Position near siblings using layout algorithm |
| AI batch create | Layout algorithm positions all new nodes relative to their parents |
| AI replace_branch | Re-layout the affected subtree |
| AI replace_map | Full map auto-layout |
| Drag | User override; position becomes sticky |
| Auto-layout command | Re-layout entire map or selected subtree |

**Layout algorithm choice:**

Use a balanced mind map layout (standard Reingold-Tilford variant) as the default. The `mindmap-layouts` npm library provides this with a simple API. D3-flextree is an alternative for variable-size nodes. The layout engine should be pluggable so additional layouts (right-logical, org chart) can be added later.

## Guiding principle

Freeform layout controls presentation.

The graph controls meaning.

The outline reflects graph order, which is updated by canvas interactions when users reorder or reparent nodes.

# V1 editor model

## Main layout

Use three primary surfaces:

- Main canvas: freeform node board with parent-child connectors
- Inspector: selected node details and metadata controls
- Nimbalyst native AI chat: branch and whole-map AI operations via registered tools

The outline should be available as a docked panel or toggleable secondary view, but not replace the canvas as the primary surface.

## Startup behavior

When a user creates a new file:

- open a blank board
- create a single empty root placeholder or onboarding prompt
- let the user start by typing, pasting, or asking AI to seed the map

# Interaction design

## Node text editing

Two-tier editing model: fast inline edits on canvas, rich editing in the inspector.

**Inline editing (canvas):**
- Double-click a node (or press F2) to enter inline edit mode
- The node becomes an editable text field directly on the canvas
- Escape, Enter, or click-away commits the edit
- Tab while editing creates a child node and moves focus to it
- This covers the fast brainstorming workflow -- type, Tab, type, Tab

**Inspector editing:**
- Selecting a node shows its full details in the inspector panel
- Inspector provides editing for: title, note (multi-line), tags, status, color
- Notes support longer text that doesn't fit in a canvas node label
- Inspector edits go through the same mutation pipeline as canvas edits

## Connector rendering

Parent-child connections use **curved Bezier lines**.

- Smooth S-curve from parent edge to child edge
- Line exits the parent node from the edge closest to the child
- Line enters the child node at the edge closest to the parent
- Collapsed nodes show a small badge indicating hidden child count
- Connector color inherits from the parent node's branch color (or uses a neutral default)
- No arrowheads in V1 -- the direction is implied by the tree hierarchy

## Keyboard shortcuts (V1 core)

These are table-stakes for any mindmap tool and must ship in Phase 2 alongside the canvas:

**Node creation:**
| Shortcut | Action |
|---|---|
| Tab | Create child node (enter edit mode) |
| Enter | Create sibling node (enter edit mode) |
| Delete/Backspace | Delete selected node(s) |

**Navigation:**
| Shortcut | Action |
|---|---|
| Arrow keys | Navigate between nodes (parent/child and sibling directions) |
| Escape | Deselect / exit edit mode / return to root |

**Editing:**
| Shortcut | Action |
|---|---|
| F2 or double-click | Enter inline edit mode |
| Ctrl+Z / Ctrl+Shift+Z | Undo / Redo |
| Space | Toggle collapse/expand children |

**View:**
| Shortcut | Action |
|---|---|
| Ctrl+Plus/Minus | Zoom in/out |
| Ctrl+0 | Fit map to view |

Additional shortcuts (Ctrl+F search, level-select, lasso) are deferred to later phases.

## What to defer from V1

The canvas should support:

- free placement of nodes
- drag-to-reparent
- drag-to-reorder siblings
- branch collapse/expand
- marquee or lasso selection deferred until later
- pan and zoom from the start

Because users want freeform placement and reparenting, V1 should use a node-canvas interaction model rather than a static DOM tree layout.

## Outline behavior

The outline is not an independent document.

It is a synchronized view of the graph using each parent's child order. That order is affected by:

- explicit outline reorder actions
- drag operations on the canvas when sibling order changes
- AI restructure operations

This keeps the freeform board and outline in sync without inventing two different truths.

## AI behavior

AI actions are exposed through Nimbalyst's native AI chat via registered extension tools. No custom AI panel is needed.

The tools support:

- reading the full map structure (outline or JSON)
- creating nodes with nested children
- updating node properties (text, notes, tags, status, color)
- deleting nodes and subtrees
- replacing branches with new subtree structures
- full map rewrites when explicitly requested

All AI mutations go through the same graph model and trigger undo checkpoints.

# Information architecture

## File format

File extension: **`.mindmap`**. The manifest's `filePatterns` must be updated from `*.example` to `*.mindmap` before Phase 1 implementation begins.

Use graph JSON as the canonical persisted format.

Recommended schema:

```json
{
  "version": 1,
  "title": "Untitled map",
  "rootId": "node_root",
  "nodes": {
    "node_root": {
      "id": "node_root",
      "text": "Central idea",
      "note": "",
      "parentId": null,
      "childIds": [],
      "position": { "x": 0, "y": 0 },
      "tags": [],
      "status": "none",
      "color": "default"
    }
  },
  "metadata": {
    "createdAt": "",
    "updatedAt": "",
    "canvas": {
      "viewport": { "x": 0, "y": 0, "zoom": 1 }
    }
  }
}
```

## Why normalized graph JSON

- parent-child edits become predictable
- canvas position is explicit
- AI tools can target nodes by ID
- outline order is explicit through `childIds`
- large rewrites stay structured instead of becoming giant string replacements

## Outlining

Each node should support:

- `text`
- `note`
- `tags`
- `status`
- `color`
- `position`
- `parentId`
- `childIds`

Recommended status values:

- `none`
- `idea`
- `question`
- `todo`
- `in-progress`
- `done`

# Technical architecture

## Rendering strategy

Use **React Flow** (`@xyflow/react`) as the canvas interaction layer.

React Flow provides the interaction primitives the editor needs without building them from scratch:
- Viewport pan/zoom with `screenToFlowPosition()` coordinate conversion
- DOM-based node rendering (custom React components per node)
- SVG edge rendering (custom Bezier connectors)
- Built-in drag-and-drop with drop target detection
- Node selection (single and multi)
- Connection handling via `onConnectStart`/`onConnectEnd`
- Zustand-based internal state that integrates well with a custom state layer

**What React Flow handles:**
- Viewport math, pan, zoom
- Drag hit testing and node movement
- Edge (connector) rendering and updates
- Selection bounds and multi-select
- Minimap (optional)

**What remains custom:**
- Graph model (normalized node map with `parentId`/`childIds`)
- Mutation pipeline (reducer-based, shared across canvas/outline/inspector/AI)
- Layout algorithm integration (compute positions, feed to React Flow)
- Outline panel synchronization
- AI tools and side panel
- Inline text editing behavior
- Keyboard shortcut system

React Flow nodes are custom React components. The mindmap node component will handle:
- Displaying node text (truncated on canvas, full in inspector)
- Collapse/expand toggle
- Color/status indicators
- Inline edit mode (double-click or F2)

React Flow edges use a custom Bezier edge component for the curved connector style.

## State management

Use a reducer-based editor state with one mutation pipeline.

Recommended state areas:

- `document`
- `selection`
- `ui`
- `history`
- `aiSession`

All edits from these sources must go through the same mutation layer:

- direct canvas manipulation
- inspector edits
- outline edits
- AI edits

This is required for:

- save correctness
- undo/redo
- dirty state
- external file reloads

## Persistence split

Persist in file:

- node graph
- positions
- metadata
- child order

Persist in `host.storage`:

- selected node
- open panels
- collapsed branches if they are purely editor-local
- temporary AI draft state

# AI integration design

## AI authority model

The user explicitly wants immediate application of large rewrites by default.

That means the editor should:

- apply AI changes directly to the document model
- mark the file dirty immediately
- create an internal undo checkpoint before each AI operation
- surface a concise change summary in the AI panel

Even with immediate apply, undo must make the behavior safe enough to live with.

## Tool surface

Recommended V1 tools:

1. `read_map`
2. `create_nodes`
3. `update_nodes`
4. `move_nodes`
5. `delete_nodes`
6. `replace_map`
7. `replace_branch`
8. `export_outline`

## Tool principles

- Tools operate on stable node IDs
- Whole-map rewrite is explicit, not the default fallback for every action
- Branch rewrite is preferred when context is localized
- Tool results should include concise summaries for the persistent AI panel

# Feature breakdown

## Brainstorming

V1 brainstorming features:

- rapid node creation from keyboard
- paste-to-branch splitting
- drag-to-group via reparenting
- branch colors and tags for clustering
- AI expand-branch action from the side panel

## V1 node fields

V1 outlining features:

- synchronized outline panel
- keyboard indentation and reorder
- import pasted outline into selected branch or whole map
- outline export

The outline is important, but it should behave as a structural lens on the freeform board rather than the primary editing surface.

## AI editing

V1 AI operations:

- brainstorm under selected branch
- rewrite node labels for clarity
- summarize branch into tighter structure
- convert branch into plan / tasks / questions
- restructure map or subtree
- rewrite whole map when explicitly asked

# Phased implementation plan

## Phase 1: graph model and persistence

Goal:

- Replace the placeholder text editor with a normalized graph document model.

Work:

- Define schema and migrations
- Build parser and serializer
- Add mutation helpers
- Wire save/load with `EditorHost`
- Add undo checkpoints

Exit criteria:

- A graph file can round-trip safely through the editor model.

## Phase 2: freeform canvas shell

Goal:

- Deliver a navigable, keyboard-driven node canvas with selection, drag, and inline editing.

Work:

- Integrate React Flow as the canvas interaction layer
- Build custom mindmap node component (text display, color, collapse toggle)
- Build custom Bezier edge component for parent-child connectors
- Add pan and zoom
- Add node creation (Tab for child, Enter for sibling) with auto-layout placement
- Add inline text editing (double-click / F2)
- Add node deletion (Delete/Backspace)
- Add drag-to-reparent
- Add sibling reordering behavior
- Implement core keyboard shortcuts (arrows, Tab, Enter, Delete, Space, Escape, Ctrl+Z, F2)
- Integrate layout algorithm for node positioning

Exit criteria:

- Users can construct and spatially organize a usable mindmap entirely from the keyboard.
- New nodes are placed by the layout algorithm. Dragged nodes keep their manual position.

## Phase 3: inspector and metadata

Goal:

- Make node editing concrete and expressive.

Work:

- Add node title and note editing
- Add tags, status, and color controls
- Add branch actions
- Add empty-state onboarding for blank maps

Exit criteria:

- Selected-node editing feels complete without opening raw JSON.

## Phase 4: synchronized outline

Goal:

- Make the structure editable through a text-friendly view without breaking canvas semantics.

Work:

- Build outline panel from `childIds`
- Support reorder, indent, and outdent
- Sync changes back to graph state
- Preserve canvas positions as reasonably as possible during restructures

Exit criteria:

- Outline edits and canvas edits stay in sync under repeated branch moves.

## Phase 5: AI tools (no custom panel -- Nimbalyst provides chat)

Goal:

- Make AI editing a first-class workflow through Nimbalyst's native AI chat.

Work:

- Implement structured AI tools (read_map, create_nodes, update_nodes, delete_nodes, replace_branch, replace_map)
- Tools operate on stable node IDs with structured input/output
- Undo checkpoint before every AI mutation

Note: No custom AI side panel. Nimbalyst's built-in AI chat uses the extension's registered tools directly. The extension only needs to expose well-described MCP tools.

Exit criteria:

- AI can directly expand, rewrite, and restructure the map through Nimbalyst's chat in a way that feels native.

## Phase 6: polish

Goal:

- Tighten usability and visual quality.

Work:

- search and focus (Ctrl+F)
- advanced selection (level-select, lasso/marquee)
- additional layout modes (right-logical, org chart)
- branch templates
- onboarding examples
- export to Markdown, FreeMind XML, PNG/SVG image

# Risks and constraints

## Main risk

The hardest part is not drawing nodes. It is keeping these behaviors coherent at the same time:

- freeform placement
- parent-child structure
- outline sync
- drag reparenting
- AI whole-map rewrites

The design only works if one mutation system owns all of them.

## Important tradeoff

Canvas order driving outline order is powerful but ambiguous if nodes can be placed anywhere.

Recommended interpretation:

- child order is explicit in data
- drag operations update child order when the user reparents or rearranges siblings
- pure position tweaks should not silently reorder outline structure unless the gesture clearly implies reordering

This distinction needs to be designed deliberately in Phase 2.

## Canvas behavior

Do not spend time on these yet:

- arbitrary non-hierarchical edges
- custom user-defined metadata schemas
- comments
- multiplayer collaboration
- embedded media
- presentation mode
- lasso multi-select
- fully customizable themes

# Immediate next step

Start with **Phase 1** and produce the graph model before any serious UI work.

After that, build the canvas shell with drag-to-reparent and only then add outline sync and the persistent AI panel.

That sequence matches the actual product requirements instead of optimizing for the earlier placeholder tree-editor concept.
