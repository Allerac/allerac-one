export interface TreeItem {
  id: string;
  parent_id: string | null;
  title: string | null;
  icon: string | null;
  position: number;
  archived_at: string | null;
  updated_at: string;
}

export interface TreeNode extends TreeItem {
  children: TreeNode[];
}

/**
 * Builds a forest from flat rows. Rows whose parent is missing from the input
 * (archived or deleted parent) are shown at the root so nothing disappears.
 */
export function buildTree(items: TreeItem[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const item of items) byId.set(item.id, { ...item, children: [] });
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.position - b.position);
    nodes.forEach(n => sort(n.children));
  };
  sort(roots);
  return roots;
}

/** Ids of a node and all of its descendants (valid move targets exclude these). */
export function subtreeIds(items: TreeItem[], rootId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const item of items) {
    if (!item.parent_id) continue;
    const list = children.get(item.parent_id) ?? [];
    list.push(item.id);
    children.set(item.parent_id, list);
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}
