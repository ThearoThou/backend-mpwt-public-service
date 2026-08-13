import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

export interface InvoicePdfData {
  invoiceNumber: string;
  issuedDate: string;
  applicationReferenceNumber: string;
  vehiclePlate: string;
  vehicleMakeModel?: string | null;
  previousInspectionExpiryDate: string;
  inspectionFeeKhr: string;
  serviceFeeKhr: string;
  baseAmount: string;
  lateDays: number;
  lateFee: string;
  totalAmount: string;
  currency: string;
}

export interface ReceiptPdfData {
  receiptNumber: string;
  invoiceNumber: string;
  confirmedDate: string;
  applicationReferenceNumber: string;
  vehiclePlate: string;
  vehicleMakeModel?: string | null;
  inspectionFeeKhr: string;
  serviceFeeKhr: string;
  baseAmount: string;
  lateDays: number;
  lateFee: string;
  totalAmount: string;
  currency: string;
  paymentReference?: string | null;
}

export interface InspectionSheetPdfData {
  receiptNumber: string;
  applicationReferenceNumber: string;
  vehiclePlate: string;
  vehicleMakeModel?: string | null;
  vehicleClass?: string | null;
  inspectionCategory?: string | null;
}

type DocumentRow = [label: string, value: string];

const PDF_FONT_FILE = 'NotoSansKhmer-Regular.ttf';
const requirePuppeteer = createRequire(__filename);

@Injectable()
export class PaymentPdfService {
  async generateInvoice(data: InvoicePdfData): Promise<Buffer> {
    return this.generateDocument({
      title: 'MPWT Demo Invoice',
      heading: 'វិក្កយបត្រ / Invoice',
      rows: [
        ['Invoice number', data.invoiceNumber],
        ['Issued date', data.issuedDate],
        ['Application reference', data.applicationReferenceNumber],
        ['Vehicle plate', data.vehiclePlate],
        ...optionalRow('Vehicle', data.vehicleMakeModel),
        ['Previous inspection expiry date', data.previousInspectionExpiryDate],
      ],
      summary: [
        ['Inspection fee', data.inspectionFeeKhr, data.currency],
        ['Service fee', data.serviceFeeKhr, data.currency],
        ['Base amount', data.baseAmount, data.currency],
        ['Late days', String(data.lateDays), 'days'],
        ['Late fee', data.lateFee, data.currency],
        ['Total due', data.totalAmount, data.currency],
      ],
      showDemoNotice: false,
    });
  }

  async generateReceipt(data: ReceiptPdfData): Promise<Buffer> {
    return this.generateDocument({
      title: 'MPWT Demo Receipt',
      heading: 'បង្កាន់ដៃទទួលប្រាក់',
      rows: [
        ['Receipt number', data.receiptNumber],
        ['Invoice number', data.invoiceNumber],
        ['Payment date', data.confirmedDate],
        ['Application reference', data.applicationReferenceNumber],
        ['Vehicle plate', data.vehiclePlate],
        ...optionalRow('Vehicle', data.vehicleMakeModel),
        ...optionalRow('Payment reference', data.paymentReference),
      ],
      summary: [
        ['Inspection fee', data.inspectionFeeKhr, data.currency],
        ['Service fee', data.serviceFeeKhr, data.currency],
        ['Base amount', data.baseAmount, data.currency],
        ['Late days', String(data.lateDays), 'days'],
        ['Late fee', data.lateFee, data.currency],
        ['Total paid', data.totalAmount, data.currency],
      ],
      showDemoNotice: false,
    });
  }

  async generateInspectionSheet(data: InspectionSheetPdfData): Promise<Buffer> {
    return this.generateDocument({
      title: 'MPWT Demo Inspection Sheet',
      heading: 'ប័ណ្ណត្រួតពិនិត្យយានយន្ត',
      rows: [
        ['Receipt number', data.receiptNumber],
        ['Application reference', data.applicationReferenceNumber],
        ['Vehicle plate', data.vehiclePlate],
        ...optionalRow('Vehicle', data.vehicleMakeModel),
        ...optionalRow('Vehicle class', data.vehicleClass),
        ...optionalRow('Inspection category', data.inspectionCategory),
      ],
      inspectionRecord: true,
      showDemoNotice: false,
    });
  }

  private async generateDocument({
    title,
    heading,
    rows,
    summary,
    footer,
    inspectionRecord = false,
    showDemoNotice = true,
  }: {
    title: string;
    heading: string;
    rows: DocumentRow[];
    summary?: Array<[string, string, string]>;
    footer?: string;
    inspectionRecord?: boolean;
    showDemoNotice?: boolean;
  }): Promise<Buffer> {
    const browser = await this.getPuppeteer().launch({ headless: true });

    try {
      const page = await browser.newPage();
      await page.setContent(
        this.documentHtml({
          title,
          heading,
          rows,
          summary,
          footer,
          inspectionRecord,
          showDemoNotice,
        }),
        { waitUntil: 'load' },
      );
      await page.evaluate(async () => document.fonts.ready);

      return Buffer.from(
        await page.pdf({
          format: 'A4',
          margin: { top: '48px', right: '48px', bottom: '48px', left: '48px' },
          printBackground: true,
        }),
      );
    } finally {
      await browser.close();
    }
  }

  private documentHtml({
    title,
    heading,
    rows,
    summary,
    footer,
    inspectionRecord,
    showDemoNotice,
  }: {
    title: string;
    heading: string;
    rows: DocumentRow[];
    summary?: Array<[string, string, string]>;
    footer?: string;
    inspectionRecord: boolean;
    showDemoNotice: boolean;
  }): string {
    const fontData = readFileSync(this.fontPath()).toString('base64');
    const details = rows
      .map(
        ([label, value]) =>
          `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`,
      )
      .join('');
    const paymentSummary =
      summary === undefined
        ? ''
        : `<section><h3>Payment summary</h3>${summary
            .map(
              ([label, amount, unit]) =>
                `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(formatAmount(amount))} ${escapeHtml(unit)}</p>`,
            )
            .join('')}</section>`;
    const inspectionSection = inspectionRecord
      ? `<section><h3>Physical inspection record</h3><p>Inspection date: ______________________________</p><p>Inspector: _____________________________________</p><p>Result: [ ] PASS &nbsp;&nbsp;&nbsp; [ ] FAIL</p><p>Notes: _________________________________________</p><p>________________________________________________</p><p>________________________________________________</p></section>`
      : '';

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @font-face { font-family: "Noto Sans Khmer"; src: url("data:font/ttf;base64,${fontData}") format("truetype"); }
    @page { size: A4; margin: 0; }
    body { color: #000; font-family: "Noto Sans Khmer", Arial, sans-serif; font-size: 10pt; line-height: 1.35; margin: 48px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 17pt; margin-bottom: 4px; }
    h2 { font-family: "Noto Sans Khmer", Arial, sans-serif; font-size: 12pt; font-weight: 400; margin-bottom: 6px; }
    h3 { font-size: 11pt; margin-bottom: 6px; }
    .demo-notice { color: #8A1C1C; font-size: 9pt; margin-bottom: 18px; }
    .details p, section p { margin-bottom: 4px; }
    section { margin-top: 18px; }
    .footer { margin-top: 18px; font-size: 9pt; }
  </style>
</head>
<body>
  <h1>MPWT Vehicle Inspection Renewal Service</h1>
  <h2>${escapeHtml(heading)}</h2>
  ${showDemoNotice ? '<p class="demo-notice">Internship / Demo System - not an official payment document</p>' : ''}
  <div class="details">${details}</div>
  ${paymentSummary}
  ${inspectionSection}
  ${footer === undefined ? '' : `<p class="footer">${escapeHtml(footer)}</p>`}
</body>
</html>`;
  }

  private fontPath(): string {
    const compiledAsset = join(__dirname, 'assets', 'fonts', PDF_FONT_FILE);
    if (existsSync(compiledAsset)) {
      return compiledAsset;
    }

    const sourceAsset = resolve(
      process.cwd(),
      'src',
      'payments',
      'assets',
      'fonts',
      PDF_FONT_FILE,
    );
    if (existsSync(sourceAsset)) {
      return sourceAsset;
    }

    throw new Error(
      `Payment PDF Khmer font asset was not found: ${PDF_FONT_FILE}`,
    );
  }

  protected getPuppeteer(): Pick<typeof import('puppeteer'), 'launch'> {
    return requirePuppeteer('puppeteer') as Pick<
      typeof import('puppeteer'),
      'launch'
    >;
  }
}

function optionalRow(
  label: string,
  value: string | null | undefined,
): DocumentRow[] {
  return value === null || value === undefined || value === ''
    ? []
    : [[label, value]];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const escaped: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return escaped[character];
  });
}

function formatAmount(value: string): string {
  const [whole, fraction] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
