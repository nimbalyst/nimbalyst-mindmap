---
planStatus:
  planId: plan-20260314-nimbalyst-mindmap-extension
  title: Nimbalyst Mindmap Extension Research
  status: in-progress
  planType: research
  priority: medium
  owner: ghinkle
  stakeholders: []
  tags:
    - extension
    - mindmap
    - research
    - ux
  created: "2026-03-14"
  updated: "2026-03-14T00:00:00.000Z"
  progress: 80
---
# Objective

Define a high-quality feature set and technical direction for a visually editable mindmap extension for Nimbalyst, with emphasis on interactive editing, keyboard-driven workflows, multiple layouts, and agent collaboration.

# Assumptions

- The extension should behave like a first-class visual editor inside Nimbalyst rather than a static export/import utility.
- The user wants both direct manipulation by humans and structured interaction by the AI agent.
- Extension APIs are available for custom editors, file storage, commands, and AI tool integration via the `@nimbalyst/extension-sdk`.

# Research Findings

## 1. Competitive Landscape

### Tier 1: Dedicated Mind Mapping Tools

**XMind**
- Native desktop apps (macOS, Windows, Linux, iOS, Android) with full offline support
- Strongest visual polish -- maps look presentation-ready out of the box
- Supports multiple structure types: mind maps, fishbone diagrams, timelines, org charts, tree tables, matrix diagrams
- AI-assisted brainstorming for idea generation and node expansion (added in recent versions)
- File format: `.xmind` is a ZIP containing `content.json` (Zen/2020+) or `content.xml` (XMind 8)
- Weakness: performance degrades with large maps; collaboration features are newer and less mature than competitors
- Pricing: Free tier available; Pro ~$60/year

**MindMeister**
- Fully browser-based, no installation needed
- Best-in-class real-time collaboration (multiple cursors, comments, guest access)
- Clean interface with automatic node alignment that keeps maps looking professional
- Extensive template library
- Weakness: export to PDF/image and media attachments locked behind paid plans; less polished for solo use than MindNode
- Pricing: Free (3 maps), Personal $6/mo, Pro $10/mo, Business $15/mo

**MindNode**
- Apple-exclusive (Mac, iPad, iPhone) with iCloud sync
- Widely considered the best native Apple experience -- gorgeous UI, low friction
- Quick Entry from menu bar, Apple Pencil support, integration with Apple Reminders, Things, OmniFocus
- Visual Tags and stickers for node categorization
- Outliner view as alternative to visual map
- Weakness: Apple-only; limited collaboration; no web version
- Pricing: $2.99/month or included in Setapp

**MindMup**
- Browser-based with strong keyboard-driven workflow
- Exceptionally deep keyboard shortcut system (see Section 2)
- Level-based selection (press 1-9 to select all nodes at that depth)
- Storyboard mode for linear narratives from map content
- Argument mapping mode for debate/reasoning structures
- Free for maps up to 100KB; Google Drive integration
- Weakness: dated visual design; less polished than modern competitors

**Coggle**
- Simplest interface -- nearly no toolbar, direct inline editing
- Free unlimited public diagrams
- Interface has remained almost unchanged since 2013 launch -- stability over feature churn
- Weakness: limited features for power users; no offline support

**FreeMind**
- Open source Java desktop app; the original popular mind mapping tool
- `.mm` XML format became a de facto interchange standard
- Weakness: very dated UI; no longer actively developed; Java dependency

### Tier 2: Multi-Purpose Tools with Mind Map Features

**Miro**
- Collaborative whiteboard that includes mind maps as one object type among many
- Auto-layout keeps maps aligned as you add/move branches
- Mind maps can coexist with sticky notes, flowcharts, wireframes on the same canvas
- Ctrl/Cmd+drag to move a node without reparenting
- Weakness: mind map feature is secondary to whiteboard; less depth than dedicated tools
- Pricing: Free (3 boards), Starter $8/mo, Business $16/mo

**Whimsical**
- Clean design tool targeting product/UX teams
- Mind maps alongside flowcharts, wireframes, docs
- Tab = child, Enter = sibling, M = new map, paste a list to auto-create structure
- AI text-to-flowchart and AI-generated mind maps
- Weakness: less flexible than dedicated mind map tools
- Pricing: Free (limited), Pro $10/mo/user

**Ayoa (iMindMap successor)**
- Organic, hand-drawn branch style -- unique aesthetic
- Strong multi-select: hold Ctrl/Cmd to click-select, then bulk-change style/color/formatting
- Combines mind maps with kanban boards and task management
- Pricing: Free tier, Mind Map $10/mo, Ultimate $13/mo (adds AI and Gantt)

### Tier 3: AI-Native Mind Map Tools

**Mapify**
- AI-first: generates mind maps from YouTube videos, PDFs, URLs, podcasts, meeting recordings
- "Type-to-map" -- type an idea and the AI builds the structure instantly
- Chat interface to ask questions about or refine the generated map
- Powered by GPT, Gemini, or other LLMs (user-selectable)

**MyMap.AI**
- AI visual canvas: conversations become mind maps, flowcharts, diagrams
- Generates entire structure from a single prompt, then allows conversational refinement
- Can restructure the whole map via follow-up messages
- Infinite canvas with connected visual elements

**Taskade**
- AI generates mind maps that double as project outlines
- Each node can become a task with assignments, deadlines, status tracking
- Bridges brainstorming and project management

**MindView 9**
- Strongest project management integration: Gantt charts, task dependencies, unified calendar
- Creates presentations directly from mind maps
- Rated "best overall for usefulness and value" in several 2025 reviews

### Key Competitive Insights

| Capability | Leaders |
| --- | --- |
| Keyboard-driven speed | MindMup, MindNode, Whimsical |
| Real-time collaboration | MindMeister, Miro, Ayoa |
| Visual polish | XMind, MindNode |
| AI generation | Mapify, MyMap.AI, Taskade |
| Simplicity | Coggle, Whimsical |
| Offline/native | XMind, MindNode, FreeMind |
| Extensibility/open format | FreeMind, jsMind (open source) |

---

## 2. Core UX Patterns

### 2.1 Node Creation Workflows

There is a near-universal convention across tools:

| Action | Common Shortcut | Tools |
| --- | --- | --- |
| Add child node | **Tab** | MindMup, Whimsical, MindMeister, Astah, Mind42 |
| Add sibling node | **Enter** | MindMup, Whimsical, MindMeister, Astah, Mind42 |
| Insert parent | **Shift+Tab** | MindMup |
| Add disconnected/floating node | **Ctrl+D** | MindMup |
| Delete node | **Delete** or **Backspace** | Universal |

Additional creation patterns:
- **Drag-from-handle**: React Flow tutorial pattern -- drag from a node's connection handle onto empty canvas to create a child. Used in Miro, some whiteboard tools.
- **Paste-to-create**: Whimsical converts pasted text lists into node hierarchies automatically (indentation = depth).
- **Double-click canvas**: Creates a new floating/root node (common in whiteboard-style tools).
- **AI generation**: Type a prompt and the tool creates multiple nodes/branches (Mapify, MyMap.AI, Taskade).

### 2.2 Navigation and Selection

**Arrow key navigation** is universal. The exact behavior varies by layout orientation:
- In horizontal layouts: Left/Right move between parent-child; Up/Down move between siblings
- In vertical layouts: Up/Down move between parent-child; Left/Right move between siblings

**Advanced selection patterns (from MindMup, the most keyboard-driven tool):**
- **Number keys 0-9**: Select all nodes at that depth level (1 = first level, 2 = second, etc.)
- **`{`**: Select current node and its entire subtree
- **`[`**: Select subtree only (excluding current node)
- **`=`**: Select all siblings of current node
- **Shift+click**: Add to multi-selection
- **`.`**: Clear multi-selection
- **Rubberband/lasso**: Click-drag on canvas to select all enclosed nodes (Ayoa, Collaboard)
- **Ctrl/Cmd+click**: Toggle individual node in multi-selection (SimpleMindMap, Ayoa)
- **Ctrl+A**: Select all nodes

### 2.3 Drag Behaviors

Three distinct drag operations exist, and tools differentiate them in various ways:

**1. Reparent (change parent)**
- Default drag behavior in most tools: drag a node onto another node, and it becomes a child of the drop target
- MindNode: "Click and hold a node then drag it on top of another node -- the node and all of its child nodes will attach to the new parent node"
- Collaboard: "Drag and drop any node onto the new parent; the whole mind map tree associated to the child is moved along"

**2. Reorder (change position among siblings)**
- MindNode: "Select a line and long-press to drag, move up or down to change order, or left and right to change hierarchy"
- Keyboard alternative: Cmd+Arrow or Ctrl+Up/Down to reorder without dragging

**3. Freeform move (change position without changing hierarchy)**
- Miro: Hold Ctrl/Cmd while dragging to move without reparenting
- Tools with freeform mode (SimpleMind) allow positioning nodes anywhere on the canvas

### 2.4 Comprehensive Keyboard Shortcuts (Synthesized)

**Node Creation & Structure:**
| Shortcut | Action |
| --- | --- |
| Tab | Create child node |
| Enter | Create sibling node |
| Shift+Enter | Add sibling above / line break in text |
| Shift+Tab | Insert parent node |
| Delete/Backspace | Remove node |
| Ctrl+D | Insert disconnected node |

**Navigation:**
| Shortcut | Action |
| --- | --- |
| Arrow keys | Navigate between nodes |
| Shift+Arrows | Multi-select adjacent nodes |
| Home/Esc | Return to root/center view |
| Ctrl+F | Find node by text |

**Editing:**
| Shortcut | Action |
| --- | --- |
| F2 or double-click | Edit node text |
| Space | Start editing (some tools) |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+C/X/V | Copy / Cut / Paste |

**View:**
| Shortcut | Action |
| --- | --- |
| Space or / | Toggle collapse/expand |
| Alt+F | Collapse one level below |
| Shift+F | Expand one level below |
| Ctrl+Plus/Minus | Zoom in/out |
| Ctrl+0 | Fit to view |

### 2.5 Collapse/Expand Patterns

- **Toggle indicator**: Small +/- icon or arrow appears on nodes with children (MindMeister, MindNode)
- **Spacebar toggle**: Press Space to collapse/expand the selected node's children
- **Batch operations**: MindMeister supports collapsing/expanding all selected topics at once
- **Progressive disclosure**: Alt+F to collapse one level below, Shift+F to expand one level below (MindMup)
- **Visual cue**: Collapsed nodes show a count badge or dot indicating hidden children

### 2.6 Multi-Select and Bulk Operations

- **Ayoa**: Hold Ctrl/Cmd + click to select multiple branches, then use multi-select menu to change branch style, box style, color, and text formatting for all selected
- **MindMup**: Press number keys to select by level (e.g., press `3` to select all third-level nodes), then apply operations
- **Rubberband selection**: Click and drag on empty canvas to lasso-select nodes (Ayoa, Collaboard)
- Common bulk operations: change color/style, delete, collapse, move, copy, export subset

---

## 3. Layout Approaches

### 3.1 Layout Algorithm Types

**Standard/Balanced Mind Map (radial/organic)**
- Root node centered, branches extend in all directions
- Balances children across left and right sides (or all quadrants)
- Most "mind-map-like" appearance
- Used by: XMind, MindMeister, MindNode (default), Coggle

**Right-Logical / Left-Logical**
- All branches extend in one direction from the root
- Reads like an outline or hierarchy
- Used by: XMind (org chart mode), Whimsical

**Downward/Upward Organizational**
- Classic org chart layout -- tree flows top-to-bottom or bottom-to-top
- Used by: XMind, Miro

**Fishbone (Ishikawa)**
- Branches extend at angles from a central spine
- Used for cause-and-effect analysis
- Used by: XMind, SimpleMindMap

**Timeline**
- Nodes arranged along a horizontal or vertical time axis
- Used by: XMind, SimpleMindMap

**Indented/Outline**
- Nodes stacked vertically with indentation showing depth
- Bridges mind map and outliner UX
- Used by: SimpleMindMap, MindNode (outline view)

### 3.2 Layout Algorithms in Practice

**Reingold-Tilford Algorithm (and variants)**
- The foundational tree layout algorithm (1981)
- Produces compact, aesthetically pleasing tree arrangements
- Walker (1990) extended it to m-ary trees; Buchheim et al. (2002) achieved O(n) time complexity
- Used by D3.js `d3.tree()` layout
- Most mind map tools use some variant of this

**mindmap-layouts npm library** (github.com/leungwensen/mindmap-layouts)
- Open source library providing 5 layout algorithms: Standard, Right Logical, Left Logical, Downward Org, Upward Org
- API: `new MindmapLayouts.Standard(root, options)` -> `layout.doLayout()` -> returns nodes with `x, y` coordinates
- Input: tree-structured data with `name` and `children` properties

**D3.js flextree** (github.com/Klortho/d3-flextree)
- Extension of D3's tree layout supporting variable node sizes
- Critical for mind maps where nodes have different text lengths

**Force-directed layouts**
- Physics-based positioning using D3-force or similar engines
- Nodes repel each other, edges act as springs
- Produces organic, spreading layouts but non-deterministic
- Better for exploration than structured reading

### 3.3 The Layout vs. Freeform Tension

This is one of the most debated UX challenges in mind mapping:

**Auto-layout approach** (Miro, MindMeister):
- Nodes automatically reposition when siblings are added/removed
- Keeps maps tidy without user effort
- User complaint: "very limiting to creativity" when "everything kept moving"

**Freeform approach** (SimpleMind):
- Users position nodes manually anywhere on the canvas
- Full creative control over spatial arrangement
- Cost: maps can become messy; no automatic cleanup

**Hybrid solutions observed:**
- **Layout with manual overrides**: Auto-layout by default, but allow users to pin/fix specific node positions
- **Layout modes**: Toggle between auto and freeform (SimpleMind offers both)
- **Snap-to-grid with auto-layout assist**: Auto-arrange on demand rather than continuously
- **"Tidy up" command**: Manual trigger to re-apply layout without forcing continuous auto-layout

### Recommendation for Nimbalyst

The design plan specifies freeform placement. To make this work well, the extension needs:
1. A smart auto-placement algorithm for newly created nodes (so they don't stack at 0,0)
2. An on-demand "auto-layout" command to tidy up messy maps
3. Position assignment logic for AI-created batches of nodes

Without these, pure freeform quickly becomes unusable, especially after AI operations that create many nodes at once.

---

## 4. AI Integration in Visual Thinking Tools

### 4.1 AI-Generated Content

**Prompt-to-map generation:**
- Mapify: Type a sentence/idea and AI generates an entire mind map structure instantly
- MyMap.AI: Single prompt creates full hierarchical structure; follow-up messages refine it
- Taskade: AI generates maps that double as project outlines with assignable tasks
- XMind: AI-assisted brainstorming to expand nodes with generated sub-topics

**Document-to-map extraction:**
- Mapify: Converts YouTube videos, PDFs, URLs, podcasts into mind maps
- NLP processing detects hierarchical relationships in raw text

### 4.2 Branch Expansion

- Select a node and ask AI to generate child topics (XMind, MindMeister)
- AI suggests related concepts, counter-arguments, or subtopics based on semantic analysis of existing nodes
- Some tools allow specifying the number and depth of generated branches

### 4.3 Reorganization/Restructuring

- MyMap.AI: "Ask AI to restructure the whole map with a follow-up message"
- Potential operations: regroup by theme, flatten hierarchy, create summary branches, identify gaps
- This is still an emerging capability -- most tools only generate, few can intelligently reorganize

### 4.4 Summarization

- Mapify specializes in summarization: feed it a long document and it extracts key concepts into a map
- Branch-level summarization: condense a detailed subtree into a single summary node

### 4.5 Implications for Nimbalyst

The AI agent integration in Nimbalyst creates a unique opportunity:
- The agent can both read and write the mind map via AI tools (MCP tools)
- Unlike other tools where AI is a black-box button, the Nimbalyst agent can explain its reasoning
- Potential operations: "expand this branch with implementation details," "reorganize by priority," "summarize this subtree," "generate a mind map from this file/directory structure"
- The agent can also read the mind map as context for other tasks (e.g., "implement the architecture shown in my mind map")

---

## 5. Technical Rendering Approaches

### 5.1 Rendering Technology Comparison

| Technology | Strengths | Weaknesses | Best For |
| --- | --- | --- | --- |
| **SVG** | Crisp at any zoom; easy CSS styling; native DOM events; accessibility | Performance degrades with hundreds of elements; large DOM | Maps under ~500 nodes |
| **Canvas (2D)** | Fast rendering of many elements; single DOM element | No native element events; blurry text at extreme zoom; harder to style | Maps with 500-5000 nodes |
| **WebGL** | Renders tens of thousands of elements at 60fps | High implementation complexity; no native text rendering | Massive graphs (5000+ nodes) |
| **DOM (HTML)** | Full CSS styling; native events; accessibility; easy text editing | Slowest for many elements; layout reflow costs | Small maps; rich text editing per node |

### 5.2 Hybrid Approaches (Recommended)

The most successful web mind map tools use **hybrid rendering**:

- **jsMind**: DOM elements for node content (allowing rich HTML), Canvas or SVG for connection lines between nodes
- **SimpleMindMap**: SVG for graphics rendering with a "performance mode" that only renders nodes within the visible viewport
- **React Flow**: DOM nodes with SVG edges. Custom node components are React elements, connection lines are SVG paths. Good for maps where nodes need rich interactivity.

### 5.3 Libraries and Frameworks

**React Flow** (reactflow.dev)
- React-based node graph library
- Custom node components (full React/DOM), SVG edges
- Built-in pan/zoom, drag-and-drop, parent-child relationships
- Tutorial specifically for mind map implementation
- State management via Zustand store
- Node creation via `onConnectStart`/`onConnectEnd` handlers (drag from handle to empty space)
- `screenToFlowPosition()` for coordinate conversion
- Best fit for Nimbalyst given its React-based extension model

**D3.js**
- `d3.tree()` and `d3.cluster()` for tree layouts
- `d3-force` for force-directed layouts
- `d3-flextree` for variable-size node trees
- SVG rendering by default; can output to Canvas
- Fine-grained control but verbose API

**jsMind** (github.com/hizzgdev/jsmind)
- Purpose-built mind map library, BSD licensed
- HTML nodes + Canvas/SVG lines (configurable)
- Built-in: expand/collapse, drag-and-drop, editing, themes

**SimpleMindMap** (wanglin2.github.io/mind-map-docs)
- Full-featured mind map library, MIT licensed
- SVG rendering with performance mode (viewport culling)
- 6+ layout types: mind map, logical structure, org chart, directory, timeline, fishbone
- Rich content: text, images, icons, hyperlinks, notes, labels, summaries
- Export/Import: JSON, PNG, SVG, PDF, Markdown, XMind, TXT
- Plugin architecture for extensibility

### 5.4 Performance Considerations

- **Viewport culling**: Only render nodes visible in the current viewport
- **Level-of-detail**: Reduce detail for distant/zoomed-out nodes (collapse to dots/labels only)
- **Debounced layout**: Don't recalculate layout on every keystroke during editing
- **Incremental layout**: When adding a single node, only recalculate affected subtree
- **Virtual scrolling for outline views**: If offering an outline/list view, virtualize long lists

---

## 6. File Format Patterns

### 6.1 Common Formats

**FreeMind XML (****`.mm`****)**
- The most widely supported interchange format
- XML tree structure where each `<node>` element can contain child `<node>` elements
- Supported for import by: XMind, MindMeister, SimpleMindMap, Freeplane, most tools

**OPML (Outline Processor Markup Language)**
- XML-based open standard for outlining
- Tree structure maps naturally to mind map hierarchy
- Widely supported for import/export

**XMind format (****`.xmind`****)**
- ZIP archive containing `content.json` (XMind Zen/2020+) or `content.xml` (XMind 8)
- JSON content includes full node tree with styling, positions, relationships

**JSON (custom per tool)**
- Most web-based tools use proprietary JSON formats internally
- SimpleMindMap and jsMind both use JSON as their native format
- Typical structure: tree of node objects with `id`, `text`, `children[]`, `style`, `position`

**Markdown**
- Some tools support import/export as indented Markdown lists
- Natural mapping: indentation depth = node depth
- Attractive for a code editor context like Nimbalyst

**Mermaid mindmap syntax**
- Text-based DSL for mind maps
- Rendered by Mermaid.js
- Could serve as a human-readable secondary format

### 6.2 Format Decision for Nimbalyst

The design plan specifies **normalized graph JSON** with a flat node map keyed by ID. This is the right choice because:
- Parent-child edits become predictable O(1) lookups
- AI tools can target nodes by ID without traversing a tree
- Reparenting is a simple `parentId` + `childIds` update, not a tree restructure
- Canvas position is explicit per node

Note: this differs from SimpleMindMap/jsMind's nested tree JSON. The flat normalized format is better for the stated requirements (AI editing, drag-reparenting) at the cost of slightly more complex serialization.

---

## Sources

- [Zapier: Best Mind Mapping Software 2025](https://zapier.com/blog/best-mind-mapping-software/)
- [TechRadar: Best Mind Map Software 2025](https://www.techradar.com/best/best-mind-map-software)
- [The Digital Project Manager: Best AI Mind Mapping Tools 2026](https://thedigitalprojectmanager.com/tools/best-ai-mind-mapping-tools/)
- [MindMup Keyboard Shortcuts](https://www.mindmup.com/tutorials/keyboard.html)
- [Whimsical: Getting Started with Mind Maps](https://help.whimsical.com/article/637-getting-started-with-mind-maps)
- [MindMeister Keyboard Shortcuts](https://support.mindmeister.com/hc/en-us/articles/360017398960-Use-Keyboard-Shortcuts)
- [MindNode User Guide](https://www.mindnode.com/user-guide/organize/reconnect-and-navigate)
- [Miro Mind Map Help](https://help.miro.com/hc/en-us/articles/360017730753-Mind-map)
- [Collaboard Mind Map Help](https://help.collaboard.app/mind-map)
- [Ayoa Multi-Select](https://support.ayoa.com/multi-select-on-mind-maps)
- [mindmap-layouts GitHub](https://github.com/leungwensen/mindmap-layouts)
- [SimpleMindMap Documentation](https://wanglin2.github.io/mind-map-docs/en/start/introduction.html)
- [React Flow Mind Map Tutorial](https://reactflow.dev/learn/tutorials/mind-map-app-with-react-flow)
- [jsMind GitHub](https://github.com/hizzgdev/jsmind)
- [yWorks: SVG, Canvas, WebGL Comparison](https://www.yworks.com/blog/svg-canvas-webgl)
- [FreeMind File Format](https://freemind.sourceforge.io/wiki/index.php/File_format)
- [SimpleMind: Freeform vs Auto Layout](https://simplemind.eu/faq/layout/)
- [D3-flextree GitHub](https://github.com/Klortho/d3-flextree)
- [Mapify](https://mapify.so/)
- [MyMap.AI](https://www.mymap.ai/)
- [Taskade AI Mind Map](https://www.taskade.com/convert/text/text-to-mind-map)
