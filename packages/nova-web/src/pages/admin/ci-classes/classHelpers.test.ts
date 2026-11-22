/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import {
  buildClassTree,
  classPath,
  descendantIds,
  filterClassTree,
  flattenClassTree,
} from './classHelpers';

const classes = [
  { id: 'hw', display_name: 'Hardware', parent_class: null },
  { id: 'computer', display_name: 'Computer', parent_class: 'hw' },
  { id: 'server', display_name: 'Server', parent_class: 'computer' },
  { id: 'laptop', display_name: 'Laptop', parent_class: 'computer' },
  { id: 'app', display_name: 'Application', parent_class: null },
];

describe('CI class hierarchy helpers', () => {
  it('nests children under their parent and sorts siblings by name', () => {
    const tree = buildClassTree(classes);
    expect(tree.map((node) => node.cls.display_name)).toEqual(['Application', 'Hardware']);
    const hardware = tree[1]!;
    expect(hardware.children.map((node) => node.cls.display_name)).toEqual(['Computer']);
    expect(hardware.children[0]!.children.map((node) => node.cls.display_name)).toEqual(['Laptop', 'Server']);
    expect(flattenClassTree(tree).map((node) => [node.cls.id, node.depth])).toEqual([
      ['app', 0],
      ['hw', 0],
      ['computer', 1],
      ['laptop', 2],
      ['server', 2],
    ]);
  });

  it('keeps ancestors when a descendant matches the filter', () => {
    const filtered = filterClassTree(buildClassTree(classes), (cls) => cls.id === 'laptop');
    expect(flattenClassTree(filtered).map((node) => node.cls.id)).toEqual(['hw', 'computer', 'laptop']);
  });

  it('builds the parent path and blocks descendant parents', () => {
    const laptop = classes.find((cls) => cls.id === 'laptop')!;
    expect(classPath(laptop, classes)).toEqual(['Hardware', 'Computer', 'Laptop']);
    expect([...descendantIds('computer', classes)].sort()).toEqual(['laptop', 'server']);
    expect(descendantIds('laptop', classes).size).toBe(0);
  });

  it('shows a cyclic class instead of dropping it', () => {
    const cyclic = [
      { id: 'a', display_name: 'A', parent_class: 'b' },
      { id: 'b', display_name: 'B', parent_class: 'a' },
    ];
    expect(buildClassTree(cyclic).map((node) => node.cls.id).sort()).toEqual(['a', 'b']);
  });

  it('treats a missing parent as a top-level class', () => {
    const orphan = { id: 'orphan', display_name: 'Orphan', parent_class: 'missing' };
    const tree = buildClassTree([...classes, orphan]);
    expect(tree.some((node) => node.cls.id === 'orphan' && node.depth === 0)).toBe(true);
  });
});
