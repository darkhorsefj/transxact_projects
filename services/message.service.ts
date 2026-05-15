"use server";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import db, { ensureDbSchema } from "@/db/connection";
import {
  directConversation,
  directConversationMember,
  directMessage,
  user,
  userBlock,
} from "@/db/schema";
import { createNotifications } from "./notification.service";
import { publishRealtimeRefresh } from "./realtime.service";
import { requireSessionUser } from "./session.service";
import { displayName, nowIso } from "@/lib/utils";

const MESSAGE_SEND_LIMIT_PER_MINUTE = 40;
const CONVERSATION_START_LIMIT_PER_MINUTE = 10;
const MAX_MESSAGE_LENGTH = 4000;

interface ConversationSummaryRow {
  conversationId: number;
  participantUserId: number;
  participantName: string | null;
  participantEmail: string;
  lastMessageBody: string | null;
  lastMessageDeletedAt: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface UserOption {
  id: number;
  label: string;
}

export interface ConversationSummary {
  conversationId: number;
  participantUserId: number;
  participantLabel: string;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface ConversationMessage {
  id: number;
  senderUserId: number;
  senderLabel: string;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  isOwn: boolean;
  readByOtherUser: boolean;
}

export interface ConversationDetail {
  conversationId: number;
  participantUserId: number;
  participantLabel: string;
  isBlockedByCurrentUser: boolean;
  isBlockedByOtherUser: boolean;
  messages: ConversationMessage[];
}

export interface MessagingPageData {
  currentUserId: number;
  currentUserRole: "admin" | "member";
  userOptions: UserOption[];
  conversations: ConversationSummary[];
  activeConversation: ConversationDetail | null;
}

function normalizeMessageBody(rawBody: string): string {
  const normalized = rawBody.trim();
  if (!normalized) {
    throw new Error("Message cannot be empty.");
  }

  if (normalized.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`);
  }

  return normalized;
}

function trimPreview(textValue: string, maxLength = 120): string {
  if (textValue.length <= maxLength) {
    return textValue;
  }

  return `${textValue.slice(0, maxLength - 1)}…`;
}

async function assertMessagingNotBlocked(
  userIdA: number,
  userIdB: number,
): Promise<{ blockedByA: boolean; blockedByB: boolean }> {
  const rows = await db
    .select({
      blockerUserId: userBlock.blockerUserId,
      blockedUserId: userBlock.blockedUserId,
    })
    .from(userBlock)
    .where(
      orTwoWay(userIdA, userIdB, userBlock.blockerUserId, userBlock.blockedUserId),
    );

  let blockedByA = false;
  let blockedByB = false;
  for (const row of rows) {
    if (row.blockerUserId === userIdA && row.blockedUserId === userIdB) {
      blockedByA = true;
    }
    if (row.blockerUserId === userIdB && row.blockedUserId === userIdA) {
      blockedByB = true;
    }
  }

  return { blockedByA, blockedByB };
}

function orTwoWay(
  leftUserId: number,
  rightUserId: number,
  leftColumn: typeof userBlock.blockerUserId,
  rightColumn: typeof userBlock.blockedUserId,
) {
  return sql`((${leftColumn} = ${leftUserId} AND ${rightColumn} = ${rightUserId}) OR (${leftColumn} = ${rightUserId} AND ${rightColumn} = ${leftUserId}))`;
}

async function enforceMessageSendRateLimit(userId: number): Promise<void> {
  const thresholdIso = new Date(Date.now() - 60 * 1000).toISOString();
  const rows = await db
    .select({ total: sql<number>`count(${directMessage.id})` })
    .from(directMessage)
    .where(
      and(eq(directMessage.senderUserId, userId), sql`${directMessage.createdAt} >= ${thresholdIso}`),
    );

  const total = Number(rows[0]?.total ?? 0);
  if (total >= MESSAGE_SEND_LIMIT_PER_MINUTE) {
    throw new Error("Message rate limit reached. Please wait a moment before sending again.");
  }
}

async function enforceConversationCreationRateLimit(userId: number): Promise<void> {
  const thresholdIso = new Date(Date.now() - 60 * 1000).toISOString();
  const rows = await db
    .select({ total: sql<number>`count(${directConversation.id})` })
    .from(directConversation)
    .where(
      and(
        eq(directConversation.createdByUserId, userId),
        sql`${directConversation.createdAt} >= ${thresholdIso}`,
      ),
    );

  const total = Number(rows[0]?.total ?? 0);
  if (total >= CONVERSATION_START_LIMIT_PER_MINUTE) {
    throw new Error(
      "Conversation start limit reached. Please wait a moment before trying again.",
    );
  }
}

async function requireConversationMembers(
  conversationId: number,
  currentUserId: number,
): Promise<{
  currentMember: {
    id: number;
    userId: number;
    archivedAt: string | null;
    lastReadMessageId: number | null;
  };
  otherMember: {
    id: number;
    userId: number;
    name: string | null;
    email: string;
    lastReadMessageId: number | null;
  };
}> {
  const rows = await db
    .select({
      memberId: directConversationMember.id,
      userId: directConversationMember.userId,
      archivedAt: directConversationMember.archivedAt,
      lastReadMessageId: directConversationMember.lastReadMessageId,
      name: user.name,
      email: user.email,
    })
    .from(directConversationMember)
    .innerJoin(user, eq(directConversationMember.userId, user.id))
    .where(eq(directConversationMember.conversationId, conversationId));

  if (rows.length !== 2) {
    throw new Error("Conversation is not available.");
  }

  const currentMemberRow = rows.find((row) => row.userId === currentUserId);
  if (!currentMemberRow) {
    throw new Error("You are not a participant in this conversation.");
  }

  const otherMemberRow = rows.find((row) => row.userId !== currentUserId);
  if (!otherMemberRow) {
    throw new Error("Conversation participant could not be resolved.");
  }

  return {
    currentMember: {
      id: currentMemberRow.memberId,
      userId: currentMemberRow.userId,
      archivedAt: currentMemberRow.archivedAt,
      lastReadMessageId: currentMemberRow.lastReadMessageId,
    },
    otherMember: {
      id: otherMemberRow.memberId,
      userId: otherMemberRow.userId,
      name: otherMemberRow.name,
      email: otherMemberRow.email,
      lastReadMessageId: otherMemberRow.lastReadMessageId,
    },
  };
}

async function listConversationSummaries(
  currentUserId: number,
): Promise<ConversationSummary[]> {
  const rows = await db.all<ConversationSummaryRow>(
    sql.raw(`
      SELECT
        c.id AS conversationId,
        peer.id AS participantUserId,
        peer.name AS participantName,
        peer.email AS participantEmail,
        lm.body AS lastMessageBody,
        lm.deletedAt AS lastMessageDeletedAt,
        lm.createdAt AS lastMessageAt,
        SUM(
          CASE
            WHEN dm.senderUserId != ${currentUserId}
              AND dm.deletedAt IS NULL
              AND dm.id > COALESCE(selfMember.lastReadMessageId, 0)
            THEN 1
            ELSE 0
          END
        ) AS unreadCount
      FROM direct_conversation c
      INNER JOIN direct_conversation_member selfMember
        ON selfMember.conversationId = c.id
        AND selfMember.userId = ${currentUserId}
        AND selfMember.archivedAt IS NULL
      INNER JOIN direct_conversation_member peerMember
        ON peerMember.conversationId = c.id
        AND peerMember.userId != ${currentUserId}
      INNER JOIN user peer
        ON peer.id = peerMember.userId
      LEFT JOIN direct_message lm
        ON lm.id = (
          SELECT id
          FROM direct_message
          WHERE conversationId = c.id
          ORDER BY id DESC
          LIMIT 1
        )
      LEFT JOIN direct_message dm
        ON dm.conversationId = c.id
      GROUP BY c.id, peer.id, peer.name, peer.email, lm.body, lm.deletedAt, lm.createdAt
      ORDER BY COALESCE(lm.createdAt, c.updatedAt) DESC
    `),
  );

  return rows.map((row) => ({
    conversationId: row.conversationId,
    participantUserId: row.participantUserId,
    participantLabel: displayName(row.participantName, row.participantEmail),
    lastMessagePreview: row.lastMessageAt
      ? row.lastMessageDeletedAt
        ? "Message deleted"
        : trimPreview(row.lastMessageBody ?? "")
      : "No messages yet",
    lastMessageAt: row.lastMessageAt,
    unreadCount: Number(row.unreadCount ?? 0),
  }));
}

async function getConversationDetail(
  conversationId: number,
  currentUserId: number,
): Promise<ConversationDetail> {
  const { otherMember } = await requireConversationMembers(conversationId, currentUserId);

  const [messages, blockStatus] = await Promise.all([
    db
      .select({
        id: directMessage.id,
        senderUserId: directMessage.senderUserId,
        senderName: user.name,
        senderEmail: user.email,
        body: directMessage.body,
        createdAt: directMessage.createdAt,
        updatedAt: directMessage.updatedAt,
        editedAt: directMessage.editedAt,
        deletedAt: directMessage.deletedAt,
      })
      .from(directMessage)
      .innerJoin(user, eq(directMessage.senderUserId, user.id))
      .where(eq(directMessage.conversationId, conversationId))
      .orderBy(asc(directMessage.id)),
    assertMessagingNotBlocked(currentUserId, otherMember.userId),
  ]);

  const recipientLastReadMessageId = otherMember.lastReadMessageId ?? 0;
  const resolvedMessages: ConversationMessage[] = messages.map((row) => {
    const isOwn = row.senderUserId === currentUserId;
    return {
      id: row.id,
      senderUserId: row.senderUserId,
      senderLabel: displayName(row.senderName, row.senderEmail),
      body: row.deletedAt ? "This message was deleted." : row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isEdited: row.editedAt !== null,
      isDeleted: row.deletedAt !== null,
      isOwn,
      readByOtherUser: isOwn && row.id <= recipientLastReadMessageId,
    };
  });

  return {
    conversationId,
    participantUserId: otherMember.userId,
    participantLabel: displayName(otherMember.name, otherMember.email),
    isBlockedByCurrentUser: blockStatus.blockedByA,
    isBlockedByOtherUser: blockStatus.blockedByB,
    messages: resolvedMessages,
  };
}

export async function listMessagingPageData(
  activeConversationId?: number,
): Promise<MessagingPageData> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const [userOptionsRows, conversations] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
      })
      .from(user)
      .where(and(eq(user.status, "active"), sql`${user.id} != ${currentUser.id}`))
      .orderBy(sql`coalesce(${user.name}, ${user.email}) ASC`),
    listConversationSummaries(currentUser.id),
  ]);

  const userOptions = userOptionsRows.map((row) => ({
    id: row.id,
    label: displayName(row.name, row.email),
  }));

  const resolvedActiveConversationId =
    activeConversationId ?? conversations[0]?.conversationId ?? null;

  let activeConversation: ConversationDetail | null = null;
  if (resolvedActiveConversationId) {
    activeConversation = await getConversationDetail(
      resolvedActiveConversationId,
      currentUser.id,
    );
  }

  return {
    currentUserId: currentUser.id,
    currentUserRole: currentUser.role,
    userOptions,
    conversations,
    activeConversation,
  };
}

export async function searchUsers(query: string): Promise<UserOption[]> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const normalized = query.trim();
  if (normalized.length === 0) return [];

  const pattern = `%${normalized}%`;

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(
      and(
        eq(user.status, "active"),
        sql`${user.id} != ${currentUser.id}`,
        sql`(LOWER(COALESCE(${user.name}, '')) LIKE LOWER(${pattern}) OR LOWER(${user.email}) LIKE LOWER(${pattern}))`,
      ),
    )
    .orderBy(sql`coalesce(${user.name}, ${user.email}) ASC`)
    .limit(8);

  return rows.map((row) => ({
    id: row.id,
    label: displayName(row.name, row.email),
  }));
}

export async function createOrOpenConversation(peerUserId: number): Promise<number> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  if (!Number.isInteger(peerUserId) || peerUserId <= 0) {
    throw new Error("A valid recipient is required.");
  }

  if (peerUserId === currentUser.id) {
    throw new Error("You cannot start a conversation with yourself.");
  }

  const peerRows = await db
    .select({
      id: user.id,
      status: user.status,
    })
    .from(user)
    .where(eq(user.id, peerUserId))
    .limit(1);

  if (peerRows.length === 0 || peerRows[0].status !== "active") {
    throw new Error("Selected user is not available for messaging.");
  }

  const blockStatus = await assertMessagingNotBlocked(currentUser.id, peerUserId);
  if (blockStatus.blockedByA || blockStatus.blockedByB) {
    throw new Error("Messaging is unavailable because one of you has blocked the other.");
  }

  const existingRows = await db.all<{ conversationId: number }>(
    sql.raw(`
      SELECT dcm.conversationId AS conversationId
      FROM direct_conversation_member dcm
      GROUP BY dcm.conversationId
      HAVING COUNT(*) = 2
        AND SUM(CASE WHEN dcm.userId IN (${currentUser.id}, ${peerUserId}) THEN 1 ELSE 0 END) = 2
      LIMIT 1
    `),
  );

  const nowAsIso = nowIso();
  if (existingRows.length > 0) {
    const conversationId = existingRows[0].conversationId;
    await db
      .update(directConversationMember)
      .set({ archivedAt: null, updatedAt: nowAsIso })
      .where(
        and(
          eq(directConversationMember.conversationId, conversationId),
          eq(directConversationMember.userId, currentUser.id),
        ),
      );

    publishRealtimeRefresh([currentUser.id, peerUserId]);
    return conversationId;
  }

  await enforceConversationCreationRateLimit(currentUser.id);

  const createdConversationRows = await db
    .insert(directConversation)
    .values({
      createdByUserId: currentUser.id,
      createdAt: nowAsIso,
      updatedAt: nowAsIso,
    })
    .returning({ id: directConversation.id });

  if (createdConversationRows.length === 0) {
    throw new Error("Unable to create conversation.");
  }

  const conversationId = createdConversationRows[0].id;
  await db.insert(directConversationMember).values([
    {
      conversationId,
      userId: currentUser.id,
      joinedAt: nowAsIso,
      updatedAt: nowAsIso,
      archivedAt: null,
      lastReadMessageId: null,
      lastReadAt: null,
    },
    {
      conversationId,
      userId: peerUserId,
      joinedAt: nowAsIso,
      updatedAt: nowAsIso,
      archivedAt: null,
      lastReadMessageId: null,
      lastReadAt: null,
    },
  ]);

  publishRealtimeRefresh([currentUser.id, peerUserId]);
  return conversationId;
}

export async function sendDirectMessage(
  conversationId: number,
  rawBody: string,
): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const body = normalizeMessageBody(rawBody);
  const members = await requireConversationMembers(conversationId, currentUser.id);
  const blockStatus = await assertMessagingNotBlocked(
    currentUser.id,
    members.otherMember.userId,
  );
  if (blockStatus.blockedByA || blockStatus.blockedByB) {
    throw new Error("Messaging is unavailable because one of you has blocked the other.");
  }

  await enforceMessageSendRateLimit(currentUser.id);

  const createdAt = nowIso();
  const insertedRows = await db
    .insert(directMessage)
    .values({
      conversationId,
      senderUserId: currentUser.id,
      body,
      createdAt,
      updatedAt: createdAt,
      editedAt: null,
      deletedAt: null,
    })
    .returning({ id: directMessage.id });

  if (insertedRows.length === 0) {
    throw new Error("Unable to send message.");
  }

  const messageId = insertedRows[0].id;
  await db
    .update(directConversation)
    .set({ updatedAt: createdAt })
    .where(eq(directConversation.id, conversationId));

  await db
    .update(directConversationMember)
    .set({
      lastReadMessageId: messageId,
      lastReadAt: createdAt,
      archivedAt: null,
      updatedAt: createdAt,
    })
    .where(eq(directConversationMember.id, members.currentMember.id));

  await db
    .update(directConversationMember)
    .set({ archivedAt: null, updatedAt: createdAt })
    .where(eq(directConversationMember.id, members.otherMember.id));

  await createNotifications({
    recipientUserIds: [members.otherMember.userId],
    actorUserId: currentUser.id,
    category: "direct_message",
    type: "direct_message_received",
    title: `New message from ${displayName(currentUser.name, currentUser.email)}`,
    body: trimPreview(body, 160),
    href: `/messages?conversationId=${conversationId}`,
    sourceType: "conversation",
    sourceId: conversationId,
    emailDelayMinutes: 5,
  });

  publishRealtimeRefresh([currentUser.id, members.otherMember.userId]);
}

export async function editDirectMessage(
  messageId: number,
  rawBody: string,
): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const body = normalizeMessageBody(rawBody);
  const rows = await db
    .select({
      id: directMessage.id,
      conversationId: directMessage.conversationId,
      senderUserId: directMessage.senderUserId,
      deletedAt: directMessage.deletedAt,
    })
    .from(directMessage)
    .where(eq(directMessage.id, messageId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Message not found.");
  }

  const targetMessage = rows[0];
  if (targetMessage.senderUserId !== currentUser.id) {
    throw new Error("You can only edit your own messages.");
  }
  if (targetMessage.deletedAt) {
    throw new Error("Deleted messages cannot be edited.");
  }

  await requireConversationMembers(targetMessage.conversationId, currentUser.id);

  const updatedAt = nowIso();
  await db
    .update(directMessage)
    .set({
      body,
      editedAt: updatedAt,
      updatedAt,
    })
    .where(eq(directMessage.id, targetMessage.id));

  await db
    .update(directConversation)
    .set({ updatedAt })
    .where(eq(directConversation.id, targetMessage.conversationId));

  const memberRows = await db
    .select({ userId: directConversationMember.userId })
    .from(directConversationMember)
    .where(eq(directConversationMember.conversationId, targetMessage.conversationId));

  publishRealtimeRefresh(memberRows.map((row) => row.userId));
}

export async function deleteDirectMessage(messageId: number): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const rows = await db
    .select({
      id: directMessage.id,
      conversationId: directMessage.conversationId,
      senderUserId: directMessage.senderUserId,
      deletedAt: directMessage.deletedAt,
    })
    .from(directMessage)
    .where(eq(directMessage.id, messageId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Message not found.");
  }

  const targetMessage = rows[0];
  if (targetMessage.senderUserId !== currentUser.id) {
    throw new Error("You can only delete your own messages.");
  }
  if (targetMessage.deletedAt) {
    return;
  }

  await requireConversationMembers(targetMessage.conversationId, currentUser.id);
  const deletedAt = nowIso();
  await db
    .update(directMessage)
    .set({
      body: "",
      deletedAt,
      updatedAt: deletedAt,
    })
    .where(eq(directMessage.id, targetMessage.id));

  await db
    .update(directConversation)
    .set({ updatedAt: deletedAt })
    .where(eq(directConversation.id, targetMessage.conversationId));

  const memberRows = await db
    .select({ userId: directConversationMember.userId })
    .from(directConversationMember)
    .where(eq(directConversationMember.conversationId, targetMessage.conversationId));

  publishRealtimeRefresh(memberRows.map((row) => row.userId));
}

export async function markConversationRead(conversationId: number): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const members = await requireConversationMembers(conversationId, currentUser.id);
  const latestRows = await db
    .select({
      id: directMessage.id,
    })
    .from(directMessage)
    .where(
      and(
        eq(directMessage.conversationId, conversationId),
        sql`${directMessage.senderUserId} != ${currentUser.id}`,
      ),
    )
    .orderBy(sql`${directMessage.id} DESC`)
    .limit(1);

  const latestIncomingMessageId = latestRows[0]?.id ?? null;
  const updatedAt = nowIso();
  await db
    .update(directConversationMember)
    .set({
      lastReadMessageId: latestIncomingMessageId,
      lastReadAt: updatedAt,
      updatedAt,
    })
    .where(eq(directConversationMember.id, members.currentMember.id));

  publishRealtimeRefresh([currentUser.id, members.otherMember.userId]);
}

export async function setConversationArchived(
  conversationId: number,
  archived: boolean,
): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const members = await requireConversationMembers(conversationId, currentUser.id);
  const updatedAt = nowIso();
  await db
    .update(directConversationMember)
    .set({
      archivedAt: archived ? updatedAt : null,
      updatedAt,
    })
    .where(eq(directConversationMember.id, members.currentMember.id));

  publishRealtimeRefresh([currentUser.id]);
}

export async function blockUserForMessaging(blockedUserId: number): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  if (blockedUserId === currentUser.id) {
    throw new Error("You cannot block yourself.");
  }

  const targetRows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, blockedUserId))
    .limit(1);

  if (targetRows.length === 0) {
    throw new Error("User to block was not found.");
  }

  const timestamp = nowIso();
  await db
    .insert(userBlock)
    .values({
      blockerUserId: currentUser.id,
      blockedUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing({
      target: [userBlock.blockerUserId, userBlock.blockedUserId],
    });

  const existingConversationRows = await db.all<{ conversationId: number }>(
    sql.raw(`
      SELECT dcm.conversationId AS conversationId
      FROM direct_conversation_member dcm
      GROUP BY dcm.conversationId
      HAVING COUNT(*) = 2
        AND SUM(CASE WHEN dcm.userId IN (${currentUser.id}, ${blockedUserId}) THEN 1 ELSE 0 END) = 2
    `),
  );

  if (existingConversationRows.length > 0) {
    await db
      .update(directConversationMember)
      .set({
        archivedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(directConversationMember.userId, currentUser.id),
          inArray(
            directConversationMember.conversationId,
            existingConversationRows.map((row) => row.conversationId),
          ),
        ),
      );
  }

  publishRealtimeRefresh([currentUser.id, blockedUserId]);
}

export async function unblockUserForMessaging(blockedUserId: number): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  await db
    .delete(userBlock)
    .where(
      and(
        eq(userBlock.blockerUserId, currentUser.id),
        eq(userBlock.blockedUserId, blockedUserId),
      ),
    );

  publishRealtimeRefresh([currentUser.id, blockedUserId]);
}
