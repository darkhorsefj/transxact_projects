"use server";

import { and, eq, inArray } from "drizzle-orm";
import db, { ensureDbSchema } from "@/db/connection";
import { entitySubscription, type SubscribableEntityType } from "@/db/schema";
import { requireSessionUser } from "./session.service";
import { publishRealtimeRefresh } from "./realtime.service";
import { nowIso } from "@/lib/utils";

interface EntityRecipientInput {
  entityType: SubscribableEntityType;
  entityId: number;
  creatorUserId?: number | null;
  assigneeUserId?: number | null;
  actorUserId: number;
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
