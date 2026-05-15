CREATE TABLE IF NOT EXISTS "user_session" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "userId" integer NOT NULL,
  "token" text NOT NULL,
  "deviceLabel" text NOT NULL,
  "ipAddress" text,
  "createdAt" text NOT NULL,
  "lastUsedAt" text NOT NULL,
  "expiresAt" text NOT NULL,
  "isActive" integer DEFAULT 1 NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS "task_comment_read_state" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "userId" integer NOT NULL,
  "taskId" integer NOT NULL,
  "lastReadCommentId" integer,
  "lastReadAt" text NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON UPDATE no action ON DELETE no action,
  FOREIGN KEY ("taskId") REFERENCES "task"("id") ON UPDATE no action ON DELETE no action,
  FOREIGN KEY ("lastReadCommentId") REFERENCES "work_item_comment"("id") ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "task_comment_read_state_unique"
  ON "task_comment_read_state" ("userId", "taskId");

CREATE INDEX IF NOT EXISTS "user_session_user_idx"
  ON "user_session" ("userId", "isActive", "expiresAt");

CREATE INDEX IF NOT EXISTS "work_item_attachment_task_idx"
  ON "work_item_attachment" ("taskId", "deletedAt");

CREATE INDEX IF NOT EXISTS "work_item_attachment_issue_idx"
  ON "work_item_attachment" ("issueId", "deletedAt");
