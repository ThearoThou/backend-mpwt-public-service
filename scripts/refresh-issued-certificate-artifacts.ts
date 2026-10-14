import 'dotenv/config';

import { ConfigService } from '@nestjs/config';

import { AuditLog } from '../src/activity/entities/audit-log.entity';
import { AuditActorType } from '../src/activity/enums/audit-actor-type.enum';
import { RenewalApplication } from '../src/applications/entities/renewal-application.entity';
import { createCertificatePdfInput } from '../src/certificates/certificate-issuance.service';
import { CertificatePdfService } from '../src/certificates/certificate-pdf.service';
import { TechnicalInspectionCertificate } from '../src/certificates/entities/technical-inspection-certificate.entity';
import dataSource from '../src/database/data-source';
import { FilesService } from '../src/files/files.service';
import { Inspection } from '../src/inspections/entities/inspection.entity';

const APPLY_FLAG = '--apply';
const ACTION = 'CERTIFICATE_ARTIFACT_REFRESHED';

async function main(): Promise<void> {
  const apply = process.argv.includes(APPLY_FLAG);
  await dataSource.initialize();

  const certificates = await dataSource
    .getRepository(TechnicalInspectionCertificate)
    .find({
      relations: { application: true, inspection: true },
      order: { issuedAt: 'ASC', id: 'ASC' },
    });

  if (!apply) {
    console.log(
      `Dry run: ${certificates.length} issued certificate artifact(s) would be regenerated. Run with ${APPLY_FLAG} to apply.`,
    );
    return;
  }

  const config = new ConfigService({ ...process.env });
  const pdf = new CertificatePdfService(config);
  const files = new FilesService(
    new ConfigService({
      ...process.env,
      PRIVATE_STORAGE_ROOT:
        process.env.PRIVATE_STORAGE_ROOT ?? 'storage/private',
    }),
  );
  let refreshed = 0;

  try {
    for (const certificate of certificates) {
      const application = certificate.application;
      const inspection = certificate.inspection;
      if (application === undefined || inspection === undefined) {
        throw new Error(
          `Certificate ${certificate.id} is missing its application or inspection relation.`,
        );
      }

      const pdfBuffer = await pdf.generate(
        createCertificatePdfInput(
          application as RenewalApplication,
          inspection as Inspection,
          certificate.certificateNumber,
          certificate.issuedAt,
        ),
      );
      const replacement = await files.saveCertificateArtifact(
        certificate.applicationId,
        pdfBuffer,
      );

      try {
        await dataSource.transaction(async (manager) => {
          const certificatesRepository = manager.getRepository(
            TechnicalInspectionCertificate,
          );
          const current = await certificatesRepository.findOneByOrFail({
            id: certificate.id,
          });
          const oldArtifactFileKey = current.artifactFileKey;
          current.artifactFileKey = replacement.storageKey;
          await certificatesRepository.save(current);

          const audits = manager.getRepository(AuditLog);
          await audits.save(
            audits.create({
              actorType: AuditActorType.SYSTEM,
              actorUserId: null,
              applicationId: current.applicationId,
              action: ACTION,
              entityType: 'TECHNICAL_INSPECTION_CERTIFICATE',
              entityId: current.id,
              description:
                'Certificate PDF refreshed with the approved certificate layout.',
              oldValues: { artifactFileKey: oldArtifactFileKey },
              newValues: { artifactFileKey: replacement.storageKey },
              ipAddress: null,
              userAgent: null,
            }),
          );
        });
      } catch (error) {
        await files.deleteIfExists(replacement.storageKey);
        throw error;
      }

      refreshed += 1;
      console.log(`Refreshed certificate ${certificate.certificateNumber}.`);
    }
  } finally {
    await pdf.onModuleDestroy();
  }

  console.log(`Refreshed ${refreshed} certificate artifact(s).`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });
