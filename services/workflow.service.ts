"use server";

import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import db, { ensureDbSchema } from "@/db/connection";
import {
  issue,
  type IssueStatus,
  phase,
  project,
  task,
  taskCommentReadState,
  type TaskStatus,
  user,
  workItemComment,
} from "@/db/schema";
import {
  listActionsByTask,
  type ActionItem,
} from "./action.service";
import {
  createNotifications,
  ensureEntitySubscriptions,
  listUserEntitySubscriptionState,
  resolveEntityNotificationRecipients,
  toggleEntitySubscription,
} from "./notification.service";
import { publishRealtimeRefresh, publishRealtimeRefreshAll } from "./realtime.service";
import { requireSessionUser } from "./session.service";

const BACKLOG_PHASE_NAME = "Backlog";
const MIN_TITLE_LENGTH = 3;
const MAX_COMMENT_LENGTH = 2000;

const NEXT_TASK_STATUS: Record<TaskStatus, TaskStatus> = {
  not_started: "in_progress",
  in_progress: "completed",
  completed: "completed",
};

const NEXT_ISSUE_STATUS: Record<IssueStatus, IssueStatus> = {
  open: "in_progress",
  in_progress: "resolved",
  resolved: "closed",
  closed: "closed",
};

export interface ProjectOption {
  id: number;
  name: string;
}

export interface AssigneeOption {
  id: number;
  label: string;
}

export interface TaskOption {
  id: number;
  title: string;
  projectId: number;
}

export interface ProjectWorkflowItem {
  id: number;
  name: string;
  createdAt: string;
  taskCount: number;
  openIssueCount: number;
  isFollowing: boolean;
}

export interface TaskWorkflowItem {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueAt: string;
  projectName: string;
  phaseName: string;
  assigneeName: string | null;
  isFollowing: boolean;
  comments: WorkItemCommentThreadItem[];
  unreadCommentCount: number;
}

export interface IssueWorkflowItem {
  id: number;
  title: string;
  description: string | null;
  status: IssueStatus;
  projectName: string;
  taskTitle: string | null;
  assigneeName: string | null;
  isFollowing: boolean;
  comments: WorkItemCommentThreadItem[];
}

export interface WorkItemCommentThreadItem {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  isEdited: boolean;
  createdByUserId: number;
  authorLabel: string;
  isOwn: boolean;
}

export interface TaskWorkflowData {
  currentUserId: number;
  projects: ProjectOption[];
  assignees: AssigneeOption[];
  tasks: TaskWorkflowItem[];
}

export interface IssueWorkflowData {
  currentUserId: number;
  projects: ProjectOption[];
  tasks: TaskOption[];
  assignees: AssigneeOption[];
  issues: IssueWorkflowItem[];
}

interface CreateTaskInput {
  projectId: number;
  assigneeUserId?: number;
  title: string;
  description?: string;
  dueOn: string;
}

interface CreateIssueInput {
  projectId: number;
  taskId?: number;
  assigneeUserId?: number;
  title: string;
  description?: string;
}

function normalizeTitle(rawTitle: string, label: string): string {
  const normalized = rawTitle.trim().replace(/\s+/g, " ");
  if (normalized.length < MIN_TITLE_LENGTH) {
    throw new Error(`${label} must be at least ${MIN_TITLE_LENGTH} characters.`);
  }

  return normalized;
}

function normalizeDescription(rawDescription: string | undefined): string | null {
  if (!rawDescription) {
    return null;
  }

  const normalized = rawDescription.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeCommentBody(rawCommentBody: string): string {
  const normalized = rawCommentBody.trim();
  if (!normalized) {
    throw new Error("Comment cannot be empty.");
  }

  if (normalized.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comment cannot exceed ${MAX_COMMENT_LENGTH} characters.`);
  }

  return normalized;
}

function parseDueDate(dueOn: string): string {
  const normalized = dueOn.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Due date must use YYYY-MM-DD format.");
  }

  const dueAt = new Date(`${normalized}T23:59:59.000Z`);
  if (Number.isNaN(dueAt.getTime())) {
    throw new Error("Due date is invalid.");
  }

  return dueAt.toISOString();
}

function displayName(name: string | null, email: string): string {
  const trimmedName = name?.trim();
  return trimmedName && trimmedName.length > 0 ? trimmedName : email;
}

async function requireActiveProject(projectId: number): Promise<void> {
  const rows = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), isNull(project.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Selected project does not exist.");
  }
}

async function requireActiveTask(taskId: number): Promise<void> {
  const rows = await db
    .select({ id: task.id })
    .from(task)
    .where(and(eq(task.id, taskId), isNull(task.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Task not found.");
  }
}

async function requireActiveIssue(issueId: number): Promise<void> {
  const rows = await db
    .select({ id: issue.id })
    .from(issue)
    .where(and(eq(issue.id, issueId), isNull(issue.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Issue not found.");
  }
}

async function requireActiveAssignee(userId: number): Promise<void> {
  const rows = await db
    .select({ id: user.id, status: user.status })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (rows.length === 0 || rows[0].status !== "active") {
    throw new Error("Selected assignee is not active.");
  }
}

async function resolveAssigneeId(
  assigneeUserId: number | undefined,
  fallbackUserId: number,
): Promise<number> {
  const resolvedAssigneeId = assigneeUserId ?? fallbackUserId;
  await requireActiveAssignee(resolvedAssigneeId);
  return resolvedAssigneeId;
}

async function resolvePhaseIdForProject(
  projectId: number,
  createdByUserId: number,
): Promise<number> {
  const existingPhaseRows = await db
    .select({ id: phase.id })
    .from(phase)
    .where(and(eq(phase.projectId, projectId), isNull(phase.deletedAt)))
    .orderBy(asc(phase.id))
    .limit(1);

  if (existingPhaseRows.length > 0) {
    return existingPhaseRows[0].id;
  }

  const nowIso = new Date().toISOString();
  const createdPhaseRows = await db
    .insert(phase)
    .values({
      projectId,
      name: BACKLOG_PHASE_NAME,
      description: "Default workflow phase",
      status: "not_started",
      createdByUserId,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .returning({ id: phase.id });

  if (createdPhaseRows.length === 0) {
    throw new Error("Unable to create a default phase for this project.");
  }

  return createdPhaseRows[0].id;
}

async function listProjectOptions(): Promise<ProjectOption[]> {
  const rows = await db
    .select({
      id: project.id,
      name: project.name,
    })
    .from(project)
    .where(isNull(project.deletedAt))
    .orderBy(asc(project.name));

  return rows;
}

async function listAssigneeOptions(): Promise<AssigneeOption[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(eq(user.status, "active"))
    .orderBy(asc(user.name), asc(user.email));

  return rows.map((row) => ({
    id: row.id,
    label: displayName(row.name, row.email),
  }));
}

async function listTaskCommentsByTaskId(
  taskIds: number[],
  currentUserId: number,
): Promise<Map<number, WorkItemCommentThreadItem[]>> {
  const uniqueTaskIds = [...new Set(taskIds)].filter((taskId) => taskId > 0);
  if (uniqueTaskIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      id: workItemComment.id,
      taskId: workItemComment.taskId,
      body: workItemComment.body,
      createdAt: workItemComment.createdAt,
      updatedAt: workItemComment.updatedAt,
      createdByUserId: workItemComment.createdByUserId,
      authorName: user.name,
      authorEmail: user.email,
    })
    .from(workItemComment)
    .innerJoin(user, eq(workItemComment.createdByUserId, user.id))
    .where(
      and(
        isNull(workItemComment.deletedAt),
        isNull(workItemComment.issueId),
        inArray(workItemComment.taskId, uniqueTaskIds),
      ),
    )
    .orderBy(asc(workItemComment.createdAt), asc(workItemComment.id));

  const commentsByTaskId = new Map<number, WorkItemCommentThreadItem[]>();
  for (const row of rows) {
    if (!row.taskId) {
      continue;
    }

    const item: WorkItemCommentThreadItem = {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isEdited: row.updatedAt !== null,
      createdByUserId: row.createdByUserId,
      authorLabel: displayName(row.authorName, row.authorEmail),
      isOwn: row.createdByUserId === currentUserId,
    };

    const existing = commentsByTaskId.get(row.taskId) ?? [];
    existing.push(item);
    commentsByTaskId.set(row.taskId, existing);
  }

  return commentsByTaskId;
}

async function listIssueCommentsByIssueId(
  issueIds: number[],
  currentUserId: number,
): Promise<Map<number, WorkItemCommentThreadItem[]>> {
  const uniqueIssueIds = [...new Set(issueIds)].filter((issueId) => issueId > 0);
  if (uniqueIssueIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      id: workItemComment.id,
      issueId: workItemComment.issueId,
      body: workItemComment.body,
      createdAt: workItemComment.createdAt,
      updatedAt: workItemComment.updatedAt,
      createdByUserId: workItemComment.createdByUserId,
      authorName: user.name,
      authorEmail: user.email,
    })
    .from(workItemComment)
    .innerJoin(user, eq(workItemComment.createdByUserId, user.id))
    .where(
      and(
        isNull(workItemComment.deletedAt),
        isNull(workItemComment.taskId),
        inArray(workItemComment.issueId, uniqueIssueIds),
      ),
    )
    .orderBy(asc(workItemComment.createdAt), asc(workItemComment.id));

  const commentsByIssueId = new Map<number, WorkItemCommentThreadItem[]>();
  for (const row of rows) {
    if (!row.issueId) {
      continue;
    }

    const item: WorkItemCommentThreadItem = {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isEdited: row.updatedAt !== null,
      createdByUserId: row.createdByUserId,
      authorLabel: displayName(row.authorName, row.authorEmail),
      isOwn: row.createdByUserId === currentUserId,
    };

    const existing = commentsByIssueId.get(row.issueId) ?? [];
    existing.push(item);
    commentsByIssueId.set(row.issueId, existing);
  }

  return commentsByIssueId;
}

export async function listProjectWorkflowData(): Promise<{
  projects: ProjectWorkflowItem[];
}> {
  await requireSessionUser();
  await ensureDbSchema();

  const projectRows = await db
    .select({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
    })
    .from(project)
    .where(isNull(project.deletedAt))
    .orderBy(asc(project.name));

  const taskCountRows = await db
    .select({
      projectId: phase.projectId,
      total: count(task.id),
    })
    .from(task)
    .innerJoin(phase, eq(task.phaseId, phase.id))
    .where(and(isNull(task.deletedAt), isNull(phase.deletedAt)))
    .groupBy(phase.projectId);

  const openIssueRows = await db
    .select({
      projectId: issue.projectId,
      total: count(issue.id),
    })
    .from(issue)
    .where(
      and(
        isNull(issue.deletedAt),
        inArray(issue.status, ["open", "in_progress"]),
      ),
    )
    .groupBy(issue.projectId);

  const taskCountByProjectId = new Map<number, number>();
  for (const row of taskCountRows) {
    taskCountByProjectId.set(row.projectId, row.total);
  }

  const openIssueCountByProjectId = new Map<number, number>();
  for (const row of openIssueRows) {
    openIssueCountByProjectId.set(row.projectId, row.total);
  }

  const projectFollowMap = await listUserEntitySubscriptionState(
    "project",
    projectRows.map((row) => row.id),
  );

  const projects = projectRows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    taskCount: taskCountByProjectId.get(row.id) ?? 0,
    openIssueCount: openIssueCountByProjectId.get(row.id) ?? 0,
    isFollowing: projectFollowMap.get(row.id) ?? false,
  }));

  return { projects };
}

async function listTaskCommentReadAtByTaskId(
  taskIds: number[],
  userId: number,
): Promise<Map<number, string | null>> {
  const uniqueTaskIds = [...new Set(taskIds)].filter((id) => id > 0);
  if (uniqueTaskIds.length === 0 || userId <= 0) {
    return new Map();
  }

  const rows = await db
    .select({
      taskId: taskCommentReadState.taskId,
      lastReadAt: taskCommentReadState.lastReadAt,
    })
    .from(taskCommentReadState)
    .where(
      and(
        eq(taskCommentReadState.userId, userId),
        inArray(taskCommentReadState.taskId, uniqueTaskIds),
      ),
    );

  const map = new Map<number, string | null>();
  for (const row of rows) {
    map.set(row.taskId, row.lastReadAt);
  }
  return map;
}

function computeUnreadCommentCount(
  comments: WorkItemCommentThreadItem[],
  lastReadAt: string | null,
): number {
  if (!lastReadAt || comments.length === 0) return 0;
  const readTime = new Date(lastReadAt).getTime();
  return comments.filter((c) => new Date(c.createdAt).getTime() > readTime).length;
}

export async function listTaskWorkflowData(): Promise<TaskWorkflowData> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const [projects, assignees, tasks] = await Promise.all([
    listProjectOptions(),
    listAssigneeOptions(),
    db
      .select({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        dueAt: task.dueAt,
        projectName: project.name,
        phaseName: phase.name,
        assigneeName: user.name,
      })
      .from(task)
      .innerJoin(phase, eq(task.phaseId, phase.id))
      .innerJoin(project, eq(phase.projectId, project.id))
      .leftJoin(user, eq(task.assigneeUserId, user.id))
      .where(
        and(
          isNull(task.deletedAt),
          isNull(phase.deletedAt),
          isNull(project.deletedAt),
        ),
      )
      .orderBy(desc(task.createdAt)),
  ]);
  const commentsByTaskId = await listTaskCommentsByTaskId(
    tasks.map((item) => item.id),
    currentUser.id,
  );

  const followMap = await listUserEntitySubscriptionState(
    "task",
    tasks.map((item) => item.id),
  );

  const readAtByTaskId = await listTaskCommentReadAtByTaskId(
    tasks.map((item) => item.id),
    currentUser.id,
  );

  return {
    currentUserId: currentUser.id,
    projects,
    assignees,
    tasks: tasks.map((item) => {
      const taskComments = commentsByTaskId.get(item.id) ?? [];
      return {
        ...item,
        isFollowing: followMap.get(item.id) ?? false,
        comments: taskComments,
        unreadCommentCount: computeUnreadCommentCount(
          taskComments,
          readAtByTaskId.get(item.id) ?? null,
        ),
      };
    }),
  };
}

export async function listIssueWorkflowData(): Promise<IssueWorkflowData> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const [projects, tasks, assignees, issues] = await Promise.all([
    listProjectOptions(),
    db
      .select({
        id: task.id,
        title: task.title,
        projectId: phase.projectId,
      })
      .from(task)
      .innerJoin(phase, eq(task.phaseId, phase.id))
      .where(and(isNull(task.deletedAt), isNull(phase.deletedAt)))
      .orderBy(desc(task.createdAt)),
    listAssigneeOptions(),
    db
      .select({
        id: issue.id,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        projectName: project.name,
        taskTitle: task.title,
        assigneeName: user.name,
      })
      .from(issue)
      .innerJoin(project, eq(issue.projectId, project.id))
      .leftJoin(task, eq(issue.taskId, task.id))
      .leftJoin(user, eq(issue.assigneeUserId, user.id))
      .where(and(isNull(issue.deletedAt), isNull(project.deletedAt)))
      .orderBy(desc(issue.createdAt)),
  ]);
  const commentsByIssueId = await listIssueCommentsByIssueId(
    issues.map((item) => item.id),
    currentUser.id,
  );

  const followMap = await listUserEntitySubscriptionState(
    "issue",
    issues.map((item) => item.id),
  );

  return {
    currentUserId: currentUser.id,
    projects,
    tasks,
    assignees,
    issues: issues.map((item) => ({
      ...item,
      isFollowing: followMap.get(item.id) ?? false,
      comments: commentsByIssueId.get(item.id) ?? [],
    })),
  };
}

export async function createProject(projectName: string): Promise<void> {
  const currentUser = await requireSessionUser();
  const name = normalizeTitle(projectName, "Project name");
  const nowIso = new Date().toISOString();

  const insertedRows = await db
    .insert(project)
    .values({
      name,
      createdByUserId: currentUser.id,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .returning({ id: project.id });

  if (insertedRows.length === 0) {
    throw new Error("Unable to create project.");
  }

  await ensureEntitySubscriptions("project", insertedRows[0].id, [currentUser.id]);
  publishRealtimeRefreshAll();
}

export async function archiveProject(projectId: number): Promise<void> {
  const currentUser = await requireSessionUser();

  await requireActiveProject(projectId);

  const projectRows = await db
    .select({
      name: project.name,
      createdByUserId: project.createdByUserId,
    })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);
  if (projectRows.length === 0) {
    throw new Error("Project not found.");
  }

  const nowIso = new Date().toISOString();
  await db
    .update(project)
    .set({
      deletedAt: nowIso,
      updatedAt: nowIso,
    })
    .where(eq(project.id, projectId));

  const recipients = await resolveEntityNotificationRecipients({
    entityType: "project",
    entityId: projectId,
    creatorUserId: projectRows[0].createdByUserId,
    actorUserId: currentUser.id,
  });
  await createNotifications({
    recipientUserIds: recipients,
    actorUserId: currentUser.id,
    category: "project_activity",
    type: "project_archived",
    title: `Project archived: ${projectRows[0].name}`,
    body: `${currentUser.name ?? "An admin"} archived this project.`,
    href: "/projects",
    sourceType: "project",
    sourceId: projectId,
    emailDelayMinutes: 0,
  });
  publishRealtimeRefreshAll();
}

export async function createTask(input: CreateTaskInput): Promise<void> {
  const currentUser = await requireSessionUser();
  const title = normalizeTitle(input.title, "Task title");
  const description = normalizeDescription(input.description);
  const dueAt = parseDueDate(input.dueOn);
  const nowIso = new Date().toISOString();

  await requireActiveProject(input.projectId);
  const assigneeUserId = await resolveAssigneeId(
    input.assigneeUserId,
    currentUser.id,
  );
  const phaseId = await resolvePhaseIdForProject(input.projectId, currentUser.id);

  const insertedRows = await db
    .insert(task)
    .values({
      phaseId,
      assigneeUserId,
      title,
      description,
      dueAt,
      createdByUserId: currentUser.id,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .returning({ id: task.id });
  if (insertedRows.length === 0) {
    throw new Error("Unable to create task.");
  }

  const createdTaskId = insertedRows[0].id;
  await ensureEntitySubscriptions("task", createdTaskId, [
    currentUser.id,
    assigneeUserId,
  ]);

  const recipients = await resolveEntityNotificationRecipients({
    entityType: "task",
    entityId: createdTaskId,
    creatorUserId: currentUser.id,
    assigneeUserId,
    actorUserId: currentUser.id,
  });
  await createNotifications({
    recipientUserIds: recipients,
    actorUserId: currentUser.id,
    category: "task_activity",
    type: "task_created",
    title: `${currentUser.name ?? "Someone"} created task: ${title}`,
    body: description
      ? `${description} | Due ${input.dueOn}`
      : `Due ${input.dueOn}`,
    href: `/tasks?taskId=${createdTaskId}`,
    sourceType: "task",
    sourceId: createdTaskId,
    emailDelayMinutes: 0,
  });
  publishRealtimeRefresh([currentUser.id, ...recipients]);
}

export async function advanceTaskStatus(taskId: number): Promise<TaskStatus> {
  const currentUser = await requireSessionUser();

  const rows = await db
    .select({
      id: task.id,
      status: task.status,
      title: task.title,
      assigneeUserId: task.assigneeUserId,
      createdByUserId: task.createdByUserId,
    })
    .from(task)
    .where(and(eq(task.id, taskId), isNull(task.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Task not found.");
  }

  const nextStatus = NEXT_TASK_STATUS[rows[0].status];
  if (nextStatus === rows[0].status) {
    return rows[0].status;
  }

  await db
    .update(task)
    .set({
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(task.id, taskId));

  await ensureEntitySubscriptions("task", taskId, [
    rows[0].createdByUserId,
    rows[0].assigneeUserId,
  ]);
  const recipients = await resolveEntityNotificationRecipients({
    entityType: "task",
    entityId: taskId,
    creatorUserId: rows[0].createdByUserId,
    assigneeUserId: rows[0].assigneeUserId,
    actorUserId: currentUser.id,
  });
  await createNotifications({
    recipientUserIds: recipients,
    actorUserId: currentUser.id,
    category: "task_activity",
    type: "task_status_changed",
    title: `Task status updated: ${rows[0].title}`,
    body: `${currentUser.name ?? "Someone"} moved this task from ${rows[0].status.replace("_", " ")} to ${nextStatus.replace("_", " ")}.`,
    href: `/tasks?taskId=${taskId}`,
    sourceType: "task",
    sourceId: taskId,
    emailDelayMinutes: 0,
  });
  publishRealtimeRefresh([currentUser.id, ...recipients]);

  return nextStatus;
}

export async function addTaskComment(taskId: number, rawCommentBody: string): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  if (!Number.isInteger(taskId) || taskId <= 0) {
    throw new Error("Task not found.");
  }

  const body = normalizeCommentBody(rawCommentBody);
  const rows = await db
    .select({
      title: task.title,
      assigneeUserId: task.assigneeUserId,
      createdByUserId: task.createdByUserId,
    })
    .from(task)
    .where(and(eq(task.id, taskId), isNull(task.deletedAt)))
    .limit(1);
  if (rows.length === 0) {
    throw new Error("Task not found.");
  }

  const nowIso = new Date().toISOString();
  const insertedRows = await db
    .insert(workItemComment)
    .values({
      taskId,
      issueId: null,
      createdByUserId: currentUser.id,
      body,
      createdAt: nowIso,
      updatedAt: null,
      deletedAt: null,
    })
    .returning({ id: workItemComment.id });
  if (insertedRows.length === 0) {
    throw new Error("Unable to add comment.");
  }

  await ensureEntitySubscriptions("task", taskId, [
    currentUser.id,
    rows[0].createdByUserId,
    rows[0].assigneeUserId,
  ]);
  const recipients = await resolveEntityNotificationRecipients({
    entityType: "task",
    entityId: taskId,
    creatorUserId: rows[0].createdByUserId,
    assigneeUserId: rows[0].assigneeUserId,
    actorUserId: currentUser.id,
  });
  await createNotifications({
    recipientUserIds: recipients,
    actorUserId: currentUser.id,
    category: "task_activity",
    type: "task_comment_added",
    title: `${currentUser.name ?? "Someone"} commented on: ${rows[0].title}`,
    body,
    href: `/tasks?taskId=${taskId}`,
    sourceType: "task",
    sourceId: taskId,
    emailDelayMinutes: 0,
  });
  publishRealtimeRefresh([currentUser.id, ...recipients]);
}

export async function markTaskCommentsRead(taskId: number): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const nowIso = new Date().toISOString();
  const existing = await db
    .select({ id: taskCommentReadState.id })
    .from(taskCommentReadState)
    .where(
      and(
        eq(taskCommentReadState.userId, currentUser.id),
        eq(taskCommentReadState.taskId, taskId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(taskCommentReadState)
      .set({ lastReadAt: nowIso })
      .where(eq(taskCommentReadState.id, existing[0].id));
  } else {
    await db.insert(taskCommentReadState).values({
      userId: currentUser.id,
      taskId,
      lastReadAt: nowIso,
    });
  }
}

export async function createIssue(input: CreateIssueInput): Promise<void> {
  const currentUser = await requireSessionUser();
  const title = normalizeTitle(input.title, "Issue title");
  const description = normalizeDescription(input.description);
  const nowIso = new Date().toISOString();

  await requireActiveProject(input.projectId);

  if (input.taskId) {
    const matchingTaskRows = await db
      .select({ id: task.id })
      .from(task)
      .innerJoin(phase, eq(task.phaseId, phase.id))
      .where(
        and(
          eq(task.id, input.taskId),
          eq(phase.projectId, input.projectId),
          isNull(task.deletedAt),
          isNull(phase.deletedAt),
        ),
      )
      .limit(1);

    if (matchingTaskRows.length === 0) {
      throw new Error("Selected task does not belong to this project.");
    }
  }

  if (input.assigneeUserId) {
    await requireActiveAssignee(input.assigneeUserId);
  }

  const insertedRows = await db
    .insert(issue)
    .values({
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      assigneeUserId: input.assigneeUserId ?? null,
      title,
      description,
      status: "open",
      createdByUserId: currentUser.id,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .returning({ id: issue.id });
  if (insertedRows.length === 0) {
    throw new Error("Unable to create issue.");
  }

  const createdIssueId = insertedRows[0].id;
  await ensureEntitySubscriptions("issue", createdIssueId, [
    currentUser.id,
    input.assigneeUserId ?? null,
  ]);
  const recipients = await resolveEntityNotificationRecipients({
    entityType: "issue",
    entityId: createdIssueId,
    creatorUserId: currentUser.id,
    assigneeUserId: input.assigneeUserId ?? null,
    actorUserId: currentUser.id,
  });
  await createNotifications({
    recipientUserIds: recipients,
    actorUserId: currentUser.id,
    category: "issue_activity",
    type: "issue_created",
    title: `${currentUser.name ?? "Someone"} created issue: ${title}`,
    body: description ?? "",
    href: `/issues?issueId=${createdIssueId}`,
    sourceType: "issue",
    sourceId: createdIssueId,
    emailDelayMinutes: 0,
  });
  publishRealtimeRefresh([currentUser.id, ...recipients]);
}

export async function advanceIssueStatus(issueId: number): Promise<IssueStatus> {
  const currentUser = await requireSessionUser();

  const rows = await db
    .select({
      id: issue.id,
      status: issue.status,
      title: issue.title,
      assigneeUserId: issue.assigneeUserId,
      createdByUserId: issue.createdByUserId,
    })
    .from(issue)
    .where(and(eq(issue.id, issueId), isNull(issue.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Issue not found.");
  }

  const nextStatus = NEXT_ISSUE_STATUS[rows[0].status];
  if (nextStatus === rows[0].status) {
    return rows[0].status;
  }

  await db
    .update(issue)
    .set({
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(issue.id, issueId));

  await ensureEntitySubscriptions("issue", issueId, [
    rows[0].createdByUserId,
    rows[0].assigneeUserId,
  ]);
  const recipients = await resolveEntityNotificationRecipients({
    entityType: "issue",
    entityId: issueId,
    creatorUserId: rows[0].createdByUserId,
    assigneeUserId: rows[0].assigneeUserId,
    actorUserId: currentUser.id,
  });
  await createNotifications({
    recipientUserIds: recipients,
    actorUserId: currentUser.id,
    category: "issue_activity",
    type: "issue_status_changed",
    title: `Issue status updated: ${rows[0].title}`,
    body: `${currentUser.name ?? "Someone"} moved this issue from ${rows[0].status.replace("_", " ")} to ${nextStatus.replace("_", " ")}.`,
    href: `/issues?issueId=${issueId}`,
    sourceType: "issue",
    sourceId: issueId,
    emailDelayMinutes: 0,
  });
  publishRealtimeRefresh([currentUser.id, ...recipients]);

  return nextStatus;
}

export async function addIssueComment(
  issueId: number,
  rawCommentBody: string,
): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  if (!Number.isInteger(issueId) || issueId <= 0) {
    throw new Error("Issue not found.");
  }

  const body = normalizeCommentBody(rawCommentBody);
  const rows = await db
    .select({
      title: issue.title,
      assigneeUserId: issue.assigneeUserId,
      createdByUserId: issue.createdByUserId,
    })
    .from(issue)
    .where(and(eq(issue.id, issueId), isNull(issue.deletedAt)))
    .limit(1);
  if (rows.length === 0) {
    throw new Error("Issue not found.");
  }

  const nowIso = new Date().toISOString();
  const insertedRows = await db
    .insert(workItemComment)
    .values({
      taskId: null,
      issueId,
      createdByUserId: currentUser.id,
      body,
      createdAt: nowIso,
      updatedAt: null,
      deletedAt: null,
    })
    .returning({ id: workItemComment.id });
  if (insertedRows.length === 0) {
    throw new Error("Unable to add comment.");
  }

  await ensureEntitySubscriptions("issue", issueId, [
    currentUser.id,
    rows[0].createdByUserId,
    rows[0].assigneeUserId,
  ]);
  const recipients = await resolveEntityNotificationRecipients({
    entityType: "issue",
    entityId: issueId,
    creatorUserId: rows[0].createdByUserId,
    assigneeUserId: rows[0].assigneeUserId,
    actorUserId: currentUser.id,
  });
  await createNotifications({
    recipientUserIds: recipients,
    actorUserId: currentUser.id,
    category: "issue_activity",
    type: "issue_comment_added",
    title: `${currentUser.name ?? "Someone"} commented on issue: ${rows[0].title}`,
    body,
    href: `/issues?issueId=${issueId}`,
    sourceType: "issue",
    sourceId: issueId,
    emailDelayMinutes: 0,
  });
  publishRealtimeRefresh([currentUser.id, ...recipients]);
}

export async function editTaskComment(
  commentId: number,
  rawCommentBody: string,
): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  if (!Number.isInteger(commentId) || commentId <= 0) {
    throw new Error("Comment not found.");
  }

  const body = normalizeCommentBody(rawCommentBody);
  const rows = await db
    .select({
      id: workItemComment.id,
      createdByUserId: workItemComment.createdByUserId,
      taskId: workItemComment.taskId,
      issueId: workItemComment.issueId,
    })
    .from(workItemComment)
    .where(and(eq(workItemComment.id, commentId), isNull(workItemComment.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Comment not found.");
  }

  if (rows[0].createdByUserId !== currentUser.id) {
    throw new Error("You can only edit your own comments.");
  }

  const nowIso = new Date().toISOString();
  await db
    .update(workItemComment)
    .set({ body, updatedAt: nowIso })
    .where(eq(workItemComment.id, commentId));

  const commentRow = rows[0];
  if (commentRow.taskId) {
    const recipients = await resolveEntityNotificationRecipients({
      entityType: "task",
      entityId: commentRow.taskId,
      actorUserId: currentUser.id,
    });
    publishRealtimeRefresh([currentUser.id, ...recipients]);
  } else if (commentRow.issueId) {
    const recipients = await resolveEntityNotificationRecipients({
      entityType: "issue",
      entityId: commentRow.issueId,
      actorUserId: currentUser.id,
    });
    publishRealtimeRefresh([currentUser.id, ...recipients]);
  }
}

export async function deleteTaskComment(commentId: number): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  if (!Number.isInteger(commentId) || commentId <= 0) {
    throw new Error("Comment not found.");
  }

  const rows = await db
    .select({
      id: workItemComment.id,
      createdByUserId: workItemComment.createdByUserId,
      taskId: workItemComment.taskId,
      issueId: workItemComment.issueId,
    })
    .from(workItemComment)
    .where(and(eq(workItemComment.id, commentId), isNull(workItemComment.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Comment not found.");
  }

  if (rows[0].createdByUserId !== currentUser.id) {
    throw new Error("You can only delete your own comments.");
  }

  const nowIso = new Date().toISOString();
  await db
    .update(workItemComment)
    .set({ deletedAt: nowIso })
    .where(eq(workItemComment.id, commentId));

  const commentRow = rows[0];
  if (commentRow.taskId) {
    const recipients = await resolveEntityNotificationRecipients({
      entityType: "task",
      entityId: commentRow.taskId,
      actorUserId: currentUser.id,
    });
    publishRealtimeRefresh([currentUser.id, ...recipients]);
  } else if (commentRow.issueId) {
    const recipients = await resolveEntityNotificationRecipients({
      entityType: "issue",
      entityId: commentRow.issueId,
      actorUserId: currentUser.id,
    });
    publishRealtimeRefresh([currentUser.id, ...recipients]);
  }
}

export async function editIssueComment(
  commentId: number,
  rawCommentBody: string,
): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  if (!Number.isInteger(commentId) || commentId <= 0) {
    throw new Error("Comment not found.");
  }

  const body = normalizeCommentBody(rawCommentBody);
  const rows = await db
    .select({
      id: workItemComment.id,
      createdByUserId: workItemComment.createdByUserId,
      taskId: workItemComment.taskId,
      issueId: workItemComment.issueId,
    })
    .from(workItemComment)
    .where(and(eq(workItemComment.id, commentId), isNull(workItemComment.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Comment not found.");
  }

  if (rows[0].createdByUserId !== currentUser.id) {
    throw new Error("You can only edit your own comments.");
  }

  const nowIso = new Date().toISOString();
  await db
    .update(workItemComment)
    .set({ body, updatedAt: nowIso })
    .where(eq(workItemComment.id, commentId));

  const commentRow = rows[0];
  if (commentRow.taskId) {
    const recipients = await resolveEntityNotificationRecipients({
      entityType: "task",
      entityId: commentRow.taskId,
      actorUserId: currentUser.id,
    });
    publishRealtimeRefresh([currentUser.id, ...recipients]);
  } else if (commentRow.issueId) {
    const recipients = await resolveEntityNotificationRecipients({
      entityType: "issue",
      entityId: commentRow.issueId,
      actorUserId: currentUser.id,
    });
    publishRealtimeRefresh([currentUser.id, ...recipients]);
  }
}

export async function deleteIssueComment(commentId: number): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  if (!Number.isInteger(commentId) || commentId <= 0) {
    throw new Error("Comment not found.");
  }

  const rows = await db
    .select({
      id: workItemComment.id,
      createdByUserId: workItemComment.createdByUserId,
      taskId: workItemComment.taskId,
      issueId: workItemComment.issueId,
    })
    .from(workItemComment)
    .where(and(eq(workItemComment.id, commentId), isNull(workItemComment.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Comment not found.");
  }

  if (rows[0].createdByUserId !== currentUser.id) {
    throw new Error("You can only delete your own comments.");
  }

  const nowIso = new Date().toISOString();
  await db
    .update(workItemComment)
    .set({ deletedAt: nowIso })
    .where(eq(workItemComment.id, commentId));

  const commentRow = rows[0];
  if (commentRow.taskId) {
    const recipients = await resolveEntityNotificationRecipients({
      entityType: "task",
      entityId: commentRow.taskId,
      actorUserId: currentUser.id,
    });
    publishRealtimeRefresh([currentUser.id, ...recipients]);
  } else if (commentRow.issueId) {
    const recipients = await resolveEntityNotificationRecipients({
      entityType: "issue",
      entityId: commentRow.issueId,
      actorUserId: currentUser.id,
    });
    publishRealtimeRefresh([currentUser.id, ...recipients]);
  }
}

export async function setProjectFollow(
  projectId: number,
  follow: boolean,
): Promise<void> {
  const currentUser = await requireSessionUser();
  await requireActiveProject(projectId);
  await toggleEntitySubscription("project", projectId, follow);
  publishRealtimeRefresh([currentUser.id]);
}

export async function setTaskFollow(taskId: number, follow: boolean): Promise<void> {
  const currentUser = await requireSessionUser();
  await requireActiveTask(taskId);
  await toggleEntitySubscription("task", taskId, follow);
  publishRealtimeRefresh([currentUser.id]);
}

export async function setIssueFollow(issueId: number, follow: boolean): Promise<void> {
  const currentUser = await requireSessionUser();
  await requireActiveIssue(issueId);
  await toggleEntitySubscription("issue", issueId, follow);
  publishRealtimeRefresh([currentUser.id]);
}

export interface TaskDetailItem {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueAt: string;
  projectId: number;
  projectName: string;
  phaseId: number;
  phaseName: string;
  assigneeId: number | null;
  assigneeName: string | null;
  createdByUserId: number | null;
  createdByUserName: string;
  createdAt: string;
  isFollowing: boolean;
  comments: WorkItemCommentThreadItem[];
  actions: ActionItem[];
}

export async function getTaskDetailById(taskId: number): Promise<TaskDetailItem> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  if (!Number.isInteger(taskId) || taskId <= 0) {
    throw new Error("Task not found.");
  }

  const rows = await db
    .select({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      dueAt: task.dueAt,
      projectId: project.id,
      projectName: project.name,
      phaseId: task.phaseId,
      phaseName: phase.name,
      assigneeId: task.assigneeUserId,
      assigneeName: user.name,
      createdByUserId: task.createdByUserId,
      createdAt: task.createdAt,
    })
    .from(task)
    .innerJoin(phase, eq(task.phaseId, phase.id))
    .innerJoin(project, eq(phase.projectId, project.id))
    .leftJoin(user, eq(task.assigneeUserId, user.id))
    .where(and(eq(task.id, taskId), isNull(task.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Task not found.");
  }

  const row = rows[0];

  // Fetch comments
  const comments = await listTaskCommentsByTaskId([taskId], currentUser.id);
  const taskComments = comments.get(taskId) ?? [];

  // Fetch actions
  const taskActions = await listActionsByTask(taskId);

  // Fetch following status
  const followingState = await listUserEntitySubscriptionState("task", [taskId]);
  const isFollowing = followingState.get(taskId) ?? false;

  // Use the current user name as fallback for creator
  const creatorName = row.createdByUserId === currentUser.id ? "You" : "Creator";

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    dueAt: row.dueAt,
    projectId: row.projectId,
    projectName: row.projectName,
    phaseId: row.phaseId,
    phaseName: row.phaseName,
    assigneeId: row.assigneeId,
    assigneeName: row.assigneeName,
    createdByUserId: row.createdByUserId,
    createdByUserName: creatorName,
    createdAt: row.createdAt,
    isFollowing,
    comments: taskComments,
    actions: taskActions,
  };
}

export interface IssueDetailItem {
  id: number;
  title: string;
  description: string | null;
  status: IssueStatus;
  projectId: number;
  projectName: string;
  taskId: number | null;
  taskTitle: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  createdByUserId: number | null;
  createdByUserName: string;
  createdAt: string;
  isFollowing: boolean;
  comments: WorkItemCommentThreadItem[];
}

export async function getIssueDetailById(issueId: number): Promise<IssueDetailItem> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  if (!Number.isInteger(issueId) || issueId <= 0) {
    throw new Error("Issue not found.");
  }

  const rows = await db
    .select({
      id: issue.id,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      projectId: issue.projectId,
      projectName: project.name,
      taskId: issue.taskId,
      taskTitle: task.title,
      assigneeId: issue.assigneeUserId,
      assigneeName: user.name,
      createdByUserId: issue.createdByUserId,
      createdAt: issue.createdAt,
    })
    .from(issue)
    .innerJoin(project, eq(issue.projectId, project.id))
    .leftJoin(task, eq(issue.taskId, task.id))
    .leftJoin(user, eq(issue.assigneeUserId, user.id))
    .where(and(eq(issue.id, issueId), isNull(issue.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Issue not found.");
  }

  const row = rows[0];

  // Fetch comments
  const comments = await listIssueCommentsByIssueId([issueId], currentUser.id);
  const issueComments = comments.get(issueId) ?? [];

  // Fetch following status
  const followingState = await listUserEntitySubscriptionState("issue", [issueId]);
  const isFollowing = followingState.get(issueId) ?? false;

  // Use the current user name as fallback for creator
  const creatorName = row.createdByUserId === currentUser.id ? "You" : "Creator";

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    projectId: row.projectId,
    projectName: row.projectName,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    assigneeId: row.assigneeId,
    assigneeName: row.assigneeName,
    createdByUserId: row.createdByUserId,
    createdByUserName: creatorName,
    createdAt: row.createdAt,
    isFollowing,
    comments: issueComments,
  };
}

export async function getTaskComments(taskId: number): Promise<WorkItemCommentThreadItem[]> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();
  const comments = await listTaskCommentsByTaskId([taskId], currentUser.id);
  return comments.get(taskId) ?? [];
}
