"use server";

import { and, asc, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import db, { ensureDbSchema } from "@/db/connection";
import {
  caseItem,
  type CaseItemImpact,
  type CaseItemPriority,
  type CaseItemSeverity,
  type CaseItemStatus,
  issue,
  type IssueStatus,
  project,
  supportCase,
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
  listAttachmentsByTask,
  listAttachmentsByIssue,
  type AttachmentItem,
} from "./attachment.service";
import {
  ensureEntitySubscriptions,
  listUserEntitySubscriptionState,
  toggleEntitySubscription,
} from "./entity-subscription.service";
import { dispatchEntityNotification, notifyEntityWatchers } from "./entity-notify.service";
import { publishRealtimeRefresh, publishRealtimeRefreshAll } from "./realtime.service";
import { requireSessionUser } from "./session.service";
import { displayName, nowIso } from "@/lib/utils";

const MIN_TITLE_LENGTH = 3;
const MAX_COMMENT_LENGTH = 2000;

const NEXT_TASK_STATUS: Record<TaskStatus, TaskStatus> = {
  not_started: "in_progress",
  in_progress: "completed",
  completed: "completed",
};

const PREV_TASK_STATUS: Record<TaskStatus, TaskStatus> = {
  not_started: "not_started",
  in_progress: "not_started",
  completed: "in_progress",
};

const NEXT_ISSUE_STATUS: Record<IssueStatus, IssueStatus> = {
  open: "in_progress",
  in_progress: "resolved",
  resolved: "closed",
  closed: "closed",
};

const PREV_ISSUE_STATUS: Record<IssueStatus, IssueStatus> = {
  open: "open",
  in_progress: "open",
  resolved: "in_progress",
  closed: "resolved",
};

export interface ProjectOption {
  id: number;
  name: string;
}

export interface CaseOption {
  id: number;
  title: string;
  projectId: number;
  projectName: string;
}

export interface ItemOption {
  id: number;
  description: string;
  caseId: number;
  caseTitle: string;
  projectName: string;
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
  caseName: string;
  itemName: string;
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
  cases: CaseOption[];
  items: ItemOption[];
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
  itemId: number;
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

async function requireActiveCase(caseId: number): Promise<void> {
  const rows = await db
    .select({ id: supportCase.id })
    .from(supportCase)
    .where(and(eq(supportCase.id, caseId), isNull(supportCase.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Selected case does not exist.");
  }
}

async function requireActiveItem(itemId: number): Promise<void> {
  const rows = await db
    .select({ id: caseItem.id })
    .from(caseItem)
    .where(and(eq(caseItem.id, itemId), isNull(caseItem.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Selected item does not exist.");
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



export async function listAllCaseOptions(): Promise<CaseOption[]> {
  await requireSessionUser();
  await ensureDbSchema();

  const rows = await db
    .select({
      id: supportCase.id,
      title: supportCase.title,
      projectId: supportCase.projectId,
      projectName: project.name,
    })
    .from(supportCase)
    .innerJoin(project, eq(supportCase.projectId, project.id))
    .where(
      and(isNull(supportCase.deletedAt), isNull(project.deletedAt)),
    )
    .orderBy(asc(project.name), asc(supportCase.title));

  return rows;
}

export async function listAllItemOptions(): Promise<ItemOption[]> {
  await requireSessionUser();
  await ensureDbSchema();

  const rows = await db
    .select({
      id: caseItem.id,
      description: caseItem.description,
      caseId: caseItem.caseId,
      caseTitle: supportCase.title,
      projectName: project.name,
    })
    .from(caseItem)
    .innerJoin(supportCase, eq(caseItem.caseId, supportCase.id))
    .innerJoin(project, eq(supportCase.projectId, project.id))
    .where(
      and(
        isNull(caseItem.deletedAt),
        isNull(supportCase.deletedAt),
        isNull(project.deletedAt),
      ),
    )
    .orderBy(asc(project.name), asc(supportCase.title), asc(caseItem.createdAt));

  return rows;
}

export async function listAssigneeOptions(): Promise<AssigneeOption[]> {
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
      projectId: supportCase.projectId,
      total: count(task.id),
    })
    .from(task)
    .innerJoin(caseItem, eq(task.itemId, caseItem.id))
    .innerJoin(supportCase, eq(caseItem.caseId, supportCase.id))
    .where(and(isNull(task.deletedAt), isNull(caseItem.deletedAt), isNull(supportCase.deletedAt)))
    .groupBy(supportCase.projectId);

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

export async function listArchivedProjects(): Promise<ProjectWorkflowItem[]> {
  await requireSessionUser();
  await ensureDbSchema();

  const projectRows = await db
    .select({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
    })
    .from(project)
    .where(isNotNull(project.deletedAt))
    .orderBy(desc(project.deletedAt));

  return projectRows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    taskCount: 0,
    openIssueCount: 0,
    isFollowing: false,
  }));
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

  const [projects, cases, items, assignees, tasks] = await Promise.all([
    listProjectOptions(),
    listAllCaseOptions(),
    listAllItemOptions(),
    listAssigneeOptions(),
      db
      .select({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        dueAt: task.dueAt,
        projectName: project.name,
        caseName: supportCase.title,
        itemName: caseItem.description,
        assigneeName: user.name,
      })
      .from(task)
      .innerJoin(caseItem, eq(task.itemId, caseItem.id)).innerJoin(supportCase, eq(caseItem.caseId, supportCase.id))
      .innerJoin(project, eq(supportCase.projectId, project.id))
      .leftJoin(user, eq(task.assigneeUserId, user.id))
      .where(
        and(
          isNull(task.deletedAt),
          isNull(caseItem.deletedAt),
          isNull(supportCase.deletedAt),
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
    cases,
    items,
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
        projectId: supportCase.projectId,
      })
      .from(task)
      .innerJoin(caseItem, eq(task.itemId, caseItem.id)).innerJoin(supportCase, eq(caseItem.caseId, supportCase.id))
      .where(and(isNull(task.deletedAt), isNull(caseItem.deletedAt), isNull(supportCase.deletedAt)))
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

  await dispatchEntityNotification({
    entity: {
      type: "project",
      id: projectId,
      creatorUserId: projectRows[0].createdByUserId,
    },
    notification: {
      actorUserId: currentUser.id,
      category: "project_activity",
      type: "project_archived",
      title: `Project archived: ${projectRows[0].name}`,
      body: `${currentUser.name ?? "An admin"} archived this project.`,
      href: "/projects",
      sourceType: "project",
      sourceId: projectId,
      emailDelayMinutes: 0,
    },
    globalRefresh: true,
  });
}

export async function restoreProject(projectId: number): Promise<void> {
  const currentUser = await requireSessionUser();
  const nowIso = new Date().toISOString();

  const projectRows = await db
    .select({ name: project.name, createdByUserId: project.createdByUserId })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);
  if (projectRows.length === 0) {
    throw new Error("Project not found.");
  }

  await db
    .update(project)
    .set({
      deletedAt: null,
      updatedAt: nowIso,
    })
    .where(eq(project.id, projectId));

  await dispatchEntityNotification({
    entity: {
      type: "project",
      id: projectId,
      creatorUserId: projectRows[0].createdByUserId,
    },
    notification: {
      actorUserId: currentUser.id,
      category: "project_activity",
      type: "project_restored",
      title: `Project restored: ${projectRows[0].name}`,
      body: `${currentUser.name ?? "An admin"} restored this project.`,
      href: "/projects",
      sourceType: "project",
      sourceId: projectId,
      emailDelayMinutes: 0,
    },
    globalRefresh: true,
  });
}

export async function updateProject(projectId: number, name: string): Promise<void> {
  const currentUser = await requireSessionUser();
  const normalizedName = normalizeTitle(name, "Project name");
  const nowIso = new Date().toISOString();

  const rows = await db
    .select({ name: project.name, createdByUserId: project.createdByUserId })
    .from(project)
    .where(and(eq(project.id, projectId), isNull(project.deletedAt)))
    .limit(1);
  if (rows.length === 0) {
    throw new Error("Project not found.");
  }

  const oldName = rows[0].name;
  await db
    .update(project)
    .set({ name: normalizedName, updatedAt: nowIso })
    .where(eq(project.id, projectId));

  await dispatchEntityNotification({
    entity: {
      type: "project",
      id: projectId,
      creatorUserId: rows[0].createdByUserId,
    },
    notification: {
      actorUserId: currentUser.id,
      category: "project_activity",
      type: "project_updated",
      title: `Project renamed: ${oldName} → ${normalizedName}`,
      body: `${currentUser.name ?? "Someone"} renamed this project.`,
      href: "/projects",
      sourceType: "project",
      sourceId: projectId,
      emailDelayMinutes: 0,
    },
    globalRefresh: true,
  });
}

export async function createTask(input: CreateTaskInput): Promise<{ id: number }> {
  const currentUser = await requireSessionUser();
  const title = normalizeTitle(input.title, "Task title");
  const description = normalizeDescription(input.description);
  const dueAt = parseDueDate(input.dueOn);
  const nowIso = new Date().toISOString();

  await requireActiveItem(input.itemId);
  const assigneeUserId = await resolveAssigneeId(
    input.assigneeUserId,
    currentUser.id,
  );

  const insertedRows = await db
    .insert(task)
    .values({
      itemId: input.itemId,
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
  const notificationBody = description
    ? `${description} | Due ${input.dueOn}`
    : `Due ${input.dueOn}`;
  await dispatchEntityNotification({
    entity: {
      type: "task",
      id: createdTaskId,
      creatorUserId: currentUser.id,
      assigneeUserId,
    },
    notification: {
      actorUserId: currentUser.id,
      category: "task_activity",
      type: "task_created",
      title: `${currentUser.name ?? "Someone"} created task: ${title}`,
      body: notificationBody,
      href: `/tasks?taskId=${createdTaskId}`,
      sourceType: "task",
      sourceId: createdTaskId,
      emailDelayMinutes: 0,
    },
    subscribeParticipantIds: [currentUser.id, assigneeUserId],
  });

  return { id: createdTaskId };
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

  await dispatchEntityNotification({
    entity: {
      type: "task",
      id: taskId,
      creatorUserId: rows[0].createdByUserId,
      assigneeUserId: rows[0].assigneeUserId,
    },
    notification: {
      actorUserId: currentUser.id,
      category: "task_activity",
      type: "task_status_changed",
      title: `Task status updated: ${rows[0].title}`,
      body: `${currentUser.name ?? "Someone"} moved this task from ${rows[0].status.replace("_", " ")} to ${nextStatus.replace("_", " ")}.`,
      href: `/tasks?taskId=${taskId}`,
      sourceType: "task",
      sourceId: taskId,
      emailDelayMinutes: 0,
    },
    subscribeParticipantIds: [
      rows[0].createdByUserId,
      rows[0].assigneeUserId,
    ],
  });

  return nextStatus;
}

export async function reverseTaskStatus(taskId: number): Promise<TaskStatus> {
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

  const prevStatus = PREV_TASK_STATUS[rows[0].status];
  if (prevStatus === rows[0].status) {
    return rows[0].status;
  }

  await db
    .update(task)
    .set({
      status: prevStatus,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(task.id, taskId));

  await dispatchEntityNotification({
    entity: {
      type: "task",
      id: taskId,
      creatorUserId: rows[0].createdByUserId,
      assigneeUserId: rows[0].assigneeUserId,
    },
    notification: {
      actorUserId: currentUser.id,
      category: "task_activity",
      type: "task_status_changed",
      title: `Task status updated: ${rows[0].title}`,
      body: `${currentUser.name ?? "Someone"} moved this task back to ${prevStatus.replace("_", " ")}.`,
      href: `/tasks?taskId=${taskId}`,
      sourceType: "task",
      sourceId: taskId,
      emailDelayMinutes: 0,
    },
    subscribeParticipantIds: [
      rows[0].createdByUserId,
      rows[0].assigneeUserId,
    ],
  });

  return prevStatus;
}

export async function updateTask(
  taskId: number,
  fields: { title?: string; description?: string; dueOn?: string; assigneeUserId?: number },
): Promise<void> {
  const currentUser = await requireSessionUser();

  const rows = await db
    .select({
      id: task.id,
      title: task.title,
      description: task.description,
      assigneeUserId: task.assigneeUserId,
      createdByUserId: task.createdByUserId,
    })
    .from(task)
    .where(and(eq(task.id, taskId), isNull(task.deletedAt)))
    .limit(1);
  if (rows.length === 0) {
    throw new Error("Task not found.");
  }

  const updates: Partial<typeof task.$inferInsert> = {};
  const changed: string[] = [];
  const nowIso = new Date().toISOString();

  if (fields.title !== undefined) {
    updates.title = normalizeTitle(fields.title, "Task title");
    changed.push("title");
  }
  if (fields.description !== undefined) {
    updates.description = normalizeDescription(fields.description);
    changed.push("description");
  }
  if (fields.dueOn !== undefined) {
    updates.dueAt = parseDueDate(fields.dueOn);
    changed.push("due date");
  }
  if (fields.assigneeUserId !== undefined) {
    await requireActiveAssignee(fields.assigneeUserId);
    updates.assigneeUserId = fields.assigneeUserId;
    changed.push("assignee");
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  updates.updatedAt = nowIso;
  await db.update(task).set(updates).where(eq(task.id, taskId));

  await dispatchEntityNotification({
    entity: {
      type: "task",
      id: taskId,
      creatorUserId: rows[0].createdByUserId,
      assigneeUserId: rows[0].assigneeUserId,
    },
    notification: {
      actorUserId: currentUser.id,
      category: "task_activity",
      type: "task_updated",
      title: `Task updated: ${rows[0].title}`,
      body: `${currentUser.name ?? "Someone"} updated ${changed.join(", ")}.`,
      href: `/tasks?taskId=${taskId}`,
      sourceType: "task",
      sourceId: taskId,
      emailDelayMinutes: 0,
    },
    subscribeParticipantIds: [
      rows[0].createdByUserId,
      fields.assigneeUserId ?? rows[0].assigneeUserId,
    ],
  });
}

export async function addTaskComment(taskId: number, rawCommentBody: string): Promise<{ id: number }> {
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

  await dispatchEntityNotification({
    entity: {
      type: "task",
      id: taskId,
      creatorUserId: rows[0].createdByUserId,
      assigneeUserId: rows[0].assigneeUserId,
    },
    notification: {
      actorUserId: currentUser.id,
      category: "task_activity",
      type: "task_comment_added",
      title: `${currentUser.name ?? "Someone"} commented on: ${rows[0].title}`,
      body,
      href: `/tasks?taskId=${taskId}`,
      sourceType: "task",
      sourceId: taskId,
      emailDelayMinutes: 0,
    },
    subscribeParticipantIds: [
      currentUser.id,
      rows[0].createdByUserId,
      rows[0].assigneeUserId,
    ],
  });

  return { id: insertedRows[0].id };
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

export async function createIssue(input: CreateIssueInput): Promise<{ id: number }> {
  const currentUser = await requireSessionUser();
  const title = normalizeTitle(input.title, "Issue title");
  const description = normalizeDescription(input.description);
  const nowIso = new Date().toISOString();

  await requireActiveProject(input.projectId);

  if (input.taskId) {
    const matchingTaskRows = await db
      .select({ id: task.id })
      .from(task)
      .innerJoin(caseItem, eq(task.itemId, caseItem.id)).innerJoin(supportCase, eq(caseItem.caseId, supportCase.id))
      .where(
        and(
          eq(task.id, input.taskId),
          eq(supportCase.projectId, input.projectId),
          isNull(task.deletedAt),
          isNull(caseItem.deletedAt),
          isNull(supportCase.deletedAt),
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
  const notificationBody = description ?? "";
  await dispatchEntityNotification({
    entity: {
      type: "issue",
      id: createdIssueId,
      creatorUserId: currentUser.id,
      assigneeUserId: input.assigneeUserId ?? undefined,
    },
    notification: {
      actorUserId: currentUser.id,
      category: "issue_activity",
      type: "issue_created",
      title: `${currentUser.name ?? "Someone"} created issue: ${title}`,
      body: notificationBody,
      href: `/issues?issueId=${createdIssueId}`,
      sourceType: "issue",
      sourceId: createdIssueId,
      emailDelayMinutes: 0,
    },
    subscribeParticipantIds: [
      currentUser.id,
      input.assigneeUserId,
    ].filter((id): id is number => typeof id === "number" && id > 0),
  });

  return { id: createdIssueId };
}

export async function reverseIssueStatus(issueId: number): Promise<IssueStatus> {
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

  const prevStatus = PREV_ISSUE_STATUS[rows[0].status];
  if (prevStatus === rows[0].status) {
    return rows[0].status;
  }

  await db
    .update(issue)
    .set({
      status: prevStatus,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(issue.id, issueId));

  await dispatchEntityNotification({
    entity: {
      type: "issue",
      id: issueId,
      creatorUserId: rows[0].createdByUserId,
      assigneeUserId: rows[0].assigneeUserId,
    },
    notification: {
      actorUserId: currentUser.id,
      category: "issue_activity",
      type: "issue_status_changed",
      title: `Issue status updated: ${rows[0].title}`,
      body: `${currentUser.name ?? "Someone"} moved this issue back to ${prevStatus.replace("_", " ")}.`,
      href: `/issues?issueId=${issueId}`,
      sourceType: "issue",
      sourceId: issueId,
      emailDelayMinutes: 0,
    },
    subscribeParticipantIds: [
      rows[0].createdByUserId,
      rows[0].assigneeUserId,
    ].filter((id): id is number => typeof id === "number" && id > 0),
  });

  return prevStatus;
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

  await dispatchEntityNotification({
    entity: {
      type: "issue",
      id: issueId,
      creatorUserId: rows[0].createdByUserId,
      assigneeUserId: rows[0].assigneeUserId,
    },
    notification: {
      actorUserId: currentUser.id,
      category: "issue_activity",
      type: "issue_status_changed",
      title: `Issue status updated: ${rows[0].title}`,
      body: `${currentUser.name ?? "Someone"} moved this issue from ${rows[0].status.replace("_", " ")} to ${nextStatus.replace("_", " ")}.`,
      href: `/issues?issueId=${issueId}`,
      sourceType: "issue",
      sourceId: issueId,
      emailDelayMinutes: 0,
    },
    subscribeParticipantIds: [
      rows[0].createdByUserId,
      rows[0].assigneeUserId,
    ].filter((id): id is number => typeof id === "number" && id > 0),
  });

  return nextStatus;
}

export async function updateIssue(
  issueId: number,
  fields: { title?: string; description?: string; assigneeUserId?: number | null },
): Promise<void> {
  const currentUser = await requireSessionUser();

  const rows = await db
    .select({
      id: issue.id,
      title: issue.title,
      description: issue.description,
      assigneeUserId: issue.assigneeUserId,
      createdByUserId: issue.createdByUserId,
    })
    .from(issue)
    .where(and(eq(issue.id, issueId), isNull(issue.deletedAt)))
    .limit(1);
  if (rows.length === 0) {
    throw new Error("Issue not found.");
  }

  const updates: Partial<typeof issue.$inferInsert> = {};
  const changed: string[] = [];
  const nowIso = new Date().toISOString();

  if (fields.title !== undefined) {
    updates.title = normalizeTitle(fields.title, "Issue title");
    changed.push("title");
  }
  if (fields.description !== undefined) {
    updates.description = normalizeDescription(fields.description);
    changed.push("description");
  }
  if (fields.assigneeUserId !== undefined) {
    if (fields.assigneeUserId !== null) {
      await requireActiveAssignee(fields.assigneeUserId);
    }
    updates.assigneeUserId = fields.assigneeUserId;
    changed.push("assignee");
  }

  updates.updatedAt = nowIso;
  await db.update(issue).set(updates).where(eq(issue.id, issueId));

  await dispatchEntityNotification({
    entity: {
      type: "issue",
      id: issueId,
      creatorUserId: rows[0].createdByUserId,
      assigneeUserId: rows[0].assigneeUserId,
    },
    notification: {
      actorUserId: currentUser.id,
      category: "issue_activity",
      type: "issue_updated",
      title: `Issue updated: ${rows[0].title}`,
      body: `${currentUser.name ?? "Someone"} updated ${changed.join(", ")}.`,
      href: `/issues?issueId=${issueId}`,
      sourceType: "issue",
      sourceId: issueId,
      emailDelayMinutes: 0,
    },
    subscribeParticipantIds: [
      rows[0].createdByUserId,
      fields.assigneeUserId ?? rows[0].assigneeUserId,
    ].filter((id): id is number => typeof id === "number" && id > 0),
  });
}

export async function addIssueComment(
  issueId: number,
  rawCommentBody: string,
): Promise<{ id: number }> {
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

  await dispatchEntityNotification({
    entity: {
      type: "issue",
      id: issueId,
      creatorUserId: rows[0].createdByUserId,
      assigneeUserId: rows[0].assigneeUserId,
    },
    notification: {
      actorUserId: currentUser.id,
      category: "issue_activity",
      type: "issue_comment_added",
      title: `${currentUser.name ?? "Someone"} commented on issue: ${rows[0].title}`,
      body,
      href: `/issues?issueId=${issueId}`,
      sourceType: "issue",
      sourceId: issueId,
      emailDelayMinutes: 0,
    },
    subscribeParticipantIds: [
      currentUser.id,
      rows[0].createdByUserId,
      rows[0].assigneeUserId,
    ].filter((id): id is number => typeof id === "number" && id > 0),
  });

  return { id: insertedRows[0].id };
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
    await notifyEntityWatchers({ type: "task", id: commentRow.taskId }, currentUser.id);
  } else if (commentRow.issueId) {
    await notifyEntityWatchers({ type: "issue", id: commentRow.issueId }, currentUser.id);
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
    await notifyEntityWatchers({ type: "task", id: commentRow.taskId }, currentUser.id);
  } else if (commentRow.issueId) {
    await notifyEntityWatchers({ type: "issue", id: commentRow.issueId }, currentUser.id);
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
    await notifyEntityWatchers({ type: "task", id: commentRow.taskId }, currentUser.id);
  } else if (commentRow.issueId) {
    await notifyEntityWatchers({ type: "issue", id: commentRow.issueId }, currentUser.id);
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
    await notifyEntityWatchers({ type: "task", id: commentRow.taskId }, currentUser.id);
  } else if (commentRow.issueId) {
    await notifyEntityWatchers({ type: "issue", id: commentRow.issueId }, currentUser.id);
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

export async function setCaseFollow(caseId: number, follow: boolean): Promise<void> {
  const currentUser = await requireSessionUser();
  await requireActiveCase(caseId);
  await toggleEntitySubscription("case", caseId, follow);
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
  caseId: number;
  caseName: string;
  itemId: number;
  itemName: string;
  assigneeId: number | null;
  assigneeName: string | null;
  createdByUserId: number | null;
  createdByUserName: string;
  createdAt: string;
  isFollowing: boolean;
  comments: WorkItemCommentThreadItem[];
  actions: ActionItem[];
  attachments: AttachmentItem[];
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
      caseId: caseItem.caseId,
      caseName: supportCase.title,
      itemId: task.itemId,
      itemName: caseItem.description,
      assigneeId: task.assigneeUserId,
      assigneeName: user.name,
      createdByUserId: task.createdByUserId,
      createdAt: task.createdAt,
    })
    .from(task)
    .innerJoin(caseItem, eq(task.itemId, caseItem.id)).innerJoin(supportCase, eq(caseItem.caseId, supportCase.id))
    .innerJoin(project, eq(supportCase.projectId, project.id))
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

  // Fetch attachments
  const attachments = await listAttachmentsByTask(taskId);

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
    caseId: row.caseId,
    caseName: row.caseName,
    itemId: row.itemId,
    itemName: row.itemName,
    assigneeId: row.assigneeId,
    assigneeName: row.assigneeName,
    createdByUserId: row.createdByUserId,
    createdByUserName: creatorName,
    createdAt: row.createdAt,
    isFollowing,
    comments: taskComments,
    actions: taskActions,
    attachments,
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
  attachments: AttachmentItem[];
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

  // Fetch attachments
  const attachments = await listAttachmentsByIssue(issueId);

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
    attachments,
  };
}

export async function getTaskComments(taskId: number): Promise<WorkItemCommentThreadItem[]> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();
  const comments = await listTaskCommentsByTaskId([taskId], currentUser.id);
  return comments.get(taskId) ?? [];
}

export interface CaseListItem {
  id: number;
  title: string;
  description: string | null;
  customerName: string | null;
  status: "open" | "in_progress" | "closed";
  projectId: number;
  projectName: string;
  taskCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface CaseDetail {
  id: number;
  title: string;
  description: string | null;
  customerName: string | null;
  status: "open" | "in_progress" | "closed";
  projectId: number;
  projectName: string;
  createdBy: string;
  createdByUserId: number;
  createdAt: string;
  updatedAt: string | null;
  items: ItemDetail[];
}

export interface ItemDetail {
  id: number;
  caseId: number;
  dateReported: string;
  description: string;
  impact: string;
  severity: string;
  priority: string;
  classification: string;
  status: string;
  relatedItemIds: string | null;
  createdBy: string;
  createdByUserId: number;
  createdAt: string;
  updatedAt: string | null;
  tasks: TaskWorkflowItem[];
}

export async function listCases(): Promise<CaseListItem[]> {
  await requireSessionUser();
  await ensureDbSchema();

  const rows = await db
    .select({
      id: supportCase.id,
      title: supportCase.title,
      description: supportCase.description,
      customerName: supportCase.customerName,
      status: supportCase.status,
      projectId: supportCase.projectId,
      projectName: project.name,
      createdBy: user.name,
      createdByEmail: user.email,
      createdAt: supportCase.createdAt,
      updatedAt: supportCase.updatedAt,
    })
    .from(supportCase)
    .innerJoin(project, eq(supportCase.projectId, project.id))
    .leftJoin(user, eq(supportCase.createdByUserId, user.id))
    .where(and(isNull(supportCase.deletedAt), isNull(project.deletedAt)))
    .orderBy(desc(supportCase.createdAt));

  const caseIds = rows.map((r) => r.id);
  const taskCounts = caseIds.length > 0
    ? await db
        .select({ caseId: caseItem.caseId, count: count(task.id) })
        .from(task)
        .innerJoin(caseItem, eq(task.itemId, caseItem.id))
        .where(and(inArray(caseItem.caseId, caseIds), isNull(task.deletedAt), isNull(caseItem.deletedAt)))
        .groupBy(caseItem.caseId)
    : [];

  const countMap = new Map(taskCounts.map((c) => [c.caseId, c.count]));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    customerName: r.customerName,
    status: r.status as CaseListItem["status"],
    projectId: r.projectId,
    projectName: r.projectName,
    taskCount: countMap.get(r.id) ?? 0,
    createdBy: displayName(r.createdBy, r.createdByEmail ?? "unknown"),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function getCaseDetail(caseId: number): Promise<CaseDetail> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const caseRows = await db
    .select({
      id: supportCase.id,
      title: supportCase.title,
      description: supportCase.description,
      customerName: supportCase.customerName,
      status: supportCase.status,
      projectId: supportCase.projectId,
      projectName: project.name,
      createdByUserId: supportCase.createdByUserId,
      createdBy: user.name,
      createdByEmail: user.email,
      createdAt: supportCase.createdAt,
      updatedAt: supportCase.updatedAt,
    })
    .from(supportCase)
    .innerJoin(project, eq(supportCase.projectId, project.id))
    .leftJoin(user, eq(supportCase.createdByUserId, user.id))
    .where(and(eq(supportCase.id, caseId), isNull(supportCase.deletedAt)))
    .limit(1);

  if (caseRows.length === 0) {
    throw new Error("Case not found.");
  }

  const c = caseRows[0];

  const itemRows = await db
    .select({
      id: caseItem.id,
      caseId: caseItem.caseId,
      dateReported: caseItem.dateReported,
      description: caseItem.description,
      impact: caseItem.impact,
      severity: caseItem.severity,
      priority: caseItem.priority,
      classification: caseItem.classification,
      status: caseItem.status,
      relatedItemIds: caseItem.relatedItemIds,
      createdByUserId: caseItem.createdByUserId,
      createdBy: user.name,
      createdByEmail: user.email,
      createdAt: caseItem.createdAt,
      updatedAt: caseItem.updatedAt,
    })
    .from(caseItem)
    .leftJoin(user, eq(caseItem.createdByUserId, user.id))
    .where(and(eq(caseItem.caseId, caseId), isNull(caseItem.deletedAt)))
    .orderBy(asc(caseItem.createdAt));

  const itemIds = itemRows.map((i) => i.id);
  const taskRows = itemIds.length > 0
    ? await db
        .select({
          id: task.id,
          itemId: task.itemId,
          title: task.title,
          description: task.description,
          status: task.status,
          dueAt: task.dueAt,
          projectName: project.name,
          caseName: supportCase.title,
          itemName: caseItem.description,
          assigneeName: user.name,
        })
        .from(task)
        .innerJoin(caseItem, eq(task.itemId, caseItem.id))
        .innerJoin(supportCase, eq(caseItem.caseId, supportCase.id))
        .innerJoin(project, eq(supportCase.projectId, project.id))
        .leftJoin(user, eq(task.assigneeUserId, user.id))
        .where(
          and(
            inArray(task.itemId, itemIds),
            isNull(task.deletedAt),
          ),
        )
        .orderBy(desc(task.createdAt))
    : [];

  const commentsByTaskId = await listTaskCommentsByTaskId(
    taskRows.map((t) => t.id),
    currentUser.id,
  );

  const followMap = await listUserEntitySubscriptionState(
    "task",
    taskRows.map((t) => t.id),
  );

  const readAtByTaskId = await listTaskCommentReadAtByTaskId(
    taskRows.map((t) => t.id),
    currentUser.id,
  );

  const tasksByItem = new Map<number, TaskWorkflowItem[]>();
  for (const t of taskRows) {
    const taskComments = commentsByTaskId.get(t.id) ?? [];
    const taskItem: TaskWorkflowItem = {
      ...t,
      isFollowing: followMap.get(t.id) ?? false,
      comments: taskComments,
      unreadCommentCount: computeUnreadCommentCount(
        taskComments,
        readAtByTaskId.get(t.id) ?? null,
      ),
    };
    const list = tasksByItem.get(t.itemId) ?? [];
    list.push(taskItem);
    tasksByItem.set(t.itemId, list);
  }

  const items: ItemDetail[] = itemRows.map((i) => ({
    id: i.id,
    caseId: i.caseId,
    dateReported: i.dateReported,
    description: i.description,
    impact: i.impact,
    severity: i.severity,
    priority: i.priority,
    classification: i.classification,
    status: i.status,
    relatedItemIds: i.relatedItemIds,
    createdBy: displayName(i.createdBy, i.createdByEmail ?? "unknown"),
    createdByUserId: i.createdByUserId,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    tasks: tasksByItem.get(i.id) ?? [],
  }));

  return {
    id: c.id,
    title: c.title,
    description: c.description,
    customerName: c.customerName,
    status: c.status as CaseDetail["status"],
    projectId: c.projectId,
    projectName: c.projectName,
    createdBy: displayName(c.createdBy, c.createdByEmail ?? "unknown"),
    createdByUserId: c.createdByUserId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    items,
  };
}

export async function createCase(input: {
  projectId: number;
  title: string;
  description?: string;
  customerName?: string;
}): Promise<{ id: number }> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const title = input.title.trim();
  if (title.length < MIN_TITLE_LENGTH) {
    throw new Error(`Case title must be at least ${MIN_TITLE_LENGTH} characters.`);
  }

  await requireActiveProject(input.projectId);

  const timestamp = nowIso();
  const rows = await db
    .insert(supportCase)
    .values({
      projectId: input.projectId,
      title,
      description: input.description?.trim() || null,
      customerName: input.customerName?.trim() || null,
      status: "open",
      createdByUserId: currentUser.id,
      createdAt: timestamp,
      updatedAt: null,
      deletedAt: null,
    })
    .returning({ id: supportCase.id });

  if (rows.length === 0) {
    throw new Error("Unable to create case.");
  }

  await ensureEntitySubscriptions("case", rows[0].id, [currentUser.id]);
  publishRealtimeRefreshAll();

  return rows[0];
}

export async function updateCase(
  caseId: number,
  fields: {
    title?: string;
    description?: string;
    customerName?: string;
    status?: "open" | "in_progress" | "closed";
  },
): Promise<void> {
  await requireSessionUser();
  await ensureDbSchema();

  const existing = await db
    .select({ id: supportCase.id })
    .from(supportCase)
    .where(and(eq(supportCase.id, caseId), isNull(supportCase.deletedAt)))
    .limit(1);

  if (existing.length === 0) {
    throw new Error("Case not found.");
  }

  const updates: Record<string, unknown> = { updatedAt: nowIso() };

  if (fields.title !== undefined) {
    const trimmed = fields.title.trim();
    if (trimmed.length < MIN_TITLE_LENGTH) {
      throw new Error(`Case title must be at least ${MIN_TITLE_LENGTH} characters.`);
    }
    updates.title = trimmed;
  }
  if (fields.description !== undefined) {
    updates.description = fields.description?.trim() || null;
  }
  if (fields.customerName !== undefined) {
    updates.customerName = fields.customerName?.trim() || null;
  }
  if (fields.status !== undefined) {
    updates.status = fields.status;
  }

  await db.update(supportCase).set(updates).where(eq(supportCase.id, caseId));
  publishRealtimeRefreshAll();
}

export async function deleteCase(caseId: number): Promise<void> {
  await requireSessionUser();
  await ensureDbSchema();

  const existing = await db
    .select({ id: supportCase.id })
    .from(supportCase)
    .where(and(eq(supportCase.id, caseId), isNull(supportCase.deletedAt)))
    .limit(1);

  if (existing.length === 0) {
    throw new Error("Case not found.");
  }

  const timestamp = nowIso();

  await db.update(supportCase).set({ deletedAt: timestamp, updatedAt: timestamp }).where(eq(supportCase.id, caseId));

  const items = await db
    .select({ id: caseItem.id })
    .from(caseItem)
    .where(and(eq(caseItem.caseId, caseId), isNull(caseItem.deletedAt)));

  for (const item of items) {
    await db.update(caseItem).set({ deletedAt: timestamp, updatedAt: timestamp }).where(eq(caseItem.id, item.id));
    await db.update(task).set({ deletedAt: timestamp, updatedAt: timestamp }).where(eq(task.itemId, item.id));
  }

  publishRealtimeRefreshAll();
}

const PRIORITY_MATRIX: Record<string, Record<string, string>> = {
  many: { major: "P1", minor: "P1", degraded: "P2", none: "P3" },
  some: { major: "P1", minor: "P2", degraded: "P3", none: "P4" },
  one:  { major: "P2", minor: "P3", degraded: "P4", none: "P4" },
};

function computeItemPriority(impact: string, severity: string): string {
  return PRIORITY_MATRIX[impact]?.[severity] ?? "P4";
}

export async function createItem(input: {
  caseId: number;
  dateReported: string;
  description: string;
  impact: string;
  severity: string;
  classification: string;
  relatedItemIds?: number[];
}): Promise<{ id: number }> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const existingCase = await db
    .select({ id: supportCase.id })
    .from(supportCase)
    .where(and(eq(supportCase.id, input.caseId), isNull(supportCase.deletedAt)))
    .limit(1);

  if (existingCase.length === 0) {
    throw new Error("Case not found.");
  }

  const description = input.description.trim();
  if (description.length < 3) {
    throw new Error("Description must be at least 3 characters.");
  }

  const priority = computeItemPriority(input.impact, input.severity);
  const timestamp = nowIso();

  const rows = await db
    .insert(caseItem)
    .values({
      caseId: input.caseId,
      dateReported: input.dateReported,
      description,
      impact: input.impact as CaseItemImpact,
      severity: input.severity as CaseItemSeverity,
      priority: priority as CaseItemPriority,
      classification: input.classification.trim() || "bug",
      status: "rework" as CaseItemStatus,
      relatedItemIds: input.relatedItemIds?.length ? JSON.stringify(input.relatedItemIds) : null,
      createdByUserId: currentUser.id,
      createdAt: timestamp,
      updatedAt: null,
      deletedAt: null,
    })
    .returning({ id: caseItem.id });

  if (rows.length === 0) {
    throw new Error("Unable to create item.");
  }

  return rows[0];
}

export async function updateItem(
  itemId: number,
  fields: {
    dateReported?: string;
    description?: string;
    impact?: string;
    severity?: string;
    classification?: string;
    status?: string;
    relatedItemIds?: number[];
  },
): Promise<void> {
  await requireSessionUser();
  await ensureDbSchema();

  const existing = await db
    .select({ id: caseItem.id, impact: caseItem.impact, severity: caseItem.severity })
    .from(caseItem)
    .where(and(eq(caseItem.id, itemId), isNull(caseItem.deletedAt)))
    .limit(1);

  if (existing.length === 0) {
    throw new Error("Item not found.");
  }

  const updates: Record<string, unknown> = { updatedAt: nowIso() };

  if (fields.dateReported !== undefined) {
    updates.dateReported = fields.dateReported;
  }
  if (fields.description !== undefined) {
    const trimmed = fields.description.trim();
    if (trimmed.length < 3) {
      throw new Error("Description must be at least 3 characters.");
    }
    updates.description = trimmed;
  }
  if (fields.impact !== undefined) {
    updates.impact = fields.impact;
  }
  if (fields.severity !== undefined) {
    updates.severity = fields.severity;
  }
  if (fields.impact !== undefined || fields.severity !== undefined) {
    const impact = fields.impact ?? existing[0].impact;
    const severity = fields.severity ?? existing[0].severity;
    updates.priority = computeItemPriority(impact, severity);
  }
  if (fields.classification !== undefined) {
    updates.classification = fields.classification.trim() || "bug";
  }
  if (fields.status !== undefined) {
    updates.status = fields.status;
  }
  if (fields.relatedItemIds !== undefined) {
    updates.relatedItemIds = fields.relatedItemIds.length ? JSON.stringify(fields.relatedItemIds) : null;
  }

  await db.update(caseItem).set(updates).where(eq(caseItem.id, itemId));
  publishRealtimeRefreshAll();
}

export async function deleteItem(itemId: number): Promise<void> {
  await requireSessionUser();
  await ensureDbSchema();

  const existing = await db
    .select({ id: caseItem.id })
    .from(caseItem)
    .where(and(eq(caseItem.id, itemId), isNull(caseItem.deletedAt)))
    .limit(1);

  if (existing.length === 0) {
    throw new Error("Item not found.");
  }

  const timestamp = nowIso();

  await db.update(caseItem).set({ deletedAt: timestamp, updatedAt: timestamp }).where(eq(caseItem.id, itemId));
  await db.update(task).set({ deletedAt: timestamp, updatedAt: timestamp }).where(eq(task.itemId, itemId));

  publishRealtimeRefreshAll();
}

export async function getItemDetail(itemId: number): Promise<ItemDetail & { caseTitle: string; projectName: string }> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const itemRows = await db
    .select({
      id: caseItem.id,
      caseId: caseItem.caseId,
      caseTitle: supportCase.title,
      projectName: project.name,
      dateReported: caseItem.dateReported,
      description: caseItem.description,
      impact: caseItem.impact,
      severity: caseItem.severity,
      priority: caseItem.priority,
      classification: caseItem.classification,
      status: caseItem.status,
      relatedItemIds: caseItem.relatedItemIds,
      createdByUserId: caseItem.createdByUserId,
      createdBy: user.name,
      createdByEmail: user.email,
      createdAt: caseItem.createdAt,
      updatedAt: caseItem.updatedAt,
    })
    .from(caseItem)
    .innerJoin(supportCase, eq(caseItem.caseId, supportCase.id))
    .innerJoin(project, eq(supportCase.projectId, project.id))
    .leftJoin(user, eq(caseItem.createdByUserId, user.id))
    .where(and(eq(caseItem.id, itemId), isNull(caseItem.deletedAt)))
    .limit(1);

  if (itemRows.length === 0) {
    throw new Error("Item not found.");
  }

  const i = itemRows[0];

  const taskRows = await db
    .select({
      id: task.id,
      itemId: task.itemId,
      title: task.title,
      description: task.description,
      status: task.status,
      dueAt: task.dueAt,
      projectName: project.name,
      caseName: supportCase.title,
      itemName: caseItem.description,
      assigneeName: user.name,
    })
    .from(task)
    .innerJoin(caseItem, eq(task.itemId, caseItem.id))
    .innerJoin(supportCase, eq(caseItem.caseId, supportCase.id))
    .innerJoin(project, eq(supportCase.projectId, project.id))
    .leftJoin(user, eq(task.assigneeUserId, user.id))
    .where(
      and(
        eq(task.itemId, itemId),
        isNull(task.deletedAt),
      ),
    )
    .orderBy(desc(task.createdAt));

  const commentsByTaskId = await listTaskCommentsByTaskId(
    taskRows.map((t) => t.id),
    currentUser.id,
  );

  const followMap = await listUserEntitySubscriptionState(
    "task",
    taskRows.map((t) => t.id),
  );

  const readAtByTaskId = await listTaskCommentReadAtByTaskId(
    taskRows.map((t) => t.id),
    currentUser.id,
  );

  const tasks: TaskWorkflowItem[] = taskRows.map((t) => {
    const taskComments = commentsByTaskId.get(t.id) ?? [];
    return {
      ...t,
      isFollowing: followMap.get(t.id) ?? false,
      comments: taskComments,
      unreadCommentCount: computeUnreadCommentCount(
        taskComments,
        readAtByTaskId.get(t.id) ?? null,
      ),
    };
  });

  return {
    id: i.id,
    caseId: i.caseId,
    caseTitle: i.caseTitle,
    projectName: i.projectName,
    dateReported: i.dateReported,
    description: i.description,
    impact: i.impact,
    severity: i.severity,
    priority: i.priority,
    classification: i.classification,
    status: i.status,
    relatedItemIds: i.relatedItemIds,
    createdBy: displayName(i.createdBy, i.createdByEmail ?? "unknown"),
    createdByUserId: i.createdByUserId,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    tasks,
  };
}
