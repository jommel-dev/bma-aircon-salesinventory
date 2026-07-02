import { Injectable } from '@angular/core';
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, degrees } from 'pdf-lib';
import { MaterialSalesOrderDetail } from './sales-order-material.service';
import { BusinessProfileSettings } from './business-settings.service';

// ─── Font Bundle Interface ──────────────────────────────────────────────────

export interface QuotationFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

// ─── Configuration Constants ────────────────────────────────────────────────

export interface QuotationPdfConfig {
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  logoMaxHeight: number;
  disclaimerMinBottomSpacing: number;
  watermarkOpacity: number;
  watermarkFontSize: number;
  watermarkRotation: number;
  headerFontSize: number;
  titleFontSize: number;
  bodyFontSize: number;
  tableFontSize: number;
  footerFontSize: number;
}

export const QUOTATION_PDF_CONFIG: QuotationPdfConfig = {
  pageWidth: 595.28,
  pageHeight: 841.89,
  marginTop: 40,
  marginBottom: 50,
  marginLeft: 40,
  marginRight: 40,
  logoMaxHeight: 60,
  disclaimerMinBottomSpacing: 10,
  watermarkOpacity: 0.08,
  watermarkFontSize: 60,
  watermarkRotation: -45,
  headerFontSize: 10,
  titleFontSize: 16,
  bodyFontSize: 9,
  tableFontSize: 9,
  footerFontSize: 8,
};

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class QuotationPdfService {

  /**
   * Validates that the order is eligible for quotation PDF generation.
   * @throws Error if productItems is empty.
   */
  validateOrder(order: MaterialSalesOrderDetail): void {
    if (!order.productItems || order.productItems.length === 0) {
      throw new Error('At least one product item is required');
    }
  }

  /**
   * Formats a number as a monetary string with 2 decimal places and thousands separators.
   * e.g., 1234.5 → "1,234.50"
   */
  formatMoney(value: number): string {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Formats a Date as "MMMM DD, YYYY" (e.g., "June 14, 2026").
   */
  formatDate(date: Date): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const month = months[date.getMonth()];
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month} ${day}, ${year}`;
  }

  /**
   * Calculates the line total for an item: max(0, rate - discount) * qty.
   */
  calculateLineTotal(rate: number, discount: number, qty: number): number {
    return Math.max(0, rate - discount) * qty;
  }

  /**
   * Calculates the grand total as the sum of all line totals.
   */
  calculateGrandTotal(items: Array<{ rate: number; discount: number; qty: number }>): number {
    return items.reduce((sum, item) => {
      return sum + this.calculateLineTotal(item.rate, item.discount, item.qty);
    }, 0);
  }

  /**
   * Wraps text into lines that do not exceed maxWidth when rendered with the given font and size.
   */
  wrapText(font: PDFFont, text: string, maxWidth: number, fontSize: number): string[] {
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

  /**
   * Scales logo dimensions to fit within maxHeight while preserving the aspect ratio.
   */
  scaleLogo(
    originalWidth: number,
    originalHeight: number,
    maxHeight: number,
  ): { width: number; height: number } {
    if (originalHeight <= maxHeight) {
      return { width: originalWidth, height: originalHeight };
    }
    const scale = maxHeight / originalHeight;
    return {
      width: originalWidth * scale,
      height: maxHeight,
    };
  }

  /**
   * Builds the display description for a line item.
   * Appends brand and itemCode in brackets when present.
   * Format: "description [brand - itemCode]"
   */
  buildItemDescription(description: string, brand: string | null, itemCode: string | null): string {
    const parts: string[] = [];
    if (brand && brand.trim()) {
      parts.push(brand.trim());
    }
    if (itemCode && itemCode.trim()) {
      parts.push(itemCode.trim());
    }

    if (parts.length > 0) {
      return `${description} [${parts.join(' - ')}]`;
    }
    return description;
  }

  // ─── Header & Customer Section Methods ────────────────────────────────────

  /**
   * Fetches and embeds a logo image into the PDF document.
   * Supports PNG and JPEG formats. Returns null if fetch fails or format is unsupported.
   */
  async fetchAndEmbedLogo(pdfDoc: PDFDocument, logoUrl: string): Promise<PDFImage | null> {
    try {
      const response = await fetch(logoUrl);
      if (!response.ok) {
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Determine format from content type or URL extension
      const contentType = response.headers.get('content-type') || '';
      const urlLower = logoUrl.toLowerCase();

      if (contentType.includes('png') || urlLower.endsWith('.png')) {
        return await pdfDoc.embedPng(uint8Array);
      } else if (
        contentType.includes('jpeg') ||
        contentType.includes('jpg') ||
        urlLower.endsWith('.jpg') ||
        urlLower.endsWith('.jpeg')
      ) {
        return await pdfDoc.embedJpg(uint8Array);
      }

      // Unsupported format
      return null;
    } catch {
      // Skip logo on any error (network, parsing, etc.)
      return null;
    }
  }

  /**
   * Draws the business header section on the page.
   * Logo on the left, business text info (name, address, contact, email) stacked on the right.
   * Omits any field that is null/empty.
   *
   * @param page The PDF page to draw on.
   * @param fonts Font bundle with regular, bold, and italic variants.
   * @param businessProfile The business profile settings (can be null).
   * @param config PDF configuration constants.
   * @param pdfDoc The PDF document (needed for embedding logo).
   * @returns The Y position after drawing the header.
   */
  async drawBusinessHeader(
    page: PDFPage,
    fonts: QuotationFonts,
    businessProfile: BusinessProfileSettings | null,
    config: QuotationPdfConfig = QUOTATION_PDF_CONFIG,
    pdfDoc?: PDFDocument,
  ): Promise<number> {
    if (!businessProfile) {
      // No business profile, return starting position unchanged
      return config.pageHeight - config.marginTop;
    }

    const startY = config.pageHeight - config.marginTop;
    const lineHeight = config.headerFontSize + 4;
    let logoWidth = 0;
    let logoEndX = config.marginLeft;

    // Draw logo on the left if available
    if (businessProfile.businessLogo && pdfDoc) {
      const logoImage = await this.fetchAndEmbedLogo(pdfDoc, businessProfile.businessLogo);
      if (logoImage) {
        const scaled = this.scaleLogo(
          logoImage.width,
          logoImage.height,
          config.logoMaxHeight,
        );
        page.drawImage(logoImage, {
          x: config.marginLeft,
          y: startY - scaled.height,
          width: scaled.width,
          height: scaled.height,
        });
        logoWidth = scaled.width;
        logoEndX = config.marginLeft + logoWidth + 15; // 15px gap between logo and text
      }
    }

    // Draw text info on the right side of the logo
    const textX = logoEndX;
    let currentY = startY - config.headerFontSize; // Align text baseline near top

    // Build list of non-empty fields
    const headerFields: Array<{ text: string; font: PDFFont }> = [];

    if (businessProfile.businessName?.trim()) {
      headerFields.push({ text: businessProfile.businessName.trim(), font: fonts.bold });
    }
    if (businessProfile.businessAddress?.trim()) {
      headerFields.push({ text: businessProfile.businessAddress.trim(), font: fonts.regular });
    }
    if (businessProfile.businessContact?.trim()) {
      headerFields.push({ text: businessProfile.businessContact.trim(), font: fonts.regular });
    }
    if (businessProfile.businessEmail?.trim()) {
      headerFields.push({ text: businessProfile.businessEmail.trim(), font: fonts.regular });
    }

    for (const field of headerFields) {
      page.drawText(field.text, {
        x: textX,
        y: currentY,
        size: config.headerFontSize,
        font: field.font,
        color: rgb(0, 0, 0),
      });
      currentY -= lineHeight;
    }

    // Return the lowest Y position (account for both logo height and text height)
    const textBottomY = startY - (headerFields.length * lineHeight);
    const logoBottomY = businessProfile.businessLogo ? startY - config.logoMaxHeight : startY;
    const bottomY = Math.min(textBottomY, logoBottomY);

    return bottomY - 10; // 10px spacing below header
  }

  /**
   * Draws the customer and order details section on the page.
   * Renders label-value pairs for customer info and order references.
   * Omits any field that is null, undefined, or empty string.
   *
   * @param page The PDF page to draw on.
   * @param fonts Font bundle with regular, bold, and italic variants.
   * @param order The material sales order detail.
   * @param yPosition The Y position to start drawing from.
   * @param config PDF configuration constants.
   * @returns The Y position after drawing the customer section.
   */
  drawCustomerSection(
    page: PDFPage,
    fonts: QuotationFonts,
    order: MaterialSalesOrderDetail,
    yPosition: number,
    config: QuotationPdfConfig = QUOTATION_PDF_CONFIG,
  ): number {
    const lineHeight = config.bodyFontSize + 5;
    const labelX = config.marginLeft;
    const valueX = config.marginLeft + 110; // Offset for value column
    let currentY = yPosition;

    // Build the list of fields to display (label-value pairs)
    const fields: Array<{ label: string; value: string }> = [];

    if (order.customerName?.trim()) {
      fields.push({ label: 'Customer:', value: order.customerName.trim() });
    }
    if (order.customerAddress?.trim()) {
      fields.push({ label: 'Address:', value: order.customerAddress.trim() });
    }
    if (order.customerContactPerson?.trim()) {
      fields.push({ label: 'Contact Person:', value: order.customerContactPerson.trim() });
    }
    if (order.customerContactNumber?.trim()) {
      fields.push({ label: 'Contact No.:', value: order.customerContactNumber.trim() });
    }
    if (order.soNumber?.trim()) {
      fields.push({ label: 'Quotation Number:', value: order.soNumber.trim() });
    }

    // Quotation date is always the current date
    fields.push({ label: 'Quotation Date:', value: this.formatDate(new Date()) });

    // Delivery date: use deliveryDate or scheduleDate
    const deliveryDateStr = order.deliveryDate || order.scheduleDate;
    if (deliveryDateStr?.trim()) {
      const deliveryDate = new Date(deliveryDateStr);
      if (!isNaN(deliveryDate.getTime())) {
        fields.push({ label: 'Delivery Date:', value: this.formatDate(deliveryDate) });
      }
    }

    // Draw each field
    for (const field of fields) {
      // Draw label in bold
      page.drawText(field.label, {
        x: labelX,
        y: currentY,
        size: config.bodyFontSize,
        font: fonts.bold,
        color: rgb(0, 0, 0),
      });

      // Draw value in regular
      page.drawText(field.value, {
        x: valueX,
        y: currentY,
        size: config.bodyFontSize,
        font: fonts.regular,
        color: rgb(0, 0, 0),
      });

      currentY -= lineHeight;
    }

    return currentY - 10; // 10px spacing below customer section
  }

  /**
   * Draws the "QUOTATION" title centered horizontally on the page.
   * @param page The PDF page to draw on.
   * @param fonts Object containing regular, bold, and italic PDFFont instances.
   * @param yPosition The Y coordinate for the top of the title text.
   * @param config The PDF configuration constants.
   * @returns The new Y position after drawing the title.
   */
  drawTitle(
    page: PDFPage,
    fonts: { regular: PDFFont; bold: PDFFont; italic: PDFFont },
    yPosition: number,
    config: QuotationPdfConfig = QUOTATION_PDF_CONFIG,
  ): number {
    const titleText = 'QUOTATION';
    const titleWidth = fonts.bold.widthOfTextAtSize(titleText, config.titleFontSize);
    const xPosition = (config.pageWidth - titleWidth) / 2;

    page.drawText(titleText, {
      x: xPosition,
      y: yPosition,
      size: config.titleFontSize,
      font: fonts.bold,
      color: rgb(0, 0, 0),
    });

    return yPosition - config.titleFontSize - 10;
  }

  /**
   * Draws the items table with column headers, line item rows, pagination support,
   * and a grand total row at the bottom of the last page.
   *
   * @param pdfDoc The PDF document (for creating new pages on overflow).
   * @param page The current PDF page to start drawing on.
   * @param fonts Font bundle with regular, bold, and italic variants.
   * @param order The material sales order detail containing productItems.
   * @param yPosition The Y coordinate to start drawing from.
   * @param config The PDF configuration constants.
   * @returns An object with the current page, Y position after the table, and any new pages created.
   */
  drawItemsTable(
    pdfDoc: PDFDocument,
    page: PDFPage,
    fonts: QuotationFonts,
    order: MaterialSalesOrderDetail,
    yPosition: number,
    config: QuotationPdfConfig = QUOTATION_PDF_CONFIG,
  ): { page: PDFPage; yPosition: number; pages: PDFPage[] } {
    const contentWidth = config.pageWidth - config.marginLeft - config.marginRight;
    const rowHeight = config.tableFontSize + 7;
    const minY = config.marginBottom + 30; // Minimum Y threshold above disclaimer/footer
    const newPages: PDFPage[] = [];

    // Column layout (x positions relative to marginLeft) — keep clear gap between Qty and Description
    const qtyDescriptionGap = 12;
    const columns = {
      qty: { x: config.marginLeft, width: 50, align: 'right' as const, label: 'Qty' },
      description: { x: config.marginLeft + 50 + qtyDescriptionGap, width: contentWidth - 50 - qtyDescriptionGap - 70 - 70, align: 'left' as const, label: 'Description' },
      rate: { x: config.marginLeft + contentWidth - 70 - 70, width: 70, align: 'right' as const, label: 'Rate' },
      total: { x: config.marginLeft + contentWidth - 70, width: 70, align: 'right' as const, label: 'Total' },
    };

    let currentPage = page;
    let currentY = yPosition;

    // Helper: draw text right-aligned within a column
    const drawRightAligned = (
      p: PDFPage,
      text: string,
      colX: number,
      colWidth: number,
      y: number,
      font: PDFFont,
    ) => {
      const textWidth = font.widthOfTextAtSize(text, config.tableFontSize);
      p.drawText(text, {
        x: colX + colWidth - textWidth,
        y,
        size: config.tableFontSize,
        font,
        color: rgb(0, 0, 0),
      });
    };

    // Helper: draw column headers
    const drawHeaders = (p: PDFPage, y: number): number => {
      // Draw header labels
      drawRightAligned(p, columns.qty.label, columns.qty.x, columns.qty.width, y, fonts.bold);

      p.drawText(columns.description.label, {
        x: columns.description.x,
        y,
        size: config.tableFontSize,
        font: fonts.bold,
        color: rgb(0, 0, 0),
      });

      drawRightAligned(p, columns.rate.label, columns.rate.x, columns.rate.width, y, fonts.bold);
      drawRightAligned(p, columns.total.label, columns.total.x, columns.total.width, y, fonts.bold);

      // Draw separator line below headers
      const lineY = y - 5;
      p.drawLine({
        start: { x: config.marginLeft, y: lineY },
        end: { x: config.marginLeft + contentWidth, y: lineY },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });

      return lineY - rowHeight + 5;
    };

    // Helper: create a new page and add to tracking array
    const createNewPage = (): PDFPage => {
      const newPage = pdfDoc.addPage([config.pageWidth, config.pageHeight]);
      newPages.push(newPage);
      return newPage;
    };

    // Draw initial column headers
    currentY = drawHeaders(currentPage, currentY);

    // Draw each line item row
    const items = order.productItems || [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const description = item.description;
      const lineTotal = this.calculateLineTotal(item.rate, item.discount, item.qty);

      // Wrap description text to determine row height
      const descMaxWidth = columns.description.width - 5; // Small padding
      const descLines = this.wrapText(fonts.regular, description, descMaxWidth, config.tableFontSize);
      const itemRowHeight = Math.max(rowHeight, descLines.length * (config.tableFontSize + 3));

      // Check if we need to paginate
      if (currentY - itemRowHeight < minY) {
        currentPage = createNewPage();
        currentY = config.pageHeight - config.marginTop;
        currentY = drawHeaders(currentPage, currentY);
      }

      // Draw description (possibly multi-line)
      let descY = currentY;
      for (const line of descLines) {
        currentPage.drawText(line, {
          x: columns.description.x,
          y: descY,
          size: config.tableFontSize,
          font: fonts.regular,
          color: rgb(0, 0, 0),
        });
        descY -= config.tableFontSize + 3;
      }

      // Draw qty
      drawRightAligned(currentPage, String(item.qty), columns.qty.x, columns.qty.width, currentY, fonts.regular);

      // Draw effective rate (rate - discount, so discount is absorbed into the price)
      const effectiveRate = Math.max(0, item.rate - item.discount);
      drawRightAligned(currentPage, this.formatMoney(effectiveRate), columns.rate.x, columns.rate.width, currentY, fonts.regular);

      // Draw line total
      drawRightAligned(currentPage, this.formatMoney(lineTotal), columns.total.x, columns.total.width, currentY, fonts.regular);

      currentY -= itemRowHeight;
    }

    // Draw grand total row
    // Check if we need a new page for the grand total
    const grandTotalRowHeight = rowHeight + 10;
    if (currentY - grandTotalRowHeight < minY) {
      currentPage = createNewPage();
      currentY = config.pageHeight - config.marginTop;
    }

    // Draw separator line above grand total
    const grandTotalLineY = currentY - 2;
    currentPage.drawLine({
      start: { x: config.marginLeft, y: grandTotalLineY },
      end: { x: config.marginLeft + contentWidth, y: grandTotalLineY },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });

    currentY = grandTotalLineY - rowHeight;

    // Draw "Grand Total" label and amount
    currentPage.drawText('Grand Total', {
      x: columns.description.x,
      y: currentY,
      size: config.tableFontSize,
      font: fonts.bold,
      color: rgb(0, 0, 0),
    });

    const grandTotal = this.calculateGrandTotal(items);
    drawRightAligned(currentPage, this.formatMoney(grandTotal), columns.total.x, columns.total.width, currentY, fonts.bold);

    currentY -= rowHeight;

    return { page: currentPage, yPosition: currentY, pages: newPages };
  }

  /**
   * Draws the remarks section below the items table.
   * Only renders if the order's remarks field contains at least one non-whitespace character.
   * Renders "Remarks:" label in bold followed by wrapped remarks text in regular font.
   *
   * @param page The PDF page to draw on.
   * @param fonts Font bundle with regular, bold, and italic variants.
   * @param order The material sales order detail.
   * @param yPosition The Y position to start drawing from.
   * @param config The PDF configuration constants.
   * @returns The new Y position after drawing (unchanged if remarks are empty/whitespace).
   */
  drawRemarks(
    page: PDFPage,
    fonts: QuotationFonts,
    order: MaterialSalesOrderDetail,
    yPosition: number,
    config: QuotationPdfConfig = QUOTATION_PDF_CONFIG,
  ): number {
    // Only render if remarks contains at least one non-whitespace character
    if (!order.remarks || !order.remarks.trim()) {
      return yPosition;
    }

    const lineHeight = config.bodyFontSize + 4;
    const contentWidth = config.pageWidth - config.marginLeft - config.marginRight;
    let currentY = yPosition;

    // Draw "Remarks:" label in bold
    page.drawText('Remarks:', {
      x: config.marginLeft,
      y: currentY,
      size: config.bodyFontSize,
      font: fonts.bold,
      color: rgb(0, 0, 0),
    });
    currentY -= lineHeight;

    // Wrap and draw the remarks text
    const wrappedLines = this.wrapText(fonts.regular, order.remarks.trim(), contentWidth, config.bodyFontSize);
    for (const line of wrappedLines) {
      page.drawText(line, {
        x: config.marginLeft,
        y: currentY,
        size: config.bodyFontSize,
        font: fonts.regular,
        color: rgb(0, 0, 0),
      });
      currentY -= lineHeight;
    }

    return currentY;
  }

  /**
   * Draws the disclaimer footer at a fixed position near the bottom of the page.
   * Exact text: "Note: This is not an official transaction slip and this will be not a valid for any cases like Refunds, Confirmation of Order"
   * Rendered in red (RGB 255, 0, 0), italic (HelveticaOblique), at footerFontSize.
   * Positioned with minimum 10 points spacing from the page bottom edge.
   * Should be called for every page in the document.
   *
   * @param page The PDF page to draw on.
   * @param fonts Font bundle with regular, bold, and italic variants.
   * @param config The PDF configuration constants.
   */
  drawDisclaimer(
    page: PDFPage,
    fonts: QuotationFonts,
    config: QuotationPdfConfig = QUOTATION_PDF_CONFIG,
  ): void {
    const disclaimerText =
      'Note: This is not an official transaction slip and this will be not a valid for any cases like Refunds, Confirmation of Order';
    const contentWidth = config.pageWidth - config.marginLeft - config.marginRight;
    const lineHeight = config.footerFontSize + 3;

    // Wrap the disclaimer text if it exceeds content width
    const wrappedLines = this.wrapText(fonts.italic, disclaimerText, contentWidth, config.footerFontSize);

    // Position: fixed at bottom of page, ensuring minimum 10 points from bottom edge
    // Start Y from bottom: disclaimerMinBottomSpacing (10) + 10 = 20 points from bottom edge
    // Then add space for each line going upward
    const startY = config.disclaimerMinBottomSpacing + 10 + ((wrappedLines.length - 1) * lineHeight);

    let currentY = startY;
    for (const line of wrappedLines) {
      page.drawText(line, {
        x: config.marginLeft,
        y: currentY,
        size: config.footerFontSize,
        font: fonts.italic,
        color: rgb(1, 0, 0), // Red: RGB(255, 0, 0) → pdf-lib uses 0-1 scale
      });
      currentY -= lineHeight;
    }
  }

  /**
   * Draws a diagonal "QUOTATION ONLY" watermark centered on the page with low opacity.
   * @param page The PDF page to draw on.
   * @param fonts Object containing regular, bold, and italic PDFFont instances.
   * @param config The PDF configuration constants.
   */
  drawWatermark(
    page: PDFPage,
    fonts: { regular: PDFFont; bold: PDFFont; italic: PDFFont },
    config: QuotationPdfConfig = QUOTATION_PDF_CONFIG,
  ): void {
    const watermarkText = 'QUOTATION ONLY';
    const radians = config.watermarkRotation * (Math.PI / 180);
    const textWidth = fonts.bold.widthOfTextAtSize(watermarkText, config.watermarkFontSize);
    const textHeight = config.watermarkFontSize;

    // Center the watermark on the page, accounting for rotation
    const xPosition = (config.pageWidth - textWidth * Math.cos(Math.abs(radians))) / 2;
    const yPosition = (config.pageHeight + textWidth * Math.sin(Math.abs(radians))) / 2 - textHeight / 2;

    page.drawText(watermarkText, {
      x: xPosition,
      y: yPosition,
      size: config.watermarkFontSize,
      font: fonts.bold,
      color: rgb(0.7, 0.7, 0.7),
      opacity: config.watermarkOpacity,
      rotate: degrees(config.watermarkRotation),
    });
  }

  // ─── Main Orchestration Method ──────────────────────────────────────────────

  /**
   * Generates a quotation PDF for a Material Sales Order.
   * Orchestrates all rendering functions in the correct order:
   * validate → create PDFDocument → embed fonts → draw header, title, customer section,
   * items table, remarks → apply disclaimer and watermark to all pages.
   *
   * @param order The material sales order detail.
   * @param businessProfile The business profile settings (can be null — no header drawn).
   * @returns A base64 data URI string (`data:application/pdf;base64,...`).
  * @throws Error if order has no product items.
   */
  async generateQuotationPdf(
    order: MaterialSalesOrderDetail,
    businessProfile: BusinessProfileSettings | null,
  ): Promise<string> {
    const config = QUOTATION_PDF_CONFIG;

    // 1. Validate preconditions
    this.validateOrder(order);

    // 2. Create PDF document
    const pdfDoc = await PDFDocument.create();

    // 3. Embed standard fonts
    const fonts: QuotationFonts = {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    };

    // 4. Create first page
    const firstPage = pdfDoc.addPage([config.pageWidth, config.pageHeight]);

    // 5. Draw business header (returns Y position)
    let yPosition = await this.drawBusinessHeader(firstPage, fonts, businessProfile, config, pdfDoc);

    // 6. Draw "QUOTATION" title
    yPosition = this.drawTitle(firstPage, fonts, yPosition, config);

    // 7. Draw customer and order details section
    yPosition = this.drawCustomerSection(firstPage, fonts, order, yPosition, config);

    // 8. Draw items table (may paginate across multiple pages)
    const tableResult = this.drawItemsTable(pdfDoc, firstPage, fonts, order, yPosition, config);
    const currentPage = tableResult.page;
    yPosition = tableResult.yPosition;

    // 9. Draw remarks on the current page (after table)
    yPosition = this.drawRemarks(currentPage, fonts, order, yPosition, config);

    // 10. Apply disclaimer and watermark to ALL pages
    const allPages = pdfDoc.getPages();
    for (const page of allPages) {
      this.drawDisclaimer(page, fonts, config);
      this.drawWatermark(page, fonts, config);
    }

    // 11. Save the document
    const pdfBytes = await pdfDoc.save();

    // 12. Convert to base64 data URI using chunk-based approach to avoid call stack overflow
    const chunkSize = 8192;
    let binaryString = '';
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      const chunk = pdfBytes.subarray(i, i + chunkSize);
      binaryString += String.fromCharCode(...chunk);
    }
    const base64String = btoa(binaryString);

    return `data:application/pdf;base64,${base64String}`;
  }
}
