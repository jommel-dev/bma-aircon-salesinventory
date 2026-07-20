/**
 * =====================================================
 * MATERIALS CONTROLLER
 * =====================================================
 * Purpose: HTTP REST API endpoints for material inventory management
 * 
 * This controller exposes the following endpoints:
 * - GET    /materials              - List all materials
 * - GET    /materials/brands       - Get material brands
 * - GET    /materials/low-stock    - Get low stock materials
 * - GET    /materials/:id          - Get single material
 * - POST   /materials              - Create new material
 * - PATCH  /materials/:id          - Update material
 * - DELETE /materials/:id          - Delete material
 * 
 * Base URL: /inventory/materials
 * =====================================================
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

/**
 * @Controller decorator defines the base route
 * All endpoints in this controller will be prefixed with /inventory/materials
 */
@Controller('inventory/materials')
@UseGuards(JwtAuthGuard)
export class MaterialsController {
  /**
   * Constructor - Inject MaterialsService
   * The service contains all business logic
   */
  constructor(private readonly materialsService: MaterialsService) {}

  /**
   * =====================================================
   * BULK UPLOAD MATERIALS
   * =====================================================
   * POST /inventory/materials/bulk-upload
   *
   * Accepts an array of rows parsed from CSV/Excel on the frontend.
   * For each row:
   *   - Finds or creates the product type (by name)
   *   - Finds or creates the brand (by name, under that product type, type='MAT')
   *   - Creates the material (skips if material_name already exists for that brand)
   *
   * Request Body:
   * { rows: Array<{ product_type, brand, material_name, material_code, unit, unit_price, sell_price, on_hand_stock, reorder_level }> }
   *
   * Response:
   * { success: true, summary: { total, created, skipped, failed }, results: [{ row, status, message }] }
   * =====================================================
   */
  @Post('bulk-upload')
  async bulkUpload(@Body() body: { rows: any[] }, @Request() req: any) {
    const userId = req.user?.id || 1;
    return this.materialsService.bulkUpload(body.rows, userId);
  }

  /**
   * =====================================================
   * MIGRATE/UPDATE STOCK
   * =====================================================
   * POST /inventory/materials/migrate-stock
   * 
   * Bulk update stock levels for existing materials.
   * Records IN movements for full audit trail.
   * 
   * Request Body:
   * {
   *   "rows": [
   *     { "material_code": "CU-1/4", "quantity": 50 },
   *     { "material_code": "BOLT-A100", "quantity": 200 }
   *   ]
   * }
   * 
   * Response:
   * {
   *   "success": true,
   *   "summary": {
   *     "total": 2,
   *     "updated": 2,
   *     "failed": 0
   *   },
   *   "results": [
   *     { "row": 1, "material_code": "CU-1/4", "status": "updated", "message": "Stock updated from 10 to 60" },
   *     { "row": 2, "material_code": "BOLT-A100", "status": "updated", "message": "Stock updated from 100 to 300" }
   *   ]
   * }
   * =====================================================
   */
  @Post('migrate-stock')
  async migrateStock(@Body() body: { rows: any[] }, @Request() req: any) {
    const userId = req.user?.id || 1;
    return this.materialsService.migrateStock(body.rows, userId);
  }

  /**
   * =====================================================
   * CREATE MATERIAL
   * =====================================================
   * POST /inventory/materials
   * 
   * Request Body Example:
   * {
   *   "brand_id": 1,
   *   "material_name": "1/4 Copper Tube",
   *   "material_code": "CU-1/4",
   *   "description": "High quality copper tube",
   *   "unit": "METERS",
   *   "unit_price": 150.00,
   *   "sell_price": 200.00,
   *   "on_hand_stock": 100,
   *   "reorder_level": 20
   * }
   * 
   * Response: Created material object
   * =====================================================
   */
  @Post()
  async create(@Body() createMaterialDto: CreateMaterialDto, @Request() req: any) {
    // Extract user ID from request (set by auth middleware)
    const userId = req.user?.id || 1;
    
    return this.materialsService.create(createMaterialDto, userId);
  }

  /**
   * =====================================================
   * GET ALL MATERIALS
   * =====================================================
   * GET /inventory/materials?search=copper&brandId=1
   * 
   * Query Parameters:
   * - search (optional): Search by material name
   * - brandId (optional): Filter by brand ID
   * 
   * Response: MaterialListResponse with success flag and items array
   * =====================================================
   */
  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('brandId') brandIdRaw?: string,
    @Query('productTypeId') productTypeIdRaw?: string,
  ) {
    const brandId = brandIdRaw ? parseInt(brandIdRaw, 10) : undefined;
    const productTypeId = productTypeIdRaw ? parseInt(productTypeIdRaw, 10) : undefined;
    const materials = await this.materialsService.findAll(
      search,
      isNaN(brandId as any) ? undefined : brandId,
      isNaN(productTypeId as any) ? undefined : productTypeId,
    );

    return {
      success: true,
      items: materials.map((m) => ({
        id: m.id,
        material_code: m.material_code ?? null,
        material_name: m.material_name,
        unit: m.unit,
        unit_price: Number(m.unit_price),
        sell_price: Number(m.sell_price),
        on_hand_stock: Number(m.on_hand_stock),
        reorder_level: Number(m.reorder_level),
        brand_id: m.brand_id ?? null,
        brand_name: m.brand_name ?? null,
      })),
    };
  }

  /**
   * =====================================================
   * SEARCH MATERIALS (Smart Search)
   * =====================================================
   * GET /inventory/materials/search?q=copper&limit=20
   * 
   * Query Parameters:
   * - q (required): Search term (min 1 character)
   * - limit (optional): Max results, capped at 500, default 200
   * 
  * Searches by material_code only.
   * Returns MaterialSearchResult[] with fields: id, material_name, material_code,
   * product_type, brand_name, unit, unit_price, sell_price
   * =====================================================
   */
  @Get('search')
  async searchMaterials(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    if (!q || q.trim().length < 1) {
      throw new BadRequestException('Query parameter "q" is required and must be at least 1 character');
    }

    const parsedLimit = limit ? parseInt(limit, 10) : 200;
    const cappedLimit = isNaN(parsedLimit) ? 200 : Math.min(Math.max(parsedLimit, 1), 500);

    return this.materialsService.searchMaterials(q.trim(), cappedLimit);
  }

  /**
   * =====================================================
   * GET MATERIAL TREE
   * =====================================================
   * GET /inventory/materials/tree
   * 
   * Returns hierarchical tree structure for the left panel:
   * Product Types as parent nodes with MAT-type Brands as children.
   * Brands without a product_type_id appear under "Uncategorized".
   * 
   * Response Example:
   * {
   *   "success": true,
   *   "tree": [
   *     {
   *       "id": 1,
   *       "name": "Breaker",
   *       "type": "product-type",
   *       "children": [
   *         { "id": 5, "name": "Schneider", "type": "brand", "prefix": "SCH" }
   *       ]
   *     },
   *     {
   *       "id": null,
   *       "name": "Uncategorized",
   *       "type": "product-type",
   *       "children": [...]
   *     }
   *   ]
   * }
   * =====================================================
   */
  @Get('tree')
  async getTree() {
    return this.materialsService.getTree();
  }

  /**
   * =====================================================
   * GET MATERIAL BRANDS
   * =====================================================
   * GET /inventory/materials/brands
   * 
   * Returns all brands with type='MAT'
   * Used for dropdown options in the UI
   * 
   * Response Example:
   * [
   *   { "id": 1, "brandName": "Generic Materials", "prefix": "GEN" },
   *   { "id": 2, "brandName": "Premium Pipes Co.", "prefix": "PPC" }
   * ]
   * =====================================================
   */
  @Get('brands')
  async getMaterialBrands() {
    return this.materialsService.getMaterialBrands();
  }

  @Get('next-code')
  async getNextMaterialCode(
    @Query('brandId', new ParseIntPipe()) brandId: number,
  ) {
    return this.materialsService.getNextMaterialCode(brandId);
  }

  @Get('next-code-by-prefix')
  async getNextMaterialCodeByPrefix(
    @Query('prefix') prefix: string,
  ) {
    if (!prefix || !prefix.trim()) {
      throw new BadRequestException('Prefix query parameter is required');
    }
    return this.materialsService.getNextSequenceForPrefix(prefix.trim());
  }

  /**
   * =====================================================
   * GET LOW STOCK MATERIALS
   * =====================================================
   * GET /inventory/materials/low-stock
   * 
   * Returns materials where on_hand_stock <= reorder_level
   * Used for inventory alerts
   * 
   * Response: Array of material objects with low stock
   * =====================================================
   */
  @Get('low-stock')
  async getLowStockMaterials() {
    return this.materialsService.getLowStockMaterials();
  }

  /**
   * =====================================================
   * GET MATERIAL HISTORY
   * =====================================================
   * GET /inventory/materials/:id/history
   * 
   * Path Parameter:
   * - id: Material ID (number)
   * 
   * Returns price history and stock movements for the material,
   * each ordered by created_at DESC and limited to 100 records.
   * 
   * Response Example:
   * {
   *   "success": true,
   *   "priceHistory": [
   *     { "id": 1, "unit_price": 100, "sell_price": 150, "created_by": 1, "created_at": "..." }
   *   ],
   *   "stockMovements": [
   *     { "id": 1, "movement_type": "ADJUST", "qty": 10, "source_type": "MANUAL", ... }
   *   ]
   * }
   * =====================================================
   */
  @Get(':id/history')
  async getHistory(@Param('id', ParseIntPipe) id: number) {
    return this.materialsService.getHistory(id);
  }

  /**
   * =====================================================
   * GET SINGLE MATERIAL
   * =====================================================
   * GET /inventory/materials/:id
   * 
   * Path Parameter:
   * - id: Material ID (number)
   * 
   * Response: Single material object
   * Throws 404 if not found
   * =====================================================
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.materialsService.findOne(id);
  }

  /**
   * =====================================================
   * UPDATE MATERIAL
   * =====================================================
   * PATCH /inventory/materials/:id
   * 
   * Path Parameter:
   * - id: Material ID (number)
   * 
   * Request Body: Partial material object (only fields to update)
   * Example:
   * {
   *   "sell_price": 220.00,
   *   "on_hand_stock": 150
   * }
   * 
   * Response: Updated material object
   * =====================================================
   */
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMaterialDto: UpdateMaterialDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 1;
    return this.materialsService.update(id, updateMaterialDto, userId);
  }

  /**
   * =====================================================
   * ADJUST STOCK
   * =====================================================
   * POST /inventory/materials/:id/adjust
   *
   * Path Parameter:
   * - id: Material ID (number)
   *
   * Request Body Example:
   * {
   *   "direction": "increase",
   *   "quantity": 50,
   *   "remarks": "Received from supplier"
   * }
   *
   * Validates:
   * - direction must be 'increase' or 'decrease'
   * - quantity must be between 1 and 999999
   * - remarks must not exceed 500 characters
   * - decrease must not reduce on_hand_stock below zero
   *
   * Records a Stock_Movement with movement_type = 'ADJUST'
   * Response: { success, message, material }
   * =====================================================
   */
  @Post(':id/adjust')
  async adjustStock(
    @Param('id', ParseIntPipe) id: number,
    @Body() stockAdjustmentDto: StockAdjustmentDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 1;

    // Validate direction
    if (!stockAdjustmentDto.direction || !['increase', 'decrease'].includes(stockAdjustmentDto.direction)) {
      throw new BadRequestException('Direction must be "increase" or "decrease"');
    }

    return this.materialsService.adjustStock(id, stockAdjustmentDto, userId);
  }

  /**
   * =====================================================
   * DELETE MATERIAL
   * =====================================================
   * DELETE /inventory/materials/:id
   * 
   * Path Parameter:
   * - id: Material ID (number)
   * 
   * Performs soft delete (sets deleted_at timestamp)
   * Response: Success message
   * =====================================================
   */
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const userId = req.user?.id || 1;
    await this.materialsService.remove(id, userId);
    
    return {
      success: true,
      message: 'Material deleted successfully',
    };
  }
}
