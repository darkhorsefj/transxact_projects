const POLL_INTERVAL_MS = 60_000;
const BATCH_LIMIT = 20;

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startEmailQueueProcessor(): void {
  if (intervalHandle) return;

  intervalHandle = setInterval(async () => {
    try {
      const [{ processPendingEmailQueue }, { notifyOverdueTasks }] =
        await Promise.all([
          import("./email-queue.service"),
          import("./notification.service"),
        ]);

      const [emailResult, overdueCount] = await Promise.all([
        processPendingEmailQueue(BATCH_LIMIT),
        notifyOverdueTasks(),
      ]);

      if (
        emailResult.sent > 0 ||
        emailResult.failed > 0 ||
        emailResult.retried > 0
      ) {
        console.log(
          `[background] Email queue: ${emailResult.sent} sent, ${emailResult.failed} failed, ${emailResult.retried} retried`,
        );
      }

      if (overdueCount > 0) {
        console.log(`[background] Overdue notifications: ${overdueCount} tasks`);
      }
    } catch {
      // Silently handle — failures are already logged by the individual functions
    }
  }, POLL_INTERVAL_MS);

  // Don't keep the process alive just for this interval
  if (intervalHandle && typeof intervalHandle === "object" && "unref" in intervalHandle) {
    intervalHandle.unref();
  }

  console.log(`[background] Email queue processor started (poll every ${POLL_INTERVAL_MS / 1000}s)`);
}

export function stopEmailQueueProcessor(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[background] Email queue processor stopped");
  }
}
