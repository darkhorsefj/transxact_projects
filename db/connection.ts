import "dotenv/config";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";

const db = drizzle(process.env.DB_FILE_NAME!);

type ColumnDefinition = {
  name: string;
  sqlType: string;
};

const compatibilityColumns: Record<string, ColumnDefinition[]> = {
  user: [
    { name: "role", sqlType: "text DEFAULT 'member' NOT NULL" },
    { name: "codeExpiresAt", sqlType: "text" },
    { name: "codeAttemptCount", sqlType: "integer DEFAULT 0 NOT NULL" },
    { name: "codeLastRequestedAt", sqlType: "text" },
    { name: "invitedByUserId", sqlType: "integer" },
    { name: "invitationAcceptedAt", sqlType: "text" },
    { name: "firstLoginCompletedAt", sqlType: "text" },
  ],
  project: [
    { name: "createdByUserId", sqlType: "integer" },
    { name: "deletedAt", sqlType: "text" },
  ],
  phase: [
    { name: "createdByUserId", sqlType: "integer" },
    { name: "deletedAt", sqlType: "text" },
  ],
  task: [
    { name: "assigneeUserId", sqlType: "integer" },
    { name: "dueAt", sqlType: "text" },
    { name: "createdByUserId", sqlType: "integer" },
    { name: "deletedAt", sqlType: "text" },
  ],
  issue: [
    { name: "taskId", sqlType: "integer" },
    { name: "assigneeUserId", sqlType: "integer" },
    { name: "createdByUserId", sqlType: "integer" },
    { name: "deletedAt", sqlType: "text" },
  ],
  notification: [{ name: "inAppVisible", sqlType: "integer DEFAULT 1 NOT NULL" }],
};

const compatibilityTableStatements = [
  `CREATE TABLE IF NOT EXISTS "direct_conversation" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "createdByUserId" integer NOT NULL,
    "createdAt" text NOT NULL,
    "updatedAt" text NOT NULL,
    FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action
  )`,
  `CREATE TABLE IF NOT EXISTS "direct_message" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "conversationId" integer NOT NULL,
    "senderUserId" integer NOT NULL,
    "body" text NOT NULL,
    "createdAt" text NOT NULL,
    "updatedAt" text,
    "editedAt" text,
    "deletedAt" text,
    FOREIGN KEY ("conversationId") REFERENCES "direct_conversation"("id") ON UPDATE no action ON DELETE no action,
    FOREIGN KEY ("senderUserId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action
  )`,
  `CREATE TABLE IF NOT EXISTS "direct_conversation_member" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "conversationId" integer NOT NULL,
    "userId" integer NOT NULL,
    "joinedAt" text NOT NULL,
    "updatedAt" text,
    "archivedAt" text,
    "lastReadMessageId" integer,
    "lastReadAt" text,
    FOREIGN KEY ("conversationId") REFERENCES "direct_conversation"("id") ON UPDATE no action ON DELETE no action,
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action,
    FOREIGN KEY ("lastReadMessageId") REFERENCES "direct_message"("id") ON UPDATE no action ON DELETE no action
  )`,
  `CREATE TABLE IF NOT EXISTS "user_block" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "blockerUserId" integer NOT NULL,
    "blockedUserId" integer NOT NULL,
    "createdAt" text NOT NULL,
    "updatedAt" text,
    FOREIGN KEY ("blockerUserId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action,
    FOREIGN KEY ("blockedUserId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action
  )`,
  `CREATE TABLE IF NOT EXISTS "direct_message_report" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "reporterUserId" integer NOT NULL,
    "conversationId" integer NOT NULL,
    "messageId" integer,
    "reason" text NOT NULL,
    "status" text DEFAULT 'open' NOT NULL,
    "reviewedByUserId" integer,
    "reviewedAt" text,
    "createdAt" text NOT NULL,
    "updatedAt" text,
    FOREIGN KEY ("reporterUserId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action,
    FOREIGN KEY ("conversationId") REFERENCES "direct_conversation"("id") ON UPDATE no action ON DELETE no action,
    FOREIGN KEY ("messageId") REFERENCES "direct_message"("id") ON UPDATE no action ON DELETE no action,
    FOREIGN KEY ("reviewedByUserId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action
  )`,
  `CREATE TABLE IF NOT EXISTS "notification" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "userId" integer NOT NULL,
    "actorUserId" integer,
    "category" text NOT NULL,
    "type" text NOT NULL,
    "title" text NOT NULL,
    "body" text,
    "href" text NOT NULL,
    "sourceType" text NOT NULL,
    "sourceId" integer,
    "inAppVisible" integer DEFAULT 1 NOT NULL,
    "isRead" integer DEFAULT 0 NOT NULL,
    "readAt" text,
    "createdAt" text NOT NULL,
    "updatedAt" text,
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action,
    FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action
  )`,
  `CREATE TABLE IF NOT EXISTS "notification_preference" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "userId" integer NOT NULL,
    "category" text NOT NULL,
    "inAppEnabled" integer DEFAULT 1 NOT NULL,
    "emailEnabled" integer DEFAULT 1 NOT NULL,
    "createdAt" text NOT NULL,
    "updatedAt" text,
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action
  )`,
  `CREATE TABLE IF NOT EXISTS "entity_subscription" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "userId" integer NOT NULL,
    "entityType" text NOT NULL,
    "entityId" integer NOT NULL,
    "createdAt" text NOT NULL,
    "updatedAt" text,
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action
  )`,
  `CREATE TABLE IF NOT EXISTS "notification_delivery_log" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "notificationId" integer,
    "userId" integer NOT NULL,
    "channel" text NOT NULL,
    "status" text NOT NULL,
    "metadata" text,
    "createdAt" text NOT NULL,
    FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON UPDATE no action ON DELETE no action,
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action
  )`,
  `CREATE TABLE IF NOT EXISTS "notification_email_queue" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "notificationId" integer NOT NULL,
    "userId" integer NOT NULL,
    "toEmail" text NOT NULL,
    "subject" text NOT NULL,
    "textBody" text NOT NULL,
    "htmlBody" text,
    "status" text DEFAULT 'pending' NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "sendAfterAt" text NOT NULL,
    "sentAt" text,
    "lastError" text,
    "createdAt" text NOT NULL,
    "updatedAt" text NOT NULL,
    FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON UPDATE no action ON DELETE no action,
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action
  )`,
  `CREATE TABLE IF NOT EXISTS "work_item_comment" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "taskId" integer,
    "issueId" integer,
    "createdByUserId" integer NOT NULL,
    "body" text NOT NULL,
    "createdAt" text NOT NULL,
    "updatedAt" text,
    "deletedAt" text,
    FOREIGN KEY ("taskId") REFERENCES "task"("id") ON UPDATE no action ON DELETE no action,
    FOREIGN KEY ("issueId") REFERENCES "issue"("id") ON UPDATE no action ON DELETE no action,
    FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action
  )`,
];

const compatibilityIndexStatements = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "direct_conversation_member_unique"
   ON "direct_conversation_member" ("conversationId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "direct_conversation_member_user_idx"
   ON "direct_conversation_member" ("userId", "archivedAt")`,
  `CREATE INDEX IF NOT EXISTS "direct_message_conversation_idx"
   ON "direct_message" ("conversationId", "createdAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "user_block_unique"
   ON "user_block" ("blockerUserId", "blockedUserId")`,
  `CREATE INDEX IF NOT EXISTS "user_block_target_idx"
   ON "user_block" ("blockedUserId")`,
  `CREATE INDEX IF NOT EXISTS "direct_message_report_status_idx"
   ON "direct_message_report" ("status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "notification_user_unread_idx"
   ON "notification" ("userId", "inAppVisible", "isRead", "createdAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "notification_preference_unique"
   ON "notification_preference" ("userId", "category")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "entity_subscription_unique"
   ON "entity_subscription" ("userId", "entityType", "entityId")`,
  `CREATE INDEX IF NOT EXISTS "entity_subscription_entity_idx"
   ON "entity_subscription" ("entityType", "entityId")`,
  `CREATE INDEX IF NOT EXISTS "notification_delivery_log_notification_idx"
   ON "notification_delivery_log" ("notificationId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "notification_email_queue_status_idx"
   ON "notification_email_queue" ("status", "sendAfterAt")`,
];

type TableInfoRow = {
  name: string;
};

let ensureDbSchemaPromise: Promise<void> | null = null;

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await db.all<{ name: string }>(
    sql.raw(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}' LIMIT 1`,
    ),
  );
  return rows.length > 0;
}

async function getColumns(tableName: string): Promise<Set<string>> {
  const rows = await db.all<TableInfoRow>(
    sql.raw(`PRAGMA table_info('${tableName}')`),
  );
  return new Set(rows.map((row) => row.name));
}

async function addColumn(
  tableName: string,
  definition: ColumnDefinition,
): Promise<void> {
  await db.run(
    sql.raw(
      `ALTER TABLE "${tableName}" ADD COLUMN "${definition.name}" ${definition.sqlType}`,
    ),
  );
}

async function ensureCompatibilityColumns(): Promise<void> {
  for (const [tableName, definitions] of Object.entries(compatibilityColumns)) {
    if (!(await tableExists(tableName))) {
      continue;
    }

    const existingColumns = await getColumns(tableName);
    for (const definition of definitions) {
      if (!existingColumns.has(definition.name)) {
        await addColumn(tableName, definition);
      }
    }
  }
}

async function ensureCompatibilityTables(): Promise<void> {
  for (const statement of compatibilityTableStatements) {
    await db.run(sql.raw(statement));
  }
}

async function ensureCompatibilityIndexes(): Promise<void> {
  for (const statement of compatibilityIndexStatements) {
    await db.run(sql.raw(statement));
  }
}

export async function ensureDbSchema(): Promise<void> {
  if (!ensureDbSchemaPromise) {
    ensureDbSchemaPromise = (async () => {
      await ensureCompatibilityTables();
      await ensureCompatibilityColumns();
      await ensureCompatibilityIndexes();
    })().catch((error) => {
      ensureDbSchemaPromise = null;
      throw error;
    });
  }

  await ensureDbSchemaPromise;
}

export default db;
