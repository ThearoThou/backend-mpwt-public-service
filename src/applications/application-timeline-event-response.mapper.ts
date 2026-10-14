import type { ApplicationTimelineEvent } from '../activity/entities/application-timeline-event.entity';
import type { TimelineEventType } from '../activity/enums/timeline-event-type.enum';

export interface CitizenApplicationTimelineEventResponse {
  eventType: TimelineEventType;
  occurredAt: string;
}

export function mapCitizenApplicationTimelineEvent(
  event: ApplicationTimelineEvent,
): CitizenApplicationTimelineEventResponse {
  return {
    eventType: event.eventType,
    occurredAt: event.occurredAt.toISOString(),
  };
}
