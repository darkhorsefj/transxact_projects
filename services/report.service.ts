"use server";

import { and, eq, sql } from "drizzle-orm";
import db, { ensureDbSchema } from "@/db/connection";
import {
  directConversationMember,
  directMessage,
  directMessageReport,
  user,
} from "@/db/schema";
import { createNotifications } from "./notification.service";
import { publishRealtimeRefresh } from "./realtime.service";
import { requireAdminUser, requireSessionUser } from "./session.service";
import { displayName, nowIso } from "@/lib/utils";

export interface AdminMessageReportItem {
  id: number;
  conversationId: number;
  messageId: number | null;
  reason: string;
  status: "open" | "resolved";
  createdAt: string;
  reporterLabel: string;
  messagePreview: string;
  participantsLabel: string;
  reviewedAt: string | null;
}

function trimPreview(textValue: string, maxLength = 120): string {
  if (textValue.length <= maxLength) {
    return textValue;
  }

  return `${textValue.slice(0, maxLength - 1)}…`;
}

async function assertUserInConversation(
  conversationId: number,
  userId: number,
): Promise<void> {
  const rows = await db
    .select({ id: directConversationMember.id })
    .from(directConversationMember)
    .where(
      and(
        eq(directConversationMember.conversationId, conversationId),
        eq(directConversationMember.userId, userId),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Conversation not found.");
  }
}

async function notifyAdminsForReport(
  reportId: number,
  actorUserId: number,
  reason: string,
): Promise<void> {
  const adminRows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.status, "active")));

  const recipients = adminRows
    .map((row) => row.id)
    .filter((userId) => userId !== actorUserId);

  await createNotifications({
    recipientUserIds: recipients,
    actorUserId,
    category: "abuse_report",
    type: "message_report_opened",
    title: "New abuse report requires review",
    body: trimPreview(reason, 180),
    href: "/admin/reports",
    sourceType: "report",
    sourceId: reportId,
    emailDelayMinutes: 0,
  });
}

export async function reportConversation(
  conversationId: number,
  reason: string,
): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  await assertUserInConversation(conversationId, currentUser.id);
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 8) {
    throw new Error("Report reason must be at least 8 characters.");
  }

  const createdAt = nowIso();
  const insertedRows = await db
    .insert(directMessageReport)
    .values({
      reporterUserId: currentUser.id,
      conversationId,
      messageId: null,
      reason: normalizedReason,
      status: "open",
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt,
      updatedAt: createdAt,
    })
    .returning({ id: directMessageReport.id });

  if (insertedRows.length > 0) {
    await notifyAdminsForReport(insertedRows[0].id, currentUser.id, normalizedReason);
  }
}

export async function reportMessage(messageId: number, reason: string): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const messageRows = await db
    .select({
      id: directMessage.id,
      conversationId: directMessage.conversationId,
    })
    .from(directMessage)
    .where(eq(directMessage.id, messageId))
    .limit(1);

  if (messageRows.length === 0) {
    throw new Error("Message not found.");
  }

  const targetMessage = messageRows[0];
  await assertUserInConversation(targetMessage.conversationId, currentUser.id);

  const normalizedReason = reason.trim();
  if (normalizedReason.length < 8) {
    throw new Error("Report reason must be at least 8 characters.");
  }

  const createdAt = nowIso();
  const insertedRows = await db
    .insert(directMessageReport)
    .values({
      reporterUserId: currentUser.id,
      conversationId: targetMessage.conversationId,
      messageId: targetMessage.id,
      reason: normalizedReason,
      status: "open",
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt,
      updatedAt: createdAt,
    })
    .returning({ id: directMessageReport.id });

  if (insertedRows.length > 0) {
    await notifyAdminsForReport(insertedRows[0].id, currentUser.id, normalizedReason);
  }
}

export async function listAdminMessageReports(): Promise<AdminMessageReportItem[]> {
  await requireAdminUser();
  await ensureDbSchema();

  const rows = await db.all<{
    id: number;
    conversationId: number;
    messageId: number | null;
    reason: string;
    status: "open" | "resolved";
    createdAt: string;
    reporterName: string | null;
    reporterEmail: string;
    messageBody: string | null;
    participantsLabel: string;
    reviewedAt: string | null;
  }>(
    sql.raw(`
      SELECT
        r.id AS id,
        r.conversationId AS conversationId,
        r.messageId AS messageId,
        r.reason AS reason,
        r.status AS status,
        r.createdAt AS createdAt,
        reporter.name AS reporterName,
        reporter.email AS reporterEmail,
        dm.body AS messageBody,
        GROUP_CONCAT(COALESCE(memberUser.name, memberUser.email), ', ') AS participantsLabel,
        r.reviewedAt AS reviewedAt
      FROM direct_message_report r
      INNER JOIN user reporter
        ON reporter.id = r.reporterUserId
      INNER JOIN direct_conversation_member dcm
        ON dcm.conversationId = r.conversationId
      INNER JOIN user memberUser
        ON memberUser.id = dcm.userId
      LEFT JOIN direct_message dm
        ON dm.id = r.messageId
      GROUP BY r.id
      ORDER BY
        CASE WHEN r.status = 'open' THEN 0 ELSE 1 END ASC,
        r.createdAt DESC
    `),
  );

  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    messageId: row.messageId,
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt,
    reporterLabel: displayName(row.reporterName, row.reporterEmail),
    messagePreview: row.messageBody ? trimPreview(row.messageBody, 120) : "Conversation-level report",
    participantsLabel: row.participantsLabel,
    reviewedAt: row.reviewedAt,
  }));
}

export async function resolveMessageReport(reportId: number): Promise<void> {
  const adminUser = await requireAdminUser();
  await ensureDbSchema();

  const rows = await db
    .select({
      id: directMessageReport.id,
      status: directMessageReport.status,
    })
    .from(directMessageReport)
    .where(eq(directMessageReport.id, reportId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Report not found.");
  }

  if (rows[0].status === "resolved") {
    return;
  }

  const resolvedAt = nowIso();
  await db
    .update(directMessageReport)
    .set({
      status: "resolved",
      reviewedByUserId: adminUser.id,
      reviewedAt: resolvedAt,
      updatedAt: resolvedAt,
    })
    .where(eq(directMessageReport.id, reportId));

  const reporterRows = await db
    .select({ reporterUserId: directMessageReport.reporterUserId })
    .from(directMessageReport)
    .where(eq(directMessageReport.id, reportId))
    .limit(1);
  if (reporterRows.length > 0) {
    publishRealtimeRefresh([reporterRows[0].reporterUserId, adminUser.id]);
  }
}
