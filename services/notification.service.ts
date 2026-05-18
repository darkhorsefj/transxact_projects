"use server";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import db, { ensureDbSchema } from "@/db/connection";
import {
  caseItem,
  directConversationMember,
  directMessage,
  entitySubscription,
  notification,
  notificationPreference,
  project,
  supportCase,
  task,
  type NotificationCategory,
  type NotificationSourceType,
  user,
} from "@/db/schema";
import { logNotificationDelivery, queueNotificationEmail, processPendingEmailQueueWithWorker } from "./email-queue.service";
import { publishRealtimeRefresh } from "./realtime.service";
import { requireSessionUser } from "./session.service";
import { nowIso, parseBooleanFlag } from "@/lib/utils";

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

export async function notifyOverdueTasks(): Promise<number> {
  await ensureDbSchema();

  const nowIso = new Date().toISOString();
  const overdueTasks = await db
    .select({
      id: task.id,
      title: task.title,
      assigneeUserId: task.assigneeUserId,
      createdByUserId: task.createdByUserId,
      projectName: project.name,
    })
    .from(task)
    .innerJoin(caseItem, eq(task.itemId, caseItem.id))
    .innerJoin(supportCase, eq(caseItem.caseId, supportCase.id))
    .innerJoin(project, eq(supportCase.projectId, project.id))
    .where(
      and(
        sql`${task.dueAt} <= ${nowIso}`,
        sql`${task.status} != 'completed'`,
        isNull(task.deletedAt),
        isNull(task.overdueNotifiedAt),
      ),
    )
    .limit(50);

  if (overdueTasks.length === 0) {
    return 0;
  }

  const taskIds = overdueTasks.map((t) => t.id);
  const subscriptions = await db
    .select({
      taskId: entitySubscription.entityId,
      userId: entitySubscription.userId,
    })
    .from(entitySubscription)
    .where(
      and(
        eq(entitySubscription.entityType, "task"),
        inArray(entitySubscription.entityId, taskIds),
      ),
    );

  const subscribersByTaskId = new Map<number, Set<number>>();
  for (const sub of subscriptions) {
    if (!subscribersByTaskId.has(sub.taskId)) {
      subscribersByTaskId.set(sub.taskId, new Set());
    }
    subscribersByTaskId.get(sub.taskId)!.add(sub.userId);
  }

  let notifiedCount = 0;

  for (const t of overdueTasks) {
    const recipientIds = new Set<number>();
    if (t.assigneeUserId) recipientIds.add(t.assigneeUserId);
    if (t.createdByUserId) recipientIds.add(t.createdByUserId);
    const subscribers = subscribersByTaskId.get(t.id);
    if (subscribers) {
      for (const sid of subscribers) {
        recipientIds.add(sid);
      }
    }

    if (recipientIds.size > 0) {
      await createNotifications({
        recipientUserIds: [...recipientIds],
        category: "task_activity",
        type: "task_overdue",
        title: `Task overdue: ${t.title}`,
        body: `This task in ${t.projectName} was due and is now overdue.`,
        href: `/tasks?taskId=${t.id}`,
        sourceType: "task",
        sourceId: t.id,
        emailDelayMinutes: 0,
      });
      notifiedCount++;
    }

    await db
      .update(task)
      .set({ overdueNotifiedAt: nowIso })
      .where(eq(task.id, t.id));
  }

  return notifiedCount;
}
