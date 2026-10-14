import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import type { Browser } from 'puppeteer';

export interface CertificatePdfInput {
  certificate: {
    certificateNumber: string;
    issuedAt: Date;
  };
  vehicle: {
    make: string;
    model: string;
    manufactureYear: number | null;
    vehicleType: string;
    colour: string | null;
    engineNumber: string | null;
    chassisNumber: string;
    numberOfCylinders: number | null;
    engineDisplacementCc: number | null;
    enginePowerHp: string | null;
    fuelType: string | null;
    numberOfSeats: number | null;
    numberOfAxles: number | null;
    steering: string | null;
    vehicleWeightKg: number | null;
    maximumLoadKg: number | null;
    maximumGrossWeightKg: number | null;
    wheelSize: string | null;
    lengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
  };
  inspection: {
    completedAt: Date;
    validUntil: string;
  };
  note?: string | null;
}

const PDF_FONT_FILE = 'NotoSansKhmer-Regular.ttf';
const requirePuppeteer = createRequire(__filename);

@Injectable()
export class CertificatePdfService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

  async generate(input: CertificatePdfInput): Promise<Buffer> {
    const html = this.renderHtml(input);
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(async () => document.fonts.ready);
      const output = Buffer.from(
        await page.pdf({
          format: 'A4',
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
          printBackground: true,
          preferCSSPageSize: true,
        }),
      );
      if (!output.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        throw new Error('Certificate renderer did not produce a PDF');
      }
      return output;
    } finally {
      await page.close();
    }
  }

  renderHtml(input: CertificatePdfInput): string {
    validateCertificatePdfInput(input);
    const fontData = readFileSync(this.fontPath()).toString('base64');
    const { certificate, vehicle, inspection } = input;
    const cell = (label: string, value: string) => `
      <div class="cell">
        <div class="label"><span>${escapeHtml(khmerLabel(label))}</span><small>${escapeHtml(label)}</small></div>
        <div class="value">${escapeHtml(value)}</div>
      </div>`;

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Certificate of Vehicle Technical Inspection</title>
  <style>
    @font-face { font-family: "Noto Sans Khmer"; src: url("data:font/ttf;base64,${fontData}") format("truetype"); }
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #111; font-family: "Noto Sans Khmer", Arial, sans-serif; }
    body { width: 210mm; min-height: 297mm; padding: 13mm 14mm; font-size: 9pt; }
    .header { display: grid; grid-template-columns: 1fr 1.25fr 1fr; align-items: start; min-height: 35mm; }
    .ministry { font-size: 7.4pt; line-height: 1.35; padding-top: 9mm; }
    .kingdom { text-align: center; font-weight: 700; line-height: 1.45; font-size: 9.2pt; }
    .emblem-slot { border: .3mm solid #222; border-radius: 50%; height: 21mm; margin: 1mm auto 0; width: 21mm; }
    .certificate-no { font-size: 8pt; margin: -6mm 0 2mm; text-align: left; }
    h1 { margin: 2mm 0 4mm; text-align: center; font-size: 12.5pt; line-height: 1.35; text-transform: uppercase; }
    h1 small { display:block; font-size: 10pt; text-transform: none; }
    .identity { display: grid; grid-template-columns: 1.35fr 1fr 1fr; border: 0.35mm solid #111; border-bottom: 0; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); border-left: 0.35mm solid #111; border-top: 0.35mm solid #111; }
    .cell { min-height: 20mm; border-right: 0.35mm solid #111; border-bottom: 0.35mm solid #111; padding: 2.2mm 2.5mm; text-align: center; overflow-wrap: anywhere; }
    .identity .cell { min-height: 18mm; }
    .label { min-height: 7mm; font-size: 7.6pt; line-height: 1.25; }
    .label span, .label small { display:block; }
    .label small { font-size: 6.8pt; font-weight: 600; }
    .value { margin-top: 1.2mm; font-size: 10.2pt; font-weight: 700; line-height: 1.25; }
    .compact .cell { min-height: 18mm; }
    .identifiers { grid-template-columns: 0.75fr 1.15fr 1.45fr; }
    .note { display: grid; grid-template-columns: 1fr 30mm; border: 0.35mm solid #111; border-top: 0; min-height: 27mm; }
    .note-copy { padding: 2.5mm; border-right: 0.35mm solid #111; }
    .note-label { font-weight: 700; margin-bottom: 2mm; }
    .note-value { white-space: pre-wrap; overflow-wrap: anywhere; }
    .qr-slot { align-items:center; display:flex; justify-content:center; min-height:26mm; }
    .qr-frame { border:.35mm solid #111; height:22mm; width:22mm; }
  </style>
</head>
<body>
  <header class="header">
    <div class="ministry">
      <strong>ក្រសួងសាធារណការ និងដឹកជញ្ជូន</strong><br>
      MINISTRY OF PUBLIC WORKS AND TRANSPORT<br><br>
      <strong>អគ្គនាយកដ្ឋានដឹកជញ្ជូនផ្លូវគោក</strong><br>
      GENERAL DEPARTMENT OF LAND TRANSPORT
    </div>
    <div class="kingdom">ព្រះរាជាណាចក្រកម្ពុជា<br>KINGDOM OF CAMBODIA<br>ជាតិ សាសនា ព្រះមហាក្សត្រ<br>NATION RELIGION KING</div>
    <div class="emblem-slot" aria-label="Official emblem placement"></div>
  </header>
  <div class="certificate-no">លេខ / Certificate No. ${escapeHtml(certificate.certificateNumber)}</div>
  <h1>វិញ្ញាបនបត្រត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត<small>CERTIFICATE OF VEHICLE TECHNICAL INSPECTION</small></h1>
  <section class="identity">
    ${cell('Certificate Number', certificate.certificateNumber)}
    ${cell('Inspection Date', formatCambodiaDate(inspection.completedAt))}
    ${cell('Expiry Date', formatFrozenDate(inspection.validUntil))}
  </section>
  <section class="grid">
    ${cell('Mark / Make', formatPrintedMark(vehicle.make, vehicle.model))}
    ${cell('Type', formatVehicleType(vehicle.vehicleType))}
    ${cell('Colour', requiredText(vehicle.colour, 'vehicle.colour'))}
    ${cell('Year Made', String(requiredNumber(vehicle.manufactureYear, 'vehicle.manufactureYear')))}
    ${cell('Steering', formatVehicleEnum(vehicle.steering, 'vehicle.steering'))}
    ${cell('Cylinders / Displacement / Power', `${requiredNumber(vehicle.numberOfCylinders, 'vehicle.numberOfCylinders')} / ${formatIntegerUnit(vehicle.engineDisplacementCc, 'cc', 'vehicle.engineDisplacementCc')} / ${formatTextUnit(vehicle.enginePowerHp, 'HP', 'vehicle.enginePowerHp')}`)}
  </section>
  <section class="grid compact">
    ${cell('Vehicle Weight', formatIntegerUnit(vehicle.vehicleWeightKg, 'kg', 'vehicle.vehicleWeightKg'))}
    ${cell('Maximum Load', formatIntegerUnit(vehicle.maximumLoadKg, 'kg', 'vehicle.maximumLoadKg'))}
    ${cell('Maximum Gross Weight', formatIntegerUnit(vehicle.maximumGrossWeightKg, 'kg', 'vehicle.maximumGrossWeightKg'))}
    ${cell('Number of Seats', String(requiredNumber(vehicle.numberOfSeats, 'vehicle.numberOfSeats')))}
    ${cell('Type of Fuel', formatVehicleEnum(vehicle.fuelType, 'vehicle.fuelType'))}
    ${cell('Wheel Size', requiredText(vehicle.wheelSize, 'vehicle.wheelSize'))}
    ${cell('Length', `${formatMillimetresAsMetres(requiredNumber(vehicle.lengthMm, 'vehicle.lengthMm'))} m`)}
    ${cell('Width', `${formatMillimetresAsMetres(requiredNumber(vehicle.widthMm, 'vehicle.widthMm'))} m`)}
    ${cell('Height', `${formatMillimetresAsMetres(requiredNumber(vehicle.heightMm, 'vehicle.heightMm'))} m`)}
  </section>
  <section class="grid compact identifiers">
    ${cell('Number of Axles', String(requiredNumber(vehicle.numberOfAxles, 'vehicle.numberOfAxles')))}
    ${cell('Engine Number', requiredText(vehicle.engineNumber, 'vehicle.engineNumber'))}
    ${cell('Body / Chassis Number', vehicle.chassisNumber)}
  </section>
  <section class="note">
    <div class="note-copy"><div class="note-label">សម្គាល់ / Note</div><div class="note-value">${escapeHtml(input.note ?? '')}</div></div>
    <div class="qr-slot" aria-label="Certificate verification QR placement"><div class="qr-frame"></div></div>
  </section>
</body>
</html>`;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browserPromise === null) return;
    const browser = await this.browserPromise;
    this.browserPromise = null;
    await browser.close();
  }

  private getBrowser(): Promise<Browser> {
    if (this.browserPromise === null) {
      this.browserPromise = this.getPuppeteer().launch({ headless: true });
    }
    return this.browserPromise;
  }

  private fontPath(): string {
    const compiledAsset = join(
      __dirname,
      '..',
      'payments',
      'assets',
      'fonts',
      PDF_FONT_FILE,
    );
    if (existsSync(compiledAsset)) return compiledAsset;
    const sourceAsset = resolve(
      process.cwd(),
      'src',
      'payments',
      'assets',
      'fonts',
      PDF_FONT_FILE,
    );
    if (existsSync(sourceAsset)) return sourceAsset;
    throw new Error(
      `Certificate PDF Khmer font asset was not found: ${PDF_FONT_FILE}`,
    );
  }

  protected getPuppeteer(): Pick<typeof import('puppeteer'), 'launch'> {
    return requirePuppeteer('puppeteer') as Pick<
      typeof import('puppeteer'),
      'launch'
    >;
  }
}

export function formatPrintedMark(make: string, model: string): string {
  requiredText(model, 'vehicle.model');
  return requiredText(make, 'vehicle.make');
}

export function formatVehicleType(vehicleType: string): string {
  const value = requiredText(vehicleType, 'vehicle.vehicleType');
  return ({ FAMILY_PASSENGER: 'Family passenger', PASSENGER_VAN: 'Passenger van' } as Record<string, string>)[value] ?? value;
}

function formatVehicleEnum(value: string | null, field: string): string {
  const normalized = requiredText(value, field);
  return ({ LEFT: 'Left', RIGHT: 'Right', PETROL: 'Petrol', DIESEL: 'Diesel', ELECTRIC: 'Electric', HYBRID: 'Hybrid' } as Record<string, string>)[normalized] ?? normalized;
}

function khmerLabel(label: string): string {
  return ({
    'Certificate Number': 'លេខវិញ្ញាបនបត្រ', 'Inspection Date': 'កាលបរិច្ឆេទត្រួតពិនិត្យ', 'Expiry Date': 'កាលបរិច្ឆេទផុតកំណត់',
    'Mark / Make': 'ម៉ាក', Type: 'ប្រភេទ', Colour: 'ពណ៌', 'Year Made': 'ឆ្នាំផលិត', Steering: 'ចង្កូត',
    'Cylinders / Displacement / Power': 'ស៊ីឡាំង / ទំហំម៉ាស៊ីន / កម្លាំងម៉ាស៊ីន', 'Vehicle Weight': 'ទម្ងន់យានយន្ត', 'Maximum Load': 'ទម្ងន់ផ្ទុកអតិបរមា',
    'Maximum Gross Weight': 'ទម្ងន់សរុបអតិបរមា', 'Number of Seats': 'ចំនួនកៅអី', 'Type of Fuel': 'ប្រភេទប្រេងឥន្ធនៈ', 'Wheel Size': 'ទំហំកង់',
    Length: 'បណ្តោយ', Width: 'ទទឹង', Height: 'កម្ពស់', 'Number of Axles': 'ចំនួនអ័ក្ស', 'Engine Number': 'លេខម៉ាស៊ីន', 'Body / Chassis Number': 'លេខតួរថយន្ត',
  } as Record<string, string>)[label] ?? label;
}

export function formatCambodiaDate(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('Certificate PDF field is invalid: date');
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Phnom_Penh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('day')}-${part('month')}-${part('year')}`;
}

export function formatFrozenDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new Error('Certificate PDF field is invalid: inspection.validUntil');
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function formatMillimetresAsMetres(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Certificate PDF dimension must be a non-negative integer');
  }
  const whole = Math.floor(value / 1000);
  const remainder = String(value % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return remainder === '' ? String(whole) : `${whole}.${remainder}`;
}

function validateCertificatePdfInput(input: CertificatePdfInput): void {
  requiredText(
    input.certificate.certificateNumber,
    'certificate.certificateNumber',
  );
  formatCambodiaDate(input.certificate.issuedAt);
  formatCambodiaDate(input.inspection.completedAt);
  formatFrozenDate(input.inspection.validUntil);
  requiredText(input.vehicle.make, 'vehicle.make');
  requiredText(input.vehicle.model, 'vehicle.model');
  requiredText(input.vehicle.vehicleType, 'vehicle.vehicleType');
  requiredText(input.vehicle.chassisNumber, 'vehicle.chassisNumber');
}

function requiredText(value: string | null, field: string): string {
  if (value === null || value.trim() === '') {
    throw new Error(`Certificate PDF field is required: ${field}`);
  }
  return value;
}

function requiredNumber(value: number | null, field: string): number {
  if (value === null || !Number.isFinite(value)) {
    throw new Error(`Certificate PDF field is required: ${field}`);
  }
  return value;
}

function formatIntegerUnit(
  value: number | null,
  unit: string,
  field: string,
): string {
  const number = requiredNumber(value, field);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`Certificate PDF field must be an integer: ${field}`);
  }
  return `${number} ${unit}`;
}

function formatTextUnit(
  value: string | null,
  unit: string,
  field: string,
): string {
  return `${requiredText(value, field)} ${unit}`;
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
