import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  SalesOrderService,
  SalesCustomerOption,
} from '../../../shared/services/sales-order.service';
import {
  LineItem,
  MaterialSearchResult,
  SalesOrderMaterialService,
  MaterialSalesOrderDetail,
} from '../../../shared/services/sales-order-material.service';
import { QuotationService } from '../../../shared/services/quotation.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { QuotationPdfService } from '../../../shared/services/quotation-pdf.service';
import { BusinessSettingsService } from '../../../shared/services/business-settings.service';
import { ProductItemsTableComponent } from '../../sales-order-materials/product-items-table/product-items-table.component';

@Component({
  selector: 'app-quotation-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ProductItemsTableComponent],
  templateUrl: './quotation-form.component.html',
})
export class QuotationFormComponent implements OnInit {
  /** When set, the form operates in edit mode and loads existing quotation data. */
  @Input() orderId?: number;

  /** Emitted after a successful save (create or update). */
  @Output() saved = new EventEmitter<void>();

  /** Emitted when the user cancels or closes the form. */
  @Output() cancelled = new EventEmitter<void>();

  // ─── Quote Date & Validity ──────────────────────────────────────────────────
  quoteDate = '';
  validityDays = 14;

  // ─── Customer Selection ─────────────────────────────────────────────────────
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

  // ─── Product Items ──────────────────────────────────────────────────────────
  productItems: LineItem[] = [];

  // ─── Form State ─────────────────────────────────────────────────────────────
  remarks = '';
  isSubmitting = false;
  validationError = '';

  // ─── Quotation Print Preview ────────────────────────────────────────────────
  isPrintModalOpen = false;
  printPdfUrl: SafeResourceUrl | null = null;
  isPrintLoading = false;

  /** Validation error specific to non-inventory item addition. */
  nonInventoryValidationError = '';

  private customerDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private materialSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs = 300;

  constructor(
    private readonly salesOrderService: SalesOrderService,
    private readonly salesOrderMaterialService: SalesOrderMaterialService,
    private readonly quotationService: QuotationService,
    private readonly notificationService: NotificationService,
    private readonly quotationPdfService: QuotationPdfService,
    private readonly businessSettingsService: BusinessSettingsService,
    private readonly sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.quoteDate = this.getTodayDate();
    void this.loadCustomerOptions();

    if (this.orderId) {
      void this.loadExistingOrder();
    }
  }

  // ─── Quote Date Logic ───────────────────────────────────────────────────────

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  onQuoteDateChange(value: string): void {
    this.quoteDate = value;
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
    this.productItems.forEach((item, i) => {
      item.itemNo = i + 1;
    });
  }

  onItemChanged(event: { index: number; item: LineItem }): void {
    if (event.index >= 0 && event.index < this.productItems.length) {
      this.productItems[event.index] = event.item;
    }
  }

  // ─── Computed ───────────────────────────────────────────────────────────────

  get totalAmount(): number {
    return Math.round(
      this.productItems.reduce((sum, item) => sum + (item.total ?? 0), 0) * 100,
    ) / 100;
  }

  // ─── Form Actions ───────────────────────────────────────────────────────────

  async saveDraft(): Promise<void> {
    if (this.isSubmitting) return;

    if (!this.validateForm()) return;

    this.isSubmitting = true;
    this.validationError = '';

    try {
      const payload = this.buildQuotationPayload();

      if (this.orderId) {
        const result = await this.quotationService.updateQuotation(this.orderId, payload);
        if (!result.success) {
          this.notificationService.error('Error', result.message || 'Failed to update quotation.');
          return;
        }
        this.notificationService.success('Success', 'Quotation updated successfully.');
      } else {
        const result = await this.quotationService.createQuotation(payload);
        if (!result.success) {
          this.notificationService.error('Error', result.message || 'Failed to create quotation.');
          return;
        }
        this.notificationService.success('Success', 'Quotation saved as draft.');
      }

      this.saved.emit();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ?? error?.message ?? 'An unexpected error occurred.';
      this.notificationService.error('Error', message);
    } finally {
      this.isSubmitting = false;
    }
  }

  async previewQuotation(): Promise<void> {
    if (this.productItems.length === 0) {
      this.validationError = 'Add at least one product item to preview the quotation.';
      return;
    }

    this.validationError = '';
    this.isPrintLoading = true;
    this.isPrintModalOpen = true;
    this.printPdfUrl = null;

    try {
      // Build a MaterialSalesOrderDetail-like object from form data
      const orderData = this.buildOrderDetailForPreview();
      const businessProfile = await this.businessSettingsService.getBusinessProfile();
      const dataUri = await this.quotationPdfService.generateQuotationPdf(orderData, businessProfile);
      this.printPdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(dataUri);
    } catch (err: any) {
      const message = err?.message ?? 'Failed to generate quotation PDF.';
      this.notificationService.error('Error', message);
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

  cancel(): void {
    this.cancelled.emit();
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private validateForm(): boolean {
    // Validate non-inventory items have valid Rate and QTY
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

  private buildQuotationPayload(): any {
    const payload: any = {
      quoteDate: this.quoteDate,
      validityDays: this.validityDays,
      status: 'draft',
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
      totalAmount: this.totalAmount,
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

    return payload;
  }

  /**
   * Builds a MaterialSalesOrderDetail-compatible object from current form data
   * for use with QuotationPdfService.generateQuotationPdf().
   */
  private buildOrderDetailForPreview(): MaterialSalesOrderDetail {
    return {
      id: this.orderId ?? 0,
      soNumber: null,
      customerId: this.selectedCustomerId,
      customerName: this.customerForm.name || null,
      customerAddress: this.customerForm.address || null,
      customerContactPerson: this.customerForm.contact_person || null,
      customerContactNumber: this.customerForm.contact_number || null,
      totalAmount: this.totalAmount,
      status: 'draft',
      salesType: 'quotation',
      scheduleDate: this.quoteDate,
      deliveryDate: this.quoteDate,
      remarks: this.remarks || null,
      createdAt: this.quoteDate,
      productItems: this.productItems.map((item, index) => ({
        id: item.id ?? index + 1,
        materialId: item.materialId ?? null,
        description: item.description,
        itemCode: item.itemCode ?? null,
        brand: item.brand ?? null,
        cost: item.cost,
        rate: item.rate,
        discount: item.discount ?? 0,
        qty: item.qty,
        total: item.total ?? 0,
        isNonInventory: item.isNonInventory,
      })),
      paymentDetails: [],
    };
  }

  // ─── Edit Mode ──────────────────────────────────────────────────────────────

  private async loadExistingOrder(): Promise<void> {
    if (!this.orderId) return;

    try {
      const quotation = await this.quotationService.getQuotationById(this.orderId);
      if (!quotation) {
        this.notificationService.error('Error', 'Quotation not found.');
        this.cancelled.emit();
        return;
      }

      // Populate quote date
      this.quoteDate = quotation.quoteDate?.split('T')[0] ?? this.getTodayDate();
      this.validityDays = quotation.validityDays ?? 14;

      // Populate customer info
      this.customerSearch = quotation.customerName ?? '';
      if (quotation.customerId) {
        this.selectedCustomerId = quotation.customerId;
      }
      this.customerForm.name = quotation.customerName ?? '';
      this.customerForm.address = quotation.customerAddress ?? '';
      this.customerForm.contact_person = quotation.customerContactPerson ?? '';
      this.customerForm.contact_number = quotation.customerContactNumber ?? '';

      // Populate product items from quotation items
      this.productItems = (quotation.productItems ?? []).map((item, index) => {
        // Prefer the dedicated materialId field, then fall back to legacy remarks metadata.
        let metadata: any = {};
        try {
          if (item.remarks && item.remarks.startsWith('{')) {
            metadata = JSON.parse(item.remarks);
          }
        } catch { /* not JSON, use as-is */ }

        const materialId = item.materialId ?? (metadata.materialId ? Number(metadata.materialId) : null);
        const isMaterial = materialId != null || metadata.type === 'material';

        return {
          id: item.id,
          itemNo: index + 1,
          description: isMaterial ? (metadata.description || item.productName || '') : (item.productName || ''),
          itemCode: metadata.itemCode ?? null,
          brand: metadata.brand ?? null,
          cost: item.unitPrice ?? 0,
          rate: item.sellPrice ?? 0,
          discount: item.discountPrice ?? 0,
          qty: item.totalSetQty ?? 0,
          total: item.lineTotal ?? 0,
          materialId,
          isNonInventory: metadata.isNonInventory ?? false,
        };
      });

      // Populate remarks
      this.remarks = quotation.remarks ?? '';
    } catch (error: any) {
      const message =
        error?.response?.data?.message ?? error?.message ?? 'Failed to load quotation.';
      this.notificationService.error('Error', message);
      this.cancelled.emit();
    }
  }
}
