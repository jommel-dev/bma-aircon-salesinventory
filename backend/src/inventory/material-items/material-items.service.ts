import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class MaterialItemsService {
  constructor(private readonly db: DatabaseService) {}

  async addMaterial(dto: { code: string; name: string; unit?: string }) {
    const unit = dto.unit || 'pcs';
    const res = await this.db.query(
      `INSERT INTO tblmaterial_items (code, name, unit) VALUES ($1, $2, $3) RETURNING *`,
      [dto.code, dto.name, unit],
    );
    return res.rows[0] ?? null;
  }

  async listMaterials() {
    const res = await this.db.query(
      `SELECT id, code, name, unit, is_active, created_at FROM tblmaterial_items ORDER BY id DESC`,
    );
    return res.rows;
  }

  async getMaterial(id: number) {
    const res = await this.db.query(
      `SELECT id, code, name, unit, is_active, created_at FROM tblmaterial_items WHERE id = $1`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  async updateMaterial(id: number, dto: { code?: string; name?: string; unit?: string }) {
    const fields = [];
    const values: any[] = [];
    let idx = 1;
    // if (dto.code !== undefined) {
    //   fields.push(`code = $${idx++}`);
    //   values.push(dto.code);
    // }
    // if (dto.name !== undefined) {
    //   fields.push(`name = $${idx++}`);
    //   values.push(dto.name);
    // }
    // if (dto.unit !== undefined) {
    //   fields.push(`unit = $${idx++}`);
    //   values.push(dto.unit);
    // }
    if (fields.length === 0) {
      return { success: false, message: 'No fields to update' };
    }
    values.push(id);
    const q = `UPDATE tblmaterial_items SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const res = await this.db.query(q, values);
    return res.rows[0] ?? null;
  }

  // async deleteMaterial(id: number) {
  //   // Soft-delete
  //   const res = await this.db.query(
  //     `UPDATE tblmaterial_items SET is_active = false WHERE id = $1 RETURNING id, code, name, is_active`,
  //     [id],
  //   );
  //   return res.rows[0] ?? null;
  // }
  async deleteMaterial(id: number) {
    // 1. Check if the material is linked to any Sales Orders
    const checkSOQuery = `SELECT COUNT(*) FROM tblsales_order_items WHERE material_id = $1`;
    const checkRes = await this.db.query(checkSOQuery, [id]);
    const hasSalesOrders = parseInt(checkRes.rows[0].count, 10) > 0;

    if (hasSalesOrders) {
      // SCENARIO A: It has history. Soft-delete but KEEP the code intact 
      // so historical joins don't break. (Requires the Partial Unique Index fix).
      const query = `
        UPDATE tblmaterials 
        SET deleted_at = NOW()
        WHERE id = $1 
        RETURNING id, material_code, material_name;
      `;
      const res = await this.db.query(query, [id]);
      return { 
        success: true, 
        message: 'Material has sales history. Archived securely without changing code.', 
        data: res.rows[0] 
      };
    } else {
      // SCENARIO B: Clean slate. No sales order dependencies. 
      // We can safely append a timestamp to free up the code immediately.
      const query = `
        UPDATE tblmaterials 
        SET material_code = material_code || '_del_' || EXTRACT(EPOCH FROM NOW()), 
            deleted_at = NOW()
        WHERE id = $1 
        RETURNING id, material_code, material_name;
      `;
      const res = await this.db.query(query, [id]);
      return { 
        success: true, 
        message: 'Material deleted. Code freed for immediate reuse.', 
        data: res.rows[0] 
      };
    }
  }
}