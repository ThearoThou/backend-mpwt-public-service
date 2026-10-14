import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import type { Browser } from 'puppeteer';
import QRCode from 'qrcode';

export interface CertificatePdfInput {
  certificate: {
    certificateNumber: string;
    issuedAt: Date;
  };
  vehicle: {
    make: string;
    model: string;
    plateProvince: string;
    plateNumber: string;
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
const SIEMREAP_FONT_FILE = 'siemreap-khmer-400-normal.woff2';
const MOUL_FONT_FILE = 'moul-khmer-400-normal.woff2';
const MPWT_LOGO_FILE = 'mpwt-logo.svg';
const MPWT_NAVY = '#2a3472';
const requirePuppeteer = createRequire(__filename);

@Injectable()
export class CertificatePdfService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

  constructor(private readonly config: ConfigService) {}

  async generate(input: CertificatePdfInput): Promise<Buffer> {
    const html = await this.renderHtml(input);
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

  async renderHtml(input: CertificatePdfInput): Promise<string> {
    validateCertificatePdfInput(input);
    const fontData = readFileSync(this.fontPath()).toString('base64');
    const siemreapFontData = readFileSync(this.siemreapFontPath()).toString(
      'base64',
    );
    const moulFontData = readFileSync(this.moulFontPath()).toString('base64');
    const logoData = readFileSync(this.logoPath()).toString('base64');
    const watermarkLogoData = createDecorativeWatermarkLogoData(logoData);
    const qrDataUrl = await QRCode.toDataURL(this.verificationUrl(input), {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 180,
    });
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
    @font-face { font-family: "Siemreap"; src: url("data:font/woff2;base64,${siemreapFontData}") format("woff2"); }
    @font-face { font-family: "Moul"; src: url("data:font/woff2;base64,${moulFontData}") format("woff2"); }
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #111; font-family: Arial, sans-serif; }
    body { width: 210mm; min-height: 297mm; padding: 8mm 13mm 9mm; font-size: 8.2pt; }
    .legacy-certificate-header { display:none; }
    .header { min-height: 55mm; position:relative; }
    .ministry { align-items: stretch; display: flex; flex-direction:column; gap: 2.4mm; padding-top: 2mm; width:78mm; }
    .ministry-logo { align-self:flex-start; flex: 0 0 auto; height: 19mm; margin-left:18.5mm; object-fit: contain; width: 19mm; }
    .ministry-copy { padding-top: 0; width:100%; }
    .khmer-institution, .kingdom .khmer { color: ${MPWT_NAVY}; font-family: "Moul", sans-serif; font-size: .8rem; font-weight:400; line-height: 1.5; }
    .ministry-copy .khmer-institution { display:block; }
    .ministry-copy .english { color: #222; display: block; font-size: .65rem; line-height: 1.28; margin-top: .55mm; }
    .ministry-copy .english + .khmer-institution { margin-top: 1.15mm; }
    .ministry-number { color: #111; font-family:Arial, "Siemreap", sans-serif; font-size: .85rem; line-height: 1.3; margin-top: 2mm; }
    .ministry-number strong { border-bottom: .25mm dotted #333; display: inline-block; font-size: .9rem; min-width: 42mm; padding-bottom: .45mm; }
    .kingdom { color: #111; left:50%; padding: .15mm 0 3.6mm; position:absolute; text-align: center; top:0; transform:translateX(-50%); line-height: 1.18; }
    .kingdom::after { background:linear-gradient(to right, #111 0 43%, transparent 43% 57%, #111 57% 100%); bottom:0; content:"◆"; font-family:Arial, sans-serif; font-size:4.5pt; height:.25mm; left:50%; line-height:.25mm; position:absolute; transform:translateX(-50%); width:25mm; }
    .kingdom .khmer { display:block; font-size: .8rem; }
    .kingdom .english { display:block; font-size: .65rem; font-weight: 400; margin: .4mm 0 1mm; }
    h1 { color: ${MPWT_NAVY}; font-family: "Moul", sans-serif; font-weight:400; margin: 0 0 3mm; text-align: center; font-size: 1.1rem; line-height: 1.55; text-transform: none; white-space:nowrap; }
    h1 small { color:#1d1d1d; display:block; font-family: Arial, sans-serif; font-size: .95rem; font-weight: 400; letter-spacing: .01em; margin-top: .5mm; text-transform: uppercase; }
    .certificate-table { position:relative; }
    .certificate-table::before { background-image:var(--certificate-watermark, none); background-position:center; background-repeat:no-repeat; background-size:76%; content:""; inset:0; opacity:.42; pointer-events:none; position:absolute; }
    .identity { display: grid; grid-template-columns: repeat(3, 1fr); border: 0.35mm solid #111; border-bottom: 0; position:relative; z-index:1; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); border-left: 0.35mm solid #111; border-top: 0.35mm solid #111; position:relative; z-index:1; }
    .grid + .grid { border-top: 0; }
    .cell { min-height: 25mm; border-right: 0.35mm solid #111; border-bottom: 0.35mm solid #111; padding: 2mm 2.2mm; text-align: center; overflow-wrap: anywhere; }
    .identity .cell { min-height: 22mm; }
    .label { min-height: 11mm; line-height: 1.3; }
    .label span, .label small { display:block; }
    .label span { font-family:"Siemreap", sans-serif; font-size:.9rem; font-weight:400; line-height:1.4; }
    .label small { font-family:Arial, sans-serif; font-size:.75rem; font-weight:400; line-height:1.25; margin-top:.4mm; }
    .value { border-bottom: .25mm dotted #666; font-family:Arial, "Siemreap", sans-serif; margin: 1.2mm auto 0; font-size: .95rem; font-weight: 700; line-height: 1.3; min-height: 6mm; padding: 0 .5mm .55mm; width:88%; max-width:88%; }
    .compact .cell { min-height: 23mm; }
    .identifiers { grid-template-columns: repeat(3, 1fr); }
    .certificate-footer { display:grid; grid-template-columns:1fr 65mm; min-height:32mm; }
    .footer-left { display:flex; flex-direction:column; }
    .note-copy { border:.35mm solid #111; min-height:13mm; padding:2mm 2.2mm; }
    .cmvic-reserve { flex:1 1 auto; min-height:16mm; }
    .note-label { font-family:"Siemreap", sans-serif; font-size: .9rem; font-weight:400; margin-bottom: .65mm; }
    .note-value { font-family:"Siemreap", sans-serif; white-space: pre-wrap; overflow-wrap: anywhere; }
    .footer-right { align-items:center; display:flex; flex-direction:column; gap:1mm; padding-top:1mm; }
    .qr-slot { align-items:center; display:flex; justify-content:center; }
    .qr-column { align-items:center; display:flex; flex-direction:column; gap:1mm; }
    .qr-frame { height:20mm; padding:.45mm; width:20mm; }
    .qr-frame img { display:block; height:100%; width:100%; }
    .signature-notice { border:.25mm solid #111; box-sizing:border-box; font-family:Arial, "Siemreap", sans-serif; line-height:1.2; padding:1mm 1.2mm; text-align:center; width:65mm; }
    .signature-notice .khmer { display:block; font-family:"Siemreap", sans-serif; font-size:.72rem; }
    .signature-notice .english { display:block; font-family:Arial, sans-serif; font-size:.72rem; margin-top:.35mm; }
    .footer-reserve { display:none; }
  </style>
</head>
<body>
  <div class="legacy-certificate-header">
  <header class="header">
    <div class="ministry">
      <img alt="MPWT" class="ministry-logo" src="data:image/svg+xml;base64,${logoData}">
      <div class="ministry-copy">
      <strong>ក្រសួងសាធារណការ និងដឹកជញ្ជូន</strong><br>
      MINISTRY OF PUBLIC WORKS AND TRANSPORT<br><br>
      <strong>អគ្គនាយកដ្ឋានដឹកជញ្ជូនផ្លូវគោក</strong><br>
      GENERAL DEPARTMENT OF LAND TRANSPORT
      </div>
    </div>
    <div class="kingdom">ព្រះរាជាណាចក្រកម្ពុជា<br>KINGDOM OF CAMBODIA<br>ជាតិ សាសនា ព្រះមហាក្សត្រ<br>NATION RELIGION KING</div>
    <div class="certificate-no">លេខ / Certificate No.<br><strong>${escapeHtml(certificate.certificateNumber)}</strong></div>
  </header>
  <h1>វិញ្ញាបនបត្រត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត<small>CERTIFICATE OF VEHICLE TECHNICAL INSPECTION</small></h1>
  </div>
  <header class="header">
    <div class="ministry">
      <img alt="MPWT" class="ministry-logo" src="data:image/svg+xml;base64,${logoData}">
      <div class="ministry-copy">
        <span class="khmer-institution">ក្រសួងសាធារណការ និងដឹកជញ្ជូន</span>
        <span class="english">MINISTRY OF PUBLIC WORKS AND TRANSPORT</span>
        <span class="khmer-institution">អគ្គនាយកដ្ឋានដឹកជញ្ជូនផ្លូវគោក</span>
        <span class="english">GENERAL DEPARTMENT OF LAND TRANSPORT</span>
        <div class="ministry-number">លេខ / No. <strong>${escapeHtml(certificate.certificateNumber)}</strong></div>
      </div>
    </div>
    <div class="kingdom">
      <span class="khmer">ព្រះរាជាណាចក្រកម្ពុជា</span>
      <span class="english">KINGDOM OF CAMBODIA</span>
      <span class="khmer">ជាតិ សាសនា ព្រះមហាក្សត្រ</span>
      <span class="english">NATION RELIGION KING</span>
    </div>
  </header>
  <h1>វិញ្ញាបនបត្រត្រួតពិនិត្យលក្ខណៈបច្ចេកទេសយានយន្ត<small>CERTIFICATE OF VEHICLE TECHNICAL INSPECTION</small></h1>
  <main class="certificate-table" style="--certificate-watermark:url('data:image/svg+xml;base64,${watermarkLogoData}')">
  <section class="identity">
    ${cell('Plate Number', formatPrintedPlate(vehicle.plateProvince, vehicle.plateNumber))}
    ${cell('Inspection Date', formatCambodiaDate(inspection.completedAt))}
    ${cell('Expiry Date', formatFrozenDate(inspection.validUntil))}
  </section>
  <section class="grid">
    ${cell('Mark', formatPrintedMark(vehicle.make, vehicle.model))}
    ${cell('Type', formatVehicleType(vehicle.vehicleType))}
    ${cell('Colour', requiredText(vehicle.colour, 'vehicle.colour'))}
    ${cell('Year Made', String(requiredNumber(vehicle.manufactureYear, 'vehicle.manufactureYear')))}
    ${cell('Steering', formatVehicleEnum(vehicle.steering, 'vehicle.steering'))}
    ${cell('Cylinders / Displacement / Power', `${requiredNumber(vehicle.numberOfCylinders, 'vehicle.numberOfCylinders')} / ${formatIntegerUnit(vehicle.engineDisplacementCc, 'cc', 'vehicle.engineDisplacementCc')} / ${formatTextUnit(vehicle.enginePowerHp, 'HP', 'vehicle.enginePowerHp')}`)}
  </section>
  <section class="grid compact">
    ${cell('Vehicle Weight (kg)', formatIntegerUnit(vehicle.vehicleWeightKg, 'kg', 'vehicle.vehicleWeightKg'))}
    ${cell('Maximum Load (kg)', formatIntegerUnit(vehicle.maximumLoadKg, 'kg', 'vehicle.maximumLoadKg'))}
    ${cell('Maximum Gross Weight (kg)', formatIntegerUnit(vehicle.maximumGrossWeightKg, 'kg', 'vehicle.maximumGrossWeightKg'))}
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
  </main>
  <section class="certificate-footer">
    <div class="footer-left"><div class="note-copy"><div class="note-label">សម្គាល់ / Note:</div><div class="note-value">${escapeHtml(input.note ?? '')}</div></div><div class="cmvic-reserve" aria-label="Reserved approved inspection-mark area"></div></div>
    <div class="footer-right"><div class="qr-slot" aria-label="Certificate verification QR placement"><div class="qr-column"><div class="qr-frame"><img alt="Certificate verification QR" src="${qrDataUrl}"></div><div class="signature-notice"><span class="khmer">វិញ្ញាបនបត្រនេះ មិនចាំបាច់ឱ្យមានហត្ថលេខា</span><span class="english">The Signature is not required in this Certificate</span></div></div></div></div>
  </section>
  <section class="footer-reserve" aria-label="Reserved certificate footer areas"><div></div><div></div></section>
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

  private siemreapFontPath(): string {
    const compiledAsset = join(__dirname, 'assets', SIEMREAP_FONT_FILE);
    if (existsSync(compiledAsset)) return compiledAsset;
    const sourceAsset = resolve(
      process.cwd(),
      'src',
      'certificates',
      'assets',
      SIEMREAP_FONT_FILE,
    );
    if (existsSync(sourceAsset)) return sourceAsset;
    throw new Error(
      `Certificate PDF Khmer font asset was not found: ${SIEMREAP_FONT_FILE}`,
    );
  }

  private moulFontPath(): string {
    const compiledAsset = join(__dirname, 'assets', MOUL_FONT_FILE);
    if (existsSync(compiledAsset)) return compiledAsset;
    const sourceAsset = resolve(
      process.cwd(),
      'src',
      'certificates',
      'assets',
      MOUL_FONT_FILE,
    );
    if (existsSync(sourceAsset)) return sourceAsset;
    throw new Error(
      `Certificate PDF Khmer font asset was not found: ${MOUL_FONT_FILE}`,
    );
  }

  private logoPath(): string {
    const compiledAsset = join(__dirname, 'assets', MPWT_LOGO_FILE);
    if (existsSync(compiledAsset)) return compiledAsset;
    const sourceAsset = resolve(
      process.cwd(),
      'src',
      'certificates',
      'assets',
      MPWT_LOGO_FILE,
    );
    if (existsSync(sourceAsset)) return sourceAsset;
    throw new Error('Certificate MPWT logo asset was not found');
  }

  private verificationUrl(input: CertificatePdfInput): string {
    const origin = this.config
      .getOrThrow<string>('FRONTEND_ORIGIN')
      .replace(/\/$/u, '');
    return `${origin}/services/inspection/certificate/verify?number=${encodeURIComponent(input.certificate.certificateNumber)}`;
  }

  protected getPuppeteer(): Pick<typeof import('puppeteer'), 'launch'> {
    return requirePuppeteer('puppeteer') as Pick<
      typeof import('puppeteer'),
      'launch'
    >;
  }
}

export function formatPrintedMark(make: string, model: string): string {
  return `${requiredText(make, 'vehicle.make')} ${requiredText(model, 'vehicle.model')}`;
}

export function formatPrintedPlate(
  province: string,
  plateNumber: string,
): string {
  return `${requiredText(province, 'vehicle.plateProvince')} ${requiredText(plateNumber, 'vehicle.plateNumber')}`;
}

export function formatVehicleType(vehicleType: string): string {
  const value = requiredText(vehicleType, 'vehicle.vehicleType');
  return (
    (
      {
        FAMILY_PASSENGER: 'Family passenger',
        PASSENGER_VAN: 'Passenger van',
      } as Record<string, string>
    )[value] ?? value
  );
}

function formatVehicleEnum(value: string | null, field: string): string {
  const normalized = requiredText(value, field);
  return (
    (
      {
        LEFT: 'Left',
        RIGHT: 'Right',
        PETROL: 'Petrol',
        DIESEL: 'Diesel',
        ELECTRIC: 'Electric',
        HYBRID: 'Hybrid',
      } as Record<string, string>
    )[normalized] ?? normalized
  );
}

function khmerLabel(label: string): string {
  if (label === 'Plate Number') return 'ផ្លាកលេខ';
  if (label === 'Mark') return 'ម៉ាក';
  if (label === 'Number of Axles') return 'ចំនួនភ្លៅ';
  return (
    (
      {
        'Certificate Number': 'លេខវិញ្ញាបនបត្រ',
        'Inspection Date': 'កាលបរិច្ឆេទត្រួតពិនិត្យ',
        'Expiry Date': 'កាលបរិច្ឆេទផុតកំណត់',
        'Mark / Make': 'ម៉ាក',
        Type: 'ប្រភេទ',
        Colour: 'ពណ៌',
        'Year Made': 'ឆ្នាំផលិត',
        Steering: 'ចង្កូត',
        'Cylinders / Displacement / Power':
          'ស៊ីឡាំង / ទំហំម៉ាស៊ីន / កម្លាំងសេះ',
        'Vehicle Weight (kg)': 'ទម្ងន់យានយន្ត (គីឡូក្រាម)',
        'Maximum Load (kg)': 'ទម្ងន់ផ្ទុកអតិបរមា (គីឡូក្រាម)',
        'Maximum Gross Weight (kg)': 'ទម្ងន់សរុបអតិបរមា (គីឡូក្រាម)',
        'Number of Seats': 'ចំនួនកៅអី',
        'Type of Fuel': 'ប្រភេទប្រេងឥន្ធនៈ',
        'Wheel Size': 'ទំហំកង់',
        Length: 'បណ្តោយ',
        Width: 'ទទឹង',
        Height: 'កម្ពស់',
        'Number of Axles': 'ចំនួនអ័ក្ស',
        'Engine Number': 'លេខម៉ាស៊ីន',
        'Body / Chassis Number': 'លេខតួរថយន្ត',
      } as Record<string, string>
    )[label] ?? label
  );
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
  requiredText(input.vehicle.plateProvince, 'vehicle.plateProvince');
  requiredText(input.vehicle.plateNumber, 'vehicle.plateNumber');
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

function createDecorativeWatermarkLogoData(logoData: string): string {
  const outerGreen = '#427642';
  const innerGreen = '#71966e';
  const detailGreen = '#275c31';
  const source = Buffer.from(logoData, 'base64').toString('utf8');
  const svg = source
    .replace(/<circle\b(?=[^>]*\bid="circle3121")[^>]*\/>/gi, (circle) =>
      circle.replace(/fill:\s*#(?:fff|ffffff)\b/gi, 'fill:none'),
    )
    .replace(/#d81d18\b/gi, outerGreen)
    .replace(/#00e880\b/gi, innerGreen)
    .replace(/#192879\b/gi, outerGreen)
    .replace(/#(?:e9720a|db8927)\b/gi, detailGreen)
    .replace(/#000000\b/gi, detailGreen);

  return Buffer.from(svg, 'utf8').toString('base64');
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
