import { AccountingService } from './accounting.service';

/**
 * Tests for normalizeReportPrintSettings signatory field handling.
 * We access the private method via bracket notation for unit testing.
 */
describe('AccountingService - normalizeReportPrintSettings signatory fields', () => {
  let service: AccountingService;

  beforeEach(() => {
    // Create service instance with a mock database service
    service = new AccountingService(
      { query: jest.fn(), withTransaction: jest.fn() } as any,
      { logMutation: jest.fn() } as any,
    );
  });

  const normalize = (payload: unknown): Record<string, unknown> => {
    return (service as any).normalizeReportPrintSettings(payload);
  };

  describe('signatoryName', () => {
    it('should default to empty string when absent', () => {
      const result = normalize({});
      expect(result.signatoryName).toBe('');
    });

    it('should default to empty string when null', () => {
      const result = normalize({ signatoryName: null });
      expect(result.signatoryName).toBe('');
    });

    it('should default to empty string when undefined', () => {
      const result = normalize({ signatoryName: undefined });
      expect(result.signatoryName).toBe('');
    });

    it('should trim whitespace', () => {
      const result = normalize({ signatoryName: '  Juan Dela Cruz  ' });
      expect(result.signatoryName).toBe('Juan Dela Cruz');
    });

    it('should truncate to 200 characters', () => {
      const longName = 'A'.repeat(250);
      const result = normalize({ signatoryName: longName });
      expect((result.signatoryName as string).length).toBe(200);
    });

    it('should preserve valid names within limit', () => {
      const result = normalize({ signatoryName: 'Juan Dela Cruz' });
      expect(result.signatoryName).toBe('Juan Dela Cruz');
    });
  });

  describe('signatoryTitle', () => {
    it('should default to empty string when absent', () => {
      const result = normalize({});
      expect(result.signatoryTitle).toBe('');
    });

    it('should default to empty string when null', () => {
      const result = normalize({ signatoryTitle: null });
      expect(result.signatoryTitle).toBe('');
    });

    it('should trim whitespace', () => {
      const result = normalize({ signatoryTitle: '  Authorized Representative  ' });
      expect(result.signatoryTitle).toBe('Authorized Representative');
    });

    it('should truncate to 200 characters', () => {
      const longTitle = 'B'.repeat(250);
      const result = normalize({ signatoryTitle: longTitle });
      expect((result.signatoryTitle as string).length).toBe(200);
    });
  });

  describe('signatoryTin', () => {
    it('should default to empty string when absent', () => {
      const result = normalize({});
      expect(result.signatoryTin).toBe('');
    });

    it('should default to empty string when null', () => {
      const result = normalize({ signatoryTin: null });
      expect(result.signatoryTin).toBe('');
    });

    it('should trim whitespace', () => {
      const result = normalize({ signatoryTin: '  123-456-789-000  ' });
      expect(result.signatoryTin).toBe('123-456-789-000');
    });

    it('should truncate to 20 characters', () => {
      const longTin = '1234567890123456789012345';
      const result = normalize({ signatoryTin: longTin });
      expect((result.signatoryTin as string).length).toBe(20);
    });
  });

  describe('signatoryImage', () => {
    it('should default to empty string when absent', () => {
      const result = normalize({});
      expect(result.signatoryImage).toBe('');
    });

    it('should default to empty string when null', () => {
      const result = normalize({ signatoryImage: null });
      expect(result.signatoryImage).toBe('');
    });

    it('should default to empty string when undefined', () => {
      const result = normalize({ signatoryImage: undefined });
      expect(result.signatoryImage).toBe('');
    });

    it('should accept valid base64 string', () => {
      const validBase64 = Buffer.from('test image data').toString('base64');
      const result = normalize({ signatoryImage: validBase64 });
      expect(result.signatoryImage).toBe(validBase64);
    });

    it('should accept data:image/ URI format', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
      const result = normalize({ signatoryImage: dataUri });
      expect(result.signatoryImage).toBe(dataUri);
    });

    it('should default to empty string for invalid base64', () => {
      const result = normalize({ signatoryImage: 'not-valid-base64!!!' });
      expect(result.signatoryImage).toBe('');
    });

    it('should default to empty string when exceeding 500000 characters', () => {
      const longString = 'A'.repeat(500001);
      const result = normalize({ signatoryImage: longString });
      expect(result.signatoryImage).toBe('');
    });

    it('should accept empty string', () => {
      const result = normalize({ signatoryImage: '' });
      expect(result.signatoryImage).toBe('');
    });

    it('should trim whitespace before validation', () => {
      const validBase64 = Buffer.from('hello').toString('base64');
      const result = normalize({ signatoryImage: `  ${validBase64}  ` });
      expect(result.signatoryImage).toBe(validBase64);
    });
  });

  describe('payload edge cases', () => {
    it('should handle non-object payload gracefully', () => {
      const result = normalize(null);
      expect(result.signatoryName).toBe('');
      expect(result.signatoryTitle).toBe('');
      expect(result.signatoryTin).toBe('');
      expect(result.signatoryImage).toBe('');
    });

    it('should handle undefined payload gracefully', () => {
      const result = normalize(undefined);
      expect(result.signatoryName).toBe('');
      expect(result.signatoryTitle).toBe('');
      expect(result.signatoryTin).toBe('');
      expect(result.signatoryImage).toBe('');
    });

    it('should handle numeric values by converting to string', () => {
      const result = normalize({ signatoryName: 12345 });
      expect(result.signatoryName).toBe('12345');
    });
  });
});
