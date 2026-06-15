import { Component, OnInit, HostListener, ElementRef, ViewChildren, QueryList, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import {
  MaterialInventoryService,
  Material,
  ProductTypeNode,
  BrandNode,
  PriceHistoryRecord,
  StockMovementRecord,
  StockAdjustmentDto,
} from '../../shared/services/material-inventory.service';
import { computeMaterialRow, ComputedMaterialRow } from './material-computations.util';
import { getStockStatus, getStockBadgeConfig, StockStatus, StockBadgeConfig } from './stock-status.util';

/** A single material row in the all-in-one creation form */
interface AllInOneMaterialRow {
  material_name: string;
  material_code: string;
  unit: string;
  unit_price: number;
  sell_price: number;
  on_hand_stock: number;
  reorder_level: number;
  brand_name: string;
  brandSuggestions: { id: number; brandName: string; prefix: string; product_type_id?: number | null }[];
  isBrandDropdownOpen: boolean;
}

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, PageBreadcrumbComponent],
  templateUrl: './inventory.component.html',
})
export class InventoryComponent implements OnInit, AfterViewChecked {
  /** Query all inline edit inputs for auto-focus */
  @ViewChildren('inlineInput') inlineInputs!: QueryList<ElementRef>;

  /** Flag to trigger focus on next view check */
  private shouldFocusInlineInput = false;
  /** Tree data from the backend */
  treeNodes: ProductTypeNode[] = [];

  /** Set of expanded product type node IDs (null = "Uncategorized") */
  expandedNodes = new Set<number | null>();

  /** Currently selected brand node */
  selectedBrandId: number | null = null;

  /** Name of the currently selected brand */
  selectedBrandName = '';

  /** Loading state for the tree */
  isTreeLoading = false;

  /** Error message for tree loading */
  treeError = '';

  /** Search filter text for the tree (Product Types & Brands) */
  treeSearchFilter = '';

  /** Materials for the selected brand (with computed columns) */
  materials: ComputedMaterialRow[] = [];

  /** Filter text for the materials table */
  materialFilter = '';

  /** Loading state for materials table */
  isMaterialsLoading = false;

  /** Error message for materials loading */
  materialsError = '';

  // --- Inline Editing State ---

  /** ID of the material currently being inline-edited (null = none) */
  inlineEditId: number | null = null;

  /** Which field is being inline-edited */
  inlineEditField: 'material_name' | 'unit_price' | 'sell_price' | null = null;

  /** Temporary value while inline editing */
  inlineEditValue = '';

  /** Whether an inline save is in progress */
  isInlineSaving = false;

  /** ID of the material whose action menu is currently open (null = no menu open) */
  activeMenuId: number | null = null;

  // --- Edit Form State ---

  /** Whether the edit modal is visible */
  isEditModalOpen = false;

  /** Whether the edit form is currently submitting */
  isEditSaving = false;

  /** Error message from the edit form submission */
  editError = '';

  /** The form model for editing a material */
  editForm: {
    id: number;
    material_name: string;
    material_code: string;
    description: string;
    unit: string;
    unit_price: number;
    sell_price: number;
    on_hand_stock: number;
    reorder_level: number;
  } = {
    id: 0,
    material_name: '',
    material_code: '',
    description: '',
    unit: '',
    unit_price: 0,
    sell_price: 0,
    on_hand_stock: 0,
    reorder_level: 0,
  };

  // --- Delete Confirmation Dialog ---

  /** Whether the delete confirmation dialog is visible */
  isDeleteDialogOpen = false;

  /** The material currently targeted for deletion */
  materialToDelete: ComputedMaterialRow | null = null;

  /** Whether a delete operation is in progress */
  isDeleting = false;

  /** Error message from a failed delete operation */
  deleteError = '';

  // --- History Modal State ---

  /** Whether the history modal is visible */
  isHistoryModalOpen = false;

  /** Whether history data is currently loading */
  isHistoryLoading = false;

  /** Error message from history loading */
  historyError = '';

  /** The material whose history is being viewed */
  historyMaterialName = '';

  /** Price history records (ordered by created_at DESC, max 100) */
  priceHistory: PriceHistoryRecord[] = [];

  /** Stock movement records (ordered by created_at DESC, max 100) */
  stockMovements: StockMovementRecord[] = [];

  // --- Adjustment Form State ---

  /** Whether the adjustment modal is visible */
  isAdjustmentModalOpen = false;

  /** Whether the adjustment form is currently submitting */
  isAdjustmentSaving = false;

  /** Error message from the adjustment form submission */
  adjustmentError = '';

  /** The material currently being adjusted */
  adjustmentMaterial: ComputedMaterialRow | null = null;

  /** The form model for stock adjustment */
  adjustmentForm: StockAdjustmentDto = {
    direction: 'increase',
    quantity: 1,
    remarks: '',
  };

  // --- All-in-One Create Drawer State ---

  /** Whether the all-in-one create drawer is visible */
  isCreateDrawerOpen = false;

  /** Whether the create form is currently submitting */
  isCreateSaving = false;

  /** Error message from the create form submission */
  createError = '';

  /** Success message from the create form submission */
  createSuccess = '';

  /** Product types list for dropdowns */
  productTypes: { id: number; name: string; prefix: string }[] = [];

  /** Material brands list for dropdowns */
  materialBrands: { id: number; brandName: string; prefix: string; product_type_id?: number | null }[] = [];

  /** All-in-one: Product Type smart search text */
  productTypeSearch = '';

  /** All-in-one: Product Type prefix (for new types) */
  productTypePrefix = '';

  /** All-in-one: Filtered product type suggestions */
  productTypeSuggestions: { id: number; name: string; prefix: string }[] = [];

  /** All-in-one: Whether the product type dropdown is open */
  isProductTypeDropdownOpen = false;

  /** All-in-one: Material rows to create */
  materialRows: AllInOneMaterialRow[] = [];

  // --- Context Menu State ---

  /** Whether the context menu is visible */
  isContextMenuOpen = false;

  /** Position of the context menu */
  contextMenuX = 0;
  contextMenuY = 0;

  /** Type of context menu: 'product-type' or 'brand' */
  contextMenuType: 'product-type' | 'brand' = 'product-type';

  /** The node that was right-clicked */
  contextMenuNodeId: number | null = null;
  contextMenuNodeName = '';

  // --- Bulk Upload State ---

  /** Whether the bulk upload modal is visible */
  isBulkUploadModalOpen = false;

  /** Whether the bulk upload is currently submitting */
  isBulkUploading = false;

  /** Error message from bulk upload */
  bulkUploadError = '';

  /** Parsed rows from the uploaded file */
  bulkUploadRows: any[] = [];

  /** File name of the uploaded file */
  bulkUploadFileName = '';

  /** Upload results after submission */
  bulkUploadResults: { success: boolean; summary: { total: number; created: number; skipped: number; failed: number }; results: any[] } | null = null;

  // --- Stock Migration State ---

  /** Whether the stock migration modal is visible */
  isStockMigrationModalOpen = false;

  /** Whether the stock migration is currently submitting */
  isStockMigrating = false;

  /** Error message from stock migration */
  stockMigrationError = '';

  /** Parsed rows from the stock migration file */
  stockMigrationRows: any[] = [];

  /** File name of the stock migration file */
  stockMigrationFileName = '';

  /** Stock migration results after submission */
  stockMigrationResults: { success: boolean; summary: { total: number; updated: number; failed: number }; results: any[] } | null = null;

  constructor(
    private readonly materialInventoryService: MaterialInventoryService,
    private readonly elementRef: ElementRef
  ) {}

  ngOnInit(): void {
    void this.loadTree();
  }

  ngAfterViewChecked(): void {
    if (this.shouldFocusInlineInput && this.inlineInputs?.length > 0) {
      this.shouldFocusInlineInput = false;
      const input = this.inlineInputs.first?.nativeElement as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  /**
   * Fetch the tree data from the backend API
   */
  async loadTree(): Promise<void> {
    this.isTreeLoading = true;
    this.treeError = '';
    try {
      this.treeNodes = await this.materialInventoryService.getTree();
    } catch {
      this.treeError = 'Failed to load tree data.';
      this.treeNodes = [];
    } finally {
      this.isTreeLoading = false;
    }
  }

  /**
   * Toggle expand/collapse state of a product type node
   */
  toggleNode(nodeId: number | null): void {
    if (this.expandedNodes.has(nodeId)) {
      this.expandedNodes.delete(nodeId);
    } else {
      this.expandedNodes.add(nodeId);
    }
  }

  /**
   * Check if a product type node is expanded
   */
  isExpanded(nodeId: number | null): boolean {
    return this.expandedNodes.has(nodeId);
  }

  /**
   * Handle brand node click - select the brand and load materials
   */
  selectBrand(brand: BrandNode): void {
    this.selectedBrandId = brand.id;
    this.selectedBrandName = brand.name;
    this.materialFilter = '';
    this.cancelInlineEdit();
    void this.loadMaterials(brand.id);
  }

  /**
   * Check if a brand is currently selected
   */
  isBrandSelected(brandId: number): boolean {
    return this.selectedBrandId === brandId;
  }

  /**
   * Fetch materials for the selected brand and compute derived columns
   */
  async loadMaterials(brandId: number): Promise<void> {
    this.isMaterialsLoading = true;
    this.materialsError = '';
    this.materials = [];
    try {
      const rawMaterials: Material[] = await this.materialInventoryService.getMaterials(undefined, brandId);
      this.materials = rawMaterials.map(computeMaterialRow);
    } catch {
      this.materialsError = 'Failed to load materials.';
      this.materials = [];
    } finally {
      this.isMaterialsLoading = false;
    }
  }

  /**
   * Get the stock badge configuration for a material row.
   * Returns the label and Tailwind CSS classes for the badge.
   */
  getStockBadge(row: ComputedMaterialRow): StockBadgeConfig {
    const status = getStockStatus(row.on_hand_stock, row.reorder_level);
    return getStockBadgeConfig(status);
  }

  /**
   * Get materials filtered by the search text.
   * Matches against material_name and material_code.
   */
  get filteredMaterials(): ComputedMaterialRow[] {
    const filter = this.materialFilter.trim().toLowerCase();
    let filtered = !filter ? this.materials : this.materials.filter(m =>
      m.material_name.toLowerCase().includes(filter) ||
      (m.material_code ?? '').toLowerCase().includes(filter)
    );
    // Sort by material_code
    return filtered.sort((a, b) => {
      const codeA = (a.material_code ?? '').toLowerCase();
      const codeB = (b.material_code ?? '').toLowerCase();
      return codeA.localeCompare(codeB);
    });
  }

  /**
   * Get tree nodes filtered by the search text.
   * Matches against product type names and brand names.
   * Automatically expands nodes that have matching children.
   */
  get filteredTreeNodes(): ProductTypeNode[] {
    const filter = this.treeSearchFilter.trim().toLowerCase();
    if (!filter) return this.treeNodes;

    const filtered = this.treeNodes
      .map(node => ({
        ...node,
        // Filter children (brands) that match the search term
        children: node.children.filter(child =>
          child.name.toLowerCase().includes(filter)
        ),
      }))
      .filter(node =>
        // Keep the node if:
        // 1. The product type name matches, OR
        // 2. The node has matching children (brands)
        node.name.toLowerCase().includes(filter) || node.children.length > 0
      );

    // Auto-expand nodes that have search results
    filtered.forEach(node => {
      if (node.children.length > 0) {
        this.expandedNodes.add(node.id);
      }
    });

    return filtered;
  }

  // --- Inline Editing Methods ---

  /**
   * Start inline editing a cell.
   */
  startInlineEdit(row: ComputedMaterialRow, field: 'material_name' | 'unit_price' | 'sell_price'): void {
    if (this.isInlineSaving) return;
    this.inlineEditId = row.id;
    this.inlineEditField = field;
    this.inlineEditValue = String(row[field]);
    this.shouldFocusInlineInput = true;
  }

  /**
   * Check if a specific cell is currently being inline-edited.
   */
  isInlineEditing(rowId: number, field: string): boolean {
    return this.inlineEditId === rowId && this.inlineEditField === field;
  }

  /**
   * Cancel inline editing without saving.
   */
  cancelInlineEdit(): void {
    this.inlineEditId = null;
    this.inlineEditField = null;
    this.inlineEditValue = '';
  }

  /**
   * Handle keydown in inline edit input.
   */
  onInlineEditKeydown(event: KeyboardEvent, row: ComputedMaterialRow): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLInputElement).blur();
    } else if (event.key === 'Escape') {
      this.cancelInlineEdit();
    }
  }

  /**
   * Save the inline edit value to the backend.
   */
  async saveInlineEdit(row: ComputedMaterialRow): Promise<void> {
    if (!this.inlineEditField) return;

    const field = this.inlineEditField;
    const newValue = this.inlineEditValue.trim();

    // Validate
    if (field === 'material_name' && !newValue) {
      this.cancelInlineEdit();
      return;
    }

    const numericValue = field !== 'material_name' ? parseFloat(newValue) : null;
    if (field !== 'material_name' && (isNaN(numericValue!) || numericValue! < 0)) {
      this.cancelInlineEdit();
      return;
    }

    // Check if value actually changed
    const currentValue = String(row[field]);
    if (newValue === currentValue) {
      this.cancelInlineEdit();
      return;
    }

    this.isInlineSaving = true;

    try {
      const updateData: Record<string, any> = {};
      if (field === 'material_name') {
        updateData['material_name'] = newValue;
      } else {
        updateData[field] = numericValue;
      }

      await this.materialInventoryService.updateMaterial(row.id, updateData);

      // Update local data without full reload
      if (field === 'material_name') {
        row.material_name = newValue;
      } else if (field === 'unit_price') {
        row.unit_price = numericValue!;
      } else if (field === 'sell_price') {
        row.sell_price = numericValue!;
      }
      // Recompute derived columns
      if (field === 'unit_price' || field === 'sell_price') {
        row.margin = Math.round((row.sell_price - row.unit_price + Number.EPSILON) * 100) / 100;
        row.overallCost = Math.round((row.unit_price * row.on_hand_stock + Number.EPSILON) * 100) / 100;
        row.overallPrice = Math.round((row.sell_price * row.on_hand_stock + Number.EPSILON) * 100) / 100;
        row.overallMargin = Math.round((row.overallPrice - row.overallCost + Number.EPSILON) * 100) / 100;
      }

      this.cancelInlineEdit();
    } catch (err: any) {
      // On error, just cancel — the value reverts visually
      this.cancelInlineEdit();
    } finally {
      this.isInlineSaving = false;
    }
  }

  // --- Action Menu ---

  /**
   * Listen for clicks on the document to close the action menu
   * when clicking outside of it.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.activeMenuId === null) return;
    const target = event.target as HTMLElement;
    // Check if the click is inside the action menu or its trigger button
    const menuContainer = this.elementRef.nativeElement.querySelector('.action-menu-container.active');
    if (menuContainer && !menuContainer.contains(target)) {
      this.activeMenuId = null;
    }
  }

  /**
   * Toggle the action menu for a specific material row.
   * Only one menu can be open at a time.
   */
  toggleActionMenu(event: MouseEvent, materialId: number): void {
    event.stopPropagation();
    this.activeMenuId = this.activeMenuId === materialId ? null : materialId;
  }

  /**
   * Check if the action menu is open for a given material.
   */
  isMenuOpen(materialId: number): boolean {
    return this.activeMenuId === materialId;
  }

  /**
   * Handle action menu item click.
   */
  onMenuAction(action: 'edit' | 'delete' | 'adjustment' | 'history', material: ComputedMaterialRow): void {
    this.activeMenuId = null;

    switch (action) {
      case 'edit':
        this.openEditForm(material);
        break;
      case 'delete':
        this.openDeleteDialog(material);
        break;
      case 'history':
        this.openHistoryModal(material);
        break;
      case 'adjustment':
        this.openAdjustmentForm(material);
        break;
      default:
        console.log(`Action: ${action}`, material);
        break;
    }
  }

  // --- Edit Form Methods ---

  /**
   * Open the edit modal pre-populated with the material's current values.
   */
  openEditForm(material: ComputedMaterialRow): void {
    this.editForm = {
      id: material.id,
      material_name: material.material_name,
      material_code: material.material_code ?? '',
      description: (material as any).description ?? '',
      unit: material.unit,
      unit_price: material.unit_price,
      sell_price: material.sell_price,
      on_hand_stock: material.on_hand_stock,
      reorder_level: material.reorder_level,
    };
    this.editError = '';
    this.isEditSaving = false;
    this.isEditModalOpen = true;
  }

  /**
   * Close the edit modal without saving.
   */
  closeEditForm(): void {
    this.isEditModalOpen = false;
    this.editError = '';
  }

  /**
   * Submit the edit form to update the material via the API.
   */
  async submitEditForm(): Promise<void> {
    this.isEditSaving = true;
    this.editError = '';

    try {
      const { id, ...data } = this.editForm;
      await this.materialInventoryService.updateMaterial(id, data);
      this.isEditModalOpen = false;

      // Refresh table data
      if (this.selectedBrandId !== null) {
        await this.loadMaterials(this.selectedBrandId);
      }
    } catch (err: any) {
      this.editError =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to update material.';
    } finally {
      this.isEditSaving = false;
    }
  }

  // --- Delete Dialog Methods ---

  /**
   * Open the delete confirmation dialog for a material.
   */
  openDeleteDialog(material: ComputedMaterialRow): void {
    this.materialToDelete = material;
    this.deleteError = '';
    this.isDeleteDialogOpen = true;
  }

  /**
   * Close the delete confirmation dialog without performing any action.
   */
  cancelDelete(): void {
    this.isDeleteDialogOpen = false;
    this.materialToDelete = null;
    this.deleteError = '';
  }

  /**
   * Confirm and perform the soft delete of the selected material.
   */
  async confirmDelete(): Promise<void> {
    if (!this.materialToDelete) return;

    this.isDeleting = true;
    this.deleteError = '';

    try {
      await this.materialInventoryService.deleteMaterial(this.materialToDelete.id);
      this.isDeleteDialogOpen = false;
      this.materialToDelete = null;

      // Refresh table data
      if (this.selectedBrandId !== null) {
        await this.loadMaterials(this.selectedBrandId);
      }
    } catch (error: any) {
      this.deleteError = error?.response?.data?.message || error?.message || 'Failed to delete material.';
    } finally {
      this.isDeleting = false;
    }
  }

  // --- History Modal Methods ---

  /**
   * Open the history modal and fetch history data for the given material.
   */
  openHistoryModal(material: ComputedMaterialRow): void {
    this.historyMaterialName = material.material_name;
    this.priceHistory = [];
    this.stockMovements = [];
    this.historyError = '';
    this.isHistoryModalOpen = true;
    void this.loadHistory(material.id);
  }

  /**
   * Fetch history data (price history + stock movements) for a material.
   */
  async loadHistory(materialId: number): Promise<void> {
    this.isHistoryLoading = true;
    this.historyError = '';

    try {
      const response = await this.materialInventoryService.getHistory(materialId);
      this.priceHistory = response.priceHistory ?? [];
      this.stockMovements = response.stockMovements ?? [];
    } catch (err: any) {
      this.historyError =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load history.';
    } finally {
      this.isHistoryLoading = false;
    }
  }

  /**
   * Close the history modal.
   */
  closeHistoryModal(): void {
    this.isHistoryModalOpen = false;
    this.priceHistory = [];
    this.stockMovements = [];
    this.historyError = '';
  }

  /**
   * Check if a stock movement is a deficit record (OUT from SO).
   */
  isDeficitRecord(movement: StockMovementRecord): boolean {
    return movement.movement_type === 'OUT' && movement.source_type === 'SO';
  }

  /**
   * Format a date string for display.
   */
  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // --- Adjustment Form Methods ---

  /**
   * Open the adjustment modal for a material.
   */
  openAdjustmentForm(material: ComputedMaterialRow): void {
    this.adjustmentMaterial = material;
    this.adjustmentForm = {
      direction: 'increase',
      quantity: 1,
      remarks: '',
    };
    this.adjustmentError = '';
    this.isAdjustmentSaving = false;
    this.isAdjustmentModalOpen = true;
  }

  /**
   * Close the adjustment modal without saving.
   */
  closeAdjustmentForm(): void {
    this.isAdjustmentModalOpen = false;
    this.adjustmentMaterial = null;
    this.adjustmentError = '';
  }

  /**
   * Get the current character count for the remarks field.
   */
  get remarksCharCount(): number {
    return (this.adjustmentForm.remarks ?? '').length;
  }

  /**
   * Submit the stock adjustment form.
   */
  async submitAdjustmentForm(): Promise<void> {
    if (!this.adjustmentMaterial) return;

    // Client-side validation
    const qty = this.adjustmentForm.quantity;
    if (!qty || qty < 1 || qty > 999999) {
      this.adjustmentError = 'Quantity must be between 1 and 999,999.';
      return;
    }

    const remarks = this.adjustmentForm.remarks ?? '';
    if (remarks.length > 500) {
      this.adjustmentError = 'Remarks must not exceed 500 characters.';
      return;
    }

    this.isAdjustmentSaving = true;
    this.adjustmentError = '';

    try {
      const dto: StockAdjustmentDto = {
        direction: this.adjustmentForm.direction,
        quantity: Number(qty),
        remarks: remarks || undefined,
      };

      await this.materialInventoryService.adjustStock(this.adjustmentMaterial.id, dto);
      this.isAdjustmentModalOpen = false;
      this.adjustmentMaterial = null;

      // Refresh table data
      if (this.selectedBrandId !== null) {
        await this.loadMaterials(this.selectedBrandId);
      }
    } catch (err: any) {
      this.adjustmentError =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to adjust stock.';
    } finally {
      this.isAdjustmentSaving = false;
    }
  }

  // --- All-in-One Create Drawer Methods ---

  /**
   * Open the all-in-one create drawer.
   */
  openCreateDrawer(): void {
    this.createError = '';
    this.createSuccess = '';
    this.isCreateSaving = false;
    this.productTypeSearch = '';
    this.productTypePrefix = '';
    this.productTypeSuggestions = [];
    this.isProductTypeDropdownOpen = false;
    this.materialRows = [this.createEmptyMaterialRow()];
    this.isCreateDrawerOpen = true;
    void this.loadDropdownData();
  }

  /**
   * Close the all-in-one create drawer.
   */
  closeCreateDrawer(): void {
    this.isCreateDrawerOpen = false;
    this.createError = '';
    this.createSuccess = '';
  }

  /**
   * Load product types and material brands for dropdowns.
   */
  async loadDropdownData(): Promise<void> {
    try {
      const [productTypes, brands] = await Promise.all([
        this.materialInventoryService.getProductTypes(),
        this.materialInventoryService.getMaterialBrands(),
      ]);
      this.productTypes = productTypes;
      this.materialBrands = brands;
    } catch {
      // Silently fail - dropdowns will be empty
    }
  }

  /**
   * Create an empty material row.
   */
  createEmptyMaterialRow(): AllInOneMaterialRow {
    return {
      material_name: '',
      material_code: '',
      unit: 'pcs',
      unit_price: 0,
      sell_price: 0,
      on_hand_stock: 0,
      reorder_level: 0,
      brand_name: '',
      brandSuggestions: [],
      isBrandDropdownOpen: false,
    };
  }

  /**
   * Add a new material row to the list.
   */
  addMaterialRow(): void {
    const newRow = this.createEmptyMaterialRow();

    // Auto-assign code using product type prefix
    const prefix = this.productTypePrefix.trim();
    if (prefix) {
      const seq = this.getNextSequenceForPrefix(prefix);
      newRow.material_code = `${prefix}${String(seq).padStart(5, '0')}`;
    }

    this.materialRows.push(newRow);
  }

  /**
   * Remove a material row by index (only if more than 1 row).
   */
  removeMaterialRow(index: number): void {
    if (this.materialRows.length > 1) {
      this.materialRows.splice(index, 1);
    }
  }

  /**
   * TrackBy function for ngFor on material rows.
   */
  trackByIndex(index: number): number {
    return index;
  }

  /**
   * Handle product type search input — filter suggestions.
   */
  onProductTypeSearchInput(): void {
    const search = this.productTypeSearch.trim().toLowerCase();
    if (!search) {
      this.productTypeSuggestions = this.productTypes;
    } else {
      this.productTypeSuggestions = this.productTypes.filter(pt =>
        pt.name.toLowerCase().includes(search)
      );
    }
    this.isProductTypeDropdownOpen = true;
  }

  /**
   * Handle product type input focus — show all suggestions.
   */
  onProductTypeFocus(): void {
    this.productTypeSuggestions = this.productTypes;
    this.isProductTypeDropdownOpen = true;
  }

  /**
   * Select a product type suggestion.
   */
  selectProductTypeSuggestion(pt: { id: number; name: string; prefix: string }): void {
    this.productTypeSearch = pt.name;
    this.productTypePrefix = pt.prefix || '';
    this.isProductTypeDropdownOpen = false;
    // Auto-generate codes for all rows using this prefix (fetches DB sequence)
    void this.regenerateAllCodes();
  }

  /**
   * Close product type dropdown (with delay for click to register).
   */
  onProductTypeBlur(): void {
    setTimeout(() => {
      this.isProductTypeDropdownOpen = false;
    }, 200);
  }

  /**
   * Check if the product type search text matches an existing product type.
   */
  get isProductTypeNew(): boolean {
    if (!this.productTypeSearch.trim()) return false;
    return !this.productTypes.some(
      pt => pt.name.toLowerCase() === this.productTypeSearch.trim().toLowerCase()
    );
  }

  /**
   * Handle brand search input for a specific row — filter suggestions.
   */
  onBrandSearchInput(row: AllInOneMaterialRow): void {
    const search = row.brand_name.trim().toLowerCase();
    if (!search) {
      row.brandSuggestions = this.materialBrands;
    } else {
      row.brandSuggestions = this.materialBrands.filter(b =>
        b.brandName.toLowerCase().includes(search)
      );
    }
    row.isBrandDropdownOpen = true;
  }

  /**
   * Handle brand input focus for a specific row — show all suggestions.
   */
  onBrandFocus(row: AllInOneMaterialRow): void {
    row.brandSuggestions = this.materialBrands;
    row.isBrandDropdownOpen = true;
  }

  /**
   * Select a brand suggestion for a specific row.
   */
  selectBrandSuggestion(row: AllInOneMaterialRow, brand: { id: number; brandName: string; prefix: string }): void {
    row.brand_name = brand.brandName;
    row.isBrandDropdownOpen = false;
    // Auto-generate code for this row based on brand prefix
    void this.generateCodeForRow(row, brand.id);
  }

  /**
   * Close brand dropdown for a specific row (with delay for click to register).
   */
  onBrandBlur(row: AllInOneMaterialRow): void {
    setTimeout(() => {
      row.isBrandDropdownOpen = false;
    }, 200);
  }

  /**
   * Check if a row's brand text matches an existing brand.
   */
  isRowBrandNew(row: AllInOneMaterialRow): boolean {
    if (!row.brand_name.trim()) return false;
    return !this.materialBrands.some(
      b => b.brandName.toLowerCase() === row.brand_name.trim().toLowerCase()
    );
  }

  /**
   * Generate material code for a single row based on the Product Type prefix.
   */
  async generateCodeForRow(row: AllInOneMaterialRow, _brandId: number): Promise<void> {
    // Use product type prefix for code generation
    let prefix = this.productTypePrefix.trim();
    if (!prefix) {
      prefix = this.productTypeSearch.trim().substring(0, 3).toUpperCase();
    }
    if (!prefix) {
      row.material_code = '';
      return;
    }
    // Find the next sequence number for this prefix (checks DB + local rows)
    const seq = await this.getNextSequenceForPrefixAsync(prefix);
    row.material_code = `${prefix}${String(seq).padStart(5, '0')}`;
  }

  /**
   * Get the next sequence number for a given prefix by checking both
   * existing material codes in the DB and the current in-memory rows.
   */
  private async getNextSequenceForPrefixAsync(prefix: string): Promise<number> {
    let dbMaxSeq = 0;

    // Query the DB for existing materials with this prefix
    try {
      const result = await this.materialInventoryService.getNextMaterialCodeByPrefix(prefix);
      dbMaxSeq = (result.next_sequence ?? 1) - 1; // next_sequence is max+1, so subtract 1 to get max
    } catch {
      // If API fails, fall back to 0
      dbMaxSeq = 0;
    }

    // Also check current in-memory rows (in case user added rows already)
    let localMaxSeq = 0;
    for (const row of this.materialRows) {
      if (row.material_code.startsWith(prefix)) {
        const numPart = row.material_code.substring(prefix.length);
        const seq = parseInt(numPart, 10);
        if (!isNaN(seq) && seq > localMaxSeq) {
          localMaxSeq = seq;
        }
      }
    }

    return Math.max(dbMaxSeq, localMaxSeq) + 1;
  }

  /**
   * Synchronous fallback: get next sequence from in-memory rows only.
   */
  private getNextSequenceForPrefix(prefix: string): number {
    let maxSeq = 0;
    for (const row of this.materialRows) {
      if (row.material_code.startsWith(prefix)) {
        const numPart = row.material_code.substring(prefix.length);
        const seq = parseInt(numPart, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
    return maxSeq + 1;
  }

  /**
   * Regenerate codes for all material rows using the current product type prefix.
   * Fetches the next sequence from the DB to avoid code collisions.
   */
  private async regenerateAllCodes(): Promise<void> {
    const prefix = this.productTypePrefix.trim();
    if (!prefix) {
      for (const row of this.materialRows) {
        row.material_code = '';
      }
      return;
    }

    // Fetch the next available sequence from the DB
    const startSeq = await this.getNextSequenceForPrefixAsync(prefix);

    // Assign sequential codes starting from the DB's next sequence
    // But since getNextSequenceForPrefixAsync already accounts for local rows,
    // we clear them first and reassign
    for (let i = 0; i < this.materialRows.length; i++) {
      this.materialRows[i].material_code = `${prefix}${String(startSeq + i).padStart(5, '0')}`;
    }
  }

  /**
   * Handle prefix input change — regenerate codes with debounce.
   */
  private prefixDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  onPrefixInput(): void {
    if (this.prefixDebounceTimer) {
      clearTimeout(this.prefixDebounceTimer);
    }
    this.prefixDebounceTimer = setTimeout(() => {
      void this.regenerateAllCodes();
      this.prefixDebounceTimer = null;
    }, 400);
  }

  /**
   * Generate material codes for all rows (used when brand is the same for all).
   * Now handled per-row via selectBrandSuggestion.
   */
  async generateMaterialCodes(): Promise<void> {
    // No-op: codes are now generated per-row when a brand is selected
  }

  /**
   * Submit the all-in-one form: resolve product type, then for each row resolve brand and create material.
   */
  async submitAllInOne(): Promise<void> {
    this.createError = '';
    this.createSuccess = '';

    // Validate product type
    if (!this.productTypeSearch.trim()) {
      this.createError = 'Product type name is required.';
      return;
    }

    // Validate materials — at least one row with a name
    const validRows = this.materialRows.filter(r => r.material_name.trim());
    if (validRows.length === 0) {
      this.createError = 'At least one material with a name is required.';
      return;
    }

    this.isCreateSaving = true;

    try {
      // Step 1: Resolve product type ID
      let productTypeId: number | null = null;
      const existingType = this.productTypes.find(
        pt => pt.name.toLowerCase() === this.productTypeSearch.trim().toLowerCase()
      );

      if (existingType) {
        productTypeId = existingType.id;
      } else {
        // Create new product type
        await this.materialInventoryService.createProductType(
          this.productTypeSearch.trim(),
          this.productTypePrefix.trim() || undefined
        );
        // Reload product types to get the new ID
        const updatedTypes = await this.materialInventoryService.getProductTypes();
        const created = updatedTypes.find(pt => pt.name.toLowerCase() === this.productTypeSearch.trim().toLowerCase());
        productTypeId = created?.id ?? null;
      }

      // Step 2: For each material row, resolve brand and create material
      for (const row of validRows) {
        // Resolve brand (optional — only if brand_name is provided)
        let brandId: number | null = null;

        if (row.brand_name.trim()) {
          const existingBrand = this.materialBrands.find(
            b => b.brandName.toLowerCase() === row.brand_name.trim().toLowerCase()
          );

          if (existingBrand) {
            brandId = existingBrand.id;
          } else {
            // Create new brand
            const createdBrandId = await this.materialInventoryService.createBrand(
              row.brand_name.trim(),
              undefined,
              productTypeId
            );
            brandId = createdBrandId;

            // Fallback: if the response didn't include the ID, try to find it
            if (!brandId) {
              const updatedBrands = await this.materialInventoryService.getMaterialBrands();
              const found = updatedBrands.find(b => b.brandName.toLowerCase() === row.brand_name.trim().toLowerCase());
              brandId = found?.id ?? null;
            }

            // Add to local list so subsequent rows with same brand name don't re-create
            if (brandId) {
              this.materialBrands.push({
                id: brandId,
                brandName: row.brand_name.trim(),
                prefix: '',
                product_type_id: productTypeId,
              });
            }
          }

          // Only error if brand name was provided but couldn't be resolved
          if (!brandId) {
            this.createError = `Failed to resolve brand for "${row.brand_name}".`;
            return;
          }
        }

        // If no code was auto-generated, generate using Product Type prefix
        if (!row.material_code.trim()) {
          // Use the product type prefix for code generation
          let prefix = this.productTypePrefix.trim();
          if (!prefix && productTypeId) {
            const pt = this.productTypes.find(p => p.id === productTypeId);
            prefix = pt?.prefix ?? '';
          }
          if (!prefix) {
            // Fallback: use first 3 chars of product type name
            prefix = this.productTypeSearch.trim().substring(0, 3).toUpperCase();
          }
          if (prefix) {
            // Count how many materials already have this prefix in the DB
            // For simplicity, use the row index + existing count
            const rowIndex = validRows.indexOf(row);
            const baseSeq = this.getNextSequenceForPrefix(prefix);
            row.material_code = `${prefix}${String(baseSeq + rowIndex).padStart(5, '0')}`;
          }
        }

        // Create the material (with product_type_id, brand is optional)
        await this.materialInventoryService.createMaterial({
          material_name: row.material_name.trim(),
          material_code: row.material_code.trim() || null,
          unit: row.unit.trim() || 'pcs',
          unit_price: Number(row.unit_price) || 0,
          sell_price: Number(row.sell_price) || 0,
          on_hand_stock: Number(row.on_hand_stock) || 0,
          reorder_level: Number(row.reorder_level) || 0,
          brand_id: brandId,
          product_type_id: productTypeId,
        } as any);
      }

      this.createSuccess = `Successfully created ${validRows.length} material(s).`;

      // Refresh tree and table
      await this.loadTree();
      if (this.selectedBrandId !== null) {
        await this.loadMaterials(this.selectedBrandId);
      }

      // Close drawer after short delay to show success
      setTimeout(() => {
        this.isCreateDrawerOpen = false;
        this.createSuccess = '';
      }, 1500);
    } catch (err: any) {
      this.createError =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to create items.';
    } finally {
      this.isCreateSaving = false;
    }
  }

  // --- Bulk Upload Methods ---

  /**
   * Open the bulk upload modal.
   */
  openBulkUploadModal(): void {
    this.bulkUploadError = '';
    this.bulkUploadRows = [];
    this.bulkUploadFileName = '';
    this.bulkUploadResults = null;
    this.isBulkUploading = false;
    this.isBulkUploadModalOpen = true;
    void this.loadDropdownData(); // Ensure brands are loaded for inference
  }

  /**
   * Close the bulk upload modal.
   */
  closeBulkUploadModal(): void {
    this.isBulkUploadModalOpen = false;
    this.bulkUploadError = '';
    this.bulkUploadRows = [];
    this.bulkUploadFileName = '';
    this.bulkUploadResults = null;
  }

  /**
   * Download a CSV template file.
   */
  downloadBulkTemplate(): void {
    const headers = 'product_type,brand,material_name,material_code,unit,unit_price,sell_price,on_hand_stock,reorder_level';
    const sampleRow = 'Electrical,Schneider,Circuit Breaker 20A,SCH00001,pcs,150,200,50,10';
    const csv = `${headers}\n${sampleRow}\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk_upload_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Handle file selection for bulk upload.
   */
  async onBulkFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.bulkUploadFileName = file.name;
    this.bulkUploadError = '';
    this.bulkUploadRows = [];
    this.bulkUploadResults = null;

    const ext = file.name.split('.').pop()?.toLowerCase();

    try {
      if (ext === 'csv') {
        await this.parseCsvFile(file);
      } else if (ext === 'xlsx' || ext === 'xls') {
        await this.parseExcelFile(file);
      } else {
        this.bulkUploadError = 'Unsupported file type. Please upload a .csv, .xlsx, or .xls file.';
      }
    } catch (err: any) {
      this.bulkUploadError = err?.message || 'Failed to parse file.';
    }

    // Reset input so the same file can be re-selected
    input.value = '';
  }

  /**
   * Parse a CSV file into rows.
   */
  private async parseCsvFile(file: File, type: 'bulk-upload' | 'stock-migration' = 'bulk-upload'): Promise<void> {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
      const errorMsg = 'CSV file must have a header row and at least one data row.';
      if (type === 'bulk-upload') {
        this.bulkUploadError = errorMsg;
      } else {
        this.stockMigrationError = errorMsg;
      }
      return;
    }

    const headers = this.parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());

    if (type === 'stock-migration') {
      // Stock migration: material_code and quantity required
      if (!headers.includes('material_code') || !headers.includes('quantity')) {
        this.stockMigrationError = 'CSV must contain "material_code" and "quantity" columns.';
        return;
      }

      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCsvLine(lines[i]);
        const row: any = {};
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = values[j]?.trim() ?? '';
        }
        if (row.material_code?.trim() && row.quantity?.trim()) {
          rows.push(row);
        }
      }
      this.stockMigrationRows = rows;
    } else {
      // Bulk upload: material_name required
      const expectedHeaders = ['product_type', 'brand', 'material_name', 'material_code', 'unit', 'unit_price', 'sell_price', 'on_hand_stock', 'reorder_level'];
      if (!headers.includes('material_name')) {
        this.bulkUploadError = 'CSV must contain a "material_name" column.';
        return;
      }

      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCsvLine(lines[i]);
        const row: any = {};
        for (let j = 0; j < headers.length; j++) {
          const key = expectedHeaders.includes(headers[j]) ? headers[j] : headers[j];
          row[key] = values[j]?.trim() ?? '';
        }
        if (row.material_name?.trim()) {
          rows.push(row);
        }
      }

      this.bulkUploadRows = rows;
      this.inferBrandsFromMaterialNames();
    }
  }

  /**
   * Parse a single CSV line handling quoted fields.
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  /**
   * Parse an Excel file (.xlsx/.xls) into rows using exceljs.
   */
  private async parseExcelFile(file: File, type: 'bulk-upload' | 'stock-migration' = 'bulk-upload'): Promise<void> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = await file.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      const errorMsg = 'Excel file must have a header row and at least one data row.';
      if (type === 'bulk-upload') {
        this.bulkUploadError = errorMsg;
      } else {
        this.stockMigrationError = errorMsg;
      }
      return;
    }

    // Get headers from first row
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = (cell.value?.toString() ?? '').trim().toLowerCase();
    });

    if (type === 'stock-migration') {
      // Stock migration: material_code and quantity required
      if (!headers.includes('material_code') || !headers.includes('quantity')) {
        this.stockMigrationError = 'Excel file must contain "material_code" and "quantity" columns.';
        return;
      }

      const rows: any[] = [];
      for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        const rowObj: any = {};
        let hasData = false;

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const key = headers[colNumber - 1];
          if (key) {
            const val = cell.value?.toString()?.trim() ?? '';
            rowObj[key] = val;
            if (val) hasData = true;
          }
        });

        if (hasData && rowObj.material_code?.trim() && rowObj.quantity?.trim()) {
          rows.push(rowObj);
        }
      }
      this.stockMigrationRows = rows;
    } else {
      // Bulk upload: material_name required
      if (!headers.includes('material_name')) {
        this.bulkUploadError = 'Excel file must contain a "material_name" column.';
        return;
      }

      const rows: any[] = [];
      for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        const rowObj: any = {};
        let hasData = false;

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const key = headers[colNumber - 1];
          if (key) {
            const val = cell.value?.toString()?.trim() ?? '';
            rowObj[key] = val;
            if (val) hasData = true;
          }
        });

        if (hasData && rowObj.material_name?.trim()) {
          rows.push(rowObj);
        }
      }

      this.bulkUploadRows = rows;
      this.inferBrandsFromMaterialNames();
    }
  }

  /**
   * Infer brands from material names for rows that have no brand specified.
   * Matches words or consecutive word combinations in the material name against existing brands (case-insensitive).
   * Prefers longer matches (e.g. "MIDEA PRO" over "MIDEA").
   * If no match, uses the product type name or "General" as fallback.
   */
  private inferBrandsFromMaterialNames(): void {
    const brandNames = this.materialBrands.map(b => b.brandName);

    for (const row of this.bulkUploadRows) {
      if (row.brand && row.brand.trim()) continue; // Already has a brand

      const materialName = (row.material_name ?? '').toString().trim();
      if (!materialName) continue;

      // Split material name into words
      const words = materialName.split(/\s+/);
      let matched = '';

      // Try multi-word combinations first (longest match wins)
      // Check from longest possible combination down to single words
      for (let len = Math.min(words.length, 4); len >= 1; len--) {
        if (matched) break;
        for (let start = 0; start <= words.length - len; start++) {
          const phrase = words.slice(start, start + len).join(' ');
          const found = brandNames.find(b => b.toLowerCase() === phrase.toLowerCase());
          if (found) {
            matched = found;
            break;
          }
        }
      }

      if (matched) {
        row.brand = matched;
        row._brandInferred = true;
      } else {
        // Fallback: use "Uncategorized <product_type>" when brand can't be inferred
        const ptName = row.product_type?.trim() || 'General';
        row.brand = `Uncategorized ${ptName}`;
        row._brandInferred = true;
      }
    }
  }

  /**
   * Submit the parsed bulk upload rows to the backend.
   */
  async submitBulkUpload(): Promise<void> {
    if (this.bulkUploadRows.length === 0) {
      this.bulkUploadError = 'No rows to upload.';
      return;
    }

    this.isBulkUploading = true;
    this.bulkUploadError = '';
    this.bulkUploadResults = null;

    try {
      this.bulkUploadResults = await this.materialInventoryService.bulkUploadMaterials(this.bulkUploadRows);

      // Refresh tree and table after successful upload
      await this.loadTree();
      if (this.selectedBrandId !== null) {
        await this.loadMaterials(this.selectedBrandId);
      }
    } catch (err: any) {
      this.bulkUploadError =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to upload materials.';
    } finally {
      this.isBulkUploading = false;
    }
  }

  // --- Stock Migration Methods ---

  /**
   * Open the stock migration modal.
   */
  openStockMigrationModal(): void {
    this.stockMigrationError = '';
    this.stockMigrationRows = [];
    this.stockMigrationFileName = '';
    this.stockMigrationResults = null;
    this.isStockMigrating = false;
    this.isStockMigrationModalOpen = true;
  }

  /**
   * Close the stock migration modal.
   */
  closeStockMigrationModal(): void {
    this.isStockMigrationModalOpen = false;
    this.stockMigrationError = '';
    this.stockMigrationRows = [];
    this.stockMigrationFileName = '';
    this.stockMigrationResults = null;
  }

  /**
   * Download a CSV template for stock migration.
   */
  downloadStockMigrationTemplate(): void {
    const headers = 'material_code,quantity';
    const sampleRow = 'SPRING-001,50';
    const csv = `${headers}\n${sampleRow}\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stock_migration_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Handle file selection for stock migration.
   */
  async onStockMigrationFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.stockMigrationFileName = file.name;
    this.stockMigrationError = '';
    this.stockMigrationRows = [];
    this.stockMigrationResults = null;

    const ext = file.name.split('.').pop()?.toLowerCase();

    try {
      if (ext === 'csv') {
        await this.parseCsvFile(file, 'stock-migration');
      } else if (ext === 'xlsx' || ext === 'xls') {
        await this.parseExcelFile(file, 'stock-migration');
      } else {
        this.stockMigrationError = 'Unsupported file type. Please upload a .csv, .xlsx, or .xls file.';
      }
    } catch (err: any) {
      this.stockMigrationError = err?.message || 'Failed to parse file.';
    }

    // Reset input so the same file can be re-selected
    input.value = '';
  }

  /**
   * Submit stock migration.
   */
  async submitStockMigration(): Promise<void> {
    if (this.stockMigrationRows.length === 0) {
      this.stockMigrationError = 'No rows to migrate.';
      return;
    }

    this.isStockMigrating = true;
    this.stockMigrationError = '';
    this.stockMigrationResults = null;

    try {
      this.stockMigrationResults = await this.materialInventoryService.migrateStock(this.stockMigrationRows);

      // Refresh tree and table after successful migration
      await this.loadTree();
      if (this.selectedBrandId !== null) {
        await this.loadMaterials(this.selectedBrandId);
      }
    } catch (err: any) {
      this.stockMigrationError =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to migrate stock.';
    } finally {
      this.isStockMigrating = false;
    }
  }

  // --- Context Menu Methods ---

  /**
   * Handle right-click on a product type node.
   */
  onProductTypeContextMenu(event: MouseEvent, node: ProductTypeNode): void {
    if (node.id === null) return; // Don't show context menu for "Uncategorized"
    event.preventDefault();
    this.contextMenuX = event.clientX;
    this.contextMenuY = event.clientY;
    this.contextMenuType = 'product-type';
    this.contextMenuNodeId = node.id;
    this.contextMenuNodeName = node.name;
    this.isContextMenuOpen = true;
  }

  /**
   * Handle right-click on a brand node.
   */
  onBrandContextMenu(event: MouseEvent, brand: BrandNode): void {
    event.preventDefault();
    this.contextMenuX = event.clientX;
    this.contextMenuY = event.clientY;
    this.contextMenuType = 'brand';
    this.contextMenuNodeId = brand.id;
    this.contextMenuNodeName = brand.name;
    this.isContextMenuOpen = true;
  }

  /**
   * Close the context menu.
   */
  closeContextMenu(): void {
    this.isContextMenuOpen = false;
  }

  /**
   * Handle context menu action: Add Brand (from product type node).
   */
  contextMenuAddBrand(): void {
    this.isContextMenuOpen = false;
    this.openCreateDrawer();
    // Pre-fill product type from the context menu node
    const pt = this.productTypes.find(p => p.id === this.contextMenuNodeId);
    if (pt) {
      this.productTypeSearch = pt.name;
      this.productTypePrefix = pt.prefix || '';
    }
  }

  /**
   * Handle context menu action: Add Material (from brand node).
   */
  contextMenuAddMaterial(): void {
    this.isContextMenuOpen = false;
    this.openCreateDrawer();
    // Find the brand in materialBrands to get its product_type_id
    const brand = this.materialBrands.find(b => b.id === this.contextMenuNodeId);
    if (brand && brand.product_type_id) {
      const pt = this.productTypes.find(p => p.id === brand.product_type_id);
      if (pt) {
        this.productTypeSearch = pt.name;
        this.productTypePrefix = pt.prefix || '';
      }
    }
    // Pre-fill brand in the first row
    if (brand && this.materialRows.length > 0) {
      this.materialRows[0].brand_name = brand.brandName;
      void this.generateCodeForRow(this.materialRows[0], brand.id);
    }
  }

  /**
   * Listen for clicks to close context menu.
   */
  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (this.isContextMenuOpen) {
      const target = event.target as HTMLElement;
      const contextMenu = document.getElementById('tree-context-menu');
      if (contextMenu && !contextMenu.contains(target)) {
        this.isContextMenuOpen = false;
      }
    }
  }
}
