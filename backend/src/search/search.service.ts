import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

export type GlobalSearchType =
  | 'sales-order'
  | 'purchase-order'
  | 'material'
  | 'customer'
  | 'product-item';

export interface GlobalSearchItem {
  type: GlobalSearchType;
  id: string;
  title: string;
  subtitle: string;
  route: string;
  status?: string;
}

@Injectable()
export class SearchService {
  constructor(private readonly databaseService: DatabaseService) {}

  async search(rawQuery: string): Promise<{ success: boolean; items: GlobalSearchItem[] }> {
    const query = String(rawQuery ?? '').trim();
    if (query.length < 2) {
      return { success: true, items: [] };
    }

    const like = `%${query}%`;
    const limit = 5;

    const [salesOrders, purchaseOrders, materials, customers, productItems] = await Promise.all([
      this.searchSalesOrders(like, limit),
      this.searchPurchaseOrders(like, limit),
      this.searchMaterials(like, limit),
      this.searchCustomers(like, limit),
      this.searchProductItems(like, limit),
    ]);

    return {
      success: true,
      items: [...salesOrders, ...purchaseOrders, ...materials, ...customers, ...productItems],
    };
  }

  private async searchSalesOrders(like: string, limit: number): Promise<GlobalSearchItem[]> {
    try {
      const result = await this.databaseService.query<{
        id: number;
        so_number: string | null;
        status: string | null;
        customer_name: string | null;
        has_material_items: boolean;
      }>(
        `SELECT
           so.id,
           COALESCE(so.so_number, '') AS so_number,
           COALESCE(so.status, '') AS status,
           COALESCE(c.name, '') AS customer_name,
           EXISTS (
             SELECT 1 FROM tblsales_order_items soi WHERE soi.sales_order_id = so.id
           ) AS has_material_items
         FROM tblsales_order so
         LEFT JOIN tblcustomer c
           ON c.id::text = COALESCE(to_jsonb(so)->>'customer_id', to_jsonb(so)->>'customerId')
         WHERE (to_jsonb(so)->>'deleted_at') IS NULL
           AND (
             COALESCE(so.so_number, '') ILIKE $1
             OR COALESCE(c.name, '') ILIKE $1
             OR so.id::text ILIKE $1
           )
         ORDER BY so.id DESC
         LIMIT $2`,
        [like, limit],
      );

      return result.rows.map((row) => {
        const soNumber = String(row.so_number ?? '').trim() || String(row.id);
        const isMaterial = Boolean(row.has_material_items);
        return {
          type: 'sales-order' as const,
          id: String(row.id),
          title: `SO #${soNumber}`,
          subtitle: String(row.customer_name ?? '').trim() || (isMaterial ? 'Material sales order' : 'Sales order'),
          route: isMaterial
            ? `/users/sales-order-materials/edit/${row.id}`
            : `/users/sales-order?editId=${row.id}`,
          status: String(row.status ?? '').trim() || undefined,
        };
      });
    } catch {
      return [];
    }
  }

  private async searchPurchaseOrders(like: string, limit: number): Promise<GlobalSearchItem[]> {
    try {
      const result = await this.databaseService.query<{
        id: number;
        po_number: string | null;
        status: string | null;
        vendor_name: string | null;
        po_type: string | null;
      }>(
        `SELECT
           po.id,
           COALESCE(po.po_number::text, '') AS po_number,
           COALESCE(po.status, '') AS status,
           COALESCE(v.name, '') AS vendor_name,
           UPPER(COALESCE(
             to_jsonb(po)->>'po_type',
             to_jsonb(po)->>'poType',
             'ACU'
           )) AS po_type
         FROM tblpurchase_orders po
         LEFT JOIN tblvendors v ON v.id::text = po.vendor_id::text
         WHERE COALESCE(po.po_number::text, '') ILIKE $1
            OR COALESCE(v.name, '') ILIKE $1
            OR po.id::text ILIKE $1
         ORDER BY po.id DESC
         LIMIT $2`,
        [like, limit],
      );

      return result.rows.map((row) => {
        const poNumber = String(row.po_number ?? '').trim() || String(row.id);
        const isMaterial = String(row.po_type ?? '').toUpperCase() === 'ACM';
        return {
          type: 'purchase-order' as const,
          id: String(row.id),
          title: `PO #${poNumber}`,
          subtitle: String(row.vendor_name ?? '').trim() || (isMaterial ? 'Material purchase order' : 'Purchase order'),
          route: isMaterial
            ? `/users/purchase-order-materials/edit/${row.id}`
            : `/users/purchase-order?q=${encodeURIComponent(poNumber)}`,
          status: String(row.status ?? '').trim() || undefined,
        };
      });
    } catch {
      return [];
    }
  }

  private async searchMaterials(like: string, limit: number): Promise<GlobalSearchItem[]> {
    try {
      const result = await this.databaseService.query<{
        id: number;
        material_code: string | null;
        material_name: string | null;
        brand_id: number | null;
        brand_name: string | null;
        product_type_id: number | null;
      }>(
        `SELECT
           m.id,
           COALESCE(m.material_code, '') AS material_code,
           COALESCE(m.material_name, '') AS material_name,
           m.brand_id,
           COALESCE(b."brandName", '') AS brand_name,
           b.product_type_id AS product_type_id
         FROM tblmaterials m
         LEFT JOIN tblbrands b ON b.id = m.brand_id
         WHERE m.deleted_at IS NULL
           AND (
             COALESCE(m.material_code, '') ILIKE $1
             OR COALESCE(m.material_name, '') ILIKE $1
           )
         ORDER BY
           CASE WHEN COALESCE(m.material_code, '') ILIKE $1 THEN 0 ELSE 1 END,
           m.material_code ASC NULLS LAST
         LIMIT $2`,
        [like, limit],
      );

      return result.rows.map((row) => {
        const code = String(row.material_code ?? '').trim();
        const name = String(row.material_name ?? '').trim();
        const params = new URLSearchParams({ materialId: String(row.id) });
        if (row.brand_id) {
          params.set('brandId', String(row.brand_id));
        }
        if (row.product_type_id) {
          params.set('productTypeId', String(row.product_type_id));
        }
        return {
          type: 'material' as const,
          id: String(row.id),
          title: code || name || `Material #${row.id}`,
          subtitle: [name && name !== code ? name : '', row.brand_name].filter(Boolean).join(' · ') || 'Material',
          route: `/users/inventory?${params.toString()}`,
        };
      });
    } catch {
      return [];
    }
  }

  private async searchCustomers(like: string, limit: number): Promise<GlobalSearchItem[]> {
    try {
      const result = await this.databaseService.query<{
        id: string;
        name: string | null;
        contact_person: string | null;
        contact_number: string | null;
      }>(
        `SELECT
           c.id::text AS id,
           COALESCE(to_jsonb(c)->>'name', to_jsonb(c)->>'customer_name', '') AS name,
           COALESCE(to_jsonb(c)->>'contact_person', to_jsonb(c)->>'contactPerson', '') AS contact_person,
           COALESCE(to_jsonb(c)->>'contact_number', to_jsonb(c)->>'contactNumber', '') AS contact_number
         FROM tblcustomer c
         WHERE COALESCE(to_jsonb(c)->>'name', to_jsonb(c)->>'customer_name', '') ILIKE $1
            OR COALESCE(to_jsonb(c)->>'contact_person', to_jsonb(c)->>'contactPerson', '') ILIKE $1
            OR COALESCE(to_jsonb(c)->>'contact_number', to_jsonb(c)->>'contactNumber', '') ILIKE $1
            OR c.id::text ILIKE $1
         ORDER BY COALESCE(to_jsonb(c)->>'name', to_jsonb(c)->>'customer_name') ASC
         LIMIT $2`,
        [like, limit],
      );

      return result.rows.map((row) => {
        const name = String(row.name ?? '').trim() || `Customer #${row.id}`;
        const contact = [row.contact_person, row.contact_number].map((value) => String(value ?? '').trim()).filter(Boolean).join(' · ');
        return {
          type: 'customer' as const,
          id: String(row.id),
          title: name,
          subtitle: contact || 'Customer',
          route: `/users/customers?id=${encodeURIComponent(String(row.id))}`,
        };
      });
    } catch {
      return [];
    }
  }

  private async searchProductItems(like: string, limit: number): Promise<GlobalSearchItem[]> {
    try {
      const [lineItems, products] = await Promise.all([
        this.databaseService.query<{
          id: number;
          description: string | null;
          item_code: string | null;
          sales_order_id: number;
          so_number: string | null;
          has_material_items: boolean;
        }>(
          `SELECT
             soi.id,
             COALESCE(soi.description, '') AS description,
             COALESCE(soi.item_code, '') AS item_code,
             soi.sales_order_id,
             COALESCE(so.so_number, '') AS so_number,
             EXISTS (
               SELECT 1 FROM tblsales_order_items material_line
               WHERE material_line.sales_order_id = so.id
             ) AS has_material_items
           FROM tblsales_order_items soi
           INNER JOIN tblsales_order so ON so.id = soi.sales_order_id
           WHERE (to_jsonb(so)->>'deleted_at') IS NULL
             AND (
               COALESCE(soi.description, '') ILIKE $1
               OR COALESCE(soi.item_code, '') ILIKE $1
             )
           ORDER BY soi.id DESC
           LIMIT $2`,
          [like, limit],
        ),
        this.databaseService.query<{
          id: number;
          product_name: string | null;
          brand_name: string | null;
        }>(
          `SELECT
             p.id,
             COALESCE(
               to_jsonb(p)->>'productName',
               to_jsonb(p)->>'product_name',
               to_jsonb(p)->>'name',
               ''
             ) AS product_name,
             COALESCE(b."brandName", '') AS brand_name
           FROM tblproducts p
           LEFT JOIN tblbrands b
             ON b.id::text = COALESCE(
               to_jsonb(p)->>'brandId',
               to_jsonb(p)->>'brand_id',
               ''
             )
           WHERE COALESCE(
               to_jsonb(p)->>'productName',
               to_jsonb(p)->>'product_name',
               to_jsonb(p)->>'name',
               ''
             ) ILIKE $1
           ORDER BY p.id DESC
           LIMIT $2`,
          [like, limit],
        ),
      ]);

      const fromLines = lineItems.rows.map((row) => {
        const description = String(row.description ?? '').trim() || 'Product item';
        const soNumber = String(row.so_number ?? '').trim() || String(row.sales_order_id);
        const itemCode = String(row.item_code ?? '').trim();
        return {
          type: 'product-item' as const,
          id: `line-${row.id}`,
          title: description,
          subtitle: [itemCode, `SO #${soNumber}`].filter(Boolean).join(' · '),
          route: row.has_material_items
            ? `/users/sales-order-materials/edit/${row.sales_order_id}`
            : `/users/sales-order?editId=${row.sales_order_id}`,
        };
      });

      const fromCatalog = products.rows.map((row) => {
        const name = String(row.product_name ?? '').trim() || `Product #${row.id}`;
        return {
          type: 'product-item' as const,
          id: `product-${row.id}`,
          title: name,
          subtitle: String(row.brand_name ?? '').trim() || 'Product catalog',
          route: `/users/sales-order?q=${encodeURIComponent(name)}`,
        };
      });

      return [...fromLines, ...fromCatalog].slice(0, limit);
    } catch {
      return [];
    }
  }
}
