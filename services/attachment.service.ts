"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import db, { ensureDbSchema } from "@/db/connection";
import { workItemAttachment } from "@/db/schema";
import { requireSessionUser } from "./session.service";

const UPLOAD_DIR = path.join(process.cwd(), "private", "uploads", "attachments");
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/gzip",
  "application/json",
]);

export interface AttachmentItem {
  id: number;
  taskId: number | null;
  issueId: number | null;
  actionId: number | null;
  commentId: number | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: number;
  createdAt: string;
}

export interface AttachmentUploadResult {
  id: number;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
}

async function ensureUploadDir(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

export async function uploadAttachment(
  file: File,
  taskId?: number,
  issueId?: number,
  actionId?: number,
  commentId?: number,
): Promise<AttachmentUploadResult> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();
  await ensureUploadDir();

  if (!taskId && !issueId && !actionId && !commentId) {
    throw new Error("Attachment must belong to a task, issue, action, or comment.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File size exceeds 10 MB limit.");
  }

  if (!ALLOWED_MIME_TYPES.has(file.type) && !file.type.startsWith("image/")) {
    throw new Error(`File type "${file.type}" is not allowed.`);
  }

  const ext = path.extname(file.name);
  const storedName = `${randomUUID()}${ext}`;
  const storagePath = storedName;
  const fullPath = path.join(UPLOAD_DIR, storedName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer);

  const now = new Date().toISOString();
  const rows = await db
    .insert(workItemAttachment)
    .values({
      taskId: taskId ?? null,
      issueId: issueId ?? null,
      actionId: actionId ?? null,
      commentId: commentId ?? null,
      uploadedByUserId: currentUser.id,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      storagePath,
      createdAt: now,
    })
    .returning({ id: workItemAttachment.id, fileName: workItemAttachment.fileName, sizeBytes: workItemAttachment.sizeBytes, mimeType: workItemAttachment.mimeType });

  return rows[0];
}

export async function getAttachmentById(id: number): Promise<{
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  taskId: number | null;
  issueId: number | null;
  actionId: number | null;
  commentId: number | null;
  uploadedByUserId: number;
  createdAt: string;
} | null> {
  await ensureDbSchema();
  const rows = await db
    .select()
    .from(workItemAttachment)
    .where(and(eq(workItemAttachment.id, id), isNull(workItemAttachment.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getFilePath(storagePath: string): Promise<string> {
  return path.join(UPLOAD_DIR, storagePath);
}

export async function deleteAttachment(id: number): Promise<void> {
  const currentUser = await requireSessionUser();
  await ensureDbSchema();

  const rows = await db
    .select()
    .from(workItemAttachment)
    .where(eq(workItemAttachment.id, id))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Attachment not found.");
  }

  const attachment = rows[0];
  if (attachment.uploadedByUserId !== currentUser.id) {
    throw new Error("You can only delete your own attachments.");
  }

  const now = new Date().toISOString();
  await db
    .update(workItemAttachment)
    .set({ deletedAt: now })
    .where(eq(workItemAttachment.id, id));

  try {
    await unlink(path.join(UPLOAD_DIR, attachment.storagePath));
  } catch {
    // file already gone
  }
}

export async function listAttachmentsByTask(taskId: number): Promise<AttachmentItem[]> {
  await ensureDbSchema();
  return db
    .select({
      id: workItemAttachment.id,
      taskId: workItemAttachment.taskId,
      issueId: workItemAttachment.issueId,
      actionId: workItemAttachment.actionId,
      commentId: workItemAttachment.commentId,
      fileName: workItemAttachment.fileName,
      mimeType: workItemAttachment.mimeType,
      sizeBytes: workItemAttachment.sizeBytes,
      uploadedByUserId: workItemAttachment.uploadedByUserId,
      createdAt: workItemAttachment.createdAt,
    })
    .from(workItemAttachment)
    .where(and(eq(workItemAttachment.taskId, taskId), isNull(workItemAttachment.deletedAt)))
    .orderBy(desc(workItemAttachment.createdAt));
}

export async function listAttachmentsByIssue(issueId: number): Promise<AttachmentItem[]> {
  await ensureDbSchema();
  return db
    .select({
      id: workItemAttachment.id,
      taskId: workItemAttachment.taskId,
      issueId: workItemAttachment.issueId,
      actionId: workItemAttachment.actionId,
      commentId: workItemAttachment.commentId,
      fileName: workItemAttachment.fileName,
      mimeType: workItemAttachment.mimeType,
      sizeBytes: workItemAttachment.sizeBytes,
      uploadedByUserId: workItemAttachment.uploadedByUserId,
      createdAt: workItemAttachment.createdAt,
    })
    .from(workItemAttachment)
    .where(and(eq(workItemAttachment.issueId, issueId), isNull(workItemAttachment.deletedAt)))
    .orderBy(desc(workItemAttachment.createdAt));
}

export async function listAttachmentsByAction(actionId: number): Promise<AttachmentItem[]> {
  await ensureDbSchema();
  return db
    .select({
      id: workItemAttachment.id,
      taskId: workItemAttachment.taskId,
      issueId: workItemAttachment.issueId,
      actionId: workItemAttachment.actionId,
      commentId: workItemAttachment.commentId,
      fileName: workItemAttachment.fileName,
      mimeType: workItemAttachment.mimeType,
      sizeBytes: workItemAttachment.sizeBytes,
      uploadedByUserId: workItemAttachment.uploadedByUserId,
      createdAt: workItemAttachment.createdAt,
    })
    .from(workItemAttachment)
    .where(and(eq(workItemAttachment.actionId, actionId), isNull(workItemAttachment.deletedAt)))
    .orderBy(desc(workItemAttachment.createdAt));
}

export async function listAttachmentsByComment(commentId: number): Promise<AttachmentItem[]> {
  await ensureDbSchema();
  return db
    .select({
      id: workItemAttachment.id,
      taskId: workItemAttachment.taskId,
      issueId: workItemAttachment.issueId,
      actionId: workItemAttachment.actionId,
      commentId: workItemAttachment.commentId,
      fileName: workItemAttachment.fileName,
      mimeType: workItemAttachment.mimeType,
      sizeBytes: workItemAttachment.sizeBytes,
      uploadedByUserId: workItemAttachment.uploadedByUserId,
      createdAt: workItemAttachment.createdAt,
    })
    .from(workItemAttachment)
    .where(and(eq(workItemAttachment.commentId, commentId), isNull(workItemAttachment.deletedAt)))
    .orderBy(desc(workItemAttachment.createdAt));
}
