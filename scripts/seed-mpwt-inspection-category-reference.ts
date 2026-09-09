import { createRequire } from 'node:module';
import type { DataSource, EntityManager } from 'typeorm';

import {
  MPWT_INSPECTION_CATEGORY_REFERENCE,
  type MpwtInspectionCategoryReference,
} from '../src/inspection-categories/mpwt-inspection-category-reference';
import { InspectionVehicleCategory } from '../src/inspection-categories/entities/inspection-vehicle-category.entity';

const CONFIRMATION_VARIABLE = 'ALLOW_MPWT_CATEGORY_REFERENCE_SEED';
const CONFIRMATION_VALUE = 'true';
const requireFromScript = createRequire(__filename);

let referenceDataSource: DataSource | undefined;

function loadDataSource(): DataSource {
  return (
    requireFromScript('../src/database/data-source') as { default: DataSource }
  ).default;
}

function categoryMatches(
  existing: InspectionVehicleCategory,
  reference: MpwtInspectionCategoryReference,
): boolean {
  return (
    existing.nameKh === reference.nameKh &&
    existing.nameEn === reference.nameEn &&
    existing.vehicleClass === reference.vehicleClass &&
    existing.inspectionFeeKhr === reference.inspectionFeeKhr &&
    existing.serviceFeeKhr === reference.serviceFeeKhr &&
    existing.validityMonths === reference.validityMonths &&
    existing.isActive === reference.isActive
  );
}

export async function upsertReferenceData(manager: EntityManager) {
  const repository = manager.getRepository(InspectionVehicleCategory);
  const created: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];

  for (const reference of MPWT_INSPECTION_CATEGORY_REFERENCE) {
    const existing = await repository.findOneBy({ code: reference.code });
    if (existing === null) {
      await repository.save(repository.create(reference));
      created.push(reference.code);
    } else if (categoryMatches(existing, reference)) {
      unchanged.push(reference.code);
    } else {
      await repository.save(repository.merge(existing, reference));
      updated.push(reference.code);
    }
  }

  return { created, updated, unchanged };
}

async function main(): Promise<void> {
  if (process.env[CONFIRMATION_VARIABLE] !== CONFIRMATION_VALUE) {
    throw new Error(
      `Set ${CONFIRMATION_VARIABLE}=true to apply MPWT category reference data. No database changes were made.`,
    );
  }

  referenceDataSource = loadDataSource();
  await referenceDataSource.initialize();
  try {
    const result = await referenceDataSource.transaction(upsertReferenceData);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await referenceDataSource.destroy();
    referenceDataSource = undefined;
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    console.error(`MPWT inspection-category seed aborted: ${message}`);
    process.exitCode = 1;
  });
}
