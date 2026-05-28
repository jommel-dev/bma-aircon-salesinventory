import { Test, TestingModule } from '@nestjs/testing';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

describe('MaterialsController', () => {
  let controller: MaterialsController;

  const mockMaterials = [
    {
      id: 1,
      material_code: 'CU-001',
      material_name: 'Copper Tube 1/4',
      unit: 'METERS',
      unit_price: 150,
      sell_price: 200,
      on_hand_stock: 100,
      reorder_level: 20,
      brand_id: 1,
      brand_name: 'Generic Materials',
      description: 'High quality copper tube',
      created_at: new Date(),
      created_by: 1,
      updated_at: null,
      updated_by: null,
      deleted_at: null,
      deleted_by: null,
    },
    {
      id: 2,
      material_code: null,
      material_name: 'PVC Pipe 16mm',
      unit: 'PCS',
      unit_price: 50,
      sell_price: 75,
      on_hand_stock: 0,
      reorder_level: 10,
      brand_id: 1,
      brand_name: 'Generic Materials',
      description: null,
      created_at: new Date(),
      created_by: 1,
      updated_at: null,
      updated_by: null,
      deleted_at: null,
      deleted_by: null,
    },
  ];

  const mockMaterialsService = {
    findAll: jest.fn().mockResolvedValue(mockMaterials),
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getMaterialBrands: jest.fn(),
    getNextMaterialCode: jest.fn(),
    getLowStockMaterials: jest.fn(),
    searchMaterials: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaterialsController],
      providers: [
        { provide: MaterialsService, useValue: mockMaterialsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MaterialsController>(MaterialsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return MaterialListResponse with success and items', async () => {
      const result = await controller.findAll();

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('items');
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should return items matching MaterialRow interface', async () => {
      const result = await controller.findAll();

      const item = result.items[0];
      expect(item).toEqual({
        id: 1,
        material_code: 'CU-001',
        material_name: 'Copper Tube 1/4',
        unit: 'METERS',
        unit_price: 150,
        sell_price: 200,
        on_hand_stock: 100,
        reorder_level: 20,
        brand_id: 1,
        brand_name: 'Generic Materials',
      });
    });

    it('should handle null material_code', async () => {
      const result = await controller.findAll();

      const item = result.items[1];
      expect(item.material_code).toBeNull();
    });

    it('should pass brandId to service when provided', async () => {
      await controller.findAll(undefined, '5');

      expect(mockMaterialsService.findAll).toHaveBeenCalledWith(undefined, 5);
    });

    it('should pass search to service when provided', async () => {
      await controller.findAll('copper', undefined);

      expect(mockMaterialsService.findAll).toHaveBeenCalledWith('copper', undefined);
    });

    it('should pass both brandId and search to service', async () => {
      await controller.findAll('pipe', '3');

      expect(mockMaterialsService.findAll).toHaveBeenCalledWith('pipe', 3);
    });

    it('should return empty items array when no materials found', async () => {
      mockMaterialsService.findAll.mockResolvedValueOnce([]);

      const result = await controller.findAll(undefined, '999');

      expect(result).toEqual({ success: true, items: [] });
    });

    it('should not include extra fields from the database row', async () => {
      const result = await controller.findAll();

      const item = result.items[0];
      expect(item).not.toHaveProperty('description');
      expect(item).not.toHaveProperty('created_at');
      expect(item).not.toHaveProperty('created_by');
      expect(item).not.toHaveProperty('updated_at');
      expect(item).not.toHaveProperty('deleted_at');
    });
  });
});
