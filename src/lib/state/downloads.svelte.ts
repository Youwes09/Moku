import type { Download, DownloaderStatus, Chapter } from "$lib/server-adapters/types";
import { tsunagu } from "$lib/server-adapters/tsunagu";
import { settingsState, updateSettings } from "$lib/state/settings.svelte";
import { addToast }                      from "$lib/state/notifications.svelte";
import { libraryState }                  from "$lib/state/library.svelte";
import { seriesState }                   from "$lib/state/series.svelte";
import {
  isRunning, getErrored, calcSpeed, estimateEta, estimateQueueBytes,
  type SpeedSample,
} from "$lib/components/downloads/lib/downloadQueue";
import { startAutoRetry, type AutoRetryHandle } from "$lib/components/downloads/lib/autoRetry";
import { mount, unmount }                        from "svelte";
import StorageWarningDialog                       from "$lib/components/downloads/StorageWarningDialog.svelte";

function fakeChapter(chapterId: string, mediaId: string): Chapter {
  return {
    id: chapterId, mediaId, externalId: "", title: null, number: null, scanlator: null,
    sourceOrder: null, uploadedAt: null, completed: false, downloaded: false, readingProgress: null, download: null, pages: null, pageCount: 0, videoUrl: null,
  };
}

class DownloadStore {
  queue:         Download[] = $state([]);
  completed:     Download[] = $state([]);
  downloaderStatusVal: DownloaderStatus | null = $state(null);
  loading                              = $state(true);
  togglingPlay                         = $state(false);
  clearing                             = $state(false);
  dequeueing                           = $state(new Set<string>());
  selected                             = $state(new Set<string>());
  batchWorking                         = $state(false);
  pagesPerSec:   number | null         = $state(null);
  eta:           number | null         = $state(null);
  storageWarning                       = $state(false);
  drawerOpen                           = $state(false);

  private freeBytes:    number | null      = null;
  private lastSample:   SpeedSample | null = null;
  private prevQueue:    Download[] = [];
  private autoRetryHnd: AutoRetryHandle | null = null;

  get isRunning()        { return isRunning(this.downloaderStatusVal); }
  get erroredIds()       { return new Set(getErrored(this.queue).map(i => i.chapterId)); }
  get hasErrored()       { return this.erroredIds.size > 0; }
  get toastsEnabled()    { return settingsState.settings.downloadToastsEnabled ?? true; }
  get autoRetryEnabled() { return settingsState.settings.downloadAutoRetry ?? false; }

  private mangaTitleFor(libraryEntryId: string): string {
    return libraryState.items.find(m => m.id === libraryEntryId)?.title ?? "Unknown series";
  }

  private mediaIdFor(chapterId: string): string {
    return (this.queue.find(i => i.chapterId === chapterId)
      ?? this.completed.find(i => i.chapterId === chapterId))?.mediaId ?? "";
  }

  private updateSpeed() {
    const active = this.queue[0];
    if (!active || active.status !== "DOWNLOADING") {
      this.lastSample = null; this.pagesPerSec = null; this.eta = null;
      return;
    }
    const sample: SpeedSample = { ts: Date.now(), progress: active.progress, pages: active.chapter.pageCount ?? 0 };
    const speed = calcSpeed(this.lastSample, sample);
    this.lastSample = sample;
    if (speed !== null) { this.pagesPerSec = speed; this.eta = estimateEta(speed, this.queue); }
  }

  private async syncFreeBytes() {
    const path = settingsState.settings.serverDownloadsPath ?? "";
    if (!path) return;
    try {
      const info = await tsunagu.storageInfo();
      this.freeBytes      = info.freeBytes;
      this.storageWarning = estimateQueueBytes(this.queue) > info.freeBytes * 0.95;
    } catch { }
  }

  private confirmStorageOverrun(): Promise<boolean> {
    return new Promise(resolve => {
      const target = document.createElement("div");
      document.body.appendChild(target);
      const instance = mount(StorageWarningDialog, {
        target,
        props: {
          onConfirm: () => { unmount(instance); target.remove(); resolve(true);  },
          onCancel:  () => { unmount(instance); target.remove(); resolve(false); },
        },
      });
    });
  }

  private async guardStorage(queueAfter: Download[]): Promise<boolean> {
    if (this.freeBytes === null) return true;
    if (estimateQueueBytes(queueAfter) <= this.freeBytes * 0.95) return true;
    return this.confirmStorageOverrun();
  }

  detectTransitions(next: Download[], done: Download[]) {
    const nextMap = new Map(next.map(i => [i.chapterId, i]));
    const doneSet = new Set(done.map(i => i.chapterId));
    const toasts  = this.toastsEnabled;
    for (const item of this.prevQueue) {
      if (item.status !== "DOWNLOADING") continue;
      const nextItem  = nextMap.get(item.chapterId);
      const completed = !nextItem && doneSet.has(item.chapterId);
      if (completed) libraryState.patchDownloadCount(item.mediaId, 1);
      if (!toasts) continue;
      const label = `${this.mangaTitleFor(item.mediaId)} — ${item.chapter.title ?? "Chapter"}`;
      if (completed)                          addToast({ kind: "download", title: "Chapter downloaded", body: label, duration: 4000 });
      else if (nextItem?.status === "FAILED") addToast({ kind: "error",    title: "Download failed",    body: label, duration: 5000 });
    }
    this.prevQueue = next.slice();
  }

  async tickStatus() {
    try {
      const status = await tsunagu.downloaderStatus();
      this.downloaderStatusVal = status;
      const active =
        status.isRunning ||
        status.queuedCount > 0 ||
        status.downloadingCount > 0 ||
        status.failedCount > 0;
      if (active || this.drawerOpen || this.wasActive) await this.poll();
      this.wasActive = active;
    } catch { } finally {
      this.loading = false;
    }
  }
  private wasActive = false;

  async poll() {
    try {
      const [all, status] = await Promise.all([tsunagu.downloadQueue(), tsunagu.downloaderStatus()]);
      const active = all.filter(d => d.status !== "DONE");
      const done   = all.filter(d => d.status === "DONE")
        .sort((a, b) => (Date.parse(b.completedAt ?? "") || 0) - (Date.parse(a.completedAt ?? "") || 0));
      this.detectTransitions(active, done);
      this.queue               = active;
      this.completed           = done;
      seriesState.reconcileDownloadsCompleted(new Set(done.map(d => d.chapterId)));
      this.downloaderStatusVal = status;
      this.updateSpeed();
      await this.syncFreeBytes();
    } catch { } finally {
      this.loading = false;
    }
  }

  async enqueue(chapterId: string, mediaId: string): Promise<boolean> {
    const projected: Download[] = [...this.queue, {
      id: "", mediaId, chapterId, chapter: fakeChapter(chapterId, mediaId), status: "QUEUED", progress: 0,
      downloadedBytes: null, bytesPerSec: null, finalSizeBytes: null, error: null,
      createdAt: "", completedAt: null,
    }];
    if (!(await this.guardStorage(projected))) return false;
    try { await tsunagu.enqueueDownload(mediaId, chapterId); await this.poll(); } catch { }
    return true;
  }

  toggleToasts() {
    const next = !this.toastsEnabled;
    updateSettings({ downloadToastsEnabled: next });
    addToast({ kind: "info", title: next ? "Notifications enabled" : "Notifications muted", duration: 2500 });
  }

  toggleAutoRetry() {
    if (this.autoRetryEnabled) {
      this.autoRetryHnd?.stop();
      this.autoRetryHnd = null;
      updateSettings({ downloadAutoRetry: false });
      addToast({ kind: "info", title: "Auto-retry disabled", duration: 2500 });
    } else {
      updateSettings({ downloadAutoRetry: true });
      this.autoRetryHnd = startAutoRetry(
        () => this.queue,
        () => this.isRunning,
        () => this.retryAllErrored(),
      );
      addToast({ kind: "info", title: "Auto-retry enabled", duration: 3000 });
    }
  }

  async togglePlay() {
    if (this.togglingPlay) return;
    this.togglingPlay = true;
    const wasRunning = this.isRunning;
    try {
      if (wasRunning) await tsunagu.stopDownloader(); else await tsunagu.startDownloader();
      await this.poll();
    } catch { await this.poll(); }
    finally { this.togglingPlay = false; }
  }

  async clear() {
    if (this.clearing) return;
    this.clearing = true;
    this.selected = new Set();
    this.queue    = [];
    try {
      await tsunagu.clearDownloads(["QUEUED", "DOWNLOADING", "FAILED"]);
      addToast({ kind: "info", title: "Queue cleared", duration: 2500 });
    } catch { await this.poll(); }
    finally { this.clearing = false; }
  }

  async clearCompleted() {
    if (this.clearing) return;
    this.clearing = true;
    const prev = this.completed;
    this.completed = [];
    try {
      await tsunagu.clearDownloads(["DONE"]);
      addToast({ kind: "info", title: "Download history cleared", duration: 2500 });
    } catch { this.completed = prev; await this.poll(); }
    finally { this.clearing = false; }
  }

  async dequeue(chapterId: string) {
    if (this.dequeueing.has(chapterId)) return;
    const mediaId = this.mediaIdFor(chapterId);
    this.dequeueing = new Set(this.dequeueing).add(chapterId);
    this.queue = this.queue.filter(i => i.chapterId !== chapterId);
    const next = new Set(this.selected); next.delete(chapterId); this.selected = next;
    try { await tsunagu.dequeueDownload(mediaId, chapterId); await this.poll(); }
    catch { await this.poll(); }
    finally { const s = new Set(this.dequeueing); s.delete(chapterId); this.dequeueing = s; }
  }

  async dequeueSelected() {
    if (this.batchWorking || !this.selected.size) return;
    this.batchWorking = true;
    const ids   = [...this.selected];
    const idSet = new Set(ids);
    const mids  = new Map(ids.map(id => [id, this.mediaIdFor(id)]));
    this.selected = new Set();
    this.queue = this.queue.filter(i => !idSet.has(i.chapterId));
    try {
      await Promise.all(ids.map(id => tsunagu.dequeueDownload(mids.get(id) ?? "", id)));
      addToast({ kind: "info", title: `Removed ${ids.length} download${ids.length !== 1 ? "s" : ""}`, duration: 2500 });
      await this.poll();
    } catch { await this.poll(); }
    finally { this.batchWorking = false; }
  }

  async retryOne(chapterId: string) {
    if (this.dequeueing.has(chapterId)) return;
    const mediaId = this.mediaIdFor(chapterId);
    this.dequeueing = new Set(this.dequeueing).add(chapterId);
    try {
      await tsunagu.dequeueDownload(mediaId, chapterId);
      const projected = this.queue.filter(i => i.chapterId !== chapterId);
      if (!(await this.guardStorage(projected))) { await this.poll(); return; }
      await tsunagu.enqueueDownload(mediaId, chapterId);
      await this.poll();
    } catch { await this.poll(); }
    finally { const s = new Set(this.dequeueing); s.delete(chapterId); this.dequeueing = s; }
  }

  async retryAllErrored() {
    if (this.batchWorking || !this.hasErrored) return;
    this.batchWorking = true;
    const ids = [...this.erroredIds];
    const mids = new Map(ids.map(id => [id, this.mediaIdFor(id)]));
    try {
      await Promise.all(ids.map(id => tsunagu.dequeueDownload(mids.get(id) ?? "", id)));
      const projected = this.queue.filter(i => !this.erroredIds.has(i.chapterId));
      if (!(await this.guardStorage(projected))) { await this.poll(); return; }
      for (const id of ids) await tsunagu.enqueueDownload(mids.get(id) ?? "", id);
      addToast({ kind: "info", title: `Retrying ${ids.length} failed download${ids.length !== 1 ? "s" : ""}`, duration: 3000 });
      await this.poll();
    } catch { await this.poll(); }
    finally { this.batchWorking = false; }
  }

  async retrySelected() {
    if (this.batchWorking || !this.selected.size) return;
    this.batchWorking = true;
    const ids     = [...this.selected].filter(id => this.erroredIds.has(id));
    const mids    = new Map(ids.map(id => [id, this.mediaIdFor(id)]));
    this.selected = new Set();
    try {
      if (ids.length) {
        await Promise.all(ids.map(id => tsunagu.dequeueDownload(mids.get(id) ?? "", id)));
        const idSet = new Set(ids);
        const projected = this.queue.filter(i => !idSet.has(i.chapterId));
        if (!(await this.guardStorage(projected))) { await this.poll(); return; }
        for (const id of ids) await tsunagu.enqueueDownload(mids.get(id) ?? "", id);
        addToast({ kind: "info", title: `Retrying ${ids.length} failed download${ids.length !== 1 ? "s" : ""}`, duration: 3000 });
      }
      await this.poll();
    } catch { await this.poll(); }
    finally { this.batchWorking = false; }
  }

  async reorder(chapterId: string, direction: "up" | "down") {
    const idx = this.queue.findIndex(i => i.chapterId === chapterId);
    if (idx === -1) return;
    const to = direction === "up" ? idx - 1 : idx + 1;
    if (to < 0 || to >= this.queue.length) return;
    const newQueue = [...this.queue];
    [newQueue[idx], newQueue[to]] = [newQueue[to], newQueue[idx]];
    this.queue = newQueue;
    try {
      await tsunagu.reorderDownload(this.mediaIdFor(chapterId), chapterId, to);
      await this.poll();
    } catch { await this.poll(); }
  }

  async reorderSelected(direction: "up" | "down", step: number = 1) {
    if (this.batchWorking || !this.selected.size) return;
    this.batchWorking = true;
    const queue           = [...this.queue];
    const selectedIndices = queue
      .map((item, i) => ({ id: item.chapterId, i }))
      .filter(({ id }) => this.selected.has(id))
      .map(({ i }) => i)
      .sort((a, b) => direction === "up" ? a - b : b - a);

    if (direction === "up"   && selectedIndices[0] === 0)                { this.batchWorking = false; return; }
    if (direction === "down" && selectedIndices[0] === queue.length - 1) { this.batchWorking = false; return; }

    const newQueue = [...queue];
    for (const idx of selectedIndices) {
      const to = direction === "up" ? Math.max(0, idx - step) : Math.min(newQueue.length - 1, idx + step);
      [newQueue[idx], newQueue[to]] = [newQueue[to], newQueue[idx]];
    }
    this.queue = newQueue;
    try {
      for (const idx of selectedIndices) {
        const to = direction === "up" ? Math.max(0, idx - step) : Math.min(queue.length - 1, idx + step);
        await tsunagu.reorderDownload(queue[idx].mediaId, queue[idx].chapterId, to);
      }
      await this.poll();
    } catch { await this.poll(); }
    finally { this.batchWorking = false; }
  }

  async reorderToEdge(chapterId: string, edge: "top" | "bottom") {
    const idx   = this.queue.findIndex(i => i.chapterId === chapterId);
    if (idx === -1) return;
    const first = this.isRunning ? 1 : 0;
    const last  = this.queue.length - 1;
    const to    = edge === "top" ? first : last;
    if (idx === to) return;
    const newQueue = [...this.queue];
    newQueue.splice(idx, 1);
    newQueue.splice(to, 0, this.queue[idx]);
    this.queue = newQueue;
    try {
      await tsunagu.reorderDownload(this.mediaIdFor(chapterId), chapterId, to);
      await this.poll();
    } catch { await this.poll(); }
  }

  async reorderSelectedToEdge(edge: "top" | "bottom") {
    if (this.batchWorking || !this.selected.size) return;
    this.batchWorking = true;
    const first    = this.isRunning ? 1 : 0;
    const active   = this.queue.slice(0, first);
    const moveable = this.queue.slice(first);
    const pinned   = moveable.filter(i => this.selected.has(i.chapterId));
    const rest     = moveable.filter(i => !this.selected.has(i.chapterId));
    const newQueue = edge === "top" ? [...active, ...pinned, ...rest] : [...active, ...rest, ...pinned];
    this.queue = newQueue;
    const last = this.queue.length - 1;
    try {
      if (edge === "top") {
        for (let i = 0; i < pinned.length; i++)
          await tsunagu.reorderDownload(pinned[i].mediaId, pinned[i].chapterId, first + i);
      } else {
        for (let i = 0; i < pinned.length; i++)
          await tsunagu.reorderDownload(pinned[i].mediaId, pinned[i].chapterId, last - (pinned.length - 1 - i));
      }
      await this.poll();
    } catch { await this.poll(); }
    finally { this.batchWorking = false; }
  }

  async moveSeries(items: Download[], direction: "up" | "down") {
    if (this.batchWorking || !items.length) return;
    const targetMangaId = items[0]?.mediaId ?? "";
    const groupOrder: string[] = [];
    for (const item of this.queue) {
      const mId = item.mediaId ?? "";
      if (!groupOrder.includes(mId)) groupOrder.push(mId);
    }
    const gIdx = groupOrder.indexOf(targetMangaId);
    if (gIdx === -1) return;
    const targetIdx = direction === "up" ? gIdx - 1 : gIdx + 1;
    if (targetIdx < 0 || targetIdx >= groupOrder.length) return;

    this.batchWorking = true;
    [groupOrder[gIdx], groupOrder[targetIdx]] = [groupOrder[targetIdx], groupOrder[gIdx]];

    const map = new Map<string, Download[]>();
    for (const item of this.queue) {
      const mId = item.mediaId ?? "";
      if (!map.has(mId)) map.set(mId, []);
      map.get(mId)!.push(item);
    }

    const first = this.isRunning ? 1 : 0;
    const active = this.queue.slice(0, first);
    const reorderedMoveable: Download[] = [];
    for (const mId of groupOrder) {
      const groupItems = map.get(mId) ?? [];
      for (const item of groupItems) {
        if (first === 1 && item.chapterId === active[0]?.chapterId) continue;
        reorderedMoveable.push(item);
      }
    }
    const newQueue = [...active, ...reorderedMoveable];
    this.queue = newQueue;
    try {
      for (let i = 0; i < reorderedMoveable.length; i++) {
        await tsunagu.reorderDownload(reorderedMoveable[i].mediaId, reorderedMoveable[i].chapterId, first + i);
      }
      await this.poll();
    } catch { await this.poll(); }
    finally { this.batchWorking = false; }
  }

  async moveSeriesToTop(items: Download[]) {
    if (this.batchWorking || !items.length) return;
    this.batchWorking = true;
    const seriesIdSet = new Set(items.map(i => i.chapterId));
    const first  = this.isRunning ? 1 : 0;
    const active = this.queue.slice(0, first);
    const moveable = this.queue.slice(first);
    const seriesItems = moveable.filter(i => seriesIdSet.has(i.chapterId));
    const rest        = moveable.filter(i => !seriesIdSet.has(i.chapterId));
    const newQueue    = [...active, ...seriesItems, ...rest];
    this.queue = newQueue;
    try {
      for (let i = 0; i < seriesItems.length; i++) {
        await tsunagu.reorderDownload(seriesItems[i].mediaId, seriesItems[i].chapterId, first + i);
      }
      await this.poll();
    } catch { await this.poll(); }
    finally { this.batchWorking = false; }
  }

  async moveSeriesToBottom(items: Download[]) {
    if (this.batchWorking || !items.length) return;
    this.batchWorking = true;
    const seriesIdSet = new Set(items.map(i => i.chapterId));
    const first  = this.isRunning ? 1 : 0;
    const active = this.queue.slice(0, first);
    const moveable = this.queue.slice(first);
    const seriesItems = moveable.filter(i => seriesIdSet.has(i.chapterId));
    const rest        = moveable.filter(i => !seriesIdSet.has(i.chapterId));
    const newQueue    = [...active, ...rest, ...seriesItems];
    this.queue = newQueue;
    const last = this.queue.length - 1;
    try {
      for (let i = 0; i < seriesItems.length; i++) {
        await tsunagu.reorderDownload(seriesItems[i].mediaId, seriesItems[i].chapterId, last - (seriesItems.length - 1 - i));
      }
      await this.poll();
    } catch { await this.poll(); }
    finally { this.batchWorking = false; }
  }

  async reverseSeriesOrder(items: Download[]) {
    if (this.batchWorking || items.length <= 1) return;
    this.batchWorking = true;
    const seriesIdSet = new Set(items.map(i => i.chapterId));
    const seriesIndices = this.queue
      .map((item, i) => ({ id: item.chapterId, i }))
      .filter(({ id }) => seriesIdSet.has(id))
      .map(({ i }) => i);

    const reversedItems = items.slice().reverse();
    const newQueue = [...this.queue];
    for (let k = 0; k < seriesIndices.length; k++) {
      newQueue[seriesIndices[k]] = reversedItems[k];
    }
    this.queue = newQueue;
    try {
      for (let k = 0; k < seriesIndices.length; k++) {
        await tsunagu.reorderDownload(reversedItems[k].mediaId, reversedItems[k].chapterId, seriesIndices[k]);
      }
      await this.poll();
    } catch { await this.poll(); }
    finally { this.batchWorking = false; }
  }

  selectOnly(chapterId: string)   { this.selected = new Set([chapterId]); }
  toggleSelect(chapterId: string) {
    const next = new Set(this.selected);
    next.has(chapterId) ? next.delete(chapterId) : next.add(chapterId);
    this.selected = next;
  }
  selectRange(fromId: string, toId: string) {
    const ids = this.queue.map(i => i.chapterId);
    const a = ids.indexOf(fromId), b = ids.indexOf(toId);
    if (a === -1 || b === -1) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const next = new Set(this.selected);
    for (let i = lo; i <= hi; i++) next.add(ids[i]);
    this.selected = next;
  }
  selectAll()      { this.selected = new Set(this.queue.map(i => i.chapterId)); }
  clearSelection() { this.selected = new Set(); }
}

export const downloadStore = new DownloadStore();
