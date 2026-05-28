/**
 * Tree filtering utility for the Material Inventory tree view.
 *
 * Provides case-insensitive substring filtering with automatic
 * parent node expansion for matching children.
 */

export interface BrandNode {
  id: number;
  name: string;
  type: 'brand';
  prefix: string;
}

export interface ProductTypeNode {
  id: number | null;
  name: string;
  type: 'product-type';
  children: BrandNode[];
}

export interface TreeFilterResult {
  filteredTree: ProductTypeNode[];
  expandedNodeIds: Set<number | null>;
}

/**
 * Filters the tree by a search term using case-insensitive substring matching.
 *
 * - Returns only nodes whose names match the search term.
 * - Includes parent nodes that have matching children (even if the parent doesn't match).
 * - Returns a set of node IDs that should be auto-expanded (parents with matching children).
 *
 * When searchTerm is empty, returns the full tree with an empty expandedNodeIds set.
 */
export function filterTree(
  tree: ProductTypeNode[],
  searchTerm: string
): TreeFilterResult {
  if (!searchTerm || searchTerm.trim().length === 0) {
    return { filteredTree: tree, expandedNodeIds: new Set() };
  }

  const term = searchTerm.toLowerCase();
  const filteredTree: ProductTypeNode[] = [];
  const expandedNodeIds = new Set<number | null>();

  for (const productType of tree) {
    const parentMatches = productType.name.toLowerCase().includes(term);
    const matchingChildren = productType.children.filter((brand) =>
      brand.name.toLowerCase().includes(term)
    );

    if (parentMatches && matchingChildren.length > 0) {
      // Parent matches AND has matching children — show only matching children, auto-expand
      filteredTree.push({ ...productType, children: matchingChildren });
      expandedNodeIds.add(productType.id);
    } else if (parentMatches) {
      // Only parent matches — show parent with all its children (not expanded)
      filteredTree.push({ ...productType });
    } else if (matchingChildren.length > 0) {
      // Only children match — include parent with matching children, auto-expand
      filteredTree.push({ ...productType, children: matchingChildren });
      expandedNodeIds.add(productType.id);
    }
  }

  return { filteredTree, expandedNodeIds };
}
