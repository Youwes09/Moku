import type { DownloadQueueItem } from "@types/index";

const RETRY_DELAY_MS = 20_000;

export interface AutoRetryHandle {
  stop: () => void;
}

export function startAutoRetry(
  getQueue:    () => DownloadQueueItem[],
  isRunning:   () => boolean,
  retryErrored: () => Promise<void>,
): AutoRetryHandle {
  let stopped = false;
  let timer:   ReturnType<typeof setTimeout> | null = null;

  async function tick() {
    if (stopped) return;

    const queue   = getQueue();
    const errored = queue.filter(i => i.state === "ERROR");
    const active  = queue.filter(i => i.state !== "ERROR");

    if (errored.length > 0 && active.length === 0 && !isRunning()) {
      await retryErrored().catch(() => {});
    }

    if (!stopped) timer = setTimeout(tick, RETRY_DELAY_MS);
  }

  timer = setTimeout(tick, RETRY_DELAY_MS);

  return {
    stop() {
      stopped = true;
      if (timer !== null) { clearTimeout(timer); timer = null; }
    },
  };
}