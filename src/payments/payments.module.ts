import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FilesModule } from '../files/files.module';
import { CommonAuthModule } from '../common/auth/common-auth.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { User } from '../users/entities/user.entity';
import { Payment } from './entities/payment.entity';
import { PaymentStatusHistory } from './entities/payment-status-history.entity';
import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { AdminPaymentsController } from './admin-payments.controller';
import { PaymentsController } from './payments.controller';
import { PaymentPdfService } from './payment-pdf.service';
import { PaymentDocumentsService } from './payment-documents.service';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    FilesModule,
    CommonAuthModule,
    SchedulingModule,
    TypeOrmModule.forFeature([
      Payment,
      PaymentStatusHistory,
      RenewalApplication,
      Vehicle,
      User,
    ]),
  ],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [PaymentsService, PaymentPdfService, PaymentDocumentsService],
  exports: [PaymentPdfService, PaymentsService],
})
export class PaymentsModule {}
