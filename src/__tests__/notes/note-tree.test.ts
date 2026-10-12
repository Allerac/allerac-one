import { buildTree, subtreeIds, TreeItem } from '@/app/notes/note-tree';

const item = (id: string, parent_id: string | null, position = 0): TreeItem =>
  ({ id, parent_id, position, title: id, icon: null, archived_at: null, updated_at: '' });

describe('note tree helpers', () => {
  const items = [item('a', null, 1), item('b', 'a', 1), item('c', 'a', 0), item('d', 'b'), item('e', 'missing'), item('f', null, 0)];

  it('nests children in position order and keeps orphans at the root', () => {
    const tree = buildTree(items);
    expect(tree.map(n => n.id)).toEqual(['e', 'f', 'a']);
    const a = tree[2];
    expect(a.children.map(n => n.id)).toEqual(['c', 'b']);
    expect(a.children[1].children.map(n => n.id)).toEqual(['d']);
  });

  it('collects a subtree', () => {
    expect([...subtreeIds(items, 'a')].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect([...subtreeIds(items, 'd')]).toEqual(['d']);
  });
});
