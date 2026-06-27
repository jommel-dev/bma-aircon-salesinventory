import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';

export interface UnpaidReportRow {
  id: string | number;
  customer: string;
  method?: string;
  totalAmount: number;
  paid?: number;
  balance?: number;
  dueDate?: string;
  status?: string;
}

@Injectable({ providedIn: 'root' })
export class PrintUnpaidReportService {

  async generatePdf(items: UnpaidReportRow[]): Promise<string> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Landscape Letter format
    const pageWidth = 842;
    const pageHeight = 595;
    const margin = 40;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Header Panel
    page.drawText('3BMA Cool Airconditioning Trading ', { x: margin, y: pageHeight - 40, size: 14, font: fontBold, color: rgb(0.31, 0.27, 0.9) });
    page.drawText('Unpaid & Overdue Sales Summary Balance Sheet Report', { x: margin, y: pageHeight - 55, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(`Generated on: ${new Date().toLocaleString()}`, { x: margin, y: pageHeight - 70, size: 8, font, color: rgb(0.6, 0.6, 0.6) });

    const columns = [
      { header: 'SO #', x: margin, width: 60 },
      { header: 'Customer', x: margin + 60, width: 220 },
      { header: 'Method', x: margin + 280, width: 80 },
      { header: 'Total Amount', x: margin + 360, width: 100, align: 'right' },
      { header: 'Paid', x: margin + 460, width: 90, align: 'right' },
      { header: 'Balance', x: margin + 550, width: 100, align: 'right' },
      { header: 'Due Date', x: margin + 650, width: 112 }
    ];

    let yPosition = pageHeight - 110;
    const rowHeight = 22;

    // Draw Header Bar
    page.drawRectangle({
      x: margin,
      y: yPosition - 4,
      width: pageWidth - (margin * 2),
      height: rowHeight,
      color: rgb(0.31, 0.27, 0.9)
    });

    columns.forEach(col => {
      let xOffset = col.x;
      if (col.align === 'right') {
        const textWidth = fontBold.widthOfTextAtSize(col.header, 9);
        xOffset = col.x + col.width - textWidth - 5;
      }
      page.drawText(col.header, { x: xOffset, y: yPosition + 2, size: 9, font: fontBold, color: rgb(1, 1, 1) });
    });

    yPosition -= rowHeight;

    items.forEach((item, index) => {
      if (yPosition < margin + 30) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        yPosition = pageHeight - 50;
      }

      if (index % 2 === 1) {
        page.drawRectangle({
          x: margin,
          y: yPosition - 4,
          width: pageWidth - (margin * 2),
          height: rowHeight,
          color: rgb(0.97, 0.98, 1.0)
        });
      }

      const total = Number(item.totalAmount ?? 0);
      const paid = Number(item.paid ?? 0);
      const balance = Number(item.balance ?? (total - paid));
      const method = item.method || (item.status === 'completed' ? 'Cash' : 'Terms/Credit');
      const formattedDueDate = item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'N/A';

      const cells = [
        { text: String(item.id ?? '-'), x: columns[0].x, width: columns[0].width },
        { text: this.truncateText(item.customer || 'Walk-in Customer', font, 9, 210), x: columns[1].x, width: columns[1].width },
        { text: method, x: columns[2].x, width: columns[2].width },
        { text: total.toLocaleString('en-US', { minimumFractionDigits: 2 }), x: columns[3].x, width: columns[3].width, align: 'right' },
        { text: paid.toLocaleString('en-US', { minimumFractionDigits: 2 }), x: columns[4].x, width: columns[4].width, align: 'right' },
        { text: balance.toLocaleString('en-US', { minimumFractionDigits: 2 }), x: columns[5].x, width: columns[5].width, align: 'right', isBalance: true },
        { text: formattedDueDate, x: columns[6].x, width: columns[6].width }
      ];

      cells.forEach((cell, i) => {
        let xOffset = cell.x;
        if (columns[i].align === 'right') {
          const textWidth = font.widthOfTextAtSize(cell.text, 9);
          xOffset = cell.x + columns[i].width - textWidth - 5;
        }

        page.drawText(cell.text, {
          x: xOffset,
          y: yPosition + 2,
          size: 9,
          font: cell.isBalance && balance > 0 ? fontBold : font,
          color: cell.isBalance && balance > 0 ? rgb(0.85, 0.15, 0.15) : rgb(0.15, 0.15, 0.15)
        });
      });

      page.drawLine({
        start: { x: margin, y: yPosition - 4 },
        end: { x: pageWidth - margin, y: yPosition - 4 },
        thickness: 0.5,
        color: rgb(0.9, 0.9, 0.9)
      });

      yPosition -= rowHeight;
    });

    // ✅ Save and convert using your safe base64 design pattern
    const pdfBytes = await pdfDoc.save();
    const base64 = this.uint8ArrayToBase64(pdfBytes);
    return `data:application/pdf;base64,${base64}`;
  }

  private uint8ArrayToBase64(uint8Array: Uint8Array): string {
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return window.btoa(binary);
  }

  private truncateText(text: string, font: PDFFont, size: number, maxWidth: number): string {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let current = text;
    while (current.length > 0 && font.widthOfTextAtSize(current + '...', size) > maxWidth) {
      current = current.slice(0, -1);
    }
    return current + '...';
  }
}
