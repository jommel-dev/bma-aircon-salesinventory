import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RbacService } from '../../../shared/services/rbac.service';
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
import { ProductItemsTableComponent } from '../product-items-table/product-items-table.component';

@Component({
  selector: 'app-sales-order-material-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ProductItemsTableComponent],
  templateUrl: './sales-order-material-form.component.html',
})
export class SalesOrderMaterialFormComponent implements OnInit {
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

  private customerDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private materialSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs = 300;

  constructor(
    private readonly rbacService: RbacService,
    private readonly salesOrderService: SalesOrderService,
    private readonly salesOrderMaterialService: SalesOrderMaterialService,
    private readonly notificationService: NotificationService,
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.rbacService.isAdminOrSuperAdmin();
    this.resetDeliveryDate();
    this.paymentDetails = [this.createEmptyPaymentDetail()];

    void this.loadCustomerOptions();

    if (this.orderId) {
      void this.loadExistingOrder();
    } else {
      void this.loadNextSoNumber();
    }
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
    await this.submitForm('complete');
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

      const stock = item.onHandStock ?? 0;
      const qty = item.qty;
      const description = item.description;

      // Zero stock - Warning
      if (stock === 0) {
        warnings.push(`⚠️ ${description}: No stock on hand. Can be considered to buy from other supplier (negative stock).`);
      }
      // Quantity greater than stock - Error
      else if (qty > stock) {
        errors.push(`❌ ${description}: Quantity (${qty}) is greater than stock on hand (${stock}).`);
      }
    });

    return { warnings, errors };
  }

  /**
   * Validates payment setup - only one payment method should be used.
   * Returns { errors: [] }
   */
  private validatePaymentSetup(): { errors: string[] } {
    const errors: string[] = [];

    // Check that at least one payment method is configured
    const validPayments = this.paymentDetails.filter((p) => p.method && p.amount > 0);

    if (validPayments.length === 0) {
      errors.push('At least one payment method with amount greater than 0 is required.');
    }

    // Check that only one payment method is selected
    if (validPayments.length > 1) {
      errors.push('Only one payment method should be selected per sales order.');
    }

    return { errors };
  }

  cancel(): void {
    this.cancelled.emit();
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
    await this.performSubmission(this.pendingSubmissionStatus);
  }

  async submitForm(status: string): Promise<void> {
    if (this.isSubmitting) return;

    this.isSubmitting = true;
    this.validationError = '';

    try {
      // Validate non-inventory items
      if (!this.validateNonInventoryItems()) {
        this.isSubmitting = false;
        return;
      }

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

      // No issues, proceed with submission
      await this.performSubmission(status);
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

      this.saved.emit();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ?? error?.message ?? 'An unexpected error occurred. Please try again later.';
      this.notificationService.error('Error', message);
      this.isSubmitting = false;
    }
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
      if (this.isAdmin && order.scheduleDate) {
        this.deliveryDate = order.scheduleDate.split('T')[0];
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
