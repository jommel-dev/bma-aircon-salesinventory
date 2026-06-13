import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

interface BackorderItem {
  salesOrderItemId: number;
  materialId: number;
  description: string;
  orderedQty: number;
  onHandQty: number;
  backorderQty: number;
}

interface BackorderCreationResult {
  backorderId: number;
  materialId: number;
  backorderQty: number;
  createdAt: string;
}

@Injectable()
export class BackorderService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Process backorders for a sales order when it transitions to pending/approved status
   * Creates backorder records for any line items where ordered qty > available stock
   * Also records negative inventory movements
   */
  async processBackordersForSalesOrder(
    salesOrderId: number,
    userId?: number,
  ): Promise<{ backorderCount: number; createdBackorders: BackorderCreationResult[] }> {
    const createdBackorders: BackorderCreationResult[] = [];

    try {
      const result = await this.databaseService.withTransaction(async (client) => {
        // Fetch all line items for the sales order
        // Use tblmaterials.on_hand_stock as the source of truth for available inventory
        const itemsResult = await client.query(
          `SELECT 
            soi.id as item_id,
            soi.sales_order_id,
            soi.material_id,
            soi.description,
            soi.qty as ordered_qty,
            COALESCE(m.on_hand_stock, 0) as on_hand_qty
          FROM tblsales_order_items soi
          LEFT JOIN tblmaterials m ON soi.material_id = m.id
          WHERE soi.sales_order_id = $1 AND soi.material_id IS NOT NULL`,
          [salesOrderId],
        );

        const items = itemsResult.rows as Array<{
          item_id: number;
          sales_order_id: number;
          material_id: number;
          description: string;
          ordered_qty: number;
          on_hand_qty: number;
        }>;

        // Process each item to check for backorders
        for (const item of items) {
          if (item.ordered_qty > item.on_hand_qty) {
            const backorderQty = item.ordered_qty - item.on_hand_qty;

            // Create backorder record
            const backorderResult = await client.query(
              `INSERT INTO tblmaterial_backorder
                (sales_order_id, sales_order_item_id, material_id, on_hand_qty, ordered_qty, backorder_qty, created_by)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING id, created_at`,
              [
                salesOrderId,
                item.item_id,
                item.material_id,
                item.on_hand_qty,
                item.ordered_qty,
                backorderQty,
                userId || null,
              ],
            );

            if (backorderResult.rowCount > 0) {
              const backorderId = backorderResult.rows[0].id;

              // Record negative stock movement
              await client.query(
                `INSERT INTO tblmaterial_stock_movement
                  (material_id, movement_type, qty, source_type, source_id, source_line_key, backorder_id, status_snapshot, remarks, created_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                  item.material_id,
                  'OUT',
                  backorderQty,
                  'SO',
                  salesOrderId,
                  `backorder_${backorderId}`,
                  backorderId,
                  'backorder',
                  `Backorder from Sales Order ${salesOrderId}: ${item.description}`,
                  userId || null,
                ],
              );

              createdBackorders.push({
                backorderId,
                materialId: item.material_id,
                backorderQty,
                createdAt: backorderResult.rows[0].created_at,
              });
            }
          }
        }

        return { backorderCount: createdBackorders.length };
      });

      return {
        backorderCount: result.backorderCount,
        createdBackorders,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? `Failed to process backorders: ${error.message}`
          : 'Failed to process backorders',
      );
    }
  }

  /**
   * Get all backorders for a sales order
   */
  async getBackordersForSalesOrder(salesOrderId: number) {
    const result = await this.databaseService.query(
      `SELECT 
        mb.id,
        mb.sales_order_id,
        mb.material_id,
        m.material_name,
        m.material_code,
        mb.on_hand_qty,
        mb.ordered_qty,
        mb.backorder_qty,
        mb.fulfilled_qty,
        mb.status,
        mb.expected_fulfillment_date,
        mb.supplier_reference,
        mb.backorder_reason,
        mb.created_at,
        mb.created_by,
        u.username as created_by_name
      FROM tblmaterial_backorder mb
      LEFT JOIN tblmaterials m ON mb.material_id = m.id
      LEFT JOIN tblusers u ON mb.created_by = u.id
      WHERE mb.sales_order_id = $1
      ORDER BY mb.created_at DESC`,
      [salesOrderId],
    );

    return result.rows;
  }

  /**
   * Get all pending backorders
   */
  async getPendingBackorders(limit: number = 50, offset: number = 0) {
    const result = await this.databaseService.query(
      `SELECT 
        mb.id,
        mb.sales_order_id,
        mb.material_id,
        m.material_name,
        m.material_code,
        mb.backorder_qty,
        mb.fulfilled_qty,
        mb.status,
        mb.expected_fulfillment_date,
        mb.supplier_reference,
        mb.created_at,
        c.customer_name,
        u.username as created_by_name
      FROM tblmaterial_backorder mb
      LEFT JOIN tblmaterials m ON mb.material_id = m.id
      LEFT JOIN tblsales_order so ON mb.sales_order_id = so.id
      LEFT JOIN tblcustomer c ON so.customer_id = c.customer_id
      LEFT JOIN tblusers u ON mb.created_by = u.id
      WHERE mb.status IN ('pending', 'partial_fulfilled')
      ORDER BY mb.expected_fulfillment_date ASC, mb.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const countResult = await this.databaseService.query(
      `SELECT COUNT(*) as total FROM tblmaterial_backorder
       WHERE status IN ('pending', 'partial_fulfilled')`,
      [],
    );

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
    };
  }

  /**
   * Fulfill a backorder (partially or fully)
   */
  async fulfillBackorder(backorderId: number, fulfillQty: number, userId?: number) {
    try {
      return await this.databaseService.withTransaction(async (client) => {
        // Fetch backorder details
        const backorderResult = await client.query(
          `SELECT * FROM tblmaterial_backorder WHERE id = $1`,
          [backorderId],
        );

        if (backorderResult.rowCount === 0) {
          throw new BadRequestException('Backorder not found');
        }

        const backorder = backorderResult.rows[0];

        // Validate fulfillment quantity
        const remainingQty = backorder.backorder_qty - backorder.fulfilled_qty;
        if (fulfillQty <= 0 || fulfillQty > remainingQty) {
          throw new BadRequestException(
            `Invalid fulfillment quantity. Remaining: ${remainingQty}`,
          );
        }

        // Update backorder fulfilled qty and status
        const updateResult = await client.query(
          `UPDATE tblmaterial_backorder
           SET fulfilled_qty = fulfilled_qty + $1,
               status = CASE
                 WHEN fulfilled_qty + $1 >= backorder_qty THEN 'fulfilled'
                 WHEN fulfilled_qty + $1 > 0 THEN 'partial_fulfilled'
                 ELSE status
               END,
               updated_at = NOW(),
               updated_by = $2
           WHERE id = $3
           RETURNING *`,
          [fulfillQty, userId || null, backorderId],
        );

        // Record stock IN movement for fulfillment
        await client.query(
          `INSERT INTO tblmaterial_stock_movement
            (material_id, movement_type, qty, source_type, source_id, source_line_key, backorder_id, status_snapshot, remarks, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            backorder.material_id,
            'IN',
            fulfillQty,
            'SO',
            backorder.sales_order_id,
            `backorder_fulfillment_${backorderId}`,
            backorderId,
            'backorder_fulfillment',
            `Backorder fulfillment: ${fulfillQty} units received`,
            userId || null,
          ],
        );

        return updateResult.rows[0];
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to fulfill backorder',
      );
    }
  }

  /**
   * Cancel a backorder
   */
  async cancelBackorder(backorderId: number, reason?: string, userId?: number) {
    try {
      return await this.databaseService.withTransaction(async (client) => {
        // Update backorder status to cancelled
        const updateResult = await client.query(
          `UPDATE tblmaterial_backorder
           SET status = 'cancelled',
               cancelled_at = NOW(),
               cancelled_by = $1
           WHERE id = $2 AND status != 'cancelled'
           RETURNING *`,
          [userId || null, backorderId],
        );

        if (updateResult.rowCount === 0) {
          throw new BadRequestException('Backorder not found or already cancelled');
        }

        const backorder = updateResult.rows[0];

        // Reverse the negative stock movement
        await client.query(
          `INSERT INTO tblmaterial_stock_movement
            (material_id, movement_type, qty, source_type, source_id, source_line_key, backorder_id, status_snapshot, remarks, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            backorder.material_id,
            'IN',
            backorder.backorder_qty - backorder.fulfilled_qty,
            'SO',
            backorder.sales_order_id,
            `backorder_cancelled_${backorderId}`,
            backorderId,
            'backorder_cancelled',
            `Backorder cancelled: ${reason || 'No reason provided'}`,
            userId || null,
          ],
        );

        return backorder;
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to cancel backorder',
      );
    }
  }
}
