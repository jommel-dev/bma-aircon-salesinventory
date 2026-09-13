import { QuotationComponent } from './quotation.component';
import { QuotationListItem, QuotationService } from '../../shared/services/quotation.service';
import { Router } from '@angular/router';
import { BusinessSettingsService } from '../../shared/services/business-settings.service';
import { RbacService } from '../../shared/services/rbac.service';
import { DomSanitizer } from '@angular/platform-browser';
import { QuotationPdfService } from '../../shared/services/quotation-pdf.service';

describe('QuotationComponent – Wave 2 convert visibility', () => {
  let component: QuotationComponent;
  let quotationService: jasmine.SpyObj<QuotationService>;
  let router: jasmine.SpyObj<Router>;

  const quote = (overrides: Partial<QuotationListItem> = {}): QuotationListItem => ({
    id: 12,
    quoteNo: 'Q-12',
    quoteDate: '2026-09-12',
    customerId: '5',
    customerName: 'Acme',
    totalAmount: 1000,
    status: 'finalized',
    ...overrides,
  });

  beforeEach(() => {
    quotationService = jasmine.createSpyObj('QuotationService', [
      'convertToSalesOrder',
      'listQuotations',
    ]);
    quotationService.listQuotations.and.returnValue(
      Promise.resolve({
        items: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 1 },
      }),
    );
    router = jasmine.createSpyObj('Router', ['navigate']);
    router.navigate.and.returnValue(Promise.resolve(true));

    component = new QuotationComponent(
      quotationService,
      {} as BusinessSettingsService,
      {} as RbacService,
      {} as DomSanitizer,
      router,
      {} as QuotationPdfService,
    );
  });

  it('navigates to the material SO editor when convert returns material lines', async () => {
    quotationService.convertToSalesOrder.and.returnValue(
      Promise.resolve({
        success: true,
        data: {
          salesOrderId: 88,
          soNumber: '2026-88',
          hasMaterialItems: true,
        },
      }),
    );

    await component.convertToSalesOrder(quote());

    expect(component.uiMessage).toContain('Pending tab');
    expect(component.uiMessage).toContain('2026-88');
    expect(router.navigate).toHaveBeenCalledWith(['/users/sales-order-materials/edit', 88]);
  });

  it('stays on the quotation list when convert is AC-only', async () => {
    quotationService.convertToSalesOrder.and.returnValue(
      Promise.resolve({
        success: true,
        data: {
          salesOrderId: 89,
          soNumber: '2026-89',
          hasMaterialItems: false,
        },
      }),
    );

    await component.convertToSalesOrder(quote());

    expect(component.uiMessage).toContain('Pending tab');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
