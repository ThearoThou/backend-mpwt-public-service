import { ApplicationTimelineEvent } from '../activity/entities/application-timeline-event.entity';
import { AuditLog } from '../activity/entities/audit-log.entity';
import { ApplicationDocument } from '../applications/entities/application-document.entity';
import { RenewalApplication } from '../applications/entities/renewal-application.entity';
import { VerificationCode } from '../auth/entities/verification-code.entity';
import { RefreshSession } from '../auth/entities/refresh-session.entity';
import { Inspection } from '../inspections/entities/inspection.entity';
import { InspectionVehicleCategory } from '../inspection-categories/entities/inspection-vehicle-category.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Appointment } from '../scheduling/entities/appointment.entity';
import { AppointmentSlot } from '../scheduling/entities/appointment-slot.entity';
import { InspectionStation } from '../scheduling/entities/inspection-station.entity';
import { Sticker } from '../stickers/entities/sticker.entity';
import { CitizenProfile } from '../users/entities/citizen-profile.entity';
import { User } from '../users/entities/user.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { VehicleClassificationHistory } from '../vehicles/entities/vehicle-classification-history.entity';

export const databaseEntities = [
  User,
  CitizenProfile,
  VerificationCode,
  RefreshSession,
  Vehicle,
  VehicleClassificationHistory,
  InspectionVehicleCategory,
  RenewalApplication,
  ApplicationDocument,
  InspectionStation,
  AppointmentSlot,
  Appointment,
  Payment,
  Inspection,
  Sticker,
  Notification,
  ApplicationTimelineEvent,
  AuditLog,
];
