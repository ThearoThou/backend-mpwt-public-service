import { PaymentPdfService } from './payment-pdf.service';

const mockLaunch = jest.fn() as jest.MockedFunction<
  typeof import('puppeteer').launch
>;
const mockNewPage = jest.fn();
const mockClose = jest.fn();
const mockSetContent = jest.fn();
const mockEvaluate = jest.fn();
const mockPdf = jest.fn();

class TestPaymentPdfService extends PaymentPdfService {
  protected override getPuppeteer(): Pick<
    typeof import('puppeteer'),
    'launch'
  > {
    return { launch: mockLaunch };
  }
}

describe('PaymentPdfService', () => {
  const service = new TestPaymentPdfService();
  const page = {
    setContent: mockSetContent,
    evaluate: mockEvaluate,
    pdf: mockPdf,
  };
  const browser = {
    newPage: mockNewPage,
    close: mockClose,
  };
  const renderedHtml: string[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    renderedHtml.length = 0;
    mockLaunch.mockResolvedValue(browser);
    mockNewPage.mockResolvedValue(page);
    mockSetContent.mockImplementation((html: string) => {
      renderedHtml.push(html);
    });
    mockPdf.mockResolvedValue(new Uint8Array(Buffer.from('%PDF-1.7 test')));
  });

  it('generates invoice, receipt, and inspection-sheet PDFs with Khmer, English, and payment snapshots', async () => {
    const [invoice, receipt, inspectionSheet] = await Promise.all([
      service.generateInvoice({
        invoiceNumber: 'INV-20260812-123456',
        issuedDate: '2026-08-12',
        applicationReferenceNumber: 'VIR-20260812-ABCDEF123456',
        vehiclePlate: '2A-3146',
        vehicleMakeModel: 'តូយ៉ូតា RAV4',
        previousInspectionExpiryDate: '2026-08-01',
        inspectionFeeKhr: '25000.00',
        serviceFeeKhr: '5000.00',
        baseAmount: '30000.00',
        lateDays: 10,
        lateFee: '500.00',
        totalAmount: '30500.00',
        currency: 'KHR',
      }),
      service.generateReceipt({
        receiptNumber: 'RCP-20260812-123456',
        invoiceNumber: 'INV-20260812-123456',
        confirmedDate: '2026-08-12',
        applicationReferenceNumber: 'VIR-20260812-ABCDEF123456',
        vehiclePlate: '2A-3146',
        vehicleMakeModel: 'តូយ៉ូតា RAV4',
        inspectionFeeKhr: '25000.00',
        serviceFeeKhr: '5000.00',
        baseAmount: '30000.00',
        lateDays: 10,
        lateFee: '500.00',
        totalAmount: '30500.00',
        currency: 'KHR',
        paymentReference: 'COUNTER-123',
      }),
      service.generateInspectionSheet({
        receiptNumber: 'RCP-20260812-123456',
        applicationReferenceNumber: 'VIR-20260812-ABCDEF123456',
        vehiclePlate: '2A-3146',
        vehicleMakeModel: 'តូយ៉ូតា RAV4',
        vehicleClass: 'LIGHT',
        inspectionCategory: 'រថយន្តឯកជន',
      }),
    ]);

    for (const output of [invoice, receipt, inspectionSheet]) {
      expect(output.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    }
    expect(mockLaunch).toHaveBeenCalledTimes(3);
    expect(mockSetContent).toHaveBeenCalledTimes(3);
    expect(renderedHtml[0]).toContain('@font-face');
    expect(renderedHtml[0]).not.toContain(
      'Internship / Demo System - not an official payment document',
    );
    expect(renderedHtml[0]).toContain('វិក្កយបត្រ');
    expect(renderedHtml[1]).toContain('បង្កាន់ដៃទទួលប្រាក់');
    expect(renderedHtml[1]).not.toContain('/ Payment Receipt');
    expect(renderedHtml[1]).not.toContain(
      'Internship / Demo System - not an official payment document',
    );
    expect(renderedHtml[1]).not.toContain(
      'No QR code is used in this demo receipt.',
    );
    expect(renderedHtml[2]).toContain('ប័ណ្ណត្រួតពិនិត្យយានយន្ត');
    expect(renderedHtml[2]).not.toContain('/ Inspection Sheet');
    expect(renderedHtml[2]).not.toContain(
      'Internship / Demo System - not an official payment document',
    );
    expect(renderedHtml.join('')).toContain('តូយ៉ូតា RAV4');
    expect(renderedHtml.join('')).toContain('រថយន្តឯកជន');
    expect(mockClose).toHaveBeenCalledTimes(3);
  });
});
