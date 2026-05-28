import { filterTree, ProductTypeNode } from './tree-filter.util';

describe('filterTree', () => {
  const sampleTree: ProductTypeNode[] = [
    {
      id: 1,
      name: 'Breaker',
      type: 'product-type',
      children: [
        { id: 10, name: 'Schneider', type: 'brand', prefix: 'SCH' },
        { id: 11, name: 'Panasonic', type: 'brand', prefix: 'PAN' },
      ],
    },
    {
      id: 2,
      name: 'Wire',
      type: 'product-type',
      children: [
        { id: 20, name: 'Phelps Dodge', type: 'brand', prefix: 'PD' },
        { id: 21, name: 'American Wire', type: 'brand', prefix: 'AW' },
      ],
    },
    {
      id: null,
      name: 'Uncategorized',
      type: 'product-type',
      children: [
        { id: 30, name: 'Generic Brand', type: 'brand', prefix: 'GEN' },
      ],
    },
  ];

  it('should return full tree with empty expandedNodeIds when search term is empty', () => {
    const result = filterTree(sampleTree, '');
    expect(result.filteredTree).toBe(sampleTree);
    expect(result.expandedNodeIds.size).toBe(0);
  });

  it('should return full tree when search term is only whitespace', () => {
    const result = filterTree(sampleTree, '   ');
    expect(result.filteredTree).toBe(sampleTree);
    expect(result.expandedNodeIds.size).toBe(0);
  });

  it('should filter by brand name (case-insensitive)', () => {
    const result = filterTree(sampleTree, 'schneider');
    expect(result.filteredTree.length).toBe(1);
    expect(result.filteredTree[0].name).toBe('Breaker');
    expect(result.filteredTree[0].children.length).toBe(1);
    expect(result.filteredTree[0].children[0].name).toBe('Schneider');
    expect(result.expandedNodeIds.has(1)).toBeTrue();
  });

  it('should filter by product type name', () => {
    const result = filterTree(sampleTree, 'wire');
    // "Wire" matches as parent, and "American Wire" matches as child
    expect(result.filteredTree.length).toBe(1);
    expect(result.filteredTree[0].name).toBe('Wire');
    // Parent matches AND has matching child ("American Wire") — shows only matching children
    expect(result.expandedNodeIds.has(2)).toBeTrue();
  });

  it('should include parent nodes that have matching children even if parent does not match', () => {
    const result = filterTree(sampleTree, 'phelps');
    expect(result.filteredTree.length).toBe(1);
    expect(result.filteredTree[0].name).toBe('Wire');
    expect(result.filteredTree[0].children.length).toBe(1);
    expect(result.filteredTree[0].children[0].name).toBe('Phelps Dodge');
    expect(result.expandedNodeIds.has(2)).toBeTrue();
  });

  it('should auto-expand parent nodes with matching children', () => {
    const result = filterTree(sampleTree, 'generic');
    expect(result.filteredTree.length).toBe(1);
    expect(result.filteredTree[0].name).toBe('Uncategorized');
    expect(result.expandedNodeIds.has(null)).toBeTrue();
  });

  it('should return empty tree when no matches found', () => {
    const result = filterTree(sampleTree, 'nonexistent');
    expect(result.filteredTree.length).toBe(0);
    expect(result.expandedNodeIds.size).toBe(0);
  });

  it('should handle partial substring matches', () => {
    const result = filterTree(sampleTree, 'an');
    // "Panasonic" contains "an", "American Wire" contains "an"
    // "Breaker" parent has "Panasonic" match
    // "Wire" parent has "American Wire" match
    expect(result.filteredTree.length).toBeGreaterThanOrEqual(2);
  });

  it('should be case-insensitive', () => {
    const resultLower = filterTree(sampleTree, 'schneider');
    const resultUpper = filterTree(sampleTree, 'SCHNEIDER');
    const resultMixed = filterTree(sampleTree, 'ScHnEiDeR');

    expect(resultLower.filteredTree.length).toBe(resultUpper.filteredTree.length);
    expect(resultLower.filteredTree.length).toBe(resultMixed.filteredTree.length);
  });

  it('should show parent with all children when only parent name matches', () => {
    const result = filterTree(sampleTree, 'breaker');
    // "Breaker" matches as parent, no children match "breaker"
    expect(result.filteredTree.length).toBe(1);
    expect(result.filteredTree[0].name).toBe('Breaker');
    // Parent-only match: shows all children, not expanded
    expect(result.filteredTree[0].children.length).toBe(2);
    expect(result.expandedNodeIds.has(1)).toBeFalse();
  });
});
