import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, OnDestroy, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RbacService } from '../../../shared/services/rbac.service';
import { AuthService } from '../../../shared/services/auth.service';
import {
  SalesOrderService,
  SalesCustomerOption,
} from '../../../shared/services/sales-order.service';
import {
  CreateMaterialSalesOrderPayload,
  LineItem,
  MaterialSearchResult,
  PaymentDetail,
  SalesOrderMaterialService,
} from '../../../shared/services/sales-order-material.service';
import { NotificationService } from '../../../shared/services/notification.service';
import {
  PrintSalesOrderService,
  PrintSalesOrderData,
} from '../../../shared/services/print-sales-order.service';
import { ProductItemsTableComponent } from '../product-items-table/product-items-table.component';

@Component({
  selector: 'app-sales-order-material-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ProductItemsTableComponent],
  templateUrl: './sales-order-material-form.component.html',
})
export class SalesOrderMaterialFormComponent implements OnInit, OnDestroy {
  /** When set, the form operates in edit mode and loads existing order data. */
  @Input() orderId?: number;

  /** Emitted after a successful save (create or update). */
  @Output() saved = new EventEmitter<void>();

  /** Emitted when the user cancels or closes the form. */
  @Output() cancelled = new EventEmitter<void>();

  // ─── Delivery Date ──────────────────────────────────────────────────────────
  deliveryDate = '';
  isAdmin = false;

  // ─── Customer Selection ─────────────────────────────────────────────────────
  customerMode: 'existing' | 'new' = 'existing';
  customerSearch = '';
  customerOptions: SalesCustomerOption[] = [];
  isCustomerDropdownOpen = false;
  selectedCustomerId: string | null = null;
  customerForm = {
    name: '',
    address: '',
    contact_person: '',
    contact_number: '',
  };

  // ─── Material Search ─────────────────────────────────────────────────────────
  materialSearchQuery = '';
  materialSearchResults: MaterialSearchResult[] = [];
  isMaterialDropdownOpen = false;
  isMaterialSearching = false;
  materialSearchNoResults = false;

  // ─── Product Items (managed by child component in later tasks) ──────────────
  productItems: LineItem[] = [];

  // ─── Form State ─────────────────────────────────────────────────────────────
  remarks = '';
  isSubmitting = false;
  validationError = '';

  // ─── Payment Details ────────────────────────────────────────────────────────
  paymentDetails: PaymentDetail[] = [];
  paymentMethods: PaymentDetail['method'][] = ['Cash', 'GCash', 'Bank Transfer', 'Terms', 'Terms with DP', 'Cheque', 'Credit Card', 'Installment'];

  // ─── Order Status (for edit mode buttons) ───────────────────────────────────
  orderStatus: string = '';
  isCancelDialogOpen = false;

  /** Returns true if the order is completed and the user is NOT superadmin — form should be read-only */
  get isFormReadonly(): boolean {
    const status = (this.orderStatus ?? '').toLowerCase();
    return (status === 'complete' || status === 'completed') && !this.isAdmin;
  }

  // ─── Stock Validation Modal ─────────────────────────────────────────────────
  isValidationModalOpen = false;
  validationWarnings: string[] = [];
  validationErrors: string[] = [];
  pendingSubmissionStatus: string = '';

  // ─── SO Number Display ──────────────────────────────────────────────────────
  nextSoNumber: string = '';
  currentSoNumber: string = '';

  /** Stores the original salesType from the loaded order (for edit mode preservation). */
  private originalSalesType = 'sales';

  // ─── Quotation Print ────────────────────────────────────────────────────────
  isPrintModalOpen = false;
  printPdfUrl: SafeResourceUrl | null = null;
  isPrintLoading = false;

  // ─── Post-Complete Print Dialog ─────────────────────────────────────────────
  isPostCompleteDialogOpen = false;
  private completedOrderId: number | null = null;

  // ─── Void Order Dialog ──────────────────────────────────────────────────────
  isVoidDialogOpen = false;
  isVoiding = false;
  voidPassword = '';
  voidError = '';

  private customerDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private materialSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs = 300;

  constructor(
    private readonly rbacService: RbacService,
    private readonly authService: AuthService,
    private readonly salesOrderService: SalesOrderService,
    private readonly salesOrderMaterialService: SalesOrderMaterialService,
    private readonly notificationService: NotificationService,
    private readonly printSalesOrderService: PrintSalesOrderService,
    private readonly sanitizer: DomSanitizer,
  ) {}

  private readonly DRAFT_STORAGE_KEY = 'so_material_form_draft';
  private draftAutoSaveTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.isAdmin = this.rbacService.isAdminOrSuperAdmin();
    this.resetDeliveryDate();
    this.paymentDetails = [this.createEmptyPaymentDetail()];

    void this.loadCustomerOptions();

    if (this.orderId) {
      void this.loadExistingOrder();
    } else {
      // Restore unsaved draft if available (only for new orders)
      this.restoreDraft();
      void this.loadNextSoNumber();
      // Start auto-saving every 5 seconds
      this.draftAutoSaveTimer = setInterval(() => this.saveDraftToStorage(), 5000);
    }
  }

  ngOnDestroy(): void {
    if (this.draftAutoSaveTimer) {
      clearInterval(this.draftAutoSaveTimer);
      this.draftAutoSaveTimer = null;
    }
  }

  /** Save current form state to localStorage */
  private saveDraftToStorage(): void {
    // Only save if there's meaningful data (at least one item or customer)
    if (this.productItems.length === 0 && !this.customerSearch.trim()) {
      return;
    }

    const draft = {
      deliveryDate: this.deliveryDate,
      customerSearch: this.customerSearch,
      selectedCustomerId: this.selectedCustomerId,
      customerForm: { ...this.customerForm },
      productItems: this.productItems.map(item => ({ ...item })),
      paymentDetails: this.paymentDetails.map(p => ({ ...p })),
      remarks: this.remarks,
      savedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(this.DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Storage full or unavailable — ignore
    }
  }

  /** Restore draft from localStorage */
  private restoreDraft(): void {
    try {
      const raw = localStorage.getItem(this.DRAFT_STORAGE_KEY);
      if (!raw) return;

      const draft = JSON.parse(raw);
      if (!draft || !draft.savedAt) return;

      // Only restore if saved within the last 24 hours
      const savedAt = new Date(draft.savedAt).getTime();
      const hoursAgo = (Date.now() - savedAt) / (1000 * 60 * 60);
      if (hoursAgo > 24) {
        this.clearDraftStorage();
        return;
      }

      // Restore form data
      if (draft.deliveryDate) this.deliveryDate = draft.deliveryDate;
      if (draft.customerSearch) this.customerSearch = draft.customerSearch;
      if (draft.selectedCustomerId) this.selectedCustomerId = draft.selectedCustomerId;
      if (draft.customerForm) this.customerForm = { ...this.customerForm, ...draft.customerForm };
      if (Array.isArray(draft.productItems) && draft.productItems.length > 0) {
        this.productItems = draft.productItems;
      }
      if (Array.isArray(draft.paymentDetails) && draft.paymentDetails.length > 0) {
        this.paymentDetails = draft.paymentDetails;
      }
      if (draft.remarks) this.remarks = draft.remarks;

      this.notificationService.success('Draft Restored', 'Your unsaved work has been recovered.');
    } catch {
      // Corrupted data — clear it
      this.clearDraftStorage();
    }
  }

  /** Clear saved draft from localStorage */
  private clearDraftStorage(): void {
    try {
      localStorage.removeItem(this.DRAFT_STORAGE_KEY);
    } catch { /* ignore */ }
  }

  /**
   * Fetch the next SO number to display in the form header.
   */
  private async loadNextSoNumber(): Promise<void> {
    try {
      const result = await this.salesOrderMaterialService.getNextSoNumber();
      this.nextSoNumber = result;
    } catch {
      this.nextSoNumber = '';
    }
  }

  // ─── Delivery Date Logic ────────────────────────────────────────────────────

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  resetDeliveryDate(): void {
    this.deliveryDate = this.getTodayDate();
  }

  onDeliveryDateChange(value: string): void {
    if (!this.isAdmin) {
      // Non-admin users: always reset to today
      this.deliveryDate = this.getTodayDate();
      return;
    }
    this.deliveryDate = value;
  }

  // ─── Customer Search ────────────────────────────────────────────────────────

  onCustomerSearchChange(value: string): void {
    this.customerSearch = value;
    this.selectedCustomerId = null;
    this.isCustomerDropdownOpen = true;
    this.customerForm.name = value.trim();
    this.customerForm.address = '';
    this.customerForm.contact_person = '';
    this.customerForm.contact_number = '';

    // Check for exact match
    const normalized = value.trim().toLowerCase();
    if (normalized) {
      const exactMatch = this.customerOptions.find(
        (c) => (c.name ?? '').trim().toLowerCase() === normalized,
      );
      if (exactMatch) {
        this.selectCustomer(exactMatch.id);
      }
    }

    if (this.customerDebounceTimer) {
      clearTimeout(this.customerDebounceTimer);
    }
    this.customerDebounceTimer = setTimeout(() => {
      void this.loadCustomerOptions(this.customerSearch);
      this.customerDebounceTimer = null;
    }, this.debounceMs);
  }

  selectCustomer(customerId: string): void {
    this.selectedCustomerId = customerId;
    const selected = this.customerOptions.find((c) => c.id === customerId);
    if (!selected) return;

    this.customerSearch = selected.name;
    this.customerForm.name = selected.name ?? '';
    this.customerForm.address = selected.address ?? '';
    this.customerForm.contact_person = selected.contact_person ?? '';
    this.customerForm.contact_number = selected.contact_number ?? '';
    this.isCustomerDropdownOpen = false;
  }

  onCustomerComboboxFocus(): void {
    this.isCustomerDropdownOpen = true;
    if (this.customerOptions.length === 0) {
      void this.loadCustomerOptions(this.customerSearch);
    }
  }

  onCustomerComboboxBlur(): void {
    setTimeout(() => {
      this.isCustomerDropdownOpen = false;
    }, 200);
  }

  getFilteredCustomerOptions(): SalesCustomerOption[] {
    const query = (this.customerSearch ?? '').trim().toLowerCase();
    if (!query) return this.customerOptions;
    return this.customerOptions.filter((c) =>
      (c.name ?? '').toLowerCase().includes(query),
    );
  }

  private async loadCustomerOptions(search?: string): Promise<void> {
    try {
      const customers = await this.salesOrderService.getCustomers(search);
      this.customerOptions = Array.isArray(customers) ? customers : [];
    } catch {
      this.customerOptions = [];
    }
  }

  // ─── Material Search ──────────────────────────────────────────────────────────

  onMaterialSearchChange(value: string): void {
    this.materialSearchQuery = value;
    this.materialSearchNoResults = false;

    if (this.materialSearchDebounceTimer) {
      clearTimeout(this.materialSearchDebounceTimer);
    }

    if (!value || value.trim().length < 1) {
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
      const results = await this.salesOrderMaterialService.searchMaterials(query, 50);
      this.materialSearchResults = results;
      this.isMaterialDropdownOpen = true;
      this.materialSearchNoResults = results.length === 0;
    } catch {
      this.materialSearchResults = [];
      this.materialSearchNoResults = true;
    } finally {
      this.isMaterialSearching = false;
    }
  }

  selectMaterial(material: MaterialSearchResult): void {
    const newItem: LineItem = {
      itemNo: this.productItems.length + 1,
      description: material.material_name,
      itemCode: material.material_code,
      brand: material.brand_name,
      cost: material.unit_price,
      rate: material.sell_price,
      discount: 0,
      qty: 1,
      total: material.sell_price * 1,
      materialId: material.id,
      isNonInventory: false,
      onHandStock: material.on_hand_stock,
      reorderLevel: material.reorder_level,
    };

    this.productItems.push(newItem);
    this.materialSearchQuery = '';
    this.materialSearchResults = [];
    this.isMaterialDropdownOpen = false;
    this.materialSearchNoResults = false;
  }

  /** Validation error specific to non-inventory item addition. */
  nonInventoryValidationError = '';

  addNonInventoryItem(): void {
    this.nonInventoryValidationError = '';
    const description = this.materialSearchQuery.trim();

    if (!description) {
      this.nonInventoryValidationError = 'Description is required to add a non-inventory item.';
      return;
    }

    if (description.length > 255) {
      this.nonInventoryValidationError = 'Description must be between 1 and 255 characters.';
      return;
    }

    const newItem: LineItem = {
      itemNo: this.productItems.length + 1,
      description,
      itemCode: null,
      brand: null,
      cost: 0,
      rate: 0,
      discount: 0,
      qty: 1,
      total: 0,
      materialId: null,
      isNonInventory: true,
    };

    this.productItems.push(newItem);
    this.materialSearchQuery = '';
    this.materialSearchResults = [];
    this.isMaterialDropdownOpen = false;
    this.materialSearchNoResults = false;
  }

  onMaterialSearchFocus(): void {
    if (this.materialSearchQuery.trim().length >= 1 && this.materialSearchResults.length > 0) {
      this.isMaterialDropdownOpen = true;
    }
  }

  onMaterialSearchBlur(): void {
    setTimeout(() => {
      this.isMaterialDropdownOpen = false;
    }, 200);
  }

  /**
   * Determines the stock status of a material.
   * Returns 'out-of-stock', 'low-stock', or 'in-stock'
   */
  getStockStatus(material: MaterialSearchResult): 'out-of-stock' | 'low-stock' | 'in-stock' {
    // Always check for out of stock first (0 or negative)
    if (material.on_hand_stock <= 0) {
      return 'out-of-stock';
    }

    // Check if stock is low (below or equal to reorder level)
    const reorderLevel = material.reorder_level ?? 0;
    if (reorderLevel > 0 && material.on_hand_stock <= reorderLevel) {
      return 'low-stock';
    }

    return 'in-stock';
  }

  // ─── Product Items Table Events ─────────────────────────────────────────────

  onItemRemoved(index: number): void {
    this.productItems.splice(index, 1);
    // Re-number items
    this.productItems.forEach((item, i) => {
      item.itemNo = i + 1;
    });
  }

  onItemChanged(event: { index: number; item: LineItem }): void {
    if (event.index >= 0 && event.index < this.productItems.length) {
      this.productItems[event.index] = event.item;
    }
  }

  // ─── Payment Details ─────────────────────────────────────────────────────────

  createEmptyPaymentDetail(): PaymentDetail {
    return {
      method: 'Cash',
      amount: 0,
      terms: '',
      termsDueDate: '',
      referenceNo: '',
      paymentDate: '',
      issuedBy: '',
      ccCharge: '',
      checkNo: '',
      bankName: '',
      bankAccount: '',
      postDated: '',
      downPayment: 0,
      status: 'paid',
    };
  }

  addPaymentDetail(): void {
    this.paymentDetails.push(this.createEmptyPaymentDetail());
  }

  removePaymentDetail(index: number): void {
    if (this.paymentDetails.length <= 1) return;
    this.paymentDetails.splice(index, 1);
  }

  onPaymentMethodChange(index: number): void {
    const payment = this.paymentDetails[index];
    if (!payment) return;
    // Auto-set status
    payment.status = (payment.method === 'Cash' || payment.method === 'GCash' || payment.method === 'Bank Transfer') ? 'paid' : 'unpaid';
    // Clear irrelevant fields
    if (payment.method !== 'Terms' && payment.method !== 'Terms with DP' && payment.method !== 'Installment') {
      payment.terms = '';
      payment.termsDueDate = '';
    }
    if (payment.method !== 'Terms with DP' && payment.method !== 'Installment') {
      payment.downPayment = 0;
    }
    if (payment.method !== 'Cheque') {
      payment.checkNo = '';
      payment.issuedBy = '';
      payment.bankAccount = '';
      payment.postDated = '';
    }
    if (payment.method !== 'Bank Transfer' && payment.method !== 'Cheque') {
      payment.bankName = '';
    }
    if (payment.method !== 'Bank Transfer' && payment.method !== 'Credit Card') {
      payment.referenceNo = '';
    }
    if (payment.method !== 'Credit Card') {
      payment.ccCharge = '';
    }
    if (payment.method !== 'Cash' && payment.method !== 'Credit Card') {
      payment.paymentDate = '';
    }
    // Auto-calculate due date if terms are already filled
    if (payment.terms && (payment.method === 'Terms' || payment.method === 'Terms with DP' || payment.method === 'Installment')) {
      this.onTermsChange(index);
    }
  }

  /**
   * Auto-calculate the Terms Due Date when the user enters number of days.
   * Due date = today + N days (extracted from the terms field).
   */
  onTermsChange(index: number): void {
    const payment = this.paymentDetails[index];
    if (!payment) return;

    // Extract numeric days from the terms field (e.g., "30", "30 days", "60")
    const daysMatch = String(payment.terms ?? '').match(/(\d+)/);
    if (!daysMatch) {
      return; // No numeric value found, don't change due date
    }

    const days = parseInt(daysMatch[1], 10);
    if (!Number.isFinite(days) || days <= 0) {
      return;
    }

    // Calculate due date: today + N days
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + days);

    // Format as YYYY-MM-DD for the date input
    const year = dueDate.getFullYear();
    const month = String(dueDate.getMonth() + 1).padStart(2, '0');
    const day = String(dueDate.getDate()).padStart(2, '0');
    payment.termsDueDate = `${year}-${month}-${day}`;
  }

  shouldShowPaymentField(method: PaymentDetail['method'], field: string): boolean {
    const map: Record<PaymentDetail['method'], string[]> = {
      'Cash': ['amount', 'paymentDate'],
      'GCash': ['amount', 'referenceNo', 'paymentDate'],
      'Bank Transfer': ['amount', 'bankName', 'referenceNo'],
      'Terms': ['amount', 'terms', 'termsDueDate'],
      'Terms with DP': ['amount', 'terms', 'termsDueDate', 'downPayment'],
      'Cheque': ['amount', 'checkNo', 'issuedBy', 'bankName', 'bankAccount', 'postDated'],
      'Credit Card': ['amount', 'ccCharge', 'referenceNo', 'paymentDate'],
      'Installment': ['amount', 'terms', 'termsDueDate', 'downPayment'],
    };
    return map[method]?.includes(field) ?? false;
  }

  // ─── Form Actions ───────────────────────────────────────────────────────────

  async saveAsDraft(): Promise<void> {
    if (!this.validateNonInventoryItems()) return;
    await this.submitForm('draft');
  }

  async createOrder(): Promise<void> {
    if (this.productItems.length === 0) {
      this.validationError = 'At least one product item is required to create an order.';
      return;
    }
    if (!this.validateNonInventoryItems()) return;
    await this.submitForm('pending');
  }

  async completeOrder(): Promise<void> {
    if (this.productItems.length === 0) {
      this.validationError = 'At least one product item is required.';
      return;
    }
    if (!this.validateNonInventoryItems()) return;
    await this.submitFormWithPostComplete('complete');
  }

  /**
   * Complete Order directly from the create form (no orderId yet).
   * Creates the order with status 'complete' and then asks if user wants to print.
   */
  async completeOrderDirect(): Promise<void> {
    if (this.productItems.length === 0) {
      this.validationError = 'At least one product item is required to complete an order.';
      return;
    }
    if (!this.validateNonInventoryItems()) return;
    await this.submitFormWithPostComplete('complete');
  }

  openCancelDialog(): void {
    this.isCancelDialogOpen = true;
  }

  closeCancelDialog(): void {
    this.isCancelDialogOpen = false;
  }

  async confirmCancelOrder(): Promise<void> {
    this.isCancelDialogOpen = false;
    await this.submitForm('voided');
  }

  // ─── Void Order (Admin/SuperAdmin only, requires password) ──────────────────

  openVoidDialog(): void {
    this.voidPassword = '';
    this.voidError = '';
    this.isVoiding = false;
    this.isVoidDialogOpen = true;
  }

  closeVoidDialog(): void {
    this.isVoidDialogOpen = false;
    this.voidPassword = '';
    this.voidError = '';
  }

  async confirmVoidOrder(): Promise<void> {
    if (!this.voidPassword || this.isVoiding) return;

    this.isVoiding = true;
    this.voidError = '';

    try {
      // Verify password using the login endpoint
      const username = this.rbacService.getPayload()?.username ?? '';
      const result = await this.authService.login(username, this.voidPassword);

      if (!result.success) {
        this.voidError = 'Incorrect password. Please try again.';
        this.isVoiding = false;
        return;
      }

      // Password verified — proceed to void the order
      await this.salesOrderMaterialService.updateMaterialSalesOrder(this.orderId!, {
        status: 'voided' as any,
      });

      this.notificationService.success('Success', 'Order has been voided.');
      this.closeVoidDialog();
      this.saved.emit();
    } catch (err: any) {
      const message = err?.response?.data?.message ?? err?.message ?? 'Failed to void order.';
      if (message.toLowerCase().includes('invalid') || message.toLowerCase().includes('unauthorized') || message.toLowerCase().includes('incorrect')) {
        this.voidError = 'Incorrect password. Please try again.';
      } else {
        this.voidError = message;
      }
    } finally {
      this.isVoiding = false;
    }
  }

  /**
   * Validates that all non-inventory items have a valid Rate (> 0) and QTY (>= 1).
   * Returns true if valid, false otherwise (sets validationError).
   */
  private validateNonInventoryItems(): boolean {
    const invalidItems = this.productItems.filter(
      (item) => item.isNonInventory && (item.rate === 0 || item.rate == null || item.qty == null || item.qty < 1),
    );

    if (invalidItems.length > 0) {
      this.validationError =
        'Non-inventory items must have a Rate greater than 0 and a valid QTY.';
      return false;
    }

    this.validationError = '';
    return true;
  }

  /**
   * Validates stock availability for inventory items.
   * Note: With backorder system enabled, quantities exceeding stock are treated as warnings.
   * The backorder system will automatically create negative stock records when order is pending.
   * Returns { warnings: [], errors: [] }
   */
  private validateStockAvailability(): { warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];

    this.productItems.forEach((item) => {
      // Skip non-inventory items
      if (item.isNonInventory) {
        return;
      }

      // Skip items without stock information (e.g., non-inventory or missing data)
      if (item.onHandStock == null) {
        return;
      }

      const stock = item.onHandStock;
      const qty = item.qty;
      const description = item.description;

      // Zero stock - Warning (backorder will be created automatically)
      if (stock === 0) {
        warnings.push(`⚠️ ${description}: No stock on hand. Will be recorded as backorder (negative stock).`);
      }
      // Quantity greater than stock - Warning (backorder will be created automatically)
      else if (qty > stock) {
        const excessQty = qty - stock;
        warnings.push(
          `⚠️ ${description}: Quantity (${qty}) exceeds stock (${stock}). ${excessQty} unit(s) will be recorded as backorder.`,
        );
      }
    });

    return { warnings, errors };
  }

  /**
   * Validates payment setup:
   * - At least one payment method with amount > 0
   * - Total payment amount must equal the grand total of product items
   * - Payment amount cannot exceed the grand total
   * Returns { errors: [] }
   */
  private validatePaymentSetup(): { errors: string[] } {
    const errors: string[] = [];

    // Must have at least one product item
    if (this.productItems.length === 0) {
      errors.push('At least one product item is required.');
      return { errors };
    }

    // Calculate grand total from product items
    const grandTotal = Math.round(
      this.productItems.reduce((sum, item) => {
        const effectiveRate = Math.max((item.rate ?? 0) - (item.discount ?? 0), 0);
        return sum + effectiveRate * (item.qty ?? 0);
      }, 0) * 100
    ) / 100;

    // Check that at least one payment method is configured
    const validPayments = this.paymentDetails.filter((p) => p.method && p.amount > 0);

    if (validPayments.length === 0) {
      errors.push('At least one payment method with amount greater than 0 is required.');
      return { errors };
    }

    // Calculate total payment amount
    const totalPayment = Math.round(
      validPayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0) * 100
    ) / 100;

    // Payment must not exceed grand total
    if (totalPayment > grandTotal) {
      errors.push(`Total payment (₱${totalPayment.toFixed(2)}) exceeds the order total (₱${grandTotal.toFixed(2)}).`);
    }

    // Payment must equal grand total
    if (totalPayment < grandTotal) {
      errors.push(`Total payment (₱${totalPayment.toFixed(2)}) does not cover the order total (₱${grandTotal.toFixed(2)}).`);
    }

    return { errors };
  }

  cancel(): void {
    // If there's draft data and this is a new order, ask to clear
    if (!this.orderId && this.productItems.length > 0) {
      this.isCloseConfirmOpen = true;
    } else {
      this.cancelled.emit();
    }
  }

  isCloseConfirmOpen = false;

  confirmCloseAndClear(): void {
    this.clearDraftStorage();
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

  canPrintQuotationFromForm(): boolean {
    return this.productItems.length > 0;
  }

  async printQuotation(): Promise<void> {
    if (!this.canPrintQuotationFromForm()) {
      this.validationError = 'Add at least one product item to print a quotation.';
      return;
    }

    this.validationError = '';
    this.isPrintLoading = true;
    this.isPrintModalOpen = true;
    this.printPdfUrl = null;

    try {
      const printData = this.buildQuotationPrintData();
      const dataUri = await this.printSalesOrderService.generatePdf(printData, {
        watermark: 'QUOTATION ONLY',
      });
      this.printPdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(dataUri);
    } catch {
      this.notificationService.error('Error', 'Failed to generate quotation PDF.');
      this.isPrintModalOpen = false;
      this.printPdfUrl = null;
    } finally {
      this.isPrintLoading = false;
    }
  }

  closePrintModal(): void {
    this.isPrintModalOpen = false;
    this.printPdfUrl = null;
  }

  private buildQuotationPrintData(): PrintSalesOrderData {
    const payment = this.paymentDetails[0];
    let paymentTerm = '';
    if (payment) {
      paymentTerm =
        payment.method === 'Terms'
          ? `TERMS ${payment.terms || ''} Day(s)`
          : payment.method || '';
    }

    const deliveryDateFormatted = this.deliveryDate
      ? new Date(this.deliveryDate).toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
        })
      : '';

    const soNumber = this.currentSoNumber || this.nextSoNumber || 'DRAFT';
    const totalAmount = Math.round(
      this.productItems.reduce((sum, item) => sum + (item.total ?? 0), 0) * 100,
    ) / 100;

    return {
      dealer: this.customerForm.name || '',
      address: this.customerForm.address || '',
      deliveryDate: deliveryDateFormatted,
      soNumber,
      paymentTerm,
      terms: payment?.terms || '',
      totalAmount,
      items: this.productItems.map((item) => {
        const discount = item.discount ?? 0;
        const effectiveRate = Math.max(item.rate - discount, 0);
        return {
          quantity: item.qty,
          unit: 'pcs',
          description: item.description || '',
          unitPrice: effectiveRate,
          amount: item.total,
        };
      }),
    };
  }

  /**
   * Opens validation modal with warnings and errors.
   * User can proceed despite warnings, but must fix errors.
   */
  private openValidationModal(status: string, warnings: string[], errors: string[]): void {
    this.validationWarnings = warnings;
    this.validationErrors = errors;
    this.pendingSubmissionStatus = status;
    this.isValidationModalOpen = true;
  }

  closeValidationModal(): void {
    this.isValidationModalOpen = false;
    this.validationWarnings = [];
    this.validationErrors = [];
    this.pendingSubmissionStatus = '';
  }

  async proceedWithSubmission(): Promise<void> {
    this.isValidationModalOpen = false;
    if (this.pendingPostComplete) {
      this.pendingPostComplete = false;
      await this.performSubmissionWithPostComplete(this.pendingSubmissionStatus);
    } else {
      await this.performSubmission(this.pendingSubmissionStatus);
    }
  }

  async submitForm(status: string): Promise<void> {
    if (this.isSubmitting) return;
    if (this.isFormReadonly) {
      this.validationError = 'Only Super Admin can update a completed order.';
      return;
    }

    this.isSubmitting = true;
    this.validationError = '';

    try {
      // Validate non-inventory items
      if (!this.validateNonInventoryItems()) {
        this.isSubmitting = false;
        return;
      }

      // Skip stock and payment validation for draft status
      const isDraft = status === 'draft';

      if (!isDraft) {
        // Validate stock availability
        const { warnings: stockWarnings, errors: stockErrors } = this.validateStockAvailability();

        // Validate payment setup
        const { errors: paymentErrors } = this.validatePaymentSetup();

        // Combine all errors
        const allErrors = [...stockErrors, ...paymentErrors];

        // If there are warnings or errors, show modal
        if (allErrors.length > 0 || stockWarnings.length > 0) {
          this.isSubmitting = false;
          this.openValidationModal(status, stockWarnings, allErrors);
          return;
        }
      }

      // No issues, proceed with submission
      await this.performSubmission(status);
      this.clearDraftStorage();
    } finally {
      this.isSubmitting = false;
    }
  }

  private async performSubmission(status: string): Promise<void> {
    try {
      const payload = this.buildPayload(status);

      if (this.orderId) {
        await this.salesOrderMaterialService.updateMaterialSalesOrder(this.orderId, payload);
        this.notificationService.success('Success', 'Sales order updated successfully.');
      } else {
        await this.salesOrderMaterialService.createMaterialSalesOrder(payload);
        this.notificationService.success('Success', 'Sales order created successfully.');
      }

      this.clearDraftStorage();
      this.saved.emit();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ?? error?.message ?? 'An unexpected error occurred. Please try again later.';
      this.notificationService.error('Error', message);
      this.isSubmitting = false;
    }
  }

  /**
   * Submit form specifically for "Complete Order" flow.
   * On success, shows the post-complete print dialog instead of navigating away.
   */
  async submitFormWithPostComplete(status: string): Promise<void> {
    if (this.isSubmitting) return;
    if (this.isFormReadonly) {
      this.validationError = 'Only Super Admin can update a completed order.';
      return;
    }

    this.isSubmitting = true;
    this.validationError = '';

    try {
      if (!this.validateNonInventoryItems()) {
        this.isSubmitting = false;
        return;
      }

      const isDraft = status === 'draft';

      if (!isDraft) {
        const { warnings: stockWarnings, errors: stockErrors } = this.validateStockAvailability();
        const { errors: paymentErrors } = this.validatePaymentSetup();
        const allErrors = [...stockErrors, ...paymentErrors];

        if (allErrors.length > 0 || stockWarnings.length > 0) {
          this.isSubmitting = false;
          this.pendingPostComplete = true;
          this.openValidationModal(status, stockWarnings, allErrors);
          return;
        }
      }

      await this.performSubmissionWithPostComplete(status);
    } finally {
      this.isSubmitting = false;
    }
  }

  private async performSubmissionWithPostComplete(status: string): Promise<void> {
    try {
      const payload = this.buildPayload(status);

      let resultOrderId: number | null = null;

      if (this.orderId) {
        await this.salesOrderMaterialService.updateMaterialSalesOrder(this.orderId, payload);
        resultOrderId = this.orderId;
      } else {
        const result = await this.salesOrderMaterialService.createMaterialSalesOrder(payload);
        resultOrderId = result?.data?.salesOrderId ?? null;
      }

      this.notificationService.success('Success', 'Order completed successfully.');
      this.completedOrderId = resultOrderId;
      this.isPostCompleteDialogOpen = true;
      this.clearDraftStorage();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ?? error?.message ?? 'An unexpected error occurred. Please try again later.';
      this.notificationService.error('Error', message);
      this.isSubmitting = false;
    }
  }

  // ─── Post-Complete Print Dialog ─────────────────────────────────────────────

  /** Flag to track if we should use post-complete flow after validation modal proceed. */
  private pendingPostComplete = false;

  closePostCompleteDialog(): void {
    this.isPostCompleteDialogOpen = false;
    this.completedOrderId = null;
    this.clearDraftStorage();
    this.saved.emit();
  }

  async printAfterComplete(): Promise<void> {
    this.isPostCompleteDialogOpen = false;

    if (!this.completedOrderId) {
      this.clearDraftStorage();
      this.saved.emit();
      return;
    }

    // Open print preview
    this.isPrintLoading = true;
    this.isPrintModalOpen = true;
    this.printPdfUrl = null;

    try {
      const order = await this.salesOrderMaterialService.getMaterialSalesOrderById(this.completedOrderId);
      const printData = this.buildReceiptPrintData(order);
      const dataUri = await this.printSalesOrderService.generatePdf(printData);
      this.printPdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(dataUri);
    } catch {
      this.notificationService.error('Error', 'Failed to generate print PDF.');
      this.isPrintModalOpen = false;
      this.printPdfUrl = null;
      this.clearDraftStorage();
      this.saved.emit();
    } finally {
      this.isPrintLoading = false;
    }
  }

  private buildReceiptPrintData(order: any): PrintSalesOrderData {
    let paymentTerm = '';
    if (order.paymentDetails && order.paymentDetails.length > 0) {
      const payment = order.paymentDetails[0];
      if (payment.method === 'Terms') {
        paymentTerm = `TERMS ${payment.terms || ''} Day(s)`;
      } else {
        paymentTerm = payment.method || '';
      }
    }

    const deliveryDateSource = order.deliveryDate ?? order.scheduleDate;
    const deliveryDate = deliveryDateSource
      ? new Date(deliveryDateSource).toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
        })
      : '';

    return {
      dealer: order.customerName || '',
      address: order.customerAddress || '',
      deliveryDate,
      soNumber: order.soNumber || '',
      paymentTerm,
      terms: order.paymentDetails?.[0]?.terms || '',
      totalAmount: order.totalAmount || 0,
      items: (order.productItems || []).map((item: any) => {
        const discount = item.discount ?? 0;
        const effectiveRate = Math.max(item.rate - discount, 0);
        return {
          quantity: item.qty,
          unit: 'pcs',
          description: item.description || '',
          unitPrice: effectiveRate,
          amount: item.total,
        };
      }),
    };
  }

  private buildPayload(status: string): CreateMaterialSalesOrderPayload {
    // For new orders, salesType is always "sales".
    // For edits, preserve the original salesType (Requirement 3.3).
    const salesType = this.orderId ? this.originalSalesType : 'sales';

    const payload: CreateMaterialSalesOrderPayload = {
      deliveryDate: this.deliveryDate,
      salesType,
      status: status as 'draft' | 'pending',
      productItems: this.productItems.map((item) => ({
        materialId: item.materialId != null ? Number(item.materialId) : null,
        description: item.description,
        itemCode: item.itemCode ?? null,
        brand: item.brand ?? null,
        cost: item.cost,
        rate: item.rate,
        discount: item.discount ?? 0,
        qty: item.qty,
        isNonInventory: item.isNonInventory,
      })),
      paymentDetails: this.paymentDetails,
      remarks: this.remarks || undefined,
    };

    // Customer info
    if (this.selectedCustomerId) {
      payload.customer_id = this.selectedCustomerId;
    }
    if (this.customerForm.name) {
      payload.customer = {
        name: this.customerForm.name,
        address: this.customerForm.address || undefined,
        contact_person: this.customerForm.contact_person || undefined,
        contact_number: this.customerForm.contact_number || undefined,
      };
    }

    // NOTE: salesType is always "sales" — no Sales Type field in UI
    // NOTE: installer is intentionally omitted from payload

    return payload;
  }

  // ─── Edit Mode ──────────────────────────────────────────────────────────────

  private async loadExistingOrder(): Promise<void> {
    if (!this.orderId) return;

    try {
      const order = await this.salesOrderMaterialService.getMaterialSalesOrderById(this.orderId);

      // Preserve original salesType for edit mode (Requirement 3.3)
      this.originalSalesType = order.salesType || 'sales';

      // Set current SO number for display
      this.currentSoNumber = order.soNumber ?? '';

      // Delivery date: non-admin always resets to today
      const scheduleDate = order.deliveryDate ?? order.scheduleDate;
      if (this.isAdmin && scheduleDate) {
        this.deliveryDate = scheduleDate.split('T')[0];
      } else {
        this.resetDeliveryDate();
      }

      // Customer
      if (order.customerId) {
        this.selectedCustomerId = order.customerId;
        this.customerSearch = order.customerName ?? '';
        this.customerForm.name = order.customerName ?? '';
        this.customerForm.address = order.customerAddress ?? '';
        this.customerForm.contact_person = order.customerContactPerson ?? '';
        this.customerForm.contact_number = order.customerContactNumber ?? '';
      }

      // Product items
      this.productItems = (order.productItems ?? []).map((item, index) => ({
        id: item.id,
        itemNo: index + 1,
        description: item.description,
        itemCode: item.itemCode,
        brand: item.brand,
        cost: item.cost,
        rate: item.rate,
        discount: item.discount ?? 0,
        qty: item.qty,
        total: item.total,
        materialId: item.materialId,
        isNonInventory: item.isNonInventory,
        onHandStock: item.onHandStock ?? undefined,
        reorderLevel: item.reorderLevel ?? undefined,
      }));

      // Order status
      this.orderStatus = order.status ?? '';

      // Payment details
      this.paymentDetails = (order.paymentDetails ?? []).length > 0
        ? order.paymentDetails
        : [this.createEmptyPaymentDetail()];

      // Remarks
      this.remarks = order.remarks ?? '';
    } catch (error: any) {
      this.notificationService.error('Error', 'Failed to load sales order details.');
    }
  }
}
