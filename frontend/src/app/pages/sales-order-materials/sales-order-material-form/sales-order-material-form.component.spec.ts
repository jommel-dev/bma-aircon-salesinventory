import { SalesOrderMaterialFormComponent } from './sales-order-material-form.component';
import { RbacService } from '../../../shared/services/rbac.service';
import { SalesOrderService } from '../../../shared/services/sales-order.service';
import { SalesOrderMaterialService } from '../../../shared/services/sales-order-material.service';
import { NotificationService } from '../../../shared/services/notification.service';

describe('SalesOrderMaterialFormComponent - Non-Inventory Item Handling', () => {
  let component: SalesOrderMaterialFormComponent;
  let mockRbacService: jasmine.SpyObj<RbacService>;
  let mockSalesOrderService: jasmine.SpyObj<SalesOrderService>;
  let mockSalesOrderMaterialService: jasmine.SpyObj<SalesOrderMaterialService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;

  beforeEach(() => {
    mockRbacService = jasmine.createSpyObj('RbacService', ['isAdminOrSuperAdmin']);
    mockRbacService.isAdminOrSuperAdmin.and.returnValue(true);

    mockSalesOrderService = jasmine.createSpyObj('SalesOrderService', ['getCustomers']);
    mockSalesOrderService.getCustomers.and.returnValue(Promise.resolve([]));

    mockSalesOrderMaterialService = jasmine.createSpyObj('SalesOrderMaterialService', [
      'searchMaterials',
      'createMaterialSalesOrder',
      'updateMaterialSalesOrder',
      'getMaterialSalesOrderById',
    ]);

    mockNotificationService = jasmine.createSpyObj('NotificationService', ['success', 'error']);

    component = new SalesOrderMaterialFormComponent(
      mockRbacService,
      mockSalesOrderService,
      mockSalesOrderMaterialService,
      mockNotificationService,
    );
  });

  describe('addNonInventoryItem', () => {
    it('should add a non-inventory item with the search query as description', () => {
      component.materialSearchQuery = 'Custom Item XYZ';
      component.addNonInventoryItem();

      expect(component.productItems.length).toBe(1);
      expect(component.productItems[0].description).toBe('Custom Item XYZ');
      expect(component.productItems[0].isNonInventory).toBeTrue();
    });

    it('should set isNonInventory = true on the line item', () => {
      component.materialSearchQuery = 'External Material';
      component.addNonInventoryItem();

      expect(component.productItems[0].isNonInventory).toBeTrue();
    });

    it('should set default rate to 0 and qty to 1', () => {
      component.materialSearchQuery = 'Some Item';
      component.addNonInventoryItem();

      expect(component.productItems[0].rate).toBe(0);
      expect(component.productItems[0].qty).toBe(1);
      expect(component.productItems[0].total).toBe(0);
    });

    it('should set materialId to null for non-inventory items', () => {
      component.materialSearchQuery = 'Non-catalog item';
      component.addNonInventoryItem();

      expect(component.productItems[0].materialId).toBeNull();
    });

    it('should show validation error when description is empty', () => {
      component.materialSearchQuery = '';
      component.addNonInventoryItem();

      expect(component.productItems.length).toBe(0);
      expect(component.nonInventoryValidationError).toBe(
        'Description is required to add a non-inventory item.',
      );
    });

    it('should show validation error when description is only whitespace', () => {
      component.materialSearchQuery = '   ';
      component.addNonInventoryItem();

      expect(component.productItems.length).toBe(0);
      expect(component.nonInventoryValidationError).toBe(
        'Description is required to add a non-inventory item.',
      );
    });

    it('should show validation error when description exceeds 255 characters', () => {
      component.materialSearchQuery = 'A'.repeat(256);
      component.addNonInventoryItem();

      expect(component.productItems.length).toBe(0);
      expect(component.nonInventoryValidationError).toBe(
        'Description must be between 1 and 255 characters.',
      );
    });

    it('should accept description with exactly 255 characters', () => {
      component.materialSearchQuery = 'B'.repeat(255);
      component.addNonInventoryItem();

      expect(component.productItems.length).toBe(1);
      expect(component.productItems[0].description.length).toBe(255);
      expect(component.nonInventoryValidationError).toBe('');
    });

    it('should clear search state after adding non-inventory item', () => {
      component.materialSearchQuery = 'Test Item';
      component.materialSearchResults = [];
      component.isMaterialDropdownOpen = true;
      component.materialSearchNoResults = true;

      component.addNonInventoryItem();

      expect(component.materialSearchQuery).toBe('');
      expect(component.isMaterialDropdownOpen).toBeFalse();
      expect(component.materialSearchNoResults).toBeFalse();
    });

    it('should trim the description before adding', () => {
      component.materialSearchQuery = '  Trimmed Item  ';
      component.addNonInventoryItem();

      expect(component.productItems[0].description).toBe('Trimmed Item');
    });

    it('should assign correct itemNo based on existing items count', () => {
      component.materialSearchQuery = 'Item 1';
      component.addNonInventoryItem();
      component.materialSearchQuery = 'Item 2';
      component.addNonInventoryItem();

      expect(component.productItems[0].itemNo).toBe(1);
      expect(component.productItems[1].itemNo).toBe(2);
    });
  });

  describe('validateNonInventoryItems (via createOrder/saveAsDraft)', () => {
    it('should prevent createOrder when non-inventory item has rate = 0', async () => {
      component.materialSearchQuery = 'Test Item';
      component.addNonInventoryItem();
      // rate is 0 by default

      await component.createOrder();

      expect(component.validationError).toBe(
        'Non-inventory items must have a Rate greater than 0 and a valid QTY.',
      );
      expect(mockSalesOrderMaterialService.createMaterialSalesOrder).not.toHaveBeenCalled();
    });

    it('should prevent saveAsDraft when non-inventory item has rate = 0', async () => {
      component.materialSearchQuery = 'Test Item';
      component.addNonInventoryItem();
      // rate is 0 by default

      await component.saveAsDraft();

      expect(component.validationError).toBe(
        'Non-inventory items must have a Rate greater than 0 and a valid QTY.',
      );
      expect(mockSalesOrderMaterialService.createMaterialSalesOrder).not.toHaveBeenCalled();
    });

    it('should allow createOrder when non-inventory item has valid rate and qty', async () => {
      component.materialSearchQuery = 'Valid Item';
      component.addNonInventoryItem();
      component.productItems[0].rate = 10.5;
      component.productItems[0].qty = 2;
      component.productItems[0].total = 21;

      mockSalesOrderMaterialService.createMaterialSalesOrder.and.returnValue(
        Promise.resolve({ success: true }),
      );

      await component.createOrder();

      expect(component.validationError).toBe('');
      expect(mockSalesOrderMaterialService.createMaterialSalesOrder).toHaveBeenCalled();
    });

    it('should not validate inventory items with rate = 0', async () => {
      // Add an inventory item with rate = 0 (edge case, but should not trigger non-inventory validation)
      component.productItems.push({
        itemNo: 1,
        description: 'Inventory Item',
        itemCode: 'IC001',
        brand: 'Brand',
        cost: 5,
        rate: 0,
        qty: 1,
        total: 0,
        materialId: 1,
        isNonInventory: false,
      });

      mockSalesOrderMaterialService.createMaterialSalesOrder.and.returnValue(
        Promise.resolve({ success: true }),
      );

      await component.createOrder();

      // Should pass non-inventory validation (the item is not non-inventory)
      expect(component.validationError).toBe('');
    });
  });
});
