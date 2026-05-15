"use server";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import db, { ensureDbSchema } from "@/db/connection";
import {
  directConversationMember,
  directMessage,
  entitySubscription,
  notification,
  notificationDeliveryLog,
  notificationEmailQueue,
  notificationPreference,
  type NotificationCategory,
  type NotificationSourceType,
  type SubscribableEntityType,
  user,
} from "@/db/schema";
import { createUnifiedEmailContent, sendEmail } from "./email.service";
import { publishRealtimeRefresh } from "./realtime.service";
import { requireSessionUser } from "./session.service";

const MAX_EMAIL_ATTEMPTS = 3;
const EMAIL_RETRY_MINUTES = [5, 15, 30];

const DEFAULT_CATEGORY_CHANNELS: Record<
  NotificationCategory,
  { inAppEnabled: boolean; emailEnabled: boolean; label: string }
> = {
  direct_message: {
    inAppEnabled: true,
    emailEnabled: false,
    label: "Direct messages",
  },
  project_activity: {
    inAppEnabled: true,
    emailEnabled: true,
    label: "Projects",
  },
  task_activity: {
    inAppEnabled: true,
    emailEnabled: true,
    label: "Tasks",
  },
  issue_activity: {
    inAppEnabled: true,
    emailEnabled: true,
    label: "Issues",
  },
  abuse_report: {
    inAppEnabled: true,
    emailEnabled: false,
    label: "Abuse reports",
  },
};

export interface NotificationPreferenceItem {
  category: NotificationCategory;
  label: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
}

export interface NotificationListItem {
  id: number;
  category: NotificationCategory;
  title: string;
  body: string | null;
  href: string;
  isRead: boolean;
  createdAt: string;
}

export interface InboxUnreadCounts {
  unreadMessageCount: number;
  unreadNotificationCount: number;
}

interface NotificationChannelPreference {
  inAppEnabled: boolean;
  emailEnabled: boolean;
}

interface CreateNotificationsInput {
  recipientUserIds: number[];
  actorUserId?: number;
  category: NotificationCategory;
  type: string;
  title: string;
  body?: string;
  href: string;
  sourceType: NotificationSourceType;
  sourceId?: number;
  emailDelayMinutes?: number;
}

interface EntityRecipientInput {
  entityType: SubscribableEntityType;
  entityId: number;
  creatorUserId?: number | null;
  assigneeUserId?: number | null;
  actorUserId: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseBooleanFlag(value: number): boolean {
  return value === 1;
}

function toAbsoluteUrl(path: string): string {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    return path;
  }

  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function resolvePreferenceFallback(
  category: NotificationCategory,
): NotificationChannelPreference {
  const defaults = DEFAULT_CATEGORY_CHANNELS[category];
  return {
    inAppEnabled: defaults.inAppEnabled,
    emailEnabled: defaults.emailEnabled,
  };
}

async function resolvePreferencesByUser(
  userIds: number[],
  category: NotificationCategory,
): Promise<Map<number, NotificationChannelPreference>> {
  const fallback = resolvePreferenceFallback(category);
  if (userIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      userId: notificationPreference.userId,
      inAppEnabled: notificationPreference.inAppEnabled,
      emailEnabled: notificationPreference.emailEnabled,
    })
    .from(notificationPreference)
    .where(
      and(
        inArray(notificationPreference.userId, userIds),
        eq(notificationPreference.category, category),
      ),
    );

  const preferenceMap = new Map<number, NotificationChannelPreference>();
  for (const userId of userIds) {
    preferenceMap.set(userId, fallback);
  }

  for (const row of rows) {
    preferenceMap.set(row.userId, {
      inAppEnabled: parseBooleanFlag(row.inAppEnabled),
      emailEnabled: parseBooleanFlag(row.emailEnabled),
    });
  }

  return preferenceMap;
}

async function logNotificationDelivery(
  input: {
    notificationId?: number;
    userId: number;
    channel: "in_app" | "email";
    status: "delivered" | "failed" | "read";
    metadata?: string;
  },
): Promise<void> {
  await db.insert(notificationDeliveryLog).values({
    notificationId: input.notificationId ?? null,
    userId: input.userId,
    channel: input.channel,
    status: input.status,
    metadata: input.metadata ?? null,
    createdAt: nowIso(),
  });
}

async function queueNotificationEmail(
  input: {
    notificationId: number;
    userId: number;
    toEmail: string;
    title: string;
    body: string | null;
    href: string;
    category: NotificationCategory;
    emailDelayMinutes: number;
  },
): Promise<void> {
  const managePreferencesUrl = toAbsoluteUrl("/notifications");
  const destinationUrl = toAbsoluteUrl(input.href);
  const subject = `Transxact: ${input.title}`;
  const content = createUnifiedEmailContent({
    headline: input.title,
    messageLines: [
      input.body ?? "You have a new update in Transxact Projects.",
    ],
    actionLabel: "View in Transxact",
    actionUrl: destinationUrl,
    footerLines: [
      `Adjust your notification preferences: ${managePreferencesUrl}`,
      `Category: ${input.category}`,
    ],
    previewText: input.body ?? input.title,
  });

  const queuedAt = new Date();
  const sendAfterAt = new Date(
    queuedAt.getTime() + input.emailDelayMinutes * 60 * 1000,
  ).toISOString();
  const createdAt = queuedAt.toISOString();

  await db.insert(notificationEmailQueue).values({
    notificationId: input.notificationId,
    userId: input.userId,
    toEmail: input.toEmail,
    subject,
    textBody: content.text,
    htmlBody: content.html,
    status: "pending",
    attempts: 0,
    sendAfterAt,
    sentAt: null,
    lastError: null,
    createdAt,
    updatedAt: createdAt,
  });
}

export async function createNotifications(
  input: CreateNotificationsInput,
): Promise<void> {
  await ensureDbSchema();

  const uniqueRecipientIds = [...new Set(input.recipientUserIds)].filter(
    (userId) => userId > 0,
  );
  if (uniqueRecipientIds.length === 0) {
    return;
  }

  const recipients = await db
    .select({
      id: user.id,
      email: user.email,
      status: user.status,
    })
    .from(user)
    .where(inArray(user.id, uniqueRecipientIds));

  const activeRecipients = recipients.filter((row) => row.status === "active");
  if (activeRecipients.length === 0) {
    return;
  }

  const activeUserIds = activeRecipients.map((row) => row.id);
  const preferenceByUserId = await resolvePreferencesByUser(
    activeUserIds,
    input.category,
  );

  const touchedUsers = new Set<number>();
  for (const recipient of activeRecipients) {
    const channels =
      preferenceByUserId.get(recipient.id) ?? resolvePreferenceFallback(input.category);

    if (!channels.inAppEnabled && !channels.emailEnabled) {
      continue;
    }

    const createdAt = nowIso();
    const inserted = await db
      .insert(notification)
      .values({
        userId: recipient.id,
        actorUserId: input.actorUserId ?? null,
        category: input.category,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        href: input.href,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        inAppVisible: channels.inAppEnabled ? 1 : 0,
        isRead: 0,
        readAt: null,
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: notification.id });

    if (inserted.length === 0) {
      continue;
    }

    const notificationId = inserted[0].id;
    if (channels.inAppEnabled) {
      await logNotificationDelivery({
        notificationId,
        userId: recipient.id,
        channel: "in_app",
        status: "delivered",
      });
    }

    if (channels.emailEnabled) {
      await queueNotificationEmail({
        notificationId,
        userId: recipient.id,
        toEmail: recipient.email,
        title: input.title,
        body: input.body ?? null,
        href: input.href,
        category: input.category,
        emailDelayMinutes: input.emailDelayMinutes ?? 0,
      });
    }

    touchedUsers.add(recipient.id);
  }

  if (touchedUsers.size > 0) {
    publishRealtimeRefresh([...touchedUsers]);
  }

  if ((input.emailDelayMinutes ?? 0) === 0) {
    processPendingEmailQueueWithWorker(10).catch(() => {});
  }
}

export async function processPendingEmailQueue(
  limit = 20,
): Promise<{ sent: number; failed: number; retried: number }> {
  await ensureDbSchema();

  const now = new Date();
  const nowAsIso = now.toISOString();
  const queuedEmails = await db
    .select({
      id: notificationEmailQueue.id,
      notificationId: notificationEmailQueue.notificationId,
      userId: notificationEmailQueue.userId,
      toEmail: notificationEmailQueue.toEmail,
      subject: notificationEmailQueue.subject,
      textBody: notificationEmailQueue.textBody,
      htmlBody: notificationEmailQueue.htmlBody,
      attempts: notificationEmailQueue.attempts,
      status: notificationEmailQueue.status,
    })
    .from(notificationEmailQueue)
    .where(
      and(
        eq(notificationEmailQueue.status, "pending"),
        sql`${notificationEmailQueue.sendAfterAt} <= ${nowAsIso}`,
      ),
    )
    .orderBy(asc(notificationEmailQueue.sendAfterAt))
    .limit(limit);

  let sent = 0;
  let failed = 0;
  let retried = 0;
  const touchedUsers = new Set<number>();

  for (const queued of queuedEmails) {
    try {
      await sendEmail({
        to: queued.toEmail,
        subject: queued.subject,
        text: queued.textBody,
        html: queued.htmlBody ?? undefined,
      });

      const sentAt = nowIso();
      await db
        .update(notificationEmailQueue)
        .set({
          status: "sent",
          sentAt,
          updatedAt: sentAt,
          lastError: null,
        })
        .where(eq(notificationEmailQueue.id, queued.id));

      await logNotificationDelivery({
        notificationId: queued.notificationId,
        userId: queued.userId,
        channel: "email",
        status: "delivered",
      });

      sent += 1;
      touchedUsers.add(queued.userId);
    } catch (error) {
      const nextAttempts = queued.attempts + 1;
      const exhausted = nextAttempts >= MAX_EMAIL_ATTEMPTS;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown email delivery error.";
      const updatedAt = nowIso();

      if (exhausted) {
        await db
          .update(notificationEmailQueue)
          .set({
            status: "failed",
            attempts: nextAttempts,
            lastError: errorMessage,
            updatedAt,
          })
          .where(eq(notificationEmailQueue.id, queued.id));
        failed += 1;
      } else {
        const delayMinutes = EMAIL_RETRY_MINUTES[nextAttempts - 1] ?? 30;
        const retryAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
        await db
          .update(notificationEmailQueue)
          .set({
            status: "pending",
            attempts: nextAttempts,
            sendAfterAt: retryAt,
            lastError: errorMessage,
            updatedAt,
          })
          .where(eq(notificationEmailQueue.id, queued.id));
        retried += 1;
      }

      await logNotificationDelivery({
        notificationId: queued.notificationId,
        userId: queued.userId,
        channel: "email",
        status: "failed",
        metadata: errorMessage,
      });
    }
  }

  if (touchedUsers.size > 0) {
    publishRealtimeRefresh([...touchedUsers]);
  }

  return { sent, failed, retried };
}

export async function processPendingEmailQueueWithWorker(
  limit = 20,
): Promise<{ sent: number; failed: number; retried: number }> {
  const { Worker } = await import("worker_threads");
  const path = await import("path");

  return new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve("workers/emailQueue.worker.ts"), {
      execArgv: ["--import", "tsx"],
    });

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("Email queue worker timed out after 60s"));
    }, 60_000);

    worker.on("message", (msg: any) => {
      if (msg.type === "result") {
        clearTimeout(timeout);
        if (msg.touchedUserIds?.length > 0) {
          publishRealtimeRefresh(msg.touchedUserIds);
        }
        resolve({ sent: msg.sent, failed: msg.failed, retried: msg.retried });
      } else if (msg.type === "error") {
        clearTimeout(timeout);
        reject(new Error(msg.message));
      }
    });

    worker.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    worker.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Email queue worker exited with code ${code}`));
      }
    });

    worker.postMessage({ type: "process", limit });
  });
}

export async function listNotificationCenterData(): Promise<{
  notifications: NotificationListItem[];
  preferences: NotificationPreferenceItem[];
}> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const [notifications, preferences] = await Promise.all([
    db
      .select({
        id: notification.id,
        category: notification.category,
        title: notification.title,
        body: notification.body,
        href: notification.href,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
      })
      .from(notification)
      .where(
        and(
          eq(notification.userId, currentUser.id),
          eq(notification.inAppVisible, 1),
        ),
      )
      .orderBy(desc(notification.createdAt))
      .limit(200),
    db
      .select({
        category: notificationPreference.category,
        inAppEnabled: notificationPreference.inAppEnabled,
        emailEnabled: notificationPreference.emailEnabled,
      })
      .from(notificationPreference)
      .where(eq(notificationPreference.userId, currentUser.id)),
  ]);

  const preferencesByCategory = new Map<
    NotificationCategory,
    NotificationChannelPreference
  >();
  for (const [category, defaults] of Object.entries(DEFAULT_CATEGORY_CHANNELS) as Array<
    [NotificationCategory, { inAppEnabled: boolean; emailEnabled: boolean }]
  >) {
    preferencesByCategory.set(category, {
      inAppEnabled: defaults.inAppEnabled,
      emailEnabled: defaults.emailEnabled,
    });
  }

  for (const row of preferences) {
    preferencesByCategory.set(row.category, {
      inAppEnabled: parseBooleanFlag(row.inAppEnabled),
      emailEnabled: parseBooleanFlag(row.emailEnabled),
    });
  }

  return {
    notifications: notifications.map((item) => ({
      id: item.id,
      category: item.category,
      title: item.title,
      body: item.body,
      href: item.href,
      isRead: parseBooleanFlag(item.isRead),
      createdAt: item.createdAt,
    })),
    preferences: [...preferencesByCategory.entries()].map(([category, channels]) => ({
      category,
      label: DEFAULT_CATEGORY_CHANNELS[category].label,
      inAppEnabled: channels.inAppEnabled,
      emailEnabled: channels.emailEnabled,
    })),
  };
}

export async function listRecentNotifications(
  limit = 8,
): Promise<NotificationListItem[]> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const rows = await db
    .select({
      id: notification.id,
      category: notification.category,
      title: notification.title,
      body: notification.body,
      href: notification.href,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    })
    .from(notification)
    .where(
      and(eq(notification.userId, currentUser.id), eq(notification.inAppVisible, 1)),
    )
    .orderBy(desc(notification.createdAt))
    .limit(limit);

  return rows.map((item) => ({
    id: item.id,
    category: item.category,
    title: item.title,
    body: item.body,
    href: item.href,
    isRead: parseBooleanFlag(item.isRead),
    createdAt: item.createdAt,
  }));
}

export async function markNotificationAsRead(notificationId: number): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const rows = await db
    .select({
      id: notification.id,
      isRead: notification.isRead,
    })
    .from(notification)
    .where(and(eq(notification.id, notificationId), eq(notification.userId, currentUser.id)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Notification not found.");
  }

  if (parseBooleanFlag(rows[0].isRead)) {
    return;
  }

  const readAt = nowIso();
  await db
    .update(notification)
    .set({
      isRead: 1,
      readAt,
      updatedAt: readAt,
    })
    .where(eq(notification.id, notificationId));

  await logNotificationDelivery({
    notificationId,
    userId: currentUser.id,
    channel: "in_app",
    status: "read",
  });

  publishRealtimeRefresh([currentUser.id]);
}

export async function markAllNotificationsAsRead(): Promise<number> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const unreadRows = await db
    .select({ id: notification.id })
    .from(notification)
    .where(
      and(
        eq(notification.userId, currentUser.id),
        eq(notification.inAppVisible, 1),
        eq(notification.isRead, 0),
      ),
    );

  if (unreadRows.length === 0) {
    return 0;
  }

  const ids = unreadRows.map((row) => row.id);
  const readAt = nowIso();
  await db
    .update(notification)
    .set({
      isRead: 1,
      readAt,
      updatedAt: readAt,
    })
    .where(inArray(notification.id, ids));

  for (const notificationId of ids) {
    await logNotificationDelivery({
      notificationId,
      userId: currentUser.id,
      channel: "in_app",
      status: "read",
    });
  }

  publishRealtimeRefresh([currentUser.id]);
  return ids.length;
}

export async function updateNotificationPreference(input: {
  category: NotificationCategory;
  inAppEnabled: boolean;
  emailEnabled: boolean;
}): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const timestamp = nowIso();
  await db
    .insert(notificationPreference)
    .values({
      userId: currentUser.id,
      category: input.category,
      inAppEnabled: input.inAppEnabled ? 1 : 0,
      emailEnabled: input.emailEnabled ? 1 : 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [notificationPreference.userId, notificationPreference.category],
      set: {
        inAppEnabled: input.inAppEnabled ? 1 : 0,
        emailEnabled: input.emailEnabled ? 1 : 0,
        updatedAt: timestamp,
      },
    });

  publishRealtimeRefresh([currentUser.id]);
}

export async function getUnreadInboxCounts(): Promise<InboxUnreadCounts> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const unreadNotificationRows = await db
    .select({ total: sql<number>`count(${notification.id})` })
    .from(notification)
    .where(
      and(
        eq(notification.userId, currentUser.id),
        eq(notification.inAppVisible, 1),
        eq(notification.isRead, 0),
      ),
    );

  const unreadMessageRows = await db
    .select({ total: sql<number>`count(${directMessage.id})` })
    .from(directConversationMember)
    .innerJoin(
      directMessage,
      and(
        eq(directMessage.conversationId, directConversationMember.conversationId),
        sql`${directMessage.id} > coalesce(${directConversationMember.lastReadMessageId}, 0)`,
      ),
    )
    .where(
      and(
        eq(directConversationMember.userId, currentUser.id),
        isNull(directConversationMember.archivedAt),
        isNull(directMessage.deletedAt),
        sql`${directMessage.senderUserId} != ${currentUser.id}`,
      ),
    );

  return {
    unreadMessageCount: Number(unreadMessageRows[0]?.total ?? 0),
    unreadNotificationCount: Number(unreadNotificationRows[0]?.total ?? 0),
  };
}

export async function ensureEntitySubscriptions(
  entityType: SubscribableEntityType,
  entityId: number,
  userIds: Array<number | null | undefined>,
): Promise<void> {
  await ensureDbSchema();

  const uniqueUserIds = [...new Set(userIds.filter((userId): userId is number => !!userId))];
  if (uniqueUserIds.length === 0) {
    return;
  }

  const createdAt = nowIso();
  for (const userId of uniqueUserIds) {
    await db
      .insert(entitySubscription)
      .values({
        userId,
        entityType,
        entityId,
        createdAt,
        updatedAt: createdAt,
      })
      .onConflictDoNothing({
        target: [
          entitySubscription.userId,
          entitySubscription.entityType,
          entitySubscription.entityId,
        ],
      });
  }
}

export async function toggleEntitySubscription(
  entityType: SubscribableEntityType,
  entityId: number,
  follow: boolean,
): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  if (follow) {
    const timestamp = nowIso();
    await db
      .insert(entitySubscription)
      .values({
        userId: currentUser.id,
        entityType,
        entityId,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing({
        target: [
          entitySubscription.userId,
          entitySubscription.entityType,
          entitySubscription.entityId,
        ],
      });
  } else {
    await db
      .delete(entitySubscription)
      .where(
        and(
          eq(entitySubscription.userId, currentUser.id),
          eq(entitySubscription.entityType, entityType),
          eq(entitySubscription.entityId, entityId),
        ),
      );
  }

  publishRealtimeRefresh([currentUser.id]);
}

export async function listUserEntitySubscriptionState(
  entityType: SubscribableEntityType,
  entityIds: number[],
): Promise<Map<number, boolean>> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const uniqueEntityIds = [...new Set(entityIds)].filter((entityId) => entityId > 0);
  if (uniqueEntityIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ entityId: entitySubscription.entityId })
    .from(entitySubscription)
    .where(
      and(
        eq(entitySubscription.userId, currentUser.id),
        eq(entitySubscription.entityType, entityType),
        inArray(entitySubscription.entityId, uniqueEntityIds),
      ),
    );

  const subscribedEntityIds = new Set(rows.map((row) => row.entityId));
  const state = new Map<number, boolean>();
  for (const entityId of uniqueEntityIds) {
    state.set(entityId, subscribedEntityIds.has(entityId));
  }

  return state;
}

export async function resolveEntityNotificationRecipients(
  input: EntityRecipientInput,
): Promise<number[]> {
  await ensureDbSchema();

  const subscribedRows = await db
    .select({ userId: entitySubscription.userId })
    .from(entitySubscription)
    .where(
      and(
        eq(entitySubscription.entityType, input.entityType),
        eq(entitySubscription.entityId, input.entityId),
      ),
    );

  const recipients = new Set<number>();
  if (input.creatorUserId) {
    recipients.add(input.creatorUserId);
  }
  if (input.assigneeUserId) {
    recipients.add(input.assigneeUserId);
  }
  for (const row of subscribedRows) {
    recipients.add(row.userId);
  }

  recipients.delete(input.actorUserId);
  return [...recipients];
}
