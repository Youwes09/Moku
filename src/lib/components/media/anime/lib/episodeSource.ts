import { gql, baseUrl } from "$lib/server-adapters/tsunagu/gql";
import { pageServerUrl } from "$lib/core/cache/pageCache";

export interface EpisodeStreamSource {
  label: string;
  resolution: number;
  preferred: boolean;
  url: string;
}

export interface SkipMarker {
  type: string;
  name: string;
  startMs: number;
  endMs: number;
}

export interface EpisodeSource {
  url?: string;
  sources?: EpisodeStreamSource[];
  subtitles?: { lang: string; url: string }[];
  skipMarkers?: SkipMarker[];
  unavailable?: boolean;
}

interface ChapterVideo {
  videoUrl: string | null;
  videoStream: {
    url: string | null;
    sources: { label: string | null; resolution: number | null; preferred: boolean | null; url: string }[] | null;
    subtitles: { lang: string; url: string }[] | null;
    skipMarkers: SkipMarker[] | null;
  } | null;
}

function dedupeByUrl(sources: EpisodeStreamSource[]): EpisodeStreamSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}

export async function resolveEpisodeSource(chapterId: string): Promise<EpisodeSource> {
  try {
    const data = await gql<{ chapter: ChapterVideo | null }>(
      `query EpisodeSource($id: ID!) {
         chapter(id: $id) {
           videoUrl
           videoStream {
             url
             sources { label resolution preferred url }
             subtitles { lang url }
             skipMarkers { type name startMs endMs }
           }
         }
       }`,
      { id: chapterId },
      baseUrl(),
    );

    const vs  = data.chapter?.videoStream;
    const raw = vs?.url ?? data.chapter?.videoUrl ?? null;
    if (!raw) return { unavailable: true };

    const abs = (u: string) => (u.startsWith("http") ? u : `${pageServerUrl()}${u}`);
    return {
      url: abs(raw),
      sources: dedupeByUrl(
        (vs?.sources ?? [])
          .filter((s) => s?.url)
          .map((s) => ({
            label: s.label || (s.resolution ? `${s.resolution}p` : "Source"),
            resolution: s.resolution ?? 0,
            preferred: !!s.preferred,
            url: abs(s.url),
          })),
      ).sort((a, b) => b.resolution - a.resolution),
      subtitles: (vs?.subtitles ?? [])
        .filter((s) => s?.url)
        .map((s) => ({ lang: s.lang || "Sub", url: abs(s.url) })),
      skipMarkers: (vs?.skipMarkers ?? []).filter((m) => m && m.endMs > m.startMs),
    };
  } catch {
    return { unavailable: true };
  }
}

export async function resolveSkipTimestamps(chapterId: string, episodeLengthMs: number): Promise<SkipMarker[]> {
  const len = Number.isFinite(episodeLengthMs) && episodeLengthMs > 0 ? Math.round(episodeLengthMs) : null;
  try {
    const data = await gql<{ skipTimestamps: SkipMarker[] | null }>(
      `query SkipTimestamps($id: ID!, $len: Int) {
         skipTimestamps(chapterId: $id, episodeLengthMs: $len) { type name startMs endMs }
       }`,
      { id: chapterId, len },
      baseUrl(),
    );
    return (data.skipTimestamps ?? []).filter((m) => m && m.endMs > m.startMs);
  } catch (e) {
    console.warn("[aniskip] skipTimestamps failed", e);
    return [];
  }
}
