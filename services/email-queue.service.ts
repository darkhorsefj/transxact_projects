"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import db, { ensureDbSchema } from "@/db/connection";
import {
  notificationDeliveryLog,
  notificationEmailQueue,
  type NotificationCategory,
} from "@/db/schema";
import { createUnifiedEmailContent, sendEmail } from "./email.service";
import { publishRealtimeRefresh } from "./realtime.service";
import { nowIso } from "@/lib/utils";
import { MAX_EMAIL_ATTEMPTS, EMAIL_RETRY_MINUTES } from "@/lib/constants";

function toAbsoluteUrl(path: string): string {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    return path;
  }

  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function logNotificationDelivery(
  input: {
    notificationId?: number;
    userId: number;
    channel: "in_app" | "email";
    status: "delivered" | "failed" | "read";
    metadata?: string;
  },
): Promise<void> {
  await db.insert(notificationDeliveryLog).values({
    notificationId: input.notificationId ?? null,
    userId: input.userId,
    channel: input.channel,
    status: input.status,
    metadata: input.metadata ?? null,
    createdAt: nowIso(),
  });
}

export async function queueNotificationEmail(
  input: {
    notificationId: number;
    userId: number;
    toEmail: string;
    title: string;
    body: string | null;
    href: string;
    category: NotificationCategory;
    emailDelayMinutes: number;
  },
): Promise<void> {
  const managePreferencesUrl = toAbsoluteUrl("/notifications");
  const destinationUrl = toAbsoluteUrl(input.href);
  const subject = `Transxact: ${input.title}`;
  const content = createUnifiedEmailContent({
    headline: input.title,
    messageLines: [
      input.body ?? "You have a new update in Transxact Projects.",
    ],
    actionLabel: "View in Transxact",
    actionUrl: destinationUrl,
    footerLines: [
      `Adjust your notification preferences: ${managePreferencesUrl}`,
      `Category: ${input.category}`,
    ],
    previewText: input.body ?? input.title,
  });

  const queuedAt = new Date();
  const sendAfterAt = new Date(
    queuedAt.getTime() + input.emailDelayMinutes * 60 * 1000,
  ).toISOString();
  const createdAt = queuedAt.toISOString();

  await db.insert(notificationEmailQueue).values({
    notificationId: input.notificationId,
    userId: input.userId,
    toEmail: input.toEmail,
    subject,
    textBody: content.text,
    htmlBody: content.html,
    status: "pending",
    attempts: 0,
    sendAfterAt,
    sentAt: null,
    lastError: null,
    createdAt,
    updatedAt: createdAt,
  });
}

export async function processPendingEmailQueue(
  limit = 20,
): Promise<{ sent: number; failed: number; retried: number }> {
  await ensureDbSchema();

  const now = new Date();
  const nowAsIso = now.toISOString();
  const queuedEmails = await db
    .select({
      id: notificationEmailQueue.id,
      notificationId: notificationEmailQueue.notificationId,
      userId: notificationEmailQueue.userId,
      toEmail: notificationEmailQueue.toEmail,
      subject: notificationEmailQueue.subject,
      textBody: notificationEmailQueue.textBody,
      htmlBody: notificationEmailQueue.htmlBody,
      attempts: notificationEmailQueue.attempts,
    })
    .from(notificationEmailQueue)
    .where(
      and(
        eq(notificationEmailQueue.status, "pending"),
        sql`${notificationEmailQueue.sendAfterAt} <= ${nowAsIso}`,
      ),
    )
    .orderBy(asc(notificationEmailQueue.sendAfterAt))
    .limit(limit);

  let sent = 0;
  let failed = 0;
  let retried = 0;
  const touchedUsers = new Set<number>();

  for (const queued of queuedEmails) {
    try {
      await sendEmail({
        to: queued.toEmail,
        subject: queued.subject,
        text: queued.textBody,
        html: queued.htmlBody ?? undefined,
      });

      const sentAt = nowIso();
      await db
        .update(notificationEmailQueue)
        .set({
          status: "sent",
          sentAt,
          updatedAt: sentAt,
          lastError: null,
        })
        .where(eq(notificationEmailQueue.id, queued.id));

      await logNotificationDelivery({
        notificationId: queued.notificationId,
        userId: queued.userId,
        channel: "email",
        status: "delivered",
      });

      sent += 1;
      touchedUsers.add(queued.userId);
    } catch (error) {
      const nextAttempts = queued.attempts + 1;
      const exhausted = nextAttempts >= MAX_EMAIL_ATTEMPTS;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown email delivery error.";
      const updatedAt = nowIso();

      if (exhausted) {
        await db
          .update(notificationEmailQueue)
          .set({
            status: "failed",
            attempts: nextAttempts,
            lastError: errorMessage,
            updatedAt,
          })
          .where(eq(notificationEmailQueue.id, queued.id));
        failed += 1;
      } else {
        const delayMinutes = EMAIL_RETRY_MINUTES[nextAttempts - 1] ?? 30;
        const retryAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
        await db
          .update(notificationEmailQueue)
          .set({
            status: "pending",
            attempts: nextAttempts,
            sendAfterAt: retryAt,
            lastError: errorMessage,
            updatedAt,
          })
          .where(eq(notificationEmailQueue.id, queued.id));
        retried += 1;
      }

      await logNotificationDelivery({
        notificationId: queued.notificationId,
        userId: queued.userId,
        channel: "email",
        status: "failed",
        metadata: errorMessage,
      });
    }
  }

  if (touchedUsers.size > 0) {
    publishRealtimeRefresh([...touchedUsers]);
  }

  return { sent, failed, retried };
}

export async function processPendingEmailQueueWithWorker(
  limit = 20,
): Promise<{ sent: number; failed: number; retried: number }> {
  const { Worker } = await import("worker_threads");
  const path = await import("path");

  return new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve("workers/emailQueue.worker.ts"), {
      execArgv: ["--import", "tsx"],
    });

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("Email queue worker timed out after 60s"));
    }, 60_000);

    worker.on("message", (msg: { type: string; sent?: number; failed?: number; retried?: number; message?: string; touchedUserIds?: number[] }) => {
      if (msg.type === "result") {
        clearTimeout(timeout);
        if (msg.touchedUserIds && msg.touchedUserIds.length > 0) {
          publishRealtimeRefresh(msg.touchedUserIds);
        }
        resolve({
          sent: msg.sent ?? 0,
          failed: msg.failed ?? 0,
          retried: msg.retried ?? 0,
        });
      }
    });

    worker.on("error", (error: Error) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(error);
    });

    worker.postMessage({ type: "process", limit });
  });
}
