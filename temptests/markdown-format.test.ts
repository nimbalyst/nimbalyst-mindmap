import { describe, it, expect } from 'vitest';
import { parseDocument, serializeDocument, parseInlineMetadata } from '../src/model';

describe('parseInlineMetadata', () => {
  it('returns text unchanged when no metadata', () => {
    const result = parseInlineMetadata('Just some text');
    expect(result.text).toBe('Just some text');
    expect(result.color).toBe('default');
    expect(result.status).toBe('none');
    expect(result.tags).toEqual([]);
  });

  it('parses color, status, and tags', () => {
    const result = parseInlineMetadata('Task name {color: blue, status: todo, tags: frontend, urgent}');
    expect(result.text).toBe('Task name');
    expect(result.color).toBe('blue');
    expect(result.status).toBe('todo');
    expect(result.tags).toEqual(['frontend', 'urgent']);
  });

  it('ignores invalid values', () => {
    const result = parseInlineMetadata('Node {color: neon, status: bogus}');
    expect(result.text).toBe('Node');
    expect(result.color).toBe('default');
    expect(result.status).toBe('none');
  });
});

describe('parseDocument', () => {
  it('returns empty document for blank input', () => {
    const doc = parseDocument('');
    expect(doc.nodes[doc.rootId].text).toBe('Central idea');
  });

  it('parses a simple mindmap with headings', () => {
    const md = `---
title: Test Map
---

# Root Node

## Branch A

## Branch B
`;
    const doc = parseDocument(md);
    expect(doc.title).toBe('Test Map');
    expect(doc.nodes[doc.rootId].text).toBe('Root Node');
    expect(doc.nodes[doc.rootId].childIds).toHaveLength(2);

    const branchA = doc.nodes[doc.nodes[doc.rootId].childIds[0]];
    expect(branchA.text).toBe('Branch A');
    expect(branchA.parentId).toBe(doc.rootId);

    const branchB = doc.nodes[doc.nodes[doc.rootId].childIds[1]];
    expect(branchB.text).toBe('Branch B');
  });

  it('parses ### headings as depth 2', () => {
    const md = `# Root
## Branch
### Sub-branch
`;
    const doc = parseDocument(md);
    const root = doc.nodes[doc.rootId];
    const branch = doc.nodes[root.childIds[0]];
    expect(branch.text).toBe('Branch');
    const sub = doc.nodes[branch.childIds[0]];
    expect(sub.text).toBe('Sub-branch');
    expect(sub.parentId).toBe(branch.id);
  });

  it('parses list items under headings', () => {
    const md = `# Root
## Branch
### Sub-branch
- Leaf 1
- Leaf 2
  - Nested leaf
`;
    const doc = parseDocument(md);
    const root = doc.nodes[doc.rootId];
    const branch = doc.nodes[root.childIds[0]];
    const sub = doc.nodes[branch.childIds[0]];
    expect(sub.childIds).toHaveLength(2);

    const leaf1 = doc.nodes[sub.childIds[0]];
    expect(leaf1.text).toBe('Leaf 1');

    const leaf2 = doc.nodes[sub.childIds[1]];
    expect(leaf2.text).toBe('Leaf 2');
    expect(leaf2.childIds).toHaveLength(1);

    const nested = doc.nodes[leaf2.childIds[0]];
    expect(nested.text).toBe('Nested leaf');
  });

  it('parses blockquote notes', () => {
    const md = `# Root
> This is a root note.
> Second line of note.

## Branch
> Branch note
`;
    const doc = parseDocument(md);
    expect(doc.nodes[doc.rootId].note).toBe('This is a root note.\nSecond line of note.');

    const branch = doc.nodes[doc.nodes[doc.rootId].childIds[0]];
    expect(branch.note).toBe('Branch note');
  });

  it('parses inline metadata', () => {
    const md = `# Root
## Tasks {color: green, status: in-progress}
- Item A {tags: frontend, backend}
- Item B {status: done}
`;
    const doc = parseDocument(md);
    const tasks = doc.nodes[doc.nodes[doc.rootId].childIds[0]];
    expect(tasks.text).toBe('Tasks');
    expect(tasks.color).toBe('green');
    expect(tasks.status).toBe('in-progress');

    const itemA = doc.nodes[tasks.childIds[0]];
    expect(itemA.tags).toEqual(['frontend', 'backend']);

    const itemB = doc.nodes[tasks.childIds[1]];
    expect(itemB.status).toBe('done');
  });

  it('parses the full example from the design doc', () => {
    const md = `---
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
`;
    const doc = parseDocument(md);
    expect(doc.title).toBe('AI & AI Research');

    const root = doc.nodes[doc.rootId];
    expect(root.text).toBe('AI & AI Research');
    expect(root.note).toBe('Major paradigms, model families, and open research areas.');
    expect(root.childIds).toHaveLength(3);

    // Core Paradigms
    const cp = doc.nodes[root.childIds[0]];
    expect(cp.text).toBe('Core Paradigms');
    expect(cp.color).toBe('blue');
    expect(cp.childIds).toHaveLength(4); // Symbolic, Statistical, Deep Learning, RL

    const symbolic = doc.nodes[cp.childIds[0]];
    expect(symbolic.text).toBe('Symbolic / GOFAI');
    expect(symbolic.note).toBe('Rules, logic, planning, expert systems.');
    expect(symbolic.childIds).toHaveLength(2);

    const rl = doc.nodes[cp.childIds[3]];
    expect(rl.text).toBe('Reinforcement Learning');
    expect(rl.status).toBe('in-progress');

    // Model Families
    const mf = doc.nodes[root.childIds[1]];
    expect(mf.text).toBe('Model Families');
    expect(mf.color).toBe('purple');

    const transformers = doc.nodes[mf.childIds[0]];
    expect(transformers.tags).toEqual(['attention', 'nlp']);
    expect(transformers.note).toBe('Foundation of modern LLMs.');

    // Research Fronts
    const rf = doc.nodes[root.childIds[2]];
    expect(rf.text).toBe('Research Fronts');
    expect(rf.color).toBe('red');
  });
});

describe('serializeDocument', () => {
  it('round-trips a simple document', () => {
    const md = `---
title: Test
---

# Test

## Branch A
- Leaf 1
- Leaf 2

## Branch B
`;
    const doc = parseDocument(md);
    const serialized = serializeDocument(doc);
    const reparsed = parseDocument(serialized);

    // Structure should match
    expect(reparsed.title).toBe(doc.title);
    expect(reparsed.nodes[reparsed.rootId].text).toBe('Test');
    expect(reparsed.nodes[reparsed.rootId].childIds).toHaveLength(2);
  });

  it('preserves metadata through round-trip', () => {
    const md = `---
title: Tasks
---

# Tasks

## Work {color: blue, status: in-progress}
- Item A {tags: frontend, backend}
- Item B {status: done}
`;
    const doc = parseDocument(md);
    const serialized = serializeDocument(doc);
    const reparsed = parseDocument(serialized);

    const work = reparsed.nodes[reparsed.nodes[reparsed.rootId].childIds[0]];
    expect(work.color).toBe('blue');
    expect(work.status).toBe('in-progress');

    const itemA = reparsed.nodes[work.childIds[0]];
    expect(itemA.tags).toEqual(['frontend', 'backend']);

    const itemB = reparsed.nodes[work.childIds[1]];
    expect(itemB.status).toBe('done');
  });

  it('preserves notes through round-trip', () => {
    const md = `---
title: Notes Test
---

# Root
> Root note line 1
> Root note line 2

## Branch
> Branch note
`;
    const doc = parseDocument(md);
    const serialized = serializeDocument(doc);
    const reparsed = parseDocument(serialized);

    expect(reparsed.nodes[reparsed.rootId].note).toBe('Root note line 1\nRoot note line 2');
    const branch = reparsed.nodes[reparsed.nodes[reparsed.rootId].childIds[0]];
    expect(branch.note).toBe('Branch note');
  });
});
