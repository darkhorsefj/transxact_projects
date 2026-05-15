"use server";

import { createNotifications } from "./notification.service";
import {
  ensureEntitySubscriptions,
  resolveEntityNotificationRecipients,
} from "./entity-subscription.service";
import { publishRealtimeRefresh, publishRealtimeRefreshAll } from "./realtime.service";
import type { NotificationCategory, NotificationSourceType, SubscribableEntityType } from "@/db/schema";

interface EntityInfo {
  type: SubscribableEntityType;
  id: number;
  creatorUserId?: number | null;
  assigneeUserId?: number | null;
}

interface NotificationPayload {
  actorUserId: number;
  category: NotificationCategory;
  type: string;
  title: string;
  body?: string;
  href: string;
  sourceType: NotificationSourceType;
  sourceId?: number;
  emailDelayMinutes?: number;
}

interface DispatchEntityNotificationInput {
  entity: EntityInfo;
  notification: NotificationPayload;
  subscribeParticipantIds?: Array<number | null | undefined>;
  globalRefresh?: boolean;
}

export async function dispatchEntityNotification(
  input: DispatchEntityNotificationInput,
): Promise<number[]> {
  const { entity, notification, subscribeParticipantIds, globalRefresh } = input;

  if (subscribeParticipantIds && subscribeParticipantIds.length > 0) {
    await ensureEntitySubscriptions(entity.type, entity.id, subscribeParticipantIds);
  }

  const recipients = await resolveEntityNotificationRecipients({
    entityType: entity.type,
    entityId: entity.id,
    creatorUserId: entity.creatorUserId,
    assigneeUserId: entity.assigneeUserId,
    actorUserId: notification.actorUserId,
  });

  if (recipients.length > 0) {
    await createNotifications({
      recipientUserIds: recipients,
      actorUserId: notification.actorUserId,
      category: notification.category,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      href: notification.href,
      sourceType: notification.sourceType,
      sourceId: notification.sourceId,
      emailDelayMinutes: notification.emailDelayMinutes ?? 0,
    });
  }

  if (globalRefresh) {
    publishRealtimeRefreshAll();
  } else {
    publishRealtimeRefresh([notification.actorUserId, ...recipients]);
  }

  return recipients;
}

export async function notifyEntityWatchers(
  entity: EntityInfo,
  actorUserId: number,
): Promise<number[]> {
  const recipients = await resolveEntityNotificationRecipients({
    entityType: entity.type,
    entityId: entity.id,
    creatorUserId: entity.creatorUserId,
    assigneeUserId: entity.assigneeUserId,
    actorUserId,
  });

  publishRealtimeRefresh([actorUserId, ...recipients]);
  return recipients;
}
