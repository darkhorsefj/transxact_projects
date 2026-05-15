type RealtimePayload = {
  type: "refresh";
  at: string;
};

type RealtimeConnections = Map<number, Set<ReadableStreamDefaultController<Uint8Array>>>;

const encoder = new TextEncoder();

function getRealtimeConnections(): RealtimeConnections {
  const globalStore = globalThis as typeof globalThis & {
    __transxactRealtimeConnections?: RealtimeConnections;
  };

  if (!globalStore.__transxactRealtimeConnections) {
    globalStore.__transxactRealtimeConnections = new Map();
  }

  return globalStore.__transxactRealtimeConnections;
}

function sendSseEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  eventName: string,
  payload: RealtimePayload,
): boolean {
  try {
    controller.enqueue(
      encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`),
    );
    return true;
  } catch {
    return false;
  }
}

function sendSseComment(
  controller: ReadableStreamDefaultController<Uint8Array>,
  comment: string,
): boolean {
  try {
    controller.enqueue(encoder.encode(`: ${comment}\n\n`));
    return true;
  } catch {
    return false;
  }
}

function removeController(
  userId: number,
  controller: ReadableStreamDefaultController<Uint8Array>,
): void {
  const connections = getRealtimeConnections();
  const userConnections = connections.get(userId);
  if (!userConnections) {
    return;
  }

  userConnections.delete(controller);
  if (userConnections.size === 0) {
    connections.delete(userId);
  }
}

export function createRealtimeStream(
  userId: number,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const connections = getRealtimeConnections();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const existing = connections.get(userId) ?? new Set();
      existing.add(controller);
      connections.set(userId, existing);

      sendSseEvent(controller, "ready", { type: "refresh", at: new Date().toISOString() });
      const heartbeatInterval = setInterval(() => {
        if (!sendSseComment(controller, "heartbeat")) {
          clearInterval(heartbeatInterval);
          removeController(userId, controller);
        }
      }, 25000);

      const handleAbort = (): void => {
        clearInterval(heartbeatInterval);
        removeController(userId, controller);
      };

      signal.addEventListener("abort", handleAbort);
    },
    cancel() {
      // AbortSignal listener handles cleanup for disconnected clients.
    },
  });
}

export function publishRealtimeRefresh(userIds: number[]): void {
  const uniqueUserIds = new Set(userIds);
  if (uniqueUserIds.size === 0) {
    return;
  }

  const connections = getRealtimeConnections();
  const payload: RealtimePayload = { type: "refresh", at: new Date().toISOString() };

  for (const userId of uniqueUserIds) {
    const userConnections = connections.get(userId);
    if (!userConnections) {
      continue;
    }

    for (const controller of userConnections) {
      const sent = sendSseEvent(controller, "refresh", payload);
      if (!sent) {
        removeController(userId, controller);
      }
    }
  }
}

export function publishRealtimeRefreshAll(): void {
  const connections = getRealtimeConnections();
  if (connections.size === 0) {
    return;
  }

  const payload: RealtimePayload = { type: "refresh", at: new Date().toISOString() };

  for (const [userId, userConnections] of connections) {
    for (const controller of userConnections) {
      const sent = sendSseEvent(controller, "refresh", payload);
      if (!sent) {
        removeController(userId, controller);
      }
    }
  }
}
