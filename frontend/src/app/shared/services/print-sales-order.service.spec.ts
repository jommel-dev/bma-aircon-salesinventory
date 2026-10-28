import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PrintSalesOrderService } from './print-sales-order.service';

describe('PrintSalesOrderService', () => {
  it('does not throw when wrapping text that Helvetica cannot encode', async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const service = new PrintSalesOrderService();
    const address = `Blk 12 Lot 8\uFFFD Brgy. San Jose \u20B1 500`;

    expect(() => font.widthOfTextAtSize(address, 11)).toThrow();

    const lines = (service as any).wrapText(font, address, 270, 11) as string[];
    expect(lines.join(' ')).toContain('Blk 12 Lot 8');
    expect(lines.join(' ')).not.toContain('\uFFFD');
    expect(lines.join(' ')).toContain('PHP');
  });
});
