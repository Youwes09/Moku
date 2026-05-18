import { gql } from "@api/client";
import { GET_DOWNLOAD_STATUS } from "@api/queries";
import {
  START_DOWNLOADER, STOP_DOWNLOADER, CLEAR_DOWNLOADER,
  DEQUEUE_DOWNLOAD, DEQUEUE_CHAPTERS_DOWNLOAD,
  ENQUEUE_DOWNLOAD, REORDER_DOWNLOAD,
} from "@api/mutations";
import { addToast, setActiveDownloads, store, updateSettings } from "@store/state.svelte";
import { boot } from "@store/boot.svelte";
import type { DownloadStatus, DownloadQueueItem } from "@types/index";
import {
  toActiveDownloads, optimisticRemove, optimisticRemoveMany,
  isRunning, getErrored, calcSpeed, estimateEta,
  type SpeedSample,
} from "../lib/downloadQueue";
import { startAutoRetry, type AutoRetryHandle } from "../lib/autoRetry";

class DownloadStore {
  status:       DownloadStatus | null = $state(null);
  loading                             = $state(true);
  togglingPlay                        = $state(false);
  clearing                            = $state(false);
  dequeueing                          = $state(new Set<number>());
  selected                            = $state(new Set<number>());
  batchWorking                        = $state(false);
  pagesPerSec:  number | null         = $state(null);
  eta:          number | null         = $state(null);

  get toastsEnabled()    { return store.settings.downloadToastsEnabled ?? true; }
  get autoRetryEnabled() { return store.settings.downloadAutoRetry ?? false; }

  private lastSample:   SpeedSample | null   = null;
  private prevQueue:    DownloadQueueItem[]   = [];
  private autoRetryHnd: AutoRetryHandle | null = null;

  get queue()      { return this.status?.queue ?? []; }
  get isRunning()  { return isRunning(this.status?.state); }
  get erroredIds() { return new Set(getErrored(this.queue).map((i) => i.chapter.id)); }
  get hasErrored() { return this.erroredIds.size > 0; }

  toggleToasts() {
    const next = !this.toastsEnabled;
    updateSettings({ downloadToastsEnabled: next });
    addToast({ kind: "info", title: next ? "Notifications enabled" : "Notifications muted", body: next ? "You'll be notified when chapters finish downloading" : "Download notifications are silenced", duration: 2500 });
  }

  toggleAutoRetry() {
    if (this.autoRetryEnabled) {
      this.autoRetryHnd?.stop();
      this.autoRetryHnd = null;
      updateSettings({ downloadAutoRetry: false });
      addToast({ kind: "info", title: "Auto-retry disabled", body: "Failed downloads will no longer retry automatically", duration: 2500 });
    } else {
      updateSettings({ downloadAutoRetry: true });
      this.autoRetryHnd = startAutoRetry(
        () => this.queue,
        () => this.isRunning,
        () => this.retryAllErrored(),
      );
      addToast({ kind: "info", title: "Auto-retry enabled", body: "Errored downloads will retry automatically", duration: 3000 });
    }
  }

  detectTransitions(next: DownloadQueueItem[]) {
    if (!this.toastsEnabled) return;
    const nextMap = new Map(next.map(i => [i.chapter.id, i]));
    for (const item of this.prevQueue) {
      if (item.state !== "DOWNLOADING") continue;
      const nextItem = nextMap.get(item.chapter.id);
      const manga    = item.chapter.manga;
      const label    = manga ? `${manga.title} — ${item.chapter.name}` : item.chapter.name;
      if (!nextItem) {
        addToast({ kind: "download", title: "Chapter downloaded", body: label, duration: 4000 });
      } else if (nextItem.state === "ERROR") {
        addToast({ kind: "error", title: "Download failed", body: label, duration: 5000 });
      }
    }
    this.prevQueue = next.slice();
  }

  applyStatus(ds: DownloadStatus) {
    this.status = ds;
    setActiveDownloads(toActiveDownloads(ds.queue));
    this.updateSpeed(ds);
  }

  private updateSpeed(ds: DownloadStatus) {
    const active = ds.queue[0];
    if (!active || active.state !== "DOWNLOADING") {
      this.lastSample  = null;
      this.pagesPerSec = null;
      this.eta         = null;
      return;
    }
    const sample: SpeedSample = {
      ts:       Date.now(),
      progress: active.progress,
      pages:    active.chapter.pageCount ?? 0,
    };
    const speed = calcSpeed(this.lastSample, sample);
    this.lastSample = sample;
    if (speed !== null) {
      this.pagesPerSec = speed;
      this.eta         = estimateEta(speed, ds.queue);
    }
  }

  async poll() {
    if (boot.sessionExpired) return;
    gql<{ downloadStatus: DownloadStatus }>(GET_DOWNLOAD_STATUS)
      .then((d) => this.applyStatus(d.downloadStatus))
      .catch(console.error)
      .finally(() => { this.loading = false; });
  }

  async togglePlay() {
    if (this.togglingPlay) return;
    this.togglingPlay = true;
    const wasRunning = this.isRunning;
    if (this.status) this.status = { ...this.status, state: wasRunning ? "STOPPED" : "STARTED" };
    try {
      if (wasRunning) {
        const d = await gql<{ stopDownloader: { downloadStatus: DownloadStatus } }>(STOP_DOWNLOADER);
        this.applyStatus(d.stopDownloader.downloadStatus);
      } else {
        const d = await gql<{ startDownloader: { downloadStatus: DownloadStatus } }>(START_DOWNLOADER);
        this.applyStatus(d.startDownloader.downloadStatus);
      }
    } catch (e) { console.error(e); this.poll(); }
    finally {
      this.togglingPlay = false;
      addToast({ kind: "info", title: wasRunning ? "Downloads paused" : "Downloads resumed", body: wasRunning ? "The download queue has been paused" : "The download queue is running", duration: 2500 });
    }
  }

  async clear() {
    if (this.clearing) return;
    this.clearing = true;
    this.selected = new Set();
    if (this.status) this.status = { ...this.status, queue: [] };
    setActiveDownloads([]);
    try {
      const d = await gql<{ clearDownloader: { downloadStatus: DownloadStatus } }>(CLEAR_DOWNLOADER);
      this.applyStatus(d.clearDownloader.downloadStatus);
      addToast({ kind: "info", title: "Queue cleared", body: "All pending downloads have been removed", duration: 2500 });
    } catch (e) { console.error(e); this.poll(); }
    finally { this.clearing = false; }
  }

  async dequeue(chapterId: number) {
    if (this.dequeueing.has(chapterId)) return;
    this.dequeueing = new Set(this.dequeueing).add(chapterId);
    if (this.status) this.status = { ...this.status, queue: optimisticRemove(this.status.queue, chapterId) };
    this.selected.delete(chapterId);
    this.selected = new Set(this.selected);
    try { await gql(DEQUEUE_DOWNLOAD, { chapterId }); this.poll(); }
    catch (e) { console.error(e); this.poll(); }
    finally { this.dequeueing.delete(chapterId); this.dequeueing = new Set(this.dequeueing); }
  }

  async dequeueSelected() {
    if (this.batchWorking || this.selected.size === 0) return;
    this.batchWorking = true;
    const ids = [...this.selected];
    if (this.status) this.status = { ...this.status, queue: optimisticRemoveMany(this.status.queue, this.selected) };
    this.selected = new Set();
    try {
      await gql(DEQUEUE_CHAPTERS_DOWNLOAD, { chapterIds: ids });
      this.poll();
      addToast({ kind: "info", title: `Removed ${ids.length} download${ids.length !== 1 ? "s" : ""}`, body: "Selected items have been removed from the queue", duration: 2500 });
    } catch (e) { console.error(e); this.poll(); }
    finally { this.batchWorking = false; }
  }

  async retryOne(chapterId: number) {
    if (this.dequeueing.has(chapterId)) return;
    this.dequeueing = new Set(this.dequeueing).add(chapterId);
    try {
      await gql(DEQUEUE_DOWNLOAD, { chapterId });
      await gql(ENQUEUE_DOWNLOAD, { chapterId });
      this.poll();
    } catch (e) { console.error(e); this.poll(); }
    finally { this.dequeueing.delete(chapterId); this.dequeueing = new Set(this.dequeueing); }
  }

  async retryAllErrored() {
    if (this.batchWorking || !this.hasErrored) return;
    this.batchWorking = true;
    const ids = [...this.erroredIds];
    try {
      await gql(DEQUEUE_CHAPTERS_DOWNLOAD, { chapterIds: ids });
      for (const id of ids) await gql(ENQUEUE_DOWNLOAD, { chapterId: id });
      this.poll();
      addToast({ kind: "info", title: `Retrying ${ids.length} failed download${ids.length !== 1 ? "s" : ""}`, duration: 3000 });
    } catch (e) { console.error(e); this.poll(); }
    finally { this.batchWorking = false; }
  }

  async retrySelected() {
    if (this.batchWorking || this.selected.size === 0) return;
    this.batchWorking = true;
    const ids     = [...this.selected].filter((id) => this.erroredIds.has(id));
    this.selected = new Set();
    try {
      if (ids.length > 0) {
        await gql(DEQUEUE_CHAPTERS_DOWNLOAD, { chapterIds: ids });
        for (const id of ids) await gql(ENQUEUE_DOWNLOAD, { chapterId: id });
        addToast({ kind: "info", title: `Retrying ${ids.length} failed download${ids.length !== 1 ? "s" : ""}`, duration: 3000 });
      }
      this.poll();
    } catch (e) { console.error(e); this.poll(); }
    finally { this.batchWorking = false; }
  }

  async reorder(chapterId: number, direction: "up" | "down") {
    const idx = this.queue.findIndex((i) => i.chapter.id === chapterId);
    if (idx === -1) return;
    const to = direction === "up" ? idx - 1 : idx + 1;
    if (to < 0 || to >= this.queue.length) return;
    const newQueue = [...this.queue];
    [newQueue[idx], newQueue[to]] = [newQueue[to], newQueue[idx]];
    if (this.status) this.status = { ...this.status, queue: newQueue };
    try {
      const d = await gql<{ reorderChapterDownload: { downloadStatus: DownloadStatus } }>(
        REORDER_DOWNLOAD, { chapterId, to },
      );
      this.applyStatus(d.reorderChapterDownload.downloadStatus);
    } catch (e) { console.error(e); this.poll(); }
  }

  async reorderSelected(direction: "up" | "down") {
    if (this.batchWorking || this.selected.size === 0) return;
    this.batchWorking = true;

    const queue           = [...this.queue];
    const selectedIndices = queue
      .map((item, i) => ({ id: item.chapter.id, i }))
      .filter(({ id }) => this.selected.has(id))
      .map(({ i }) => i)
      .sort((a, b) => direction === "up" ? a - b : b - a);

    if (direction === "up"   && selectedIndices[0] === 0)                { this.batchWorking = false; return; }
    if (direction === "down" && selectedIndices[0] === queue.length - 1) { this.batchWorking = false; return; }

    const newQueue = [...queue];
    for (const idx of selectedIndices) {
      const to = direction === "up" ? idx - 1 : idx + 1;
      if (to < 0 || to >= newQueue.length) break;
      [newQueue[idx], newQueue[to]] = [newQueue[to], newQueue[idx]];
    }
    if (this.status) this.status = { ...this.status, queue: newQueue };

    try {
      for (const idx of selectedIndices) {
        const to = direction === "up" ? idx - 1 : idx + 1;
        if (to < 0 || to >= queue.length) break;
        const chapterId = queue[idx].chapter.id;
        await gql<{ reorderChapterDownload: { downloadStatus: DownloadStatus } }>(
          REORDER_DOWNLOAD, { chapterId, to },
        );
      }
      this.poll();
    } catch (e) { console.error(e); this.poll(); }
    finally { this.batchWorking = false; }
  }

  async reorderToEdge(chapterId: number, edge: "top" | "bottom") {
    const idx = this.queue.findIndex((i) => i.chapter.id === chapterId);
    if (idx === -1) return;
    const first = this.isRunning ? 1 : 0;
    const last  = this.queue.length - 1;
    const to    = edge === "top" ? first : last;
    if (idx === to) return;
    const newQueue = [...this.queue];
    newQueue.splice(idx, 1);
    newQueue.splice(to, 0, this.queue[idx]);
    if (this.status) this.status = { ...this.status, queue: newQueue };
    try {
      const d = await gql<{ reorderChapterDownload: { downloadStatus: DownloadStatus } }>(
        REORDER_DOWNLOAD, { chapterId, to },
      );
      this.applyStatus(d.reorderChapterDownload.downloadStatus);
    } catch (e) { console.error(e); this.poll(); }
  }

  async reorderSelectedToEdge(edge: "top" | "bottom") {
    if (this.batchWorking || this.selected.size === 0) return;
    this.batchWorking = true;

    const first    = this.isRunning ? 1 : 0;
    const active   = this.queue.slice(0, first);
    const moveable = this.queue.slice(first);
    const pinned   = moveable.filter((i) => this.selected.has(i.chapter.id));
    const rest     = moveable.filter((i) => !this.selected.has(i.chapter.id));
    const newQueue = edge === "top"
      ? [...active, ...pinned, ...rest]
      : [...active, ...rest, ...pinned];
    if (this.status) this.status = { ...this.status, queue: newQueue };

    const last = this.queue.length - 1;

    try {
      if (edge === "top") {
        for (let i = 0; i < pinned.length; i++) {
          await gql<{ reorderChapterDownload: { downloadStatus: DownloadStatus } }>(
            REORDER_DOWNLOAD, { chapterId: pinned[i].chapter.id, to: first + i },
          );
        }
      } else {
        for (let i = 0; i < pinned.length; i++) {
          await gql<{ reorderChapterDownload: { downloadStatus: DownloadStatus } }>(
            REORDER_DOWNLOAD, { chapterId: pinned[i].chapter.id, to: last - (pinned.length - 1 - i) },
          );
        }
      }
      this.poll();
    } catch (e) { console.error(e); this.poll(); }
    finally { this.batchWorking = false; }
  }

  selectOnly(chapterId: number)   { this.selected = new Set([chapterId]); }
  toggleSelect(chapterId: number) {
    const next = new Set(this.selected);
    if (next.has(chapterId)) next.delete(chapterId);
    else next.add(chapterId);
    this.selected = next;
  }

  selectRange(fromId: number, toId: number) {
    const ids      = this.queue.map((i) => i.chapter.id);
    const a        = ids.indexOf(fromId), b = ids.indexOf(toId);
    if (a === -1 || b === -1) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const next     = new Set(this.selected);
    for (let i = lo; i <= hi; i++) next.add(ids[i]);
    this.selected = next;
  }

  selectAll()      { this.selected = new Set(this.queue.map((i) => i.chapter.id)); }
  clearSelection() { this.selected = new Set(); }
}

export const downloadStore = new DownloadStore();