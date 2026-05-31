import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseService } from './purchase.service';
import { DatabaseService } from 'src/database/database.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { MaterialStockService } from 'src/inventory/material-stock/material-stock.service';

/**
 * Unit tests for PO status transition logic.
 * Validates Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
 */
describe('PurchaseService - Status Transitions', () => {
  let service: PurchaseService;
  let mockDatabaseService: {
    query: jest.Mock;
    withTransaction: jest.Mock;
  };
  let mockAuditLogService: { logMutation: jest.Mock };
  let mockMaterialStockService: { recordMovement: jest.Mock };

  beforeEach(async () => {
    mockDatabaseService = {
      query: jest.fn(),
      withTransaction: jest.fn(),
    };
    mockAuditLogService = {
      logMutation: jest.fn().mockResolvedValue(undefined),
    };
    mockMaterialStockService = {
      recordMovement: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: MaterialStockService, useValue: mockMaterialStockService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<PurchaseService>(PurchaseService);
  });

  describe('revertInProgress (for_approval → in-progress)', () => {
    it('should succeed when PO is in for_approval status', async () => {
      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ id: 1, status: 'for_approval' }],
            }) // SELECT PO
            .mockResolvedValueOnce({ rows: [{ column_name: 'status' }] }) // getTableColumns
            .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE status
            .mockResolvedValueOnce({ rows: [{ po_type: 'ACM' }] }) // PO type check
            .mockResolvedValueOnce({ rowCount: 0 }) // linked SO check
        };
        return fn(mockClient);
      });

      const result = await service.revertInProgress(1, 100);
      expect(result.success).toBe(true);
      expect(result.message).toContain('reverted to in-progress');
    });

    it('should reject when PO is in approved status', async () => {
      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ id: 1, status: 'approved' }],
            }),
        };
        return fn(mockClient);
      });

      const result = await service.revertInProgress(1, 100);
      expect(result.success).toBe(false);
      expect(result.message).toContain('for_approval');
    });

    it('should return error when PO not found', async () => {
      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] }),
        };
        return fn(mockClient);
      });

      const result = await service.revertInProgress(999, 100);
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('approve (for_approval → approved)', () => {
    it('should succeed when PO is in for_approval status', async () => {
      // Mock getPurchaseAuditSnapshot (called before and after)
      mockDatabaseService.query.mockResolvedValue({ rows: [], rowCount: 0 });

      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ id: 1, status: 'for_approval' }],
            }) // SELECT PO
            .mockResolvedValueOnce({ rows: [{ column_name: 'status' }] }) // getTableColumns
            .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE status
            .mockResolvedValueOnce({ rows: [{ po_type: 'ACM' }] }) // PO type check
            .mockResolvedValueOnce({ rowCount: 0 }) // linked SO check
        };
        return fn(mockClient);
      });

      const result = await service.approve(1, 100);
      expect(result.success).toBe(true);
      expect(result.message).toContain('approved');
    });

    it('should reject when PO is in in-progress status', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [], rowCount: 0 });

      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ id: 1, status: 'in-progress' }],
            }),
        };
        return fn(mockClient);
      });

      const result = await service.approve(1, 100);
      expect(result.success).toBe(false);
      expect(result.message).toContain('for_approval');
    });

    it('should return error when PO not found', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [], rowCount: 0 });

      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] }),
        };
        return fn(mockClient);
      });

      const result = await service.approve(999, 100);
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('verifyAndReceive (approved → received)', () => {
    it('should succeed when PO is in approved status (non-transfer)', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [], rowCount: 0 });

      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ status: 'approved', po_type: 'ACM' }],
            }) // SELECT PO with status and po_type
            .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // linked SO check (no transfer)
            .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE status to received
        };
        return fn(mockClient);
      });

      const result = await service.verifyAndReceive(1, 100);
      expect(result.success).toBe(true);
      expect(result.message).toContain('received');
    });

    it('should reject when PO is in for_approval status', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [], rowCount: 0 });

      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ status: 'for_approval', po_type: 'ACM' }],
            }),
        };
        return fn(mockClient);
      });

      const result = await service.verifyAndReceive(1, 100);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Cannot mark as received from status 'for_approval'");
    });

    it('should reject when PO is in in-progress status', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [], rowCount: 0 });

      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ status: 'in-progress', po_type: 'ACM' }],
            }),
        };
        return fn(mockClient);
      });

      const result = await service.verifyAndReceive(1, 100);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Cannot mark as received from status 'in-progress'");
    });

    it('should return error when PO not found', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [], rowCount: 0 });

      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] }),
        };
        return fn(mockClient);
      });

      const result = await service.verifyAndReceive(999, 100);
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('completeRequest (received → completed) for ACM', () => {
    it('should succeed when ACM PO is in received status', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [], rowCount: 0 });

      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ po_type: 'ACM' }],
            }) // PO type check
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ status: 'received' }],
            }) // status check
            .mockResolvedValueOnce({ rows: [{ column_name: 'status' }] }) // getTableColumns
            .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE status
            .mockResolvedValueOnce({ rows: [{ column_name: 'material_id' }, { column_name: 'quantity' }, { column_name: 'purchase_id' }, { column_name: 'trans_type' }] }) // material item columns
            .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // material items query (empty)
        };
        return fn(mockClient);
      });

      const result = await service.completeRequest(1, 100);
      expect(result.success).toBe(true);
    });

    it('should reject when ACM PO is in approved status', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [], rowCount: 0 });

      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ po_type: 'ACM' }],
            }) // PO type check
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ status: 'approved' }],
            }) // status check
        };
        return fn(mockClient);
      });

      const result = await service.completeRequest(1, 100);
      expect(result.success).toBe(false);
      expect(result.message).toContain("Cannot complete purchase order from status 'approved'");
    });

    it('should return error when PO not found', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [], rowCount: 0 });

      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] }),
        };
        return fn(mockClient);
      });

      const result = await service.completeRequest(999, 100);
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('Invalid transitions are rejected', () => {
    it('should reject revert from in-progress', async () => {
      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ id: 1, status: 'in-progress' }],
            }),
        };
        return fn(mockClient);
      });

      const result = await service.revertInProgress(1, 100);
      expect(result.success).toBe(false);
    });

    it('should reject revert from completed', async () => {
      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ id: 1, status: 'completed' }],
            }),
        };
        return fn(mockClient);
      });

      const result = await service.revertInProgress(1, 100);
      expect(result.success).toBe(false);
    });

    it('should reject approve from in-progress', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [], rowCount: 0 });

      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ id: 1, status: 'in-progress' }],
            }),
        };
        return fn(mockClient);
      });

      const result = await service.approve(1, 100);
      expect(result.success).toBe(false);
    });

    it('should reject receive from for_approval', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [], rowCount: 0 });

      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ status: 'for_approval', po_type: 'ACM' }],
            }),
        };
        return fn(mockClient);
      });

      const result = await service.verifyAndReceive(1, 100);
      expect(result.success).toBe(false);
    });

    it('should reject complete from approved (ACM)', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [], rowCount: 0 });

      mockDatabaseService.withTransaction.mockImplementation(async (fn) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ po_type: 'ACM' }],
            })
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [{ status: 'approved' }],
            }),
        };
        return fn(mockClient);
      });

      const result = await service.completeRequest(1, 100);
      expect(result.success).toBe(false);
    });

    it('should return invalid purchase id for id <= 0', async () => {
      const result = await service.revertInProgress(0, 100);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid purchase id');
    });
  });
});
