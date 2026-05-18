import { gql }                    from "@api/client";
import { GET_MANGA_TRACK_RECORDS, GET_ALL_TRACKER_RECORDS } from "@api/queries/tracking";
import { GET_CHAPTERS }                                     from "@api/queries/chapters";
import { UPDATE_TRACK, FETCH_TRACK, UNBIND_TRACK }          from "@api/mutations/tracking";
import { buildChapterList, type ChapterDisplayPrefs }       from "@features/series/lib/chapterList";
import { syncBackFromTracker }                              from "@features/tracking/lib/trackingSync";
import { store }                                            from "@store/state.svelte";
import type { TrackRecord, Tracker }                        from "@types/index";
import type { Chapter }                                     from "@types/index";
import type { TrackerWithRecords }                          from "@features/tracking/lib/trackingSync";

const BOOT_SYNC_RATE_MS = 400;

type RecordMap   = Map<number, TrackRecord[]>;
type MangaBucket = { mangaId: number; records: TrackRecord[] };

class TrackingState {
  private byManga: RecordMap = $state(new Map());

  allTrackers: TrackerWithRecords[] = $state([]);
  loadingAll:  boolean              = $state(false);
  loadingFor:  Set<number>          = $state(new Set());
  error:       string | null        = $state(null);

  recordsFor(mangaId: number): TrackRecord[] {
    return this.byManga.get(mangaId) ?? [];
  }

  private setFor(mangaId: number, records: TrackRecord[]) {
    const next = new Map(this.byManga);
    next.set(mangaId, records);
    this.byManga = next;
  }

  private patchFor(mangaId: number, updated: Partial<TrackRecord> & { id: number }) {
    const records = this.recordsFor(mangaId).map(r =>
      r.id === updated.id ? { ...r, ...updated } : r
    );
    this.setFor(mangaId, records);

    this.allTrackers = this.allTrackers.map(t => ({
      ...t,
      trackRecords: {
        nodes: t.trackRecords.nodes.map(r =>
          r.id === updated.id ? { ...r, ...updated } : r
        ),
      },
    }));
  }

  async loadForManga(mangaId: number) {
    if (this.loadingFor.has(mangaId)) return;
    const existing = this.byManga.get(mangaId);
    if (existing && existing.length > 0) return;

    const next = new Set(this.loadingFor);
    next.add(mangaId);
    this.loadingFor = next;

    try {
      const res = await gql<{ manga: { trackRecords: { nodes: TrackRecord[] } } }>(
        GET_MANGA_TRACK_RECORDS, { mangaId }
      );
      this.setFor(mangaId, res.manga.trackRecords.nodes);
    } catch (e: any) {
      this.error = e?.message ?? "Failed to load tracking";
    } finally {
      const s = new Set(this.loadingFor);
      s.delete(mangaId);
      this.loadingFor = s;
    }
  }

  async loadAll() {
    this.loadingAll = true;
    this.error      = null;
    try {
      const res = await gql<{ trackers: { nodes: TrackerWithRecords[] } }>(GET_ALL_TRACKER_RECORDS);
      this.allTrackers = res.trackers.nodes;

      for (const tracker of res.trackers.nodes.filter(t => t.isLoggedIn)) {
        for (const record of tracker.trackRecords.nodes) {
          if (!record.manga?.id) continue;
          const mangaId  = record.manga.id;
          const existing = this.byManga.get(mangaId) ?? [];
          const merged   = [...existing.filter(r => r.id !== record.id), record];
          this.setFor(mangaId, merged);
        }
      }
    } catch (e: any) {
      this.error = e?.message ?? "Failed to load tracking";
    } finally {
      this.loadingAll = false;
    }
  }

  async updateStatus(mangaId: number, record: TrackRecord, status: number): Promise<TrackRecord> {
    const res = await gql<{ updateTrack: { trackRecord: TrackRecord } }>(
      UPDATE_TRACK, { recordId: record.id, status }
    );
    this.patchFor(mangaId, res.updateTrack.trackRecord);
    return res.updateTrack.trackRecord;
  }

  async updateScore(mangaId: number, record: TrackRecord, scoreString: string): Promise<TrackRecord> {
    const res = await gql<{ updateTrack: { trackRecord: TrackRecord } }>(
      UPDATE_TRACK, { recordId: record.id, scoreString }
    );
    this.patchFor(mangaId, res.updateTrack.trackRecord);
    return res.updateTrack.trackRecord;
  }

  async updateChapterProgress(mangaId: number, record: TrackRecord, lastChapterRead: number): Promise<TrackRecord> {
    const res = await gql<{ updateTrack: { trackRecord: TrackRecord } }>(
      UPDATE_TRACK, { recordId: record.id, lastChapterRead }
    );
    this.patchFor(mangaId, res.updateTrack.trackRecord);
    return res.updateTrack.trackRecord;
  }

  async unbind(mangaId: number, record: TrackRecord) {
    await gql(UNBIND_TRACK, { recordId: record.id });
    this.setFor(mangaId, this.recordsFor(mangaId).filter(r => r.id !== record.id));
    this.allTrackers = this.allTrackers.map(t => ({
      ...t,
      trackRecords: { nodes: t.trackRecords.nodes.filter(r => r.id !== record.id) },
    }));
  }

  async syncFromRemote(
    mangaId:  number,
    record:   TrackRecord,
    chapters: Chapter[],
    prefs:    ChapterDisplayPrefs,
  ): Promise<{ fresh: TrackRecord; markedIds: number[] }> {
    const res = await gql<{ fetchTrack: { trackRecord: TrackRecord } }>(
      FETCH_TRACK, { recordId: record.id }
    );
    const fresh = res.fetchTrack.trackRecord;
    this.patchFor(mangaId, fresh);

    const markedIds = await this._applyRemoteProgress(fresh, chapters, prefs);
    return { fresh, markedIds };
  }

  private async _applyRemoteProgress(
    record:   TrackRecord,
    chapters: Chapter[],
    prefs:    ChapterDisplayPrefs,
  ): Promise<number[]> {
    if (!store.settings.trackerSyncBack) return [];

    return syncBackFromTracker(
      [record],
      chapters,
      {
        threshold:              store.settings.trackerSyncBackThreshold ?? null,
        respectScanlatorFilter: store.settings.trackerRespectScanlatorFilter ?? true,
        chapterPrefs:           prefs,
      },
      (query, vars) => gql(query, vars),
    );
  }

  async updateFromRead(
    mangaId:     number,
    chapter:     Chapter,
    chapterList: Chapter[],
    prefs:       ChapterDisplayPrefs,
  ) {
    const filtered = buildChapterList(chapterList, { ...prefs, sortDir: "asc" });
    const idx      = filtered.findIndex(c => c.id === chapter.id);
    if (idx < 0) return;
    const position = idx + 1;

    const records = this.recordsFor(mangaId);
    for (const record of records) {
      try {
        const completedValue = this._completedStatusFor(record.trackerId);
        const isCompleted    = completedValue !== null && record.status === completedValue;
        const readingValue   = this._readingStatusFor(record.trackerId);
        const belowMax       = record.totalChapters > 0 && (record.lastChapterRead ?? 0) < record.totalChapters;

        if ((isCompleted || belowMax) && readingValue !== null && position > (record.lastChapterRead ?? 0)) {
          await gql<{ updateTrack: { trackRecord: TrackRecord } }>(
            UPDATE_TRACK, { recordId: record.id, lastChapterRead: position, status: readingValue }
          ).then(res => this.patchFor(mangaId, res.updateTrack.trackRecord));
        } else if (!isCompleted && position > (record.lastChapterRead ?? 0)) {
          await this.updateChapterProgress(mangaId, record, position);
        }
      } catch {}
    }
  }

  async updateFromUnread(
    mangaId:     number,
    chapterList: Chapter[],
    prefs:       ChapterDisplayPrefs,
  ) {
    const filtered = buildChapterList(chapterList, { ...prefs, sortDir: "asc" });
    const lastRead = [...filtered].reverse().find(c => c.isRead);
    const position = lastRead ? filtered.findIndex(c => c.id === lastRead.id) + 1 : 0;

    const records = this.recordsFor(mangaId);
    for (const record of records.filter(r => (r.lastChapterRead ?? 0) > position)) {
      try {
        const completedValue = this._completedStatusFor(record.trackerId);
        const isCompleted    = completedValue !== null && record.status === completedValue;
        const belowMax       = record.totalChapters > 0 && position < record.totalChapters;
        const readingValue   = this._readingStatusFor(record.trackerId);

        if ((isCompleted || belowMax) && readingValue !== null) {
          await gql<{ updateTrack: { trackRecord: TrackRecord } }>(
            UPDATE_TRACK, { recordId: record.id, lastChapterRead: position, status: readingValue }
          ).then(res => this.patchFor(mangaId, res.updateTrack.trackRecord));
        } else {
          await this.updateChapterProgress(mangaId, record, position);
        }
      } catch {}
    }
  }

  clear(mangaId: number) {
    const next = new Map(this.byManga);
    next.delete(mangaId);
    this.byManga = next;
  }

  private _statusesFor(trackerId: number): { value: number; name: string }[] {
    return this.allTrackers.find(t => t.id === trackerId)?.statuses ?? [];
  }

  private _completedStatusFor(trackerId: number): number | null {
    const s = this._statusesFor(trackerId).find(s => s.name.toLowerCase() === "completed");
    return s?.value ?? null;
  }

  private _readingStatusFor(trackerId: number): number | null {
    const s = this._statusesFor(trackerId).find(s => s.name.toLowerCase() === "reading");
    return s?.value ?? null;
  }

  async bootSync() {
    if (!store.settings.trackerSyncBack) return;

    if (this.allTrackers.length === 0) await this.loadAll();

    const buckets = new Map<number, MangaBucket>();

    for (const tracker of this.allTrackers.filter(t => t.isLoggedIn)) {
      const completedValue = this._completedStatusFor(tracker.id);
      for (const record of tracker.trackRecords.nodes) {
        const mangaId = record.manga?.id;
        if (!mangaId) continue;
        if (completedValue !== null && record.status === completedValue) continue;
        const bucket = buckets.get(mangaId) ?? { mangaId, records: [] };
        bucket.records.push(record);
        buckets.set(mangaId, bucket);
      }
    }

    const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    for (const { mangaId, records } of buckets.values()) {
      const prefs = { ...(store.settings.mangaPrefs?.[mangaId] ?? {}) } as ChapterDisplayPrefs;

      let chapters: Chapter[];
      try {
        const res = await gql<{ chapters: { nodes: Chapter[] } }>(GET_CHAPTERS, { mangaId });
        chapters  = res.chapters.nodes;
      } catch {
        continue;
      }

      const freshRecords: TrackRecord[] = [];
      for (const record of records) {
        await delay(BOOT_SYNC_RATE_MS);
        try {
          const res   = await gql<{ fetchTrack: { trackRecord: TrackRecord } }>(FETCH_TRACK, { recordId: record.id });
          const fresh = res.fetchTrack.trackRecord;
          this.patchFor(mangaId, fresh);
          freshRecords.push(fresh);
        } catch {
          freshRecords.push(record);
        }
      }

      try {
        await syncBackFromTracker(
          freshRecords,
          chapters,
          {
            threshold:              store.settings.trackerSyncBackThreshold ?? null,
            respectScanlatorFilter: store.settings.trackerRespectScanlatorFilter ?? true,
            chapterPrefs:           prefs,
          },
          (query, vars) => gql(query, vars),
        );
      } catch {}
    }
  }
}

export const trackingState = new TrackingState();