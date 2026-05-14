import { int, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export type UserRole = "admin" | "member";
export type UserStatus = "active" | "inactive" | "pending";
export const user = sqliteTable("user", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text(),
  email: text().notNull().unique(),
  role: text().notNull().$type<UserRole>().default("member"),
  code: text(),
  codeExpiresAt: text(),
  codeAttemptCount: int().notNull().default(0),
  codeLastRequestedAt: text(),
  jwt: text(),
  status: text().notNull().$type<UserStatus>().default("pending"),
  invitedByUserId: int(),
  invitationAcceptedAt: text(),
  firstLoginCompletedAt: text(),
  lastLoginAt: text(),
  createdAt: text().notNull(),
  updatedAt: text(),
});

export type DirectMessageReportStatus = "open" | "resolved";
export type NotificationCategory =
  | "direct_message"
  | "project_activity"
  | "task_activity"
  | "issue_activity"
  | "abuse_report";
export type NotificationSourceType = "conversation" | "project" | "task" | "issue" | "report";
export type NotificationChannel = "in_app" | "email";
export type NotificationDeliveryStatus = "delivered" | "failed" | "read";
export type NotificationEmailQueueStatus = "pending" | "sent" | "failed";
export type SubscribableEntityType = "project" | "task" | "issue";

export const project = sqliteTable("project", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  createdByUserId: int().references(() => user.id),
  createdAt: text().notNull(),
  updatedAt: text(),
  deletedAt: text(),
});

export type PhaseStatus = "not_started" | "in_progress" | "completed";
export const phase = sqliteTable("phase", {
  id: int().primaryKey({ autoIncrement: true }),
  projectId: int()
    .notNull()
    .references(() => project.id),
  name: text().notNull(),
  description: text(),
  status: text().notNull().$type<PhaseStatus>().default("not_started"),
  createdByUserId: int().references(() => user.id),
  createdAt: text().notNull(),
  updatedAt: text(),
  deletedAt: text(),
});

export type TaskStatus = "not_started" | "in_progress" | "completed";
export const task = sqliteTable("task", {
  id: int().primaryKey({ autoIncrement: true }),
  phaseId: int()
    .notNull()
    .references(() => phase.id),
  assigneeUserId: int()
    .notNull()
    .references(() => user.id),
  title: text().notNull(),
  description: text(),
  status: text().notNull().$type<TaskStatus>().default("not_started"),
  dueAt: text().notNull(),
  createdByUserId: int().references(() => user.id),
  createdAt: text().notNull(),
  updatedAt: text(),
  deletedAt: text(),
});

export type IssueStatus = "open" | "in_progress" | "resolved" | "closed";
export const issue = sqliteTable("issue", {
  id: int().primaryKey({ autoIncrement: true }),
  projectId: int()
    .notNull()
    .references(() => project.id),
  taskId: int().references(() => task.id),
  assigneeUserId: int().references(() => user.id),
  title: text().notNull(),
  description: text(),
  status: text().notNull().$type<IssueStatus>().default("open"),
  createdByUserId: int().references(() => user.id),
  createdAt: text().notNull(),
  updatedAt: text(),
  deletedAt: text(),
});

export const directConversation = sqliteTable("direct_conversation", {
  id: int().primaryKey({ autoIncrement: true }),
  createdByUserId: int()
    .notNull()
    .references(() => user.id),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
});

export const directMessage = sqliteTable(
  "direct_message",
  {
    id: int().primaryKey({ autoIncrement: true }),
    conversationId: int()
      .notNull()
      .references(() => directConversation.id),
    senderUserId: int()
      .notNull()
      .references(() => user.id),
    body: text().notNull(),
    createdAt: text().notNull(),
    updatedAt: text(),
    editedAt: text(),
    deletedAt: text(),
  },
  (table) => ({
    conversationIdx: index("direct_message_conversation_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  }),
);

export const directConversationMember = sqliteTable(
  "direct_conversation_member",
  {
    id: int().primaryKey({ autoIncrement: true }),
    conversationId: int()
      .notNull()
      .references(() => directConversation.id),
    userId: int()
      .notNull()
      .references(() => user.id),
    joinedAt: text().notNull(),
    updatedAt: text(),
    archivedAt: text(),
    lastReadMessageId: int().references(() => directMessage.id),
    lastReadAt: text(),
  },
  (table) => ({
    conversationMemberUnique: uniqueIndex(
      "direct_conversation_member_unique",
    ).on(table.conversationId, table.userId),
    memberByUserIdx: index("direct_conversation_member_user_idx").on(
      table.userId,
      table.archivedAt,
    ),
  }),
);

export const userBlock = sqliteTable(
  "user_block",
  {
    id: int().primaryKey({ autoIncrement: true }),
    blockerUserId: int()
      .notNull()
      .references(() => user.id),
    blockedUserId: int()
      .notNull()
      .references(() => user.id),
    createdAt: text().notNull(),
    updatedAt: text(),
  },
  (table) => ({
    blockerTargetUnique: uniqueIndex("user_block_unique").on(
      table.blockerUserId,
      table.blockedUserId,
    ),
    blockedByTargetIdx: index("user_block_target_idx").on(table.blockedUserId),
  }),
);

export const directMessageReport = sqliteTable(
  "direct_message_report",
  {
    id: int().primaryKey({ autoIncrement: true }),
    reporterUserId: int()
      .notNull()
      .references(() => user.id),
    conversationId: int()
      .notNull()
      .references(() => directConversation.id),
    messageId: int().references(() => directMessage.id),
    reason: text().notNull(),
    status: text().notNull().$type<DirectMessageReportStatus>().default("open"),
    reviewedByUserId: int().references(() => user.id),
    reviewedAt: text(),
    createdAt: text().notNull(),
    updatedAt: text(),
  },
  (table) => ({
    reportStatusIdx: index("direct_message_report_status_idx").on(
      table.status,
      table.createdAt,
    ),
  }),
);

export const notification = sqliteTable(
  "notification",
  {
    id: int().primaryKey({ autoIncrement: true }),
    userId: int()
      .notNull()
      .references(() => user.id),
    actorUserId: int().references(() => user.id),
    category: text().notNull().$type<NotificationCategory>(),
    type: text().notNull(),
    title: text().notNull(),
    body: text(),
    href: text().notNull(),
    sourceType: text().notNull().$type<NotificationSourceType>(),
    sourceId: int(),
    inAppVisible: int().notNull().default(1),
    isRead: int().notNull().default(0),
    readAt: text(),
    createdAt: text().notNull(),
    updatedAt: text(),
  },
  (table) => ({
    userUnreadIdx: index("notification_user_unread_idx").on(
      table.userId,
      table.inAppVisible,
      table.isRead,
      table.createdAt,
    ),
  }),
);

export const notificationPreference = sqliteTable(
  "notification_preference",
  {
    id: int().primaryKey({ autoIncrement: true }),
    userId: int()
      .notNull()
      .references(() => user.id),
    category: text().notNull().$type<NotificationCategory>(),
    inAppEnabled: int().notNull().default(1),
    emailEnabled: int().notNull().default(1),
    createdAt: text().notNull(),
    updatedAt: text(),
  },
  (table) => ({
    categoryByUserUnique: uniqueIndex("notification_preference_unique").on(
      table.userId,
      table.category,
    ),
  }),
);

export const entitySubscription = sqliteTable(
  "entity_subscription",
  {
    id: int().primaryKey({ autoIncrement: true }),
    userId: int()
      .notNull()
      .references(() => user.id),
    entityType: text().notNull().$type<SubscribableEntityType>(),
    entityId: int().notNull(),
    createdAt: text().notNull(),
    updatedAt: text(),
  },
  (table) => ({
    uniqueEntitySubscription: uniqueIndex("entity_subscription_unique").on(
      table.userId,
      table.entityType,
      table.entityId,
    ),
    entitySubscriptionIdx: index("entity_subscription_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
  }),
);

export const notificationDeliveryLog = sqliteTable(
  "notification_delivery_log",
  {
    id: int().primaryKey({ autoIncrement: true }),
    notificationId: int().references(() => notification.id),
    userId: int()
      .notNull()
      .references(() => user.id),
    channel: text().notNull().$type<NotificationChannel>(),
    status: text().notNull().$type<NotificationDeliveryStatus>(),
    metadata: text(),
    createdAt: text().notNull(),
  },
  (table) => ({
    deliveryLogNotificationIdx: index("notification_delivery_log_notification_idx").on(
      table.notificationId,
      table.createdAt,
    ),
  }),
);

export const notificationEmailQueue = sqliteTable(
  "notification_email_queue",
  {
    id: int().primaryKey({ autoIncrement: true }),
    notificationId: int()
      .notNull()
      .references(() => notification.id),
    userId: int()
      .notNull()
      .references(() => user.id),
    toEmail: text().notNull(),
    subject: text().notNull(),
    textBody: text().notNull(),
    htmlBody: text(),
    status: text().notNull().$type<NotificationEmailQueueStatus>().default("pending"),
    attempts: int().notNull().default(0),
    sendAfterAt: text().notNull(),
    sentAt: text(),
    lastError: text(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => ({
    queueStatusIdx: index("notification_email_queue_status_idx").on(
      table.status,
      table.sendAfterAt,
    ),
  }),
);

export type InviteRole = UserRole;
export const invite = sqliteTable("invite", {
  id: int().primaryKey({ autoIncrement: true }),
  email: text().notNull(),
  role: text().notNull().$type<InviteRole>().default("member"),
  invitedByUserId: int()
    .notNull()
    .references(() => user.id),
  token: text().notNull().unique(),
  expiresAt: text().notNull(),
  acceptedAt: text(),
  revokedAt: text(),
  createdAt: text().notNull(),
  updatedAt: text(),
});

export const workItemComment = sqliteTable("work_item_comment", {
  id: int().primaryKey({ autoIncrement: true }),
  taskId: int().references(() => task.id),
  issueId: int().references(() => issue.id),
  createdByUserId: int()
    .notNull()
    .references(() => user.id),
  body: text().notNull(),
  createdAt: text().notNull(),
  updatedAt: text(),
  deletedAt: text(),
});

export const workItemAttachment = sqliteTable("work_item_attachment", {
  id: int().primaryKey({ autoIncrement: true }),
  taskId: int().references(() => task.id),
  issueId: int().references(() => issue.id),
  uploadedByUserId: int()
    .notNull()
    .references(() => user.id),
  fileName: text().notNull(),
  mimeType: text().notNull(),
  sizeBytes: int().notNull(),
  storagePath: text().notNull(),
  createdAt: text().notNull(),
  deletedAt: text(),
});

export const auditEvent = sqliteTable("audit_event", {
  id: int().primaryKey({ autoIncrement: true }),
  actorUserId: int().references(() => user.id),
  entityType: text().notNull(),
  entityId: int(),
  action: text().notNull(),
  metadata: text(),
  createdAt: text().notNull(),
});

export type AuditLogAction = "created" | "updated" | "deleted" | "role_changed" | "status_changed" | "invited";
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: int().primaryKey({ autoIncrement: true }),
    adminUserId: int()
      .notNull()
      .references(() => user.id),
    targetUserId: int()
      .notNull()
      .references(() => user.id),
    action: text().notNull().$type<AuditLogAction>(),
    previousValue: text(),
    newValue: text(),
    metadata: text(),
    createdAt: text().notNull(),
  },
  (table) => ({
    targetUserIdx: index("audit_log_target_user_idx").on(table.targetUserId, table.createdAt),
    adminUserIdx: index("audit_log_admin_user_idx").on(table.adminUserId, table.createdAt),
  }),
);
