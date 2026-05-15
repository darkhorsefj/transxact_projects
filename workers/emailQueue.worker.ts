import "dotenv/config";
import { parentPort } from "worker_threads";
import { eq, and, asc, sql } from "drizzle-orm";
import db, { ensureDbSchema } from "../db/connection";
import {
  notificationEmailQueue,
  notificationDeliveryLog,
} from "../db/schema";
import { sendEmail } from "../services/email.service";
import { nowIso } from "../lib/utils";
import { MAX_EMAIL_ATTEMPTS, EMAIL_RETRY_MINUTES } from "../lib/constants";

async function processQueue(limit: number): Promise<{
  sent: number;
  failed: number;
  retried: number;
  touchedUserIds: number[];
}> {
  await ensureDbSchema();

  const nowAsIso = nowIso();
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

      await db.insert(notificationDeliveryLog).values({
        notificationId: queued.notificationId,
        userId: queued.userId,
        channel: "email",
        status: "delivered",
        createdAt: sentAt,
      });

      sent += 1;
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

      await db.insert(notificationDeliveryLog).values({
        notificationId: queued.notificationId,
        userId: queued.userId,
        channel: "email",
        status: "failed",
        metadata: errorMessage,
        createdAt: updatedAt,
      });
    }
  }

  return {
    sent,
    failed,
    retried,
    touchedUserIds: [...new Set(queuedEmails.map((e) => e.userId))],
  };
}

parentPort?.on("message", async (msg: { type: string; limit?: number }) => {
  if (msg.type === "process") {
    try {
      const result = await processQueue(msg.limit ?? 20);
      parentPort?.postMessage({ type: "result", ...result });
    } catch (error) {
      parentPort?.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : "Worker error",
      });
    }
  }
});
