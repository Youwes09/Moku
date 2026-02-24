import { useEffect, useState, useMemo, useRef, memo } from "react";
import { ArrowLeft, BookmarkSimple, FolderSimplePlus, Folder } from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import { GET_ALL_MANGA, GET_LIBRARY, GET_SOURCES, FETCH_SOURCE_MANGA, UPDATE_MANGA } from "../../lib/queries";
import { cache, CACHE_KEYS } from "../../lib/cache";
import { dedupeSources, dedupeMangaByTitle, dedupeMangaById } from "../../lib/sourceUtils";
import { useStore } from "../../store";
import ContextMenu, { type ContextMenuEntry } from "../context/ContextMenu";
import type { Manga, Source } from "../../lib/types";
import s from "./GenreDrillPage.module.css";

const CoverImg = memo(function CoverImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src} alt={alt} className={className}
      loading="lazy" decoding="async"
      onLoad={() => setLoaded(true)}
      style={{ opacity: loaded ? 1 : 0, transition: loaded ? "opacity 0.15s ease" : "none" }}
    />
  );
});

export default function GenreDrillPage() {
  const genre               = useStore((st) => st.genreFilter);
  const setGenreFilter      = useStore((st) => st.setGenreFilter);
  const setPreviewManga     = useStore((st) => st.setPreviewManga);
  const settings            = useStore((st) => st.settings);
  const folders             = useStore((st) => st.settings.folders);
  const addFolder           = useStore((st) => st.addFolder);
  const assignMangaToFolder = useStore((st) => st.assignMangaToFolder);

  const [libraryManga, setLibraryManga]   = useState<Manga[]>([]);
  const [sourceManga, setSourceManga]     = useState<Manga[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadingSources, setLoadingSources] = useState(true);
  const [ctx, setCtx] = useState<{ x: number; y: number; manga: Manga } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!genre) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoadingLibrary(true);
    setLoadingSources(true);
    setSourceManga([]);

    // ── Library ────────────────────────────────────────────────────────────
    cache.get(CACHE_KEYS.LIBRARY, () =>
      Promise.all([
        gql<{ mangas: { nodes: Manga[] } }>(GET_ALL_MANGA),
        gql<{ mangas: { nodes: Manga[] } }>(GET_LIBRARY),
      ]).then(([all, lib]) => {
        const libMap = new Map(lib.mangas.nodes.map((m) => [m.id, m]));
        return all.mangas.nodes.map((m) => libMap.get(m.id) ?? m);
      })
    ).then(setLibraryManga)
     .catch((e) => { if (e?.name !== "AbortError") console.error(e); })
     .finally(() => setLoadingLibrary(false));

    // ── Sources ────────────────────────────────────────────────────────────
    const preferredLang = settings.preferredExtensionLang || "en";
    cache.get(CACHE_KEYS.SOURCES, () =>
      gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
        .then((d) => dedupeSources(d.sources.nodes, preferredLang))
    ).then((allSources) => {
      // Use ALL deduped sources for drill pages (not just frecency top 4)
      // Cap at 8 to avoid hammering the server too hard
      const sourcesToQuery = allSources.slice(0, 8);
      return cache.get(CACHE_KEYS.GENRE(genre), () =>
        Promise.allSettled(
          // Fetch page 1 and page 2 from each source for a fuller result set
          sourcesToQuery.flatMap((src) =>
            [1, 2].map((page) =>
              gql<{ fetchSourceManga: { mangas: Manga[] } }>(FETCH_SOURCE_MANGA, {
                source: src.id, type: "SEARCH", page, query: genre,
              }, ctrl.signal).then((d) => d.fetchSourceManga.mangas)
            )
          )
        ).then((results) => {
          const merged: Manga[] = [];
          for (const r of results)
            if (r.status === "fulfilled") merged.push(...r.value);
          return dedupeMangaByTitle(merged);
        })
      );
    })
    .then((manga) => { if (!ctrl.signal.aborted) setSourceManga(manga); })
    .catch((e) => { if (e?.name !== "AbortError") console.error(e); })
    .finally(() => { if (!ctrl.signal.aborted) setLoadingSources(false); });

    return () => { ctrl.abort(); };
  }, [genre]);

  const filtered = useMemo(() => {
    // Library manga: only include if genre matches (we have full metadata)
    const libMatches = libraryManga.filter((m) => (m.genre ?? []).includes(genre));
    // Source manga: include ALL results — they came from a genre search,
    // but the API often returns no genre tags in the brief response payload.
    // De-duplicate against library matches by id.
    const libIds = new Set(libMatches.map((m) => m.id));
    const srcAll = sourceManga.filter((m) => !libIds.has(m.id));
    return dedupeMangaById([...libMatches, ...srcAll]);
  }, [libraryManga, sourceManga, genre]);

  function openCtx(e: React.MouseEvent, m: Manga) {
    e.preventDefault(); e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, manga: m });
  }

  function buildCtxItems(m: Manga): ContextMenuEntry[] {
    return [
      {
        label: m.inLibrary ? "In Library" : "Add to library",
        icon: <BookmarkSimple size={13} weight={m.inLibrary ? "fill" : "light"} />,
        disabled: m.inLibrary,
        onClick: () => gql(UPDATE_MANGA, { id: m.id, inLibrary: true })
          .then(() => {
            setSourceManga((prev) => prev.map((x) => x.id === m.id ? { ...x, inLibrary: true } : x));
            cache.clear(CACHE_KEYS.LIBRARY);
          })
          .catch(console.error),
      },
      ...(folders.length > 0 ? [
        { separator: true } as ContextMenuEntry,
        ...folders.map((f): ContextMenuEntry => ({
          label: f.mangaIds.includes(m.id) ? `✓ ${f.name}` : f.name,
          icon: <Folder size={13} weight={f.mangaIds.includes(m.id) ? "fill" : "light"} />,
          onClick: () => assignMangaToFolder(f.id, m.id),
        })),
      ] : []),
      { separator: true },
      {
        label: "New folder & add",
        icon: <FolderSimplePlus size={13} weight="light" />,
        onClick: () => {
          const name = prompt("Folder name:");
          if (name?.trim()) { const id = addFolder(name.trim()); assignMangaToFolder(id, m.id); }
        },
      },
    ];
  }

  const showSkeleton = loadingLibrary && filtered.length === 0;

  return (
    <div className={s.root}>
      <div className={s.header}>
        <button className={s.back} onClick={() => setGenreFilter("")}>
          <ArrowLeft size={13} weight="light" />
          <span>Back</span>
        </button>
        <span className={s.title}>{genre}</span>
        {loadingSources && !loadingLibrary && filtered.length > 0 && (
          <span className={s.loadingHint}>Loading more…</span>
        )}
      </div>

      {showSkeleton ? (
        <div className={s.grid}>
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className={s.cardSkeleton}>
              <div className={["skeleton", s.coverSkeleton].join(" ")} />
              <div className={["skeleton", s.titleSkeleton].join(" ")} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 && !loadingSources ? (
        <div className={s.empty}>No manga found for "{genre}".</div>
      ) : (
        <div className={s.grid}>
          {filtered.map((m) => (
            <button key={m.id} className={s.card} onClick={() => setPreviewManga(m)} onContextMenu={(e) => openCtx(e, m)}>
              <div className={s.coverWrap}>
                <CoverImg src={thumbUrl(m.thumbnailUrl)} alt={m.title} className={s.cover} />
                {m.inLibrary && <span className={s.inLibraryBadge}>Saved</span>}
              </div>
              <p className={s.cardTitle}>{m.title}</p>
            </button>
          ))}
        </div>
      )}

      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={buildCtxItems(ctx.manga)} onClose={() => setCtx(null)} />
      )}
    </div>
  );
}