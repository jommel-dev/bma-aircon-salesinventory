import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';

export interface PrintSalesOrderData {
  dealer: string;
  address: string;
  deliveryDate: string;
  soNumber: string;
  paymentTerm: string;
  terms: string;
  totalAmount: number;
  items: Array<{
    quantity: number;
    unit: string;
    description: string;
    unitPrice: number;
    amount: number;
  }>;
}

@Injectable({ providedIn: 'root' })
export class PrintSalesOrderService {
  private readonly ITEMS_PER_PAGE = 30;

  async generatePdf(data: PrintSalesOrderData): Promise<string> {
    const isHighSales = data.totalAmount >= 2000;

    // Load the appropriate template for the first page
    const firstTemplateUrl = isHighSales ? '/docs/blankpage.pdf' : '/docs/3bmaDR.pdf';
    const blankTemplateUrl = '/docs/blankpage.pdf';

    const [firstTemplateBytes, blankTemplateBytes] = await Promise.all([
      fetch(firstTemplateUrl).then(r => r.arrayBuffer()),
      fetch(blankTemplateUrl).then(r => r.arrayBuffer()),
    ]);

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Paginate items
    const pages = this.paginateItems(data.items);

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const isFirstPage = pageIndex === 0;
      const templateBytes = isFirstPage ? firstTemplateBytes : blankTemplateBytes;

      // Load template and copy the page
      const templateDoc = await PDFDocument.load(templateBytes);
      const [copiedPage] = await pdfDoc.copyPages(templateDoc, [0]);
      pdfDoc.addPage(copiedPage);

      const page = pdfDoc.getPages()[pageIndex];
      const { width, height } = page.getSize();

      // Column positions
      const cols = isHighSales
        ? [42, 75, 120, width - 170, width - 110]
        : [42, 75, 130, width - 200, width - 120];

      // Draw header info on first page
      if (isFirstPage) {
        this.drawHeader(page, font, boldFont, data, width, height);
      }

      // Draw items
      const startY = height - 240;
      this.drawItems(page, font, pages[pageIndex], cols, startY, width);

      // Draw total on last page
      if (pageIndex === pages.length - 1) {
        const totalY = isHighSales ? height - 800 : height - 670;
        const totalX = width - 110;
        page.drawText(this.formatNumber(data.totalAmount), {
          x: totalX,
          y: totalY,
          size: 11,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
      }
    }

    const pdfBytes = await pdfDoc.save();
    const base64 = this.uint8ArrayToBase64(pdfBytes);
    return `data:application/pdf;base64,${base64}`;
  }

  private drawHeader(
    page: PDFPage,
    font: PDFFont,
    boldFont: PDFFont,
    data: PrintSalesOrderData,
    width: number,
    height: number,
  ): void {
    const fontSize = 11;
    const color = rgb(0, 0, 0);

    // Customer name
    page.drawText(data.dealer || '', {
      x: 90,
      y: height - 125,
      size: fontSize,
      font: font,
      color,
    });

    // Address (with maxWidth wrapping)
    this.drawWrappedText(page, font, data.address || '', 90, height - 150, 270, fontSize, 14, color);

    // Delivery date
    page.drawText(data.deliveryDate || '', {
      x: width - 140,
      y: height - 125,
      size: fontSize,
      font: font,
      color,
    });

    // SO number
    page.drawText(data.soNumber || '', {
      x: width - 140,
      y: height - 150,
      size: fontSize,
      font: font,
      color,
    });

    // Payment terms
    page.drawText(data.paymentTerm || '', {
      x: width - 140,
      y: height - 176,
      size: fontSize,
      font: font,
      color,
    });
  }

  private drawItems(
    page: PDFPage,
    font: PDFFont,
    items: PrintSalesOrderData['items'],
    cols: number[],
    startY: number,
    width: number,
  ): void {
    const fontSize = 11;
    const rowHeight = 13;
    const lineHeight = 14;
    const color = rgb(0, 0, 0);
    const maxDescWidth = 270;

    let currentY = startY;

    for (const item of items) {
      // Quantity
      page.drawText(String(item.quantity), {
        x: cols[0],
        y: currentY,
        size: fontSize,
        font,
        color,
      });

      // Unit
      page.drawText(item.unit || '', {
        x: cols[1],
        y: currentY,
        size: fontSize,
        font,
        color,
      });

      // Description (wrapped)
      const descLines = this.wrapText(font, item.description || '', maxDescWidth, fontSize);
      for (let i = 0; i < descLines.length; i++) {
        page.drawText(descLines[i], {
          x: cols[2],
          y: currentY - i * lineHeight,
          size: fontSize,
          font,
          color,
        });
      }

      // Unit Price
      page.drawText(this.formatNumber(item.unitPrice), {
        x: cols[3],
        y: currentY,
        size: fontSize,
        font,
        color,
      });

      // Amount
      page.drawText(this.formatNumber(item.amount), {
        x: cols[4],
        y: currentY,
        size: fontSize,
        font,
        color,
      });

      // Move Y down based on description lines
      const linesUsed = Math.max(descLines.length, 1);
      currentY -= linesUsed * rowHeight;
    }
  }

  private drawWrappedText(
    page: PDFPage,
    font: PDFFont,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    fontSize: number,
    lineHeight: number,
    color: ReturnType<typeof rgb>,
  ): void {
    const lines = this.wrapText(font, text, maxWidth, fontSize);
    for (let i = 0; i < lines.length; i++) {
      page.drawText(lines[i], {
        x,
        y: y - i * lineHeight,
        size: fontSize,
        font,
        color,
      });
    }
  }

  private wrapText(font: PDFFont, text: string, maxWidth: number, fontSize: number): string[] {
    if (!text) return [''];
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
  }

  private paginateItems(items: PrintSalesOrderData['items']): PrintSalesOrderData['items'][] {
    const pages: PrintSalesOrderData['items'][] = [];
    for (let i = 0; i < items.length; i += this.ITEMS_PER_PAGE) {
      pages.push(items.slice(i, i + this.ITEMS_PER_PAGE));
    }
    if (pages.length === 0) {
      pages.push([]);
    }
    return pages;
  }

  private formatNumber(value: number): string {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
