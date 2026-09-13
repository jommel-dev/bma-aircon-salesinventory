import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from 'src/database/database.service';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: DatabaseService, useValue: { query } },
      ],
    }).compile();
    service = module.get(SearchService);
  });

  it('returns empty results for queries shorter than 2 characters', async () => {
    const result = await service.search('a');
    expect(result).toEqual({ success: true, items: [] });
    expect(query).not.toHaveBeenCalled();
  });

  it('groups sales orders, POs, materials, customers, and product items', async () => {
    query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('FROM tblsales_order so') && text.includes('LEFT JOIN tblcustomer')) {
        return {
          rows: [
            {
              id: 10,
              so_number: '2026-3315',
              status: 'pending',
              customer_name: 'SAM A&G',
              has_material_items: true,
            },
          ],
        };
      }
      if (text.includes('FROM tblpurchase_orders po')) {
        return {
          rows: [
            {
              id: 20,
              po_number: '2026-0131',
              status: 'complete',
              vendor_name: 'Copper Supply',
              po_type: 'ACM',
            },
          ],
        };
      }
      if (text.includes('FROM tblmaterials m')) {
        return {
          rows: [
            {
              id: 114,
              material_code: 'CT0005',
              material_name: 'Copper Tube',
              brand_id: 3,
              brand_name: 'Copper',
              product_type_id: 2,
            },
          ],
        };
      }
      if (text.includes('FROM tblcustomer c')) {
        return {
          rows: [{ id: '16399', name: 'SAM A&G SERVICES', contact_person: 'Ana', contact_number: '09' }],
        };
      }
      if (text.includes('FROM tblsales_order_items soi')) {
        return {
          rows: [
            {
              id: 88,
              description: '3/4 Copper Tube',
              item_code: 'CT0005',
              sales_order_id: 10,
              so_number: '2026-3315',
              has_material_items: true,
            },
          ],
        };
      }
      if (text.includes('FROM tblproducts p')) {
        return { rows: [{ id: 7, product_name: 'Inverter 1.0HP', brand_name: 'Koppel' }] };
      }
      return { rows: [] };
    });

    const result = await service.search('copper');

    expect(result.success).toBe(true);
    expect(result.items.map((item) => item.type)).toEqual([
      'sales-order',
      'purchase-order',
      'material',
      'customer',
      'product-item',
      'product-item',
    ]);
    expect(result.items[0].title).toBe('SO #2026-3315');
    expect(result.items[0].route).toContain('/sales-order-materials/edit/10');
    expect(result.items[1].title).toBe('PO #2026-0131');
    expect(result.items[2].title).toBe('CT0005');
    expect(result.items[3].title).toBe('SAM A&G SERVICES');
  });
});
