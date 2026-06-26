import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, OnDestroy, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RbacService } from '../../../shared/services/rbac.service';
import {
  PoMaterialsService,
  MaterialSearchResult,
  VendorOption,
  PoPaymentDetail,
  CreatePoMaterialsPayload,
} from '../po-materials.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { PoItemsTableComponent, PoLineItem } from '../po-items-table/po-items-table.component';

@Component({
  selector: 'app-po-materials-form',
  standalone: true,
  imports: [CommonModule, FormsModule, PoItemsTableComponent],
  templateUrl: './po-materials-form.component.html',
})
export class PoMaterialsFormComponent implements OnInit, OnDestroy {
  /** When set, the form operates in edit mode and loads existing order data. */
  @Input() orderId?: number;

  /** Emitted after a successful save (create or update). */
  @Output() saved = new EventEmitter<void>();

  /** Emitted when the user cancels or closes the form. */
  @Output() cancelled = new EventEmitter<void>();

  // ─── Form State ─────────────────────────────────────────────────────────────
  mode: 'create' | 'edit' = 'create';
  orderStatus = '';
  isReadOnly = false;
  isSubmitting = false;
  isTransitioning = false;
  validationError = '';
  isAdmin = false;
  poNumber = '';

  // ─── Material Search ─────────────────────────────────────────────────────────
  materialSearchQuery = '';
  materialSearchResults: MaterialSearchResult[] = [];
  isMaterialDropdownOpen = false;
  isMaterialSearching = false;
  materialSearchNoResults = false;

  // ─── Line Items ─────────────────────────────────────────────────────────────
  productItems: PoLineItem[] = [];

  // ─── Vendor ──────────────────────────────────────────────────────────────────
  vendorMode: 'existing' | 'new' = 'existing';
  vendorSearch = '';
  vendorSearchResults: VendorOption[] = [];
  isVendorDropdownOpen = false;
  isVendorSearching = false;
  vendorSearchNoResults = false;
  selectedVendorId: string | null = null;
  vendorForm = { name: '', address: '', contact_person: '', contact_number: '' };
  vendorValidationError = '';

  // ─── Payment Details ─────────────────────────────────────────────────────────
  paymentDetails: PoPaymentDetail[] = [];
  paymentMethods: string[] = ['Cash', 'Bank Transfer', 'Terms', 'Terms with DP', 'Cheque', 'Credit Card', 'Installment'];

  // ─── Remarks ──────────────────────────────────────────────────────────────
  remarks = '';
  readonly maxRemarksLength = 1000;

  private materialSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private vendorSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs = 300;
  private readonly minSearchChars = 2;

  constructor(
    private readonly rbacService: RbacService,
    private readonly poMaterialsService: PoMaterialsService,
    private readonly notificationService: NotificationService,
  ) {}

  private readonly PO_DRAFT_STORAGE_KEY = 'po_material_form_draft';
  private poDraftAutoSaveTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.isAdmin = this.rbacService.isAdminOrSuperAdmin();
    this.paymentDetails = [this.createEmptyPaymentDetail()];

    if (this.orderId) {
      this.mode = 'edit';
      void this.loadExistingOrder();
    } else {
      this.restorePoDraft();
      this.poDraftAutoSaveTimer = setInterval(() => this.savePoDraftToStorage(), 5000);
    }
  }

  ngOnDestroy(): void {
    if (this.poDraftAutoSaveTimer) {
      clearInterval(this.poDraftAutoSaveTimer);
      this.poDraftAutoSaveTimer = null;
    }
  }

  private savePoDraftToStorage(): void {
    if (this.productItems.length === 0 && !this.vendorSearch.trim()) return;

    const draft = {
      vendorSearch: this.vendorSearch,
      selectedVendorId: this.selectedVendorId,
      vendorForm: { ...this.vendorForm },
      productItems: this.productItems.map(item => ({ ...item })),
      paymentDetails: this.paymentDetails.map(p => ({ ...p })),
      remarks: this.remarks,
      savedAt: new Date().toISOString(),
    };

    try { localStorage.setItem(this.PO_DRAFT_STORAGE_KEY, JSON.stringify(draft)); } catch { }
  }

  private restorePoDraft(): void {
    try {
      const raw = localStorage.getItem(this.PO_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft?.savedAt) return;

      const hoursAgo = (Date.now() - new Date(draft.savedAt).getTime()) / (1000 * 60 * 60);
      if (hoursAgo > 24) { this.clearPoDraftStorage(); return; }

      if (draft.vendorSearch) this.vendorSearch = draft.vendorSearch;
      if (draft.selectedVendorId) this.selectedVendorId = draft.selectedVendorId;
      if (draft.vendorForm) this.vendorForm = { ...this.vendorForm, ...draft.vendorForm };
      if (Array.isArray(draft.productItems) && draft.productItems.length > 0) this.productItems = draft.productItems;
      if (Array.isArray(draft.paymentDetails) && draft.paymentDetails.length > 0) this.paymentDetails = draft.paymentDetails;
      if (draft.remarks) this.remarks = draft.remarks;

      this.notificationService.success('Draft Restored', 'Your unsaved PO work has been recovered.');
    } catch { this.clearPoDraftStorage(); }
  }

  clearPoDraftStorage(): void {
    try { localStorage.removeItem(this.PO_DRAFT_STORAGE_KEY); } catch { }
  }

  // ─── Material Search ──────────────────────────────────────────────────────────

  onMaterialSearchChange(value: string): void {
    this.materialSearchQuery = value;
    this.materialSearchNoResults = false;

    if (this.materialSearchDebounceTimer) {
      clearTimeout(this.materialSearchDebounceTimer);
    }

    if (!value || value.trim().length < this.minSearchChars) {
      this.materialSearchResults = [];
      this.isMaterialDropdownOpen = false;
      this.isMaterialSearching = false;
      return;
    }

    this.isMaterialSearching = true;
    this.materialSearchDebounceTimer = setTimeout(() => {
      void this.performMaterialSearch(value.trim());
      this.materialSearchDebounceTimer = null;
    }, this.debounceMs);
  }

  private async performMaterialSearch(query: string): Promise<void> {
    try {
      const results = await this.poMaterialsService.searchMaterials(query);
      // Limit to max 50 results
      this.materialSearchResults = results.slice(0, 50);
      this.isMaterialDropdownOpen = true;
      this.materialSearchNoResults = this.materialSearchResults.length === 0;
    } catch {
      this.materialSearchResults = [];
      this.materialSearchNoResults = true;
      this.isMaterialDropdownOpen = true;
    } finally {
      this.isMaterialSearching = false;
    }
  }

  selectMaterial(material: MaterialSearchResult): void {
    // Check for duplicate: if material already exists in items, increment qty
    const existingIndex = this.productItems.findIndex(
      (item) => item.materialId === material.id,
    );

    if (existingIndex >= 0) {
      // Duplicate material: increment quantity by 1
      const existingItem = this.productItems[existingIndex];
      existingItem.qty += 1;
      existingItem.total = this.calculateTotal(existingItem.cost, existingItem.qty);
    } else {
      // New material: add line item
      const newItem: PoLineItem = {
        materialId: material.id,
        description: material.material_name,
        itemCode: material.material_code,
        unit: material.unit,
        cost: material.unit_price,
        rate: material.sell_price,
        discount: 0,
        qty: 1,
        total: material.unit_price * 1,
      };
      this.productItems = [...this.productItems, newItem];
    }

    // Clear search
    this.materialSearchQuery = '';
    this.materialSearchResults = [];
    this.isMaterialDropdownOpen = false;
    this.materialSearchNoResults = false;
  }

  onMaterialSearchFocus(): void {
    if (
      this.materialSearchQuery.trim().length >= this.minSearchChars &&
      this.materialSearchResults.length > 0
    ) {
      this.isMaterialDropdownOpen = true;
    }
  }

  onMaterialSearchBlur(): void {
    setTimeout(() => {
      this.isMaterialDropdownOpen = false;
    }, 200);
  }

  // ─── Vendor Search ──────────────────────────────────────────────────────────

  onVendorSearchChange(value: string): void {
    this.vendorSearch = value;
    this.vendorSearchNoResults = false;
    this.vendorValidationError = '';
    this.selectedVendorId = null;
    this.vendorForm.name = value.trim();
    this.vendorForm.address = '';
    this.vendorForm.contact_person = '';
    this.vendorForm.contact_number = '';

    // Check for exact match
    const normalized = value.trim().toLowerCase();
    if (normalized && this.vendorSearchResults.length > 0) {
      const exactMatch = this.vendorSearchResults.find(
        (v) => (v.name ?? '').trim().toLowerCase() === normalized,
      );
      if (exactMatch) {
        this.selectVendor(exactMatch);
        return;
      }
    }

    if (this.vendorSearchDebounceTimer) {
      clearTimeout(this.vendorSearchDebounceTimer);
    }

    if (!value || value.trim().length === 0) {
      this.vendorSearchResults = [];
      this.isVendorDropdownOpen = false;
      this.isVendorSearching = false;
      return;
    }

    this.isVendorSearching = true;
    this.isVendorDropdownOpen = true;
    this.vendorSearchDebounceTimer = setTimeout(() => {
      void this.performVendorSearch(value.trim());
      this.vendorSearchDebounceTimer = null;
    }, this.debounceMs);
  }

  private async performVendorSearch(query: string): Promise<void> {
    try {
      const results = await this.poMaterialsService.searchVendors(query);
      // Limit to max 20 results
      this.vendorSearchResults = results.slice(0, 20);
      this.isVendorDropdownOpen = true;
      this.vendorSearchNoResults = this.vendorSearchResults.length === 0;
    } catch {
      this.vendorSearchResults = [];
      this.vendorSearchNoResults = true;
      this.isVendorDropdownOpen = true;
    } finally {
      this.isVendorSearching = false;
    }
  }

  selectVendor(vendor: VendorOption): void {
    this.selectedVendorId = vendor.id;
    this.vendorSearch = vendor.name;
    this.vendorForm = {
      name: vendor.name,
      address: vendor.address ?? '',
      contact_person: vendor.contact_person ?? '',
      contact_number: vendor.contact_number ?? '',
    };
    this.vendorSearchResults = [];
    this.isVendorDropdownOpen = false;
    this.vendorSearchNoResults = false;
    this.vendorValidationError = '';
  }

  clearVendorSelection(): void {
    this.selectedVendorId = null;
    this.vendorSearch = '';
    this.vendorForm = { name: '', address: '', contact_person: '', contact_number: '' };
    this.vendorSearchResults = [];
    this.isVendorDropdownOpen = false;
    this.vendorSearchNoResults = false;
  }

  switchVendorMode(mode: 'existing' | 'new'): void {
    this.vendorMode = mode;
    this.vendorValidationError = '';
    if (mode === 'new') {
      this.selectedVendorId = null;
      this.vendorSearch = '';
      this.vendorSearchResults = [];
      this.isVendorDropdownOpen = false;
      this.vendorSearchNoResults = false;
      this.vendorForm = { name: '', address: '', contact_person: '', contact_number: '' };
    } else {
      this.vendorForm = { name: '', address: '', contact_person: '', contact_number: '' };
    }
  }

  onVendorSearchFocus(): void {
    if (
      this.vendorSearch.trim().length > 0 &&
      this.vendorSearchResults.length > 0 &&
      !this.selectedVendorId
    ) {
      this.isVendorDropdownOpen = true;
    }
  }

  onVendorSearchBlur(): void {
    setTimeout(() => {
      this.isVendorDropdownOpen = false;
    }, 200);
  }

  /**
   * Validates vendor selection. Returns true if valid.
   * Sets vendorValidationError if invalid.
   */
  validateVendor(): boolean {
    // Vendor is optional when creating a purchase order.
    if (this.mode === 'create') {
      const vendorName = this.vendorSearch.trim() || this.vendorForm.name.trim();
      if (vendorName.length > 200) {
        this.vendorValidationError = 'Vendor name must not exceed 200 characters.';
        return false;
      }
      this.vendorValidationError = '';
      return true;
    }

    if (this.vendorMode === 'existing') {
      if (!this.selectedVendorId) {
        this.vendorValidationError = 'Please select a vendor from the search results.';
        return false;
      }
    } else {
      // new vendor mode
      if (!this.vendorForm.name || this.vendorForm.name.trim().length === 0) {
        this.vendorValidationError = 'Vendor name is required.';
        return false;
      }
      if (this.vendorForm.name.trim().length > 200) {
        this.vendorValidationError = 'Vendor name must not exceed 200 characters.';
        return false;
      }
    }
    this.vendorValidationError = '';
    return true;
  }

  // ─── Product Items Table Events ─────────────────────────────────────────────

  onItemRemoved(index: number): void {
    this.productItems = this.productItems.filter((_, i) => i !== index);
  }

  onItemChanged(event: { index: number; item: PoLineItem }): void {
    if (event.index >= 0 && event.index < this.productItems.length) {
      this.productItems[event.index] = event.item;
    }
  }

  // ─── Payment Details ────────────────────────────────────────────────────────

  createEmptyPaymentDetail(): PoPaymentDetail {
    return {
      method: 'Cash',
      amount: 0,
      terms: '',
      termsDueDate: null,
      status: 'paid',
      paymentDate: null,
      bankName: '',
      referenceNo: '',
      checkNo: '',
      chequeDate: null,
      issuedBy: '',
      downPayment: 0,
    };
  }

  addPaymentDetail(): void {
    this.paymentDetails = [...this.paymentDetails, this.createEmptyPaymentDetail()];
  }

  removePaymentDetail(index: number): void {
    this.paymentDetails = this.paymentDetails.filter((_, i) => i !== index);
  }

  onPaymentMethodChange(index: number): void {
    const payment = this.paymentDetails[index];
    if (!payment) return;

    // Auto-set status based on method
    this.derivePaymentStatus(payment);

    // Clear irrelevant fields
    if (payment.method !== 'Terms' && payment.method !== 'Terms with DP' && payment.method !== 'Installment') {
      payment.terms = '';
      payment.termsDueDate = null;
    }
    if (payment.method !== 'Terms with DP' && payment.method !== 'Installment') {
      payment.downPayment = 0;
    }
    if (payment.method !== 'Cheque') {
      payment.checkNo = '';
      payment.chequeDate = null;
      payment.issuedBy = '';
    }
    if (payment.method !== 'Bank Transfer' && payment.method !== 'Cheque') {
      payment.bankName = '';
    }
    if (payment.method !== 'Bank Transfer') {
      payment.referenceNo = '';
    }
    if (payment.method !== 'Cash' && payment.method !== 'Credit Card') {
      payment.paymentDate = null;
    }
  }

  onPaymentDateChange(index: number): void {
    const payment = this.paymentDetails[index];
    if (!payment) return;
    this.derivePaymentStatus(payment);
  }

  derivePaymentStatus(payment: PoPaymentDetail): void {
    if (payment.method === 'Cash' || payment.method === 'Bank Transfer' || payment.method === 'Credit Card') {
      payment.status = 'paid';
    } else if (payment.method === 'Terms' || payment.method === 'Terms with DP' || payment.method === 'Installment') {
      if (payment.termsDueDate && this.isDateBeforeToday(payment.termsDueDate)) {
        payment.status = 'overdue';
      } else {
        payment.status = 'unpaid';
      }
    } else if (payment.method === 'Cheque') {
      if (payment.chequeDate && this.isDateBeforeToday(payment.chequeDate)) {
        payment.status = 'overdue';
      } else {
        payment.status = 'unpaid';
      }
    } else {
      payment.status = 'unpaid';
    }
  }

  shouldShowPaymentField(method: string, field: string): boolean {
    const map: Record<string, string[]> = {
      'Cash': ['amount', 'paymentDate'],
      'Bank Transfer': ['amount', 'bankName', 'referenceNo'],
      'Terms': ['amount', 'terms', 'termsDueDate'],
      'Terms with DP': ['amount', 'terms', 'termsDueDate', 'downPayment'],
      'Cheque': ['amount', 'bankName', 'checkNo', 'chequeDate', 'issuedBy'],
      'Credit Card': ['amount', 'paymentDate'],
      'Installment': ['amount', 'terms', 'termsDueDate', 'downPayment'],
    };
    return map[method]?.includes(field) ?? false;
  }

  private isDateBeforeToday(dateStr: string): boolean {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date < today;
  }

  // ─── Form Actions ─────────────────────────────────────────────────────────

  async submitOrder(): Promise<void> {
    this.validationError = '';

    // Prevent save if line items list is empty
    if (this.productItems.length === 0) {
      this.validationError = 'At least one product item is required.';
      return;
    }

    // Validate vendor is selected/provided
    if (!this.validateVendor()) {
      return;
    }

    this.isSubmitting = true;

    try {
      const payload = this.buildPayload();

      if (this.mode === 'edit' && this.orderId) {
        const result = await this.poMaterialsService.updatePurchaseOrder(this.orderId, payload);
        if (result.success) {
          this.notificationService.success('Success', 'Purchase order updated successfully.');
          this.clearPoDraftStorage();
          this.saved.emit();
        } else {
          this.validationError = result.message || 'Failed to update purchase order.';
        }
      } else {
        const result = await this.poMaterialsService.createPurchaseOrder(payload);
        if (result.success) {
          this.notificationService.success('Success', 'Purchase order created successfully.');
          this.clearPoDraftStorage();
          this.saved.emit();
        } else {
          this.validationError = result.message || 'Failed to create purchase order.';
        }
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'An error occurred while saving the purchase order.';
      this.validationError = message;
    } finally {
      this.isSubmitting = false;
    }
  }

  cancel(): void {
    if (!this.orderId && this.productItems.length > 0) {
      this.isCloseConfirmOpen = true;
    } else {
      this.cancelled.emit();
    }
  }

  isCloseConfirmOpen = false;

  confirmCloseAndClear(): void {
    this.clearPoDraftStorage();
    this.isCloseConfirmOpen = false;
    this.cancelled.emit();
  }

  confirmCloseAndKeep(): void {
    this.isCloseConfirmOpen = false;
    this.cancelled.emit();
  }

  cancelClose(): void {
    this.isCloseConfirmOpen = false;
  }

  /**
   * Builds the API payload from the current form state.
   */
  /**
   * Builds the API payload from the current form state.
   */
  private buildPayload(): CreatePoMaterialsPayload {
    const payload: CreatePoMaterialsPayload = {
      poType: 'ACM',
      productItems: this.productItems.map((item) => ({
        transType: 'purchase' as const,
        materialId: item.materialId,
        materialName: item.description,
        materialCode: item.itemCode,
        materialUnit: item.unit,
        unitPrice: item.cost,
        sellPrice: item.rate,
        discountPrice: item.discount,
        totalSetQty: item.qty,
      })),
      remarks: this.remarks?.trim() || '',
      status: this.mode === 'edit' ? this.orderStatus : 'for_approval',
    };

    // ✅ FIX: Set vendorId if present, but ALWAYS include the nested vendor details if a name exists!
    if (this.selectedVendorId) {
      payload.vendorId = this.selectedVendorId;
    }

    const vendorName = this.vendorSearch.trim() || this.vendorForm.name.trim();
    if (vendorName) {
      payload.vendor = {
        name: vendorName,
        address: this.vendorForm.address?.trim() || '',
        contact_person: this.vendorForm.contact_person?.trim() || '',
        contact_number: this.vendorForm.contact_number?.trim() || '',
      };
    }

    // Payment details (only include entries with a method)
    const validPayments = this.paymentDetails.filter((p) => p.method);
    if (validPayments.length > 0) {
      payload.paymentDetails = validPayments.map((p) => ({
        method: p.method,
        amount: p.amount || undefined,
        terms: p.terms || undefined,
        termsDueDate: p.termsDueDate || undefined,
        status: p.status || undefined,
        paymentDate: p.paymentDate || undefined,
        bankName: p.bankName || undefined,
        referenceNo: p.referenceNo || undefined,
        checkNo: p.checkNo || undefined,
        chequeDate: p.chequeDate || undefined,
        issuedBy: p.issuedBy || undefined,
        downPayment: p.downPayment || undefined,
      }));
    }

    return payload;
  }
  // private buildPayload(): CreatePoMaterialsPayload {
  //   const payload: CreatePoMaterialsPayload = {
  //     poType: 'ACM',
  //     productItems: this.productItems.map((item) => ({
  //       transType: 'purchase' as const,
  //       materialId: item.materialId,
  //       materialName: item.description,
  //       materialCode: item.itemCode,
  //       materialUnit: item.unit,
  //       unitPrice: item.cost,
  //       sellPrice: item.rate,
  //       discountPrice: item.discount,
  //       totalSetQty: item.qty,
  //     })),
  //     remarks: this.remarks?.trim() || '',
  //     status: this.mode === 'edit' ? this.orderStatus : 'for_approval',
  //   };

  //   // Vendor (optional on create, required by edit validation rules)
  //   if (this.selectedVendorId) {
  //     payload.vendorId = this.selectedVendorId;
  //   } else {
  //     const vendorName = this.vendorSearch.trim() || this.vendorForm.name.trim();
  //     if (vendorName) {
  //     payload.vendor = {
  //       name: vendorName,
  //       address: this.vendorForm.address?.trim() || undefined,
  //       contact_person: this.vendorForm.contact_person?.trim() || undefined,
  //       contact_number: this.vendorForm.contact_number?.trim() || undefined,
  //     };
  //     }
  //   }

  //   // Payment details (only include entries with a method)
  //   const validPayments = this.paymentDetails.filter((p) => p.method);
  //   if (validPayments.length > 0) {
  //     payload.paymentDetails = validPayments.map((p) => ({
  //       method: p.method,
  //       amount: p.amount || undefined,
  //       terms: p.terms || undefined,
  //       termsDueDate: p.termsDueDate || undefined,
  //       status: p.status || undefined,
  //       paymentDate: p.paymentDate || undefined,
  //       bankName: p.bankName || undefined,
  //       referenceNo: p.referenceNo || undefined,
  //       checkNo: p.checkNo || undefined,
  //       chequeDate: p.chequeDate || undefined,
  //       issuedBy: p.issuedBy || undefined,
  //       downPayment: p.downPayment || undefined,
  //     }));
  //   }

  //   return payload;
  // }

  // ─── Remarks ────────────────────────────────────────────────────────────────

  /**
   * Handles remarks input, preventing input beyond maxRemarksLength.
   */
  onRemarksInput(value: string): void {
    if (value.length > this.maxRemarksLength) {
      this.remarks = value.substring(0, this.maxRemarksLength);
    } else {
      this.remarks = value;
    }
  }

  // ─── Edit Mode ──────────────────────────────────────────────────────────────

  private async loadExistingOrder(): Promise<void> {
    if (!this.orderId) return;

    try {
      const order = await this.poMaterialsService.getPurchaseOrderById(this.orderId);

      this.orderStatus = order.status ?? '';
      this.poNumber = order.poNumber ?? '';
      // Read-only for all statuses except in-progress
      this.isReadOnly = ['for_approval', 'approved', 'received', 'completed'].includes(this.orderStatus);

      // Vendor
      if (order.vendorId) {
        this.vendorMode = 'existing';
        this.selectedVendorId = order.vendorId;
        this.vendorSearch = order.vendorName ?? '';
        this.vendorForm.name = order.vendorName ?? '';
        this.vendorForm.address = order.vendorAddress ?? '';
        this.vendorForm.contact_person = order.vendorContactPerson ?? '';
        this.vendorForm.contact_number = order.vendorContactNumber ?? '';
      }

      // Product items - map all fields from API response to PoLineItem
      this.productItems = (order.productItems ?? []).map((item) => ({
        materialId: item.materialId,
        description: item.materialName ?? '',
        itemCode: item.materialCode,
        unit: item.materialUnit ?? '',
        cost: item.unitPrice,
        rate: item.sellPrice ?? item.unitPrice,
        discount: item.discountPrice ?? 0,
        qty: item.totalSetQty,
        total: this.calculateTotal(item.unitPrice, item.totalSetQty),
      }));

      // Remarks
      this.remarks = order.remarks ?? '';

      // Payment details - map from API response ensuring all fields are populated
      if ((order.paymentDetails ?? []).length > 0) {
        this.paymentDetails = order.paymentDetails.map((p) => ({
          method: p.method ?? 'Cash',
          amount: p.amount ?? 0,
          terms: p.terms ?? '',
          termsDueDate: p.termsDueDate ?? null,
          status: p.status ?? 'unpaid',
          paymentDate: p.paymentDate ?? null,
          bankName: p.bankName ?? '',
          referenceNo: p.referenceNo ?? '',
          checkNo: p.checkNo ?? '',
          chequeDate: p.chequeDate ?? null,
          issuedBy: p.issuedBy ?? '',
          downPayment: p.downPayment ?? 0,
        }));
      } else {
        this.paymentDetails = [this.createEmptyPaymentDetail()];
      }
    } catch (error: any) {
      this.notificationService.error('Error', 'Failed to load purchase order details.');
    }
  }

  // ─── Status Transition Permission Checks ─────────────────────────────────────

  /**
   * Whether the current user can create or update purchase orders.
   */
  canCreateOrUpdate(): boolean {
    return (
      this.rbacService.canAccess('purchase_order_materials', 'canUpdate') ||
      this.rbacService.canAccess('purchase_order_materials', 'canCreate') ||
      this.rbacService.canAccess('purchase_order', 'canUpdate') ||
      this.rbacService.canAccess('purchase_order', 'canCreate')
    );
  }

  /**
   * Whether the current user can approve purchase orders.
   */
  canApprovePurchaseOrder(): boolean {
    return (
      this.rbacService.canAccess('purchase_order_materials', 'canUpdate') ||
      this.rbacService.canAccess('purchase_order', 'canUpdate')
    );
  }

  /**
   * Whether the current user can receive purchase orders.
   */
  canReceivePurchaseOrder(): boolean {
    return (
      this.rbacService.hasEffectivePermissionKey('purchase-order.button.receive-request') ||
      this.rbacService.hasEffectivePermissionKey('purchase-order-materials.receive') ||
      this.canApprovePurchaseOrder()
    );
  }

  /**
   * Whether the current user can complete purchase orders.
   */
  canCompletePurchaseOrder(): boolean {
    return (
      this.rbacService.hasEffectivePermissionKey('purchase-order.button.receive-request') ||
      this.rbacService.hasEffectivePermissionKey('purchase-order-materials.complete') ||
      this.canApprovePurchaseOrder()
    );
  }

  /**
   * Whether the current user can revert purchase orders.
   */
  canRevertPurchaseOrder(): boolean {
    return this.canApprovePurchaseOrder();
  }

  // ─── Status Transition Visibility ───────────────────────────────────────────

  /**
   * Whether the "Submit for Approval" button should be shown.
   * Visible when status is in-progress and user can create/update.
   */
  get showSubmitForApproval(): boolean {
    return this.orderStatus === 'in-progress' && this.canCreateOrUpdate();
  }

  /**
   * Whether the "Approve" button should be shown.
   * Visible when status is for_approval and user has approval permission.
   */
  get showApprove(): boolean {
    return this.orderStatus === 'for_approval' && this.canApprovePurchaseOrder();
  }

  /**
   * Whether the "Receive" button should be shown.
   * Visible when status is approved and user has receive permission.
   */
  get showReceive(): boolean {
    return this.orderStatus === 'approved' && this.canReceivePurchaseOrder();
  }

  /**
   * Whether the "Complete" button should be shown.
   * Visible when status is received and user has complete permission.
   */
  get showComplete(): boolean {
    return this.orderStatus === 'received' && this.canCompletePurchaseOrder();
  }

  /**
   * Whether the "Revert to In Progress" button should be shown.
   * Visible when status is for_approval and user has revert permission.
   */
  get showRevert(): boolean {
    return this.orderStatus === 'for_approval' && this.canRevertPurchaseOrder();
  }

  // ─── Status Transition Actions ──────────────────────────────────────────────

  async submitForApproval(): Promise<void> {
    if (!this.orderId || this.isTransitioning) return;

    this.isTransitioning = true;
    this.validationError = '';

    try {
      const result = await this.poMaterialsService.submitForApproval(this.orderId);
      if (result.success) {
        this.notificationService.success('Success', 'Purchase order submitted for approval.');
        await this.loadExistingOrder();
      } else {
        this.validationError = result.message || 'Failed to submit for approval.';
        this.notificationService.error('Error', this.validationError);
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to submit for approval.';
      this.validationError = message;
      this.notificationService.error('Error', message);
    } finally {
      this.isTransitioning = false;
    }
  }

  async approveOrder(): Promise<void> {
    if (!this.orderId || this.isTransitioning) return;

    this.isTransitioning = true;
    this.validationError = '';

    try {
      const result = await this.poMaterialsService.approve(this.orderId);
      if (result.success) {
        this.notificationService.success('Success', 'Purchase order approved.');
        await this.loadExistingOrder();
      } else {
        this.validationError = result.message || 'Failed to approve purchase order.';
        this.notificationService.error('Error', this.validationError);
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to approve purchase order.';
      this.validationError = message;
      this.notificationService.error('Error', message);
    } finally {
      this.isTransitioning = false;
    }
  }

  async receiveOrder(): Promise<void> {
    if (!this.orderId || this.isTransitioning) return;

    this.isTransitioning = true;
    this.validationError = '';

    try {
      const result = await this.poMaterialsService.receive(this.orderId);
      if (result.success) {
        this.notificationService.success('Success', 'Purchase order marked as received.');
        await this.loadExistingOrder();
      } else {
        this.validationError = result.message || 'Failed to mark as received.';
        this.notificationService.error('Error', this.validationError);
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to mark as received.';
      this.validationError = message;
      this.notificationService.error('Error', message);
    } finally {
      this.isTransitioning = false;
    }
  }

  async completeOrder(): Promise<void> {
    if (!this.orderId || this.isTransitioning) return;

    this.isTransitioning = true;
    this.validationError = '';

    try {
      const result = await this.poMaterialsService.complete(this.orderId);
      if (result.success) {
        this.notificationService.success('Success', 'Purchase order completed.');
        await this.loadExistingOrder();
      } else {
        this.validationError = result.message || 'Failed to complete purchase order.';
        this.notificationService.error('Error', this.validationError);
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to complete purchase order.';
      this.validationError = message;
      this.notificationService.error('Error', message);
    } finally {
      this.isTransitioning = false;
    }
  }

  async revertToInProgress(): Promise<void> {
    if (!this.orderId || this.isTransitioning) return;

    this.isTransitioning = true;
    this.validationError = '';

    try {
      const result = await this.poMaterialsService.revertToInProgress(this.orderId);
      if (result.success) {
        this.notificationService.success('Success', 'Purchase order reverted to in-progress.');
        await this.loadExistingOrder();
      } else {
        this.validationError = result.message || 'Failed to revert purchase order.';
        this.notificationService.error('Error', this.validationError);
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to revert purchase order.';
      this.validationError = message;
      this.notificationService.error('Error', message);
    } finally {
      this.isTransitioning = false;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private calculateTotal(cost: number, qty: number): number {
    return Math.round(cost * qty * 100) / 100;
  }
}
