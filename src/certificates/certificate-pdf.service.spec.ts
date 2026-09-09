import {
  CertificatePdfInput,
  CertificatePdfService,
  formatCambodiaDate,
  formatFrozenDate,
  formatMillimetresAsMetres,
  formatPrintedMark,
  formatVehicleType,
} from './certificate-pdf.service';

const launch = jest.fn();
const newPage = jest.fn();
const browserClose = jest.fn();
const setContent = jest.fn();
const evaluate = jest.fn();
const pdf = jest.fn();
const pageClose = jest.fn();

class TestCertificatePdfService extends CertificatePdfService {
  protected override getPuppeteer(): Pick<
    typeof import('puppeteer'),
    'launch'
  > {
    return { launch };
  }
}

describe('CertificatePdfService', () => {
  let service: TestCertificatePdfService;
  let html: string;

  beforeEach(() => {
    jest.clearAllMocks();
    html = '';
    service = new TestCertificatePdfService();
    launch.mockResolvedValue({ newPage, close: browserClose });
    newPage.mockResolvedValue({
      setContent,
      evaluate,
      pdf,
      close: pageClose,
    });
    setContent.mockImplementation((value: string) => {
      html = value;
    });
    pdf.mockResolvedValue(new Uint8Array(Buffer.from('%PDF-1.7 certificate')));
  });

  afterEach(async () => service.onModuleDestroy());

  it('generates a safe one-page A4 PDF with every certificate field', async () => {
    const output = await service.generate(realisticInput());

    expect(output.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      }),
    );
    expect(html).toContain('@page { size: A4 portrait;');
    for (const value of [
      '2299922916447',
      '10-09-2026',
      '09-12-2030',
      'HYUNDAI',
      'PASSENGER_VAN',
      'White',
      '2022',
      'Left',
      '4 / 2199 cc / 177.50 HP',
      '2200 kg',
      '220 kg',
      '2970 kg',
      '11',
      'Diesel',
      '235/55R18',
      '5.25 m',
      '2 m',
      '1.9 m',
      '2',
      'D4HBN02273001',
      'KMJYD371BNU068732',
    ]) {
      expect(html).toContain(value);
    }
    expect(html).toContain('class="note-value"></div>');
    expect(html).not.toContain('qr-code');
    expect(html).not.toContain('verification-url');
    expect(pageClose).toHaveBeenCalledTimes(1);
  });

  it('HTML-escapes dynamic values and renders an explicit Khmer note', () => {
    const input = realisticInput();
    input.certificate.certificateNumber = `A<&>"'`;
    input.vehicle.make = '<script>unsafe</script>';
    input.vehicle.vehicleType = 'Van & Bus';
    input.note = 'សម្គាល់ <ពិនិត្យ>';

    const rendered = service.renderHtml(input);

    expect(rendered).toContain('A&lt;&amp;&gt;&quot;&#39;');
    expect(rendered).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
    expect(rendered).toContain('Van &amp; Bus');
    expect(rendered).toContain('សម្គាល់ &lt;ពិនិត្យ&gt;');
    expect(rendered).not.toContain('<script>unsafe</script>');
    expect(rendered).toContain('data:font/ttf;base64,');
  });

  it('rejects missing mandatory values before opening a browser', async () => {
    const input = realisticInput();
    input.vehicle.engineNumber = null;

    await expect(service.generate(input)).rejects.toThrow(
      'Certificate PDF field is required: vehicle.engineNumber',
    );
    expect(launch).not.toHaveBeenCalled();
  });

  it('rejects a non-PDF browser result', async () => {
    pdf.mockResolvedValue(new Uint8Array(Buffer.from('invalid')));
    await expect(service.generate(realisticInput())).rejects.toThrow(
      'did not produce a PDF',
    );
  });
});

describe('certificate PDF formatting', () => {
  it('uses Cambodia calendar time across a UTC date rollover', () => {
    expect(formatCambodiaDate(new Date('2026-09-09T18:00:00.000Z'))).toBe(
      '10-09-2026',
    );
    expect(formatFrozenDate('2030-09-12')).toBe('12-09-2030');
  });

  it('converts integer millimetres to exact trimmed metre strings', () => {
    expect(formatMillimetresAsMetres(4700)).toBe('4.7');
    expect(formatMillimetresAsMetres(4750)).toBe('4.75');
    expect(formatMillimetresAsMetres(4755)).toBe('4.755');
    expect(formatMillimetresAsMetres(2000)).toBe('2');
  });

  it('isolates the current Mark and vehicle-type assumptions', () => {
    expect(formatPrintedMark('HYUNDAI', 'STARIA')).toBe('HYUNDAI');
    expect(formatVehicleType('PASSENGER_VAN')).toBe('PASSENGER_VAN');
  });
});

export function realisticInput(): CertificatePdfInput {
  return {
    certificate: {
      certificateNumber: '2299922916447',
      issuedAt: new Date('2026-09-12T05:30:00.000Z'),
    },
    inspection: {
      completedAt: new Date('2026-09-09T18:00:00.000Z'),
      validUntil: '2030-12-09',
    },
    vehicle: {
      make: 'HYUNDAI',
      model: 'STARIA',
      manufactureYear: 2022,
      vehicleType: 'PASSENGER_VAN',
      colour: 'White',
      engineNumber: 'D4HBN02273001',
      chassisNumber: 'KMJYD371BNU068732',
      numberOfCylinders: 4,
      engineDisplacementCc: 2199,
      enginePowerHp: '177.50',
      fuelType: 'Diesel',
      numberOfSeats: 11,
      numberOfAxles: 2,
      steering: 'Left',
      vehicleWeightKg: 2200,
      maximumLoadKg: 220,
      maximumGrossWeightKg: 2970,
      wheelSize: '235/55R18',
      lengthMm: 5250,
      widthMm: 2000,
      heightMm: 1900,
    },
  };
}
