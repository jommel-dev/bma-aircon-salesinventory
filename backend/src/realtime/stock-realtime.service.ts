import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DatabaseService } from 'src/database/database.service';
import { StockRealtimeGateway, StockRealtimeItem } from './stock-realtime.gateway';

@Injectable()
export class StockRealtimeService {
  private readonly logger = new Logger(StockRealtimeService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async publish(materialIds: Array<number | null | undefined>): Promise<void> {
    const uniqueIds = [...new Set(
      materialIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    )];

    if (uniqueIds.length === 0) {
      return;
    }

    try {
      const items = await this.loadAvailableStock(uniqueIds);
      const gateway = this.getGateway();
      if (!gateway) {
        this.logger.warn(`Stock gateway unavailable; skipped emit for ${uniqueIds.join(',')}`);
        return;
      }
      gateway.emitStockUpdated(items);
    } catch (error) {
      // Realtime is best-effort and must never fail the business transaction.
      this.logger.warn(
        `Stock realtime publish failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async publishForPurchase(purchaseId: number): Promise<void> {
    if (!Number.isFinite(purchaseId) || purchaseId <= 0) {
      return;
    }

    try {
      const result = await this.databaseService.query<{ material_id: number }>(
        `SELECT DISTINCT COALESCE(material_id, NULLIF(to_jsonb(tmi)->>'productId', '')::int) AS material_id
         FROM tbltransaction_material_items tmi
         WHERE COALESCE(purchase_id, NULLIF(to_jsonb(tmi)->>'purchaseId', '')::int) = $1
           AND COALESCE(material_id, NULLIF(to_jsonb(tmi)->>'productId', '')::int) IS NOT NULL`,
        [purchaseId],
      );
      await this.publish(result.rows.map((row) => Number(row.material_id)));
    } catch (error) {
      this.logger.warn(
        `Stock realtime purchase lookup failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async publishForSalesOrder(
    salesOrderId: number,
    dtoItems?: Array<{ materialId?: number | null }>,
  ): Promise<void> {
    const fromDto = (dtoItems ?? []).map((item) => Number(item?.materialId));
    if (fromDto.some((id) => Number.isFinite(id) && id > 0)) {
      await this.publish(fromDto);
      return;
    }

    if (!Number.isFinite(salesOrderId) || salesOrderId <= 0) {
      return;
    }

    try {
      const result = await this.databaseService.query<{ material_id: number }>(
        `SELECT DISTINCT material_id
         FROM tblsales_order_items
         WHERE sales_order_id = $1
           AND material_id IS NOT NULL`,
        [salesOrderId],
      );
      await this.publish(result.rows.map((row) => Number(row.material_id)));
    } catch (error) {
      this.logger.warn(
        `Stock realtime order lookup failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private getGateway(): StockRealtimeGateway | undefined {
    try {
      return this.moduleRef.get(StockRealtimeGateway, { strict: false });
    } catch {
      return undefined;
    }
  }

  private async loadAvailableStock(materialIds: number[]): Promise<StockRealtimeItem[]> {
    const result = await this.databaseService.query<{
      id: number;
      on_hand: number;
      reserved_qty: number;
    }>(
      `SELECT
         m.id,
         COALESCE(m.on_hand_stock, 0)::int AS on_hand,
         COALESCE(reserved.qty, 0)::int AS reserved_qty
       FROM tblmaterials m
       LEFT JOIN (
         SELECT soi.material_id, SUM(soi.qty)::int AS qty
         FROM tblsales_order_items soi
         INNER JOIN tblsales_order so ON so.id = soi.sales_order_id
         WHERE LOWER(TRIM(COALESCE(so.status, ''))) = 'pending'
           AND COALESCE(soi.is_non_inventory, false) = false
           AND soi.material_id IS NOT NULL
         GROUP BY soi.material_id
       ) reserved ON reserved.material_id = m.id
       WHERE m.id = ANY($1::int[])`,
      [materialIds],
    );

    return result.rows.map((row) => {
      const onHandStock = Math.max(0, Number(row.on_hand) || 0);
      const reservedQty = Math.max(0, Number(row.reserved_qty) || 0);
      return {
        materialId: Number(row.id),
        onHandStock,
        reservedQty,
        availableQty: Math.max(0, onHandStock - reservedQty),
      };
    });
  }
}
