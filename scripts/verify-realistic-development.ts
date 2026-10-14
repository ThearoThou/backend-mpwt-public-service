import 'dotenv/config';

import { createRequire } from 'node:module';
import type { DataSource } from 'typeorm';

import { InspectionReadsService } from '../src/inspections/inspection-reads.service';
import { InspectionResult } from '../src/inspections/enums/inspection-result.enum';
import { inspectionPolicy } from '../src/config/inspection-policy';
import { chargeableLateDays } from '../src/payments/late-penalty-policy';
import { verifyRealisticDevelopmentDataset } from './seed-realistic-development';
import {
  REALISTIC_VEHICLES,
  WORKFLOW_APPLICATION_STATUS,
} from './realistic-development-fixtures';

const requireFromScript = createRequire(__filename);

function addYears(date: string, years: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCFullYear(value.getUTCFullYear() + years);
  return value.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const dataSource = (
    requireFromScript('../src/database/data-source') as { default: DataSource }
  ).default;
  await dataSource.initialize();
  try {
    const counts = await verifyRealisticDevelopmentDataset(dataSource.manager);
    const [details] = await dataSource.query<
      Array<{
        categoryCounts: Record<string, number>;
        categoryFees: Record<string, string>;
        expiryOffsets: number[];
        incompleteTechnicalVehicles: number;
        incoherentCategories: number;
        invalidLateFees: number;
        invalidInvoices: number;
        invalidAttempts: number;
        invalidCertificates: number;
        syntheticIdentifiers: number;
        oldDemoRecords: number;
        orphanRows: number;
        invalidCompletedWorkflowChains: number;
        invalidRejectedWorkflowChains: number;
        invalidCanonicalProvinceValues: number;
        nonNeutralRegistrationIdentifiers: number;
        officialCategoryCount: number;
        stationCount: number;
        applicationStatusCounts: Record<string, number>;
      }>
    >(`
      SELECT
        (SELECT jsonb_object_agg(code, count) FROM (
          SELECT c.code, COUNT(*)::int AS count
          FROM vehicles v
          JOIN inspection_vehicle_categories c ON c.id = v.inspection_category_id
          GROUP BY c.code
        ) categories) AS "categoryCounts",
        (SELECT jsonb_object_agg(code, inspection_fee_khr) FROM inspection_vehicle_categories
          WHERE code IN ('MPWT0011524','MPWT0011525','MPWT0011526')) AS "categoryFees",
        (SELECT jsonb_agg(offset_days ORDER BY offset_days) FROM (
          SELECT DISTINCT (v.inspection_expiry_date - (now() AT TIME ZONE 'Asia/Phnom_Penh')::date)::int AS offset_days
          FROM vehicles v
        ) expiry) AS "expiryOffsets",
        (SELECT COUNT(*)::int FROM vehicles v WHERE
          v.colour IS NULL OR v.engine_number IS NULL OR v.number_of_cylinders IS NULL OR
          v.engine_displacement_cc IS NULL OR v.engine_power_hp IS NULL OR v.fuel_type IS NULL OR
          v.number_of_seats IS NULL OR v.number_of_axles IS NULL OR v.steering IS NULL OR
          v.vehicle_weight_kg IS NULL OR v.maximum_load_kg IS NULL OR
          v.maximum_gross_weight_kg IS NULL OR v.wheel_size IS NULL OR v.length_mm IS NULL OR
          v.width_mm IS NULL OR v.height_mm IS NULL) AS "incompleteTechnicalVehicles",
        (SELECT COUNT(*)::int FROM vehicles v
          JOIN inspection_vehicle_categories c ON c.id = v.inspection_category_id
          WHERE (c.code = 'MPWT0011524' AND v.first_registration_date + INTERVAL '4 years' <> v.inspection_expiry_date)
             OR (c.code = 'MPWT0011525' AND v.number_of_seats > 4)
             OR (c.code = 'MPWT0011526' AND v.number_of_seats NOT BETWEEN 5 AND 9)
             OR v.vehicle_class <> 'LIGHT' OR v.vehicle_type <> 'FAMILY_PASSENGER'
        ) AS "incoherentCategories",
        (SELECT COUNT(*)::int FROM payments p WHERE
          p.late_fee <> (GREATEST(LEAST(p.late_days, (p.previous_inspection_expiry_date + INTERVAL '2 years')::date - p.previous_inspection_expiry_date) - 30, 0) * 500)::numeric(12,2)
          OR p.total_amount <> p.inspection_fee_khr + p.service_fee_khr + p.late_fee
          OR p.service_fee_khr NOT IN (0, 7000)
        ) AS "invalidLateFees",
        (SELECT COUNT(*)::int FROM payments WHERE invoice_number !~ '^90L[0-9]{10}$') AS "invalidInvoices",
        (SELECT COUNT(*)::int FROM inspections WHERE attempt_number > 1) AS "invalidAttempts",
        (SELECT COUNT(*)::int FROM technical_inspection_certificates WHERE certificate_number !~ '^[0-9]{13}$') AS "invalidCertificates",
        (SELECT COUNT(*)::int FROM vehicles WHERE
          registration_number ~* '(DEMO-|TEST-|SAMPLE-|C1-|C2-)' OR
          plate_number ~* '(DEMO-|TEST-|SAMPLE-|C1-|C2-)' OR
          chassis_number ~* '(DEMO-|TEST-|SAMPLE-|C1-|C2-)'
        ) AS "syntheticIdentifiers",
        ((SELECT COUNT(*) FROM users WHERE email IN ('demo.admin@local.test', 'demo.citizen@local.test') OR email LIKE 'demo.%@local.test')
          + (SELECT COUNT(*) FROM citizen_profiles WHERE national_id_number LIKE 'LOCAL-DEMO%')
          + (SELECT COUNT(*) FROM inspection_vehicle_categories WHERE code LIKE 'LOCAL-DEMO%')
          + (SELECT COUNT(*) FROM vehicles WHERE registration_number ~* '(LOCAL|LDMO|DEMO|TEST|SAMPLE)' OR chassis_number ~* '(LOCAL|LDMO|DEMO|TEST|SAMPLE)')
          + (SELECT COUNT(*) FROM renewal_applications WHERE reference_number ~* '(LDMO|LOCAL-DEMO|DEMO|TEST|SAMPLE)')
        )::int AS "oldDemoRecords",
        ((SELECT COUNT(*) FROM renewal_applications a LEFT JOIN users u ON u.id = a.citizen_id LEFT JOIN vehicles v ON v.id = a.vehicle_id WHERE u.id IS NULL OR v.id IS NULL)
          + (SELECT COUNT(*) FROM payments p LEFT JOIN renewal_applications a ON a.id = p.application_id WHERE a.id IS NULL)
          + (SELECT COUNT(*) FROM inspections i LEFT JOIN renewal_applications a ON a.id = i.application_id WHERE a.id IS NULL)
          + (SELECT COUNT(*) FROM stickers s LEFT JOIN inspections i ON i.id = s.inspection_id WHERE i.id IS NULL)
          + (SELECT COUNT(*) FROM technical_inspection_certificates c LEFT JOIN inspections i ON i.id = c.inspection_id WHERE i.id IS NULL)
        )::int AS "orphanRows"
        ,(SELECT COUNT(*)::int FROM renewal_applications a
          JOIN technical_inspection_certificates c ON c.application_id = a.id
          JOIN inspections i ON i.id = c.inspection_id
          JOIN vehicles v ON v.id = a.vehicle_id
          WHERE a.status <> 'COMPLETED' OR a.completed_at <> c.issued_at
             OR NOT EXISTS (SELECT 1 FROM payments p WHERE p.application_id = a.id AND p.status = 'CONFIRMED')
             OR i.attempt_number <> 1 OR i.result <> 'PASS'
             OR i.valid_until <> v.inspection_expiry_date
             OR NOT (a.submitted_at < (SELECT p.confirmed_at FROM payments p WHERE p.application_id = a.id AND p.status = 'CONFIRMED')
               AND (SELECT p.confirmed_at FROM payments p WHERE p.application_id = a.id AND p.status = 'CONFIRMED') < i.completed_at
               AND i.completed_at < (SELECT s.issued_at FROM stickers s WHERE s.application_id = a.id)
               AND (SELECT s.issued_at FROM stickers s WHERE s.application_id = a.id) < c.issued_at)
             OR NOT EXISTS (SELECT 1 FROM stickers s WHERE s.application_id = a.id AND s.issued_at IS NOT NULL)
             OR (SELECT COUNT(*) FROM application_documents d WHERE d.application_id = a.id AND d.is_current AND d.status = 'APPROVED') <> 3
             OR NOT EXISTS (SELECT 1 FROM application_timeline_events e WHERE e.application_id = a.id AND e.event_type = 'DOCUMENTS_APPROVED')
        ) AS "invalidCompletedWorkflowChains"
        ,(SELECT COUNT(*)::int FROM renewal_applications a
          WHERE a.status = 'REJECTED' AND (
            NOT EXISTS (SELECT 1 FROM payments p WHERE p.application_id = a.id AND p.status = 'CONFIRMED')
            OR NOT EXISTS (SELECT 1 FROM inspections i WHERE i.application_id = a.id AND i.result = 'PASS')
            OR NOT EXISTS (SELECT 1 FROM stickers s WHERE s.application_id = a.id)
            OR NOT EXISTS (SELECT 1 FROM application_documents d WHERE d.application_id = a.id AND d.status = 'REJECTED' AND NULLIF(BTRIM(d.rejection_reason), '') IS NOT NULL)
            OR NULLIF(BTRIM(a.current_rejection_reason), '') IS NULL
          )
        ) AS "invalidRejectedWorkflowChains"
        ,(SELECT COUNT(*)::int FROM vehicles v
          WHERE v.plate_category = 'PROVINCE' AND v.plate_province <> ALL(ARRAY[
            'ភ្នំពេញ', 'បន្ទាយមានជ័យ', 'បាត់ដំបង', 'កំពង់ចាម', 'កំពង់ឆ្នាំង', 'កំពង់ស្ពឺ',
            'កំពង់ធំ', 'កំពត', 'កណ្ដាល', 'កែប', 'កោះកុង', 'ក្រចេះ', 'មណ្ឌលគិរី',
            'ឧត្តរមានជ័យ', 'ប៉ៃលិន', 'ព្រះសីហនុ', 'ព្រះវិហារ', 'ព្រៃវែង', 'ពោធិ៍សាត់',
            'រតនគិរី', 'សៀមរាប', 'ស្ទឹងត្រែង', 'ស្វាយរៀង', 'តាកែវ', 'ត្បូងឃ្មុំ'
          ])) AS "invalidCanonicalProvinceValues"
        ,(SELECT COUNT(*)::int FROM vehicles
          WHERE registration_number !~ '^VR-[0-9]{4}-[0-9]+$'
        ) AS "nonNeutralRegistrationIdentifiers"
        ,(SELECT COUNT(*)::int FROM inspection_vehicle_categories WHERE code LIKE 'MPWT%') AS "officialCategoryCount"
        ,(SELECT COUNT(*)::int FROM inspection_stations) AS "stationCount"
        ,(SELECT jsonb_object_agg(status, count) FROM (
          SELECT status, COUNT(*)::int AS count
          FROM renewal_applications
          GROUP BY status
        ) statuses) AS "applicationStatusCounts"
    `);
    if (details === undefined)
      throw new Error('Detailed verification returned no row.');
    const expectedOffsets = [-90, -60, -50, -40, -25, -15, -10, 15, 180];
    if (
      JSON.stringify(details.expiryOffsets) !== JSON.stringify(expectedOffsets)
    ) {
      throw new Error(
        `Expiry scenarios are incomplete: ${JSON.stringify(details.expiryOffsets)}.`,
      );
    }
    if (details.officialCategoryCount !== 19 || details.stationCount === 0) {
      throw new Error(
        `Required master data is incomplete: ${details.officialCategoryCount} official categories, ${details.stationCount} stations.`,
      );
    }
    const expectedCategoryFees = {
      MPWT0011524: 36_000,
      MPWT0011525: 42_000,
      MPWT0011526: 48_000,
    };
    for (const [code, fee] of Object.entries(expectedCategoryFees)) {
      if (Number(details.categoryFees[code]) !== fee) {
        throw new Error(
          `Unexpected fee for ${code}: ${details.categoryFees[code]}.`,
        );
      }
    }
    for (const key of [
      'incompleteTechnicalVehicles',
      'incoherentCategories',
      'invalidLateFees',
      'invalidInvoices',
      'invalidAttempts',
      'invalidCertificates',
      'syntheticIdentifiers',
      'oldDemoRecords',
      'orphanRows',
      'invalidCompletedWorkflowChains',
      'invalidRejectedWorkflowChains',
      'invalidCanonicalProvinceValues',
      'nonNeutralRegistrationIdentifiers',
    ] as const) {
      if (details[key] !== 0) {
        throw new Error(
          `Detailed verification failed for ${key}: ${details[key]}.`,
        );
      }
    }
    const registrations = await dataSource.query<
      Array<{ registrationNumber: string }>
    >(
      'SELECT registration_number AS "registrationNumber" FROM vehicles ORDER BY registration_number',
    );
    const actualRegistrations = registrations.map(
      ({ registrationNumber }) => registrationNumber,
    );
    const expectedRegistrations = REALISTIC_VEHICLES.map(
      ({ registrationNumber }) => registrationNumber,
    ).sort();
    if (
      JSON.stringify(actualRegistrations) !==
      JSON.stringify(expectedRegistrations)
    ) {
      throw new Error(
        'The database vehicle set is not the canonical fixture set.',
      );
    }
    const scenarioRows = await dataSource.query<
      Array<{
        plateNumber: string;
        expiryOffset: number;
        statuses: string[] | string;
        unfinishedCount: number;
      }>
    >(`
      SELECT v.plate_number AS "plateNumber",
        (v.inspection_expiry_date - (now() AT TIME ZONE 'Asia/Phnom_Penh')::date)::int AS "expiryOffset",
        COALESCE(array_agg(a.status ORDER BY a.submitted_at NULLS LAST) FILTER (WHERE a.id IS NOT NULL), '{}') AS statuses,
        COUNT(a.id) FILTER (WHERE a.status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','CORRECTION_REQUIRED','APPROVED'))::int AS "unfinishedCount"
      FROM vehicles v
      JOIN users u ON u.id = v.linked_citizen_id
      LEFT JOIN renewal_applications a ON a.vehicle_id = v.id
      WHERE u.email = 'citizen1@gmail.com'
      GROUP BY v.id
      ORDER BY v.plate_number
    `);
    const expectedPrimary = REALISTIC_VEHICLES.filter(
      ({ owner }) => owner === 1,
    );
    if (scenarioRows.length !== expectedPrimary.length) {
      throw new Error(
        `Expected ${expectedPrimary.length} Citizen 1 scenarios, found ${scenarioRows.length}.`,
      );
    }
    for (const [index, fixture] of expectedPrimary.entries()) {
      const row = scenarioRows[index];
      const actualStatuses = Array.isArray(row?.statuses)
        ? row.statuses
        : row?.statuses === '{}'
          ? []
          : (row?.statuses.slice(1, -1).split(',') ?? []);
      const expectedStatuses = fixture.workflows.map(
        (workflow) => WORKFLOW_APPLICATION_STATUS[workflow],
      );
      if (
        row === undefined ||
        row.plateNumber !== fixture.plateNumber ||
        row.expiryOffset !== fixture.expiryOffsetDays ||
        JSON.stringify(actualStatuses) !== JSON.stringify(expectedStatuses) ||
        row.unfinishedCount > 1
      ) {
        throw new Error(
          `Scenario matrix mismatch for ${fixture.scenario}: ${JSON.stringify(row)}.`,
        );
      }
    }
    const cleanNewFamilyVehicles = await dataSource.query<
      Array<{
        plateNumber: string;
        categoryCode: string;
        lastInspectionDate: string | null;
        inspectionExpiryDate: string;
        applicationCount: number;
      }>
    >(`
      SELECT v.plate_number AS "plateNumber",
        c.code AS "categoryCode",
        v.last_inspection_date::text AS "lastInspectionDate",
        v.inspection_expiry_date::text AS "inspectionExpiryDate",
        COUNT(a.id)::int AS "applicationCount"
      FROM vehicles v
      JOIN inspection_vehicle_categories c ON c.id = v.inspection_category_id
      LEFT JOIN renewal_applications a ON a.vehicle_id = v.id
      WHERE v.plate_number IN ('2AA-1001', '2BB-2001')
      GROUP BY v.id, c.code
      ORDER BY v.plate_number
    `);
    if (cleanNewFamilyVehicles.length !== 2) {
      throw new Error(
        'Clean new-family vehicle fixtures 2AA-1001 and 2BB-2001 are missing.',
      );
    }
    for (const vehicle of cleanNewFamilyVehicles) {
      const expectedLastInspectionDate = addYears(
        vehicle.inspectionExpiryDate,
        -4,
      );
      if (
        vehicle.categoryCode !== 'MPWT0011524' ||
        vehicle.lastInspectionDate !== expectedLastInspectionDate ||
        vehicle.applicationCount !== 0
      ) {
        throw new Error(
          `Clean new-family vehicle fixture is invalid: ${JSON.stringify(vehicle)}.`,
        );
      }
    }
    const citizenOneMatrix = await dataSource.query<
      Array<{
        plateNumber: string;
        categoryCode: string;
        lastInspectionDate: string | null;
        inspectionExpiryDate: string;
        expiryOffset: number;
        statuses: string[] | string;
        applicationCount: number;
        unfinishedCount: number;
        paymentPending: boolean;
        paymentConfirmed: boolean;
        paymentLateDays: number | null;
        inspectionPass: boolean;
        inspectionFail: boolean;
        stickerIssued: boolean;
        documentsApproved: boolean;
        certificateIssued: boolean;
      }>
    >(`
      SELECT v.plate_number AS "plateNumber", category.code AS "categoryCode",
        v.last_inspection_date::text AS "lastInspectionDate",
        v.inspection_expiry_date::text AS "inspectionExpiryDate",
        (v.inspection_expiry_date - (now() AT TIME ZONE 'Asia/Phnom_Penh')::date)::int AS "expiryOffset",
        COALESCE(array_agg(DISTINCT application.status) FILTER (WHERE application.id IS NOT NULL), '{}') AS statuses,
        COUNT(DISTINCT application.id)::int AS "applicationCount",
        COUNT(DISTINCT application.id) FILTER (WHERE application.status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','CORRECTION_REQUIRED','APPROVED'))::int AS "unfinishedCount",
        COALESCE(BOOL_OR(payment.status = 'PENDING'), false) AS "paymentPending",
        COALESCE(BOOL_OR(payment.status = 'CONFIRMED'), false) AS "paymentConfirmed",
        MAX(payment.late_days)::int AS "paymentLateDays",
        EXISTS (SELECT 1 FROM renewal_applications a JOIN inspections i ON i.application_id = a.id WHERE a.vehicle_id = v.id AND i.result = 'PASS') AS "inspectionPass",
        EXISTS (SELECT 1 FROM renewal_applications a JOIN inspections i ON i.application_id = a.id WHERE a.vehicle_id = v.id AND i.result = 'FAIL') AS "inspectionFail",
        EXISTS (SELECT 1 FROM renewal_applications a JOIN stickers s ON s.application_id = a.id WHERE a.vehicle_id = v.id) AS "stickerIssued",
        EXISTS (SELECT 1 FROM renewal_applications a JOIN application_timeline_events event ON event.application_id = a.id WHERE a.vehicle_id = v.id AND event.event_type = 'DOCUMENTS_APPROVED') AS "documentsApproved",
        EXISTS (SELECT 1 FROM renewal_applications a JOIN technical_inspection_certificates certificate ON certificate.application_id = a.id WHERE a.vehicle_id = v.id) AS "certificateIssued"
      FROM vehicles v
      JOIN inspection_vehicle_categories category ON category.id = v.inspection_category_id
      LEFT JOIN renewal_applications application ON application.vehicle_id = v.id
      LEFT JOIN payments payment ON payment.application_id = application.id
      WHERE v.plate_number BETWEEN '2AA-1001' AND '2AA-1015'
      GROUP BY v.id, category.code
      ORDER BY v.plate_number
    `);
    const expectedCitizenOneMatrix = [
      ['2AA-1001', [], false, false, false, false, false, false, false, 0],
      [
        '2AA-1002',
        ['DRAFT'],
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        1,
      ],
      [
        '2AA-1003',
        ['COMPLETED'],
        false,
        true,
        true,
        false,
        true,
        true,
        true,
        0,
      ],
      ['2AA-1004', [], false, false, false, false, false, false, false, 0],
      [
        '2AA-1005',
        ['SUBMITTED'],
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        1,
      ],
      [
        '2AA-1006',
        ['APPROVED'],
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        1,
      ],
      [
        '2AA-1007',
        ['CORRECTION_REQUIRED'],
        false,
        true,
        true,
        false,
        true,
        false,
        false,
        1,
      ],
      [
        '2AA-1008',
        ['APPROVED'],
        false,
        true,
        true,
        false,
        false,
        false,
        false,
        1,
      ],
      [
        '2AA-1009',
        ['UNDER_REVIEW'],
        false,
        true,
        true,
        false,
        true,
        false,
        false,
        1,
      ],
      [
        '2AA-1010',
        ['APPROVED'],
        false,
        true,
        true,
        false,
        true,
        true,
        false,
        1,
      ],
      [
        '2AA-1011',
        ['INSPECTION_FAILED'],
        false,
        true,
        false,
        true,
        false,
        false,
        false,
        0,
      ],
      [
        '2AA-1012',
        ['REJECTED'],
        false,
        true,
        true,
        false,
        true,
        false,
        false,
        0,
      ],
      [
        '2AA-1013',
        ['EXPIRED'],
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        0,
      ],
      [
        '2AA-1014',
        ['CANCELLED'],
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        0,
      ],
      [
        '2AA-1015',
        ['COMPLETED'],
        false,
        true,
        true,
        false,
        true,
        true,
        true,
        0,
      ],
    ] as const;
    if (citizenOneMatrix.length !== expectedCitizenOneMatrix.length) {
      throw new Error(
        `Expected 15 Citizen 1 matrix vehicles, found ${citizenOneMatrix.length}.`,
      );
    }
    const validityCounts = { valid: 0, expiring: 0, expired: 0 };
    for (const [index, expected] of expectedCitizenOneMatrix.entries()) {
      const row = citizenOneMatrix[index];
      const statuses = Array.isArray(row?.statuses)
        ? row.statuses.sort()
        : row?.statuses === '{}'
          ? []
          : (row?.statuses.slice(1, -1).split(',').sort() ?? []);
      const [
        plateNumber,
        expectedStatuses,
        paymentPending,
        paymentConfirmed,
        inspectionPass,
        inspectionFail,
        stickerIssued,
        documentsApproved,
        certificateIssued,
        unfinishedCount,
      ] = expected;
      if (
        row === undefined ||
        row.plateNumber !== plateNumber ||
        JSON.stringify(statuses) !== JSON.stringify(expectedStatuses) ||
        row.paymentPending !== paymentPending ||
        row.paymentConfirmed !== paymentConfirmed ||
        row.inspectionPass !== inspectionPass ||
        row.inspectionFail !== inspectionFail ||
        row.stickerIssued !== stickerIssued ||
        row.documentsApproved !== documentsApproved ||
        row.certificateIssued !== certificateIssued ||
        row.unfinishedCount !== unfinishedCount
      ) {
        throw new Error(
          `Citizen 1 final matrix mismatch: ${JSON.stringify(row)}.`,
        );
      }
      if (row.expiryOffset > 30) validityCounts.valid += 1;
      else if (row.expiryOffset >= 0) validityCounts.expiring += 1;
      else validityCounts.expired += 1;
    }
    if (
      JSON.stringify(validityCounts) !==
      JSON.stringify({ valid: 3, expiring: 4, expired: 8 })
    ) {
      throw new Error(
        `Citizen 1 validity distribution mismatch: ${JSON.stringify(validityCounts)}.`,
      );
    }
    const expectedExpiredOffsets = new Map([
      ['2AA-1004', -10],
      ['2AA-1009', -10],
      ['2AA-1010', -15],
      ['2AA-1011', -25],
      ['2AA-1012', -40],
      ['2AA-1013', -50],
      ['2AA-1014', -60],
      ['2AA-1015', -90],
    ]);
    for (const row of citizenOneMatrix) {
      const expectedOffset = expectedExpiredOffsets.get(row.plateNumber);
      if (expectedOffset === undefined) continue;
      const actualOverdueDays = Math.max(-row.expiryOffset, 0);
      const penaltyDays = chargeableLateDays(
        actualOverdueDays,
        row.inspectionExpiryDate,
        inspectionPolicy.latePenalty,
      );
      if (
        row.expiryOffset !== expectedOffset ||
        row.paymentLateDays !== actualOverdueDays ||
        (expectedOffset >= -30 ? penaltyDays !== 0 : penaltyDays <= 0)
      ) {
        throw new Error(
          `Citizen 1 overdue/penalty scenario mismatch: ${JSON.stringify({ row, actualOverdueDays, penaltyDays })}.`,
        );
      }
    }
    const [cancelledFixture] = await dataSource.query<
      Array<{
        cancelledAt: string | null;
        cancelledByUserId: string | null;
        cancellationReason: string | null;
        confirmedPaymentHistoryCount: number;
        confirmedPaymentEventCount: number;
        inspectionCount: number;
        stickerCount: number;
        certificateCount: number;
        reviewedDocumentCount: number;
      }>
    >(`
      SELECT
        application.cancelled_at::text AS "cancelledAt",
        application.cancelled_by_user_id AS "cancelledByUserId",
        application.cancellation_reason AS "cancellationReason",
        (SELECT COUNT(*)::int
          FROM payment_status_history history
          JOIN payments payment ON payment.id = history.payment_id
          WHERE payment.application_id = application.id
            AND (history.from_status = 'CONFIRMED' OR history.to_status = 'CONFIRMED')
        ) AS "confirmedPaymentHistoryCount",
        (SELECT COUNT(*)::int FROM application_timeline_events event
          WHERE event.application_id = application.id AND event.event_type = 'PAYMENT_CONFIRMED'
        ) AS "confirmedPaymentEventCount",
        (SELECT COUNT(*)::int FROM inspections WHERE application_id = application.id) AS "inspectionCount",
        (SELECT COUNT(*)::int FROM stickers WHERE application_id = application.id) AS "stickerCount",
        (SELECT COUNT(*)::int FROM technical_inspection_certificates WHERE application_id = application.id) AS "certificateCount",
        (SELECT COUNT(*)::int FROM application_documents
          WHERE application_id = application.id AND reviewed_at IS NOT NULL
        ) AS "reviewedDocumentCount"
      FROM renewal_applications application
      JOIN vehicles vehicle ON vehicle.id = application.vehicle_id
      WHERE vehicle.plate_number = '2AA-1014'
    `);
    if (
      cancelledFixture === undefined ||
      cancelledFixture.cancelledAt === null ||
      cancelledFixture.cancelledByUserId === null ||
      cancelledFixture.cancellationReason === null ||
      cancelledFixture.confirmedPaymentHistoryCount !== 0 ||
      cancelledFixture.confirmedPaymentEventCount !== 0 ||
      cancelledFixture.inspectionCount !== 0 ||
      cancelledFixture.stickerCount !== 0 ||
      cancelledFixture.certificateCount !== 0 ||
      cancelledFixture.reviewedDocumentCount !== 0
    ) {
      throw new Error(
        `Cancelled Citizen 1 fixture has progressed beyond the allowed submitted/pending state: ${JSON.stringify(cancelledFixture)}.`,
      );
    }
    const cleanCitizenOne = citizenOneMatrix[0];
    if (
      cleanCitizenOne?.categoryCode !== 'MPWT0011524' ||
      cleanCitizenOne.lastInspectionDate === null ||
      cleanCitizenOne.applicationCount !== 0
    ) {
      throw new Error(
        `Citizen 1 clean new-family fixture is invalid: ${JSON.stringify(cleanCitizenOne)}.`,
      );
    }
    const [matrixIntegrity] = await dataSource.query<
      Array<{
        duplicateReferences: number;
        duplicateTransactions: number;
        invalidReferences: number;
        invalidCorrectionChains: number;
        ownershipLeaks: number;
      }>
    >(`
      SELECT
        (SELECT COUNT(*)::int FROM (SELECT reference_number FROM renewal_applications WHERE reference_number IS NOT NULL GROUP BY reference_number HAVING COUNT(*) > 1) d) AS "duplicateReferences",
        (SELECT COUNT(*)::int FROM (SELECT invoice_number FROM payments GROUP BY invoice_number HAVING COUNT(*) > 1) d) AS "duplicateTransactions",
        (SELECT COUNT(*)::int FROM renewal_applications WHERE reference_number IS NOT NULL AND reference_number !~ '^MPWT-[0-9]{6}-[0-9A-F]{6}$') AS "invalidReferences",
        (SELECT COUNT(*)::int FROM renewal_applications a WHERE a.status = 'CORRECTION_REQUIRED' AND NOT EXISTS (
          SELECT 1 FROM application_documents rejected
          WHERE rejected.application_id = a.id AND rejected.status = 'REJECTED'
            AND NULLIF(BTRIM(rejected.rejection_reason), '') IS NOT NULL
            AND (rejected.is_current OR EXISTS (
              SELECT 1 FROM application_documents replacement
              WHERE replacement.replaces_document_id = rejected.id AND replacement.is_current AND replacement.status = 'PENDING'
            ))
        )) AS "invalidCorrectionChains",
        (SELECT COUNT(*)::int FROM renewal_applications a JOIN vehicles v ON v.id = a.vehicle_id WHERE a.citizen_id <> v.linked_citizen_id) AS "ownershipLeaks"
    `);
    if (
      matrixIntegrity === undefined ||
      Object.values(matrixIntegrity).some((value) => value !== 0)
    ) {
      throw new Error(
        `Scenario matrix integrity failed: ${JSON.stringify(matrixIntegrity)}.`,
      );
    }
    const [historicalFailFixture] = await dataSource.query<
      Array<{
        citizenId: string;
        plateNumber: string;
        make: string;
        model: string;
        failedApplicationReference: string;
        failedTransactionNumber: string;
        inspectionId: string;
        inspectionDate: Date;
        stationNameKh: string;
        stationNameEn: string;
        categoryCode: string;
        categoryNameKh: string;
        categoryNameEn: string;
        failureReason: string;
        result: InspectionResult;
        failedApplicationStatus: string;
      }>
    >(`
      SELECT failed.citizen_id AS "citizenId", v.plate_number AS "plateNumber",
        v.make, v.model, failed.reference_number AS "failedApplicationReference",
        payment.invoice_number AS "failedTransactionNumber", inspection.id AS "inspectionId",
        inspection.completed_at AS "inspectionDate", station.name_kh AS "stationNameKh",
        station.name_en AS "stationNameEn", category.code AS "categoryCode",
        category.name_kh AS "categoryNameKh", category.name_en AS "categoryNameEn",
        inspection.failure_reason AS "failureReason", inspection.result AS result,
        failed.status AS "failedApplicationStatus"
      FROM renewal_applications failed
      JOIN vehicles v ON v.id = failed.vehicle_id
      JOIN inspections inspection ON inspection.application_id = failed.id
      JOIN payments payment ON payment.application_id = failed.id
      JOIN inspection_stations station ON station.id = inspection.actual_station_id
      JOIN inspection_vehicle_categories category ON category.id = v.inspection_category_id
      JOIN users citizen ON citizen.id = failed.citizen_id
      WHERE citizen.email = 'citizen1@gmail.com' AND v.plate_number = '2AA-1011'
        AND failed.status = 'INSPECTION_FAILED' AND inspection.result = 'FAIL'
    `);
    if (historicalFailFixture === undefined) {
      throw new Error('Citizen 1 historical FAIL fixture was not found.');
    }
    const inspectionReads = new InspectionReadsService(dataSource);
    const historySearch = await inspectionReads.listCitizenInspectionHistory(
      historicalFailFixture.citizenId,
      {
        page: 1,
        limit: 20,
        sortOrder: 'desc',
        search: historicalFailFixture.failedTransactionNumber,
      },
    );
    const inspectionDetail = await inspectionReads.getCitizenInspectionDetail(
      historicalFailFixture.citizenId,
      historicalFailFixture.inspectionId,
    );
    if (
      historySearch.data.length !== 1 ||
      historySearch.data[0]?.inspectionId !==
        historicalFailFixture.inspectionId ||
      inspectionDetail.result !== InspectionResult.FAIL ||
      inspectionDetail.validUntil !== null ||
      inspectionDetail.inspectionCategory?.code !==
        historicalFailFixture.categoryCode
    ) {
      throw new Error(
        'Historical FAIL history/detail read verification failed.',
      );
    }
    console.log(
      JSON.stringify(
        {
          counts,
          ...details,
          historicalFailFixture,
          historySearchCount: historySearch.data.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(
    `Realistic development verification failed: ${error instanceof Error ? error.message : 'Unknown error.'}`,
  );
  process.exitCode = 1;
});
