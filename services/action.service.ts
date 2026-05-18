"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import db, { ensureDbSchema } from "@/db/connection";
import { action, caseItem, supportCase, task, user } from "@/db/schema";
import { dispatchEntityNotification, notifyEntityWatchers } from "./entity-notify.service";
import { requireSessionUser } from "./session.service";

const MIN_ACTION_NAME_LENGTH = 2;

export interface ActionItem {
  id: number;
  name: string;
  description: string | null;
  status: "pending" | "completed";
  createdByUserId: number;
  authorLabel: string;
  isOwn: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export async function listActionsByTask(taskId: number): Promise<ActionItem[]> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const rows = await db
    .select({
      id: action.id,
      name: action.name,
      description: action.description,
      status: action.status,
      createdByUserId: action.createdByUserId,
      authorName: user.name,
      authorEmail: user.email,
      createdAt: action.createdAt,
      updatedAt: action.updatedAt,
    })
    .from(action)
    .innerJoin(user, eq(action.createdByUserId, user.id))
    .where(and(eq(action.taskId, taskId), isNull(action.deletedAt)))
    .orderBy(asc(action.createdAt), asc(action.id));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as "pending" | "completed",
    createdByUserId: row.createdByUserId,
    authorLabel: row.authorName?.trim() || row.authorEmail,
    isOwn: row.createdByUserId === currentUser.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function createTaskAction(
  taskId: number,
  projectId: number,
  name: string,
  description?: string,
): Promise<{ id: number }> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (normalizedName.length < MIN_ACTION_NAME_LENGTH) {
    throw new Error(
      `Action name must be at least ${MIN_ACTION_NAME_LENGTH} characters.`,
    );
  }

  const normalizedDescription = description?.trim() || null;

  const nowIso = new Date().toISOString();
  const insertedRows = await db
    .insert(action)
    .values({
      projectId,
      taskId,
      createdByUserId: currentUser.id,
      name: normalizedName,
      description: normalizedDescription,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .returning({ id: action.id });

  if (insertedRows.length === 0) {
    throw new Error("Unable to create action.");
  }

  // Notify task subscribers
  const taskRows = await db
    .select({
      title: task.title,
      assigneeUserId: task.assigneeUserId,
      createdByUserId: task.createdByUserId,
    })
    .from(task)
    .where(and(eq(task.id, taskId), isNull(task.deletedAt)))
    .limit(1);

  if (taskRows.length > 0) {
    const taskData = taskRows[0];
    const bodyText = description
      ? `"${normalizedName}": ${description} (in task "${taskData.title}")`
      : `"${normalizedName}" added to task "${taskData.title}"`;
    await dispatchEntityNotification({
      entity: {
        type: "task",
        id: taskId,
        creatorUserId: taskData.createdByUserId,
        assigneeUserId: taskData.assigneeUserId,
      },
      notification: {
        actorUserId: currentUser.id,
        category: "task_activity",
        type: "action_created",
        title: `${currentUser.name ?? "Someone"} added action: ${normalizedName}`,
        body: bodyText,
        href: `/tasks?taskId=${taskId}`,
        sourceType: "action",
        sourceId: insertedRows[0].id,
        emailDelayMinutes: 0,
      },
      subscribeParticipantIds: [
        currentUser.id,
        taskData.createdByUserId,
        taskData.assigneeUserId,
      ],
    });
  }

  return { id: insertedRows[0].id };
}

export async function deleteTaskAction(actionId: number): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const rows = await db
    .select({
      id: action.id,
      createdByUserId: action.createdByUserId,
      taskId: action.taskId,
    })
    .from(action)
    .where(and(eq(action.id, actionId), isNull(action.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Action not found.");
  }

  if (rows[0].createdByUserId !== currentUser.id) {
    throw new Error("You can only delete your own actions.");
  }

  const nowIso = new Date().toISOString();
  await db
    .update(action)
    .set({ deletedAt: nowIso, updatedAt: nowIso })
    .where(eq(action.id, actionId));

  const actionRow = rows[0];
  if (actionRow.taskId) {
    await notifyEntityWatchers(
      { type: "task", id: actionRow.taskId },
      currentUser.id,
    );
  }
}

export async function getTaskActionData(taskId: number): Promise<{ actions: ActionItem[]; projectId: number }> {
  await requireSessionUser();
  await ensureDbSchema();

  const taskRows = await db
    .select({ projectId: supportCase.projectId })
    .from(task)
    .innerJoin(caseItem, eq(task.itemId, caseItem.id))
    .innerJoin(supportCase, eq(caseItem.caseId, supportCase.id))
    .where(eq(task.id, taskId))
    .limit(1);

  if (taskRows.length === 0) {
    throw new Error("Task not found.");
  }

  const actions = await listActionsByTask(taskId);
  return { actions, projectId: taskRows[0].projectId };
}

export async function updateActionStatus(actionId: number, status: "pending" | "completed"): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const rows = await db
    .select({
      id: action.id,
      createdByUserId: action.createdByUserId,
      name: action.name,
      taskId: action.taskId,
    })
    .from(action)
    .where(and(eq(action.id, actionId), isNull(action.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Action not found.");
  }

  if (rows[0].createdByUserId !== currentUser.id) {
    throw new Error("You can only update your own actions.");
  }

  const nowIso = new Date().toISOString();
  await db
    .update(action)
    .set({ status, updatedAt: nowIso })
    .where(eq(action.id, actionId));

  const taskId = rows[0].taskId;
  if (!taskId) return;

  // Notify task subscribers
  const taskRows = await db
    .select({
      title: task.title,
      assigneeUserId: task.assigneeUserId,
      createdByUserId: task.createdByUserId,
    })
    .from(task)
    .where(and(eq(task.id, taskId), isNull(task.deletedAt)))
    .limit(1);

  if (taskRows.length > 0) {
    const taskData = taskRows[0];
    await dispatchEntityNotification({
      entity: {
        type: "task",
        id: taskId,
        creatorUserId: taskData.createdByUserId,
        assigneeUserId: taskData.assigneeUserId,
      },
      notification: {
        actorUserId: currentUser.id,
        category: "task_activity",
        type: "action_status_changed",
        title: `Action ${status}: ${rows[0].name}`,
        body: `${currentUser.name ?? "Someone"} marked action "${rows[0].name}" as ${status} in task "${taskData.title}".`,
        href: `/tasks?taskId=${taskId}`,
        sourceType: "action",
        sourceId: actionId,
        emailDelayMinutes: 0,
      },
      subscribeParticipantIds: [
        currentUser.id,
        taskData.createdByUserId,
        taskData.assigneeUserId,
      ],
    });
  }
}
