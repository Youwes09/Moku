import { useEffect, useState, useMemo, memo } from "react";
import { ArrowLeft, ArrowRight, Compass, List, BookOpen, Star, Fire, BookmarkSimple, FolderSimplePlus, Folder } from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import { UPDATE_MANGA } from "../../lib/queries";
import ContextMenu, { type ContextMenuEntry } from "../context/ContextMenu";
import { GET_ALL_MANGA, GET_LIBRARY, GET_SOURCES, FETCH_SOURCE_MANGA } from "../../lib/queries";
import { useStore } from "../../store";
import type { Manga, Source } from "../../lib/types";
import SourceList from "./SourceList";
import SourceBrowse from "./SourceBrowse";
import s from "./Explore.module.css";

// ── Frecency ──────────────────────────────────────────────────────────────────

function frecencyScore(readAt: number, count: number): number {
  const hoursSince = (Date.now() - readAt) / 3_600_000;
  return count / Math.log(hoursSince + 2);
}

// ── Ghost card ────────────────────────────────────────────────────────────────

function GhostCard() {
  return <div className={s.ghostCard} aria-hidden />;
}

const GHOST_COUNT = 3;

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow({ count = 8 }: { count?: number }) {
  return (
    <div className={s.skeletonRow}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={s.cardSkeleton}>
          <div className={["skeleton", s.coverSkeleton].join(" ")} />
          <div className={["skeleton", s.titleSkeleton].join(" ")} />
        </div>
      ))}
    </div>
  );
}

// ── Mini card ─────────────────────────────────────────────────────────────────

const MiniCard = memo(function MiniCard({
  manga,
  onClick,
  onContextMenu,
  subtitle,
  progress,
}: {
  manga: Manga;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  subtitle?: string;
  progress?: number;
}) {
  return (
    <button className={s.card} onClick={onClick} onContextMenu={onContextMenu}>
      <div className={s.coverWrap}>
        <img
          src={thumbUrl(manga.thumbnailUrl)}
          alt={manga.title}
          className={s.cover}
          loading="lazy"
          decoding="async"
        />
        {manga.inLibrary && <span className={s.inLibraryBadge}>Saved</span>}
        {progress !== undefined && progress > 0 && (
          <div className={s.progressBar}>
            <div className={s.progressFill} style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
      <p className={s.title}>{manga.title}</p>
      {subtitle && <p className={s.subtitle}>{subtitle}</p>}
    </button>
  );
});

// ── Genre drill-down ──────────────────────────────────────────────────────────

function GenreDrill({
  genre,
  manga,
  sourceManga,
  onBack,
  onOpen,
}: {
  genre: string;
  manga: Manga[];
  sourceManga: Manga[];
  onBack: () => void;
  onOpen: (m: Manga) => void;
}) {
  const [ctx, setCtx]       = useState<{ x: number; y: number; manga: Manga } | null>(null);
  const folders             = useStore((st) => st.settings.folders);
  const addFolder           = useStore((st) => st.addFolder);
  const assignMangaToFolder = useStore((st) => st.assignMangaToFolder);

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
        onClick: () => gql(UPDATE_MANGA, { id: m.id, inLibrary: true }).catch(console.error),
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

  const filtered = useMemo(() => {
    const combined = new Map<number, Manga>();
    [...manga, ...sourceManga]
      .filter((m) => (m.genre ?? []).includes(genre))
      .forEach((m) => combined.set(m.id, m));
    return Array.from(combined.values());
  }, [manga, sourceManga, genre]);

  return (
    <div className={s.drillRoot}>
      <div className={s.drillHeader}>
        <button className={s.back} onClick={onBack}>
          <ArrowLeft size={13} weight="light" />
          <span>Explore</span>
        </button>
        <span className={s.drillTitle}>{genre}</span>
      </div>
      <div className={s.drillGrid}>
        {filtered.map((m) => (
          <button key={m.id} className={s.drillCard} onClick={() => onOpen(m)} onContextMenu={(e) => openCtx(e, m)}>
            <div className={s.coverWrap}>
              <img
                src={thumbUrl(m.thumbnailUrl)}
                alt={m.title}
                className={s.cover}
                loading="lazy"
                decoding="async"
              />
              {m.inLibrary && <span className={s.inLibraryBadge}>Saved</span>}
            </div>
            <p className={s.title}>{m.title}</p>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className={s.empty}>No manga found for {genre}.</div>
        )}
      </div>
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={buildCtxItems(ctx.manga)}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  onSeeAll,
  loading,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  onSeeAll?: () => void;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={s.section}>
      <div className={s.sectionHeader}>
        <span className={s.sectionTitle}>
          <span className={s.sectionTitleIcon}>
            {icon}
            {title}
          </span>
        </span>
        {onSeeAll && (
          <button className={s.seeAll} onClick={onSeeAll}>
            See all <ArrowRight size={11} weight="light" />
          </button>
        )}
      </div>
      {loading ? <SkeletonRow /> : children}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

type ExploreMode = "explore" | "sources";
type DrillState = { type: "genre"; genre: string } | null;

export default function Explore() {
  const [mode, setMode] = useState<ExploreMode>("explore");
  const [drill, setDrill] = useState<DrillState>(null);
  const activeSource = useStore((s) => s.activeSource);

  if (activeSource) return <SourceBrowse />;

  if (drill?.type === "genre" && mode === "explore") {
    return <DrillWrapper drill={drill} onBack={() => setDrill(null)} />;
  }

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.heading}>Explore</h1>
          <div className={s.tabs}>
            <button
              className={[s.tab, mode === "explore" ? s.tabActive : ""].join(" ").trim()}
              onClick={() => setMode("explore")}
            >
              <Compass size={11} weight="bold" />
              Explore
            </button>
            <button
              className={[s.tab, mode === "sources" ? s.tabActive : ""].join(" ").trim()}
              onClick={() => setMode("sources")}
            >
              <List size={11} weight="bold" />
              Sources
            </button>
          </div>
        </div>
      </div>

      {mode === "explore" ? <ExploreFeed onDrill={setDrill} /> : <SourceList />}
    </div>
  );
}

// ── Drill wrapper ─────────────────────────────────────────────────────────────

function DrillWrapper({ drill, onBack }: { drill: DrillState; onBack: () => void }) {
  const [allManga, setAllManga] = useState<Manga[]>([]);
  const [sourceManga, setSourceManga] = useState<Manga[]>([]);
  const setActiveManga = useStore((s) => s.setActiveManga);
  const setNavPage = useStore((s) => s.setNavPage);
  const settings = useStore((s) => s.settings);

  useEffect(() => {
    Promise.all([
      gql<{ mangas: { nodes: Manga[] } }>(GET_ALL_MANGA),
      gql<{ mangas: { nodes: Manga[] } }>(GET_LIBRARY),
    ]).then(([all, lib]) => {
      const libMap = new Map(lib.mangas.nodes.map((m) => [m.id, m]));
      setAllManga(all.mangas.nodes.map((m) => libMap.get(m.id) ?? m));
    }).catch(console.error);

    const preferredLang = settings.preferredExtensionLang || "en";
    gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
      .then((d) => {
        const all = d.sources.nodes.filter((src) => src.id !== "0");
        const byName = new Map<string, Source[]>();
        for (const src of all) {
          if (!byName.has(src.name)) byName.set(src.name, []);
          byName.get(src.name)!.push(src);
        }
        const picked: Source[] = [];
        for (const group of byName.values()) {
          const preferred = group.find((s) => s.lang === preferredLang);
          picked.push(preferred ?? group.sort((a, b) => a.lang.localeCompare(b.lang))[0]);
        }
        return Promise.allSettled(
          picked.map((src) =>
            gql<{ fetchSourceManga: { mangas: Manga[] } }>(FETCH_SOURCE_MANGA, {
              source: src.id, type: "POPULAR", page: 1, query: null,
            }).then((d) => d.fetchSourceManga.mangas)
          )
        );
      })
      .then((results) => {
        const seen = new Set<number>();
        const merged: Manga[] = [];
        for (const r of results) {
          if (r.status === "fulfilled")
            for (const m of r.value)
              if (!seen.has(m.id)) { seen.add(m.id); merged.push(m); }
        }
        setSourceManga(merged);
      })
      .catch(console.error);
  }, []);

  if (!drill) return null;

  return (
    <GenreDrill
      genre={drill.genre}
      manga={allManga}
      sourceManga={sourceManga}
      onBack={onBack}
      onOpen={(m) => { setActiveManga(m); setNavPage("library"); }}
    />
  );
}

// ── Explore feed ──────────────────────────────────────────────────────────────

function ExploreFeed({ onDrill }: { onDrill: (d: DrillState) => void }) {
  const [allManga, setAllManga] = useState<Manga[]>([]);
  const [loadingLib, setLoadingLib] = useState(true);
  // Popular row: deduped results from POPULAR fetch across all sources
  const [popularManga, setPopularManga] = useState<Manga[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  // Genre search results: genre → merged Manga[] from SEARCH per source
  const [genreResults, setGenreResults] = useState<Map<string, Manga[]>>(new Map());
  const [loadingGenres, setLoadingGenres] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);

  const history = useStore((s) => s.history);
  const settings = useStore((s) => s.settings);
  const setActiveManga = useStore((s) => s.setActiveManga);
  const setNavPage = useStore((s) => s.setNavPage);
  const folders            = useStore((s) => s.settings.folders);
  const addFolder          = useStore((s) => s.addFolder);
  const assignMangaToFolder = useStore((s) => s.assignMangaToFolder);
  const [ctx, setCtx]      = useState<{ x: number; y: number; manga: Manga } | null>(null);

  function openCtx(e: React.MouseEvent, m: Manga) {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, manga: m });
  }

  function buildCtxItems(m: Manga): ContextMenuEntry[] {
    return [
      {
        label: m.inLibrary ? "In Library" : "Add to library",
        icon: <BookmarkSimple size={13} weight={m.inLibrary ? "fill" : "light"} />,
        disabled: m.inLibrary,
        onClick: () => gql(UPDATE_MANGA, { id: m.id, inLibrary: true })
          .then(() => setActiveManga({ ...m, inLibrary: true }))
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
          if (name?.trim()) {
            const id = addFolder(name.trim());
            assignMangaToFolder(id, m.id);
          }
        },
      },
    ];
  }

  // Load library
  useEffect(() => {
    Promise.all([
      gql<{ mangas: { nodes: Manga[] } }>(GET_ALL_MANGA),
      gql<{ mangas: { nodes: Manga[] } }>(GET_LIBRARY),
    ])
      .then(([all, lib]) => {
        const libMap = new Map(lib.mangas.nodes.map((m) => [m.id, m]));
        setAllManga(all.mangas.nodes.map((m) => libMap.get(m.id) ?? m));
      })
      .catch(console.error)
      .finally(() => setLoadingLib(false));
  }, []);

  // Load sources → fetch POPULAR from all (for popular row),
  // then once we know frecency genres, fire SEARCH per genre per source
  useEffect(() => {
    const preferredLang = settings.preferredExtensionLang || "en";

    gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
      .then((d) => {
        const all = d.sources.nodes.filter((src) => src.id !== "0");

        // Dedupe by name, pick preferred lang
        const byName = new Map<string, Source[]>();
        for (const src of all) {
          if (!byName.has(src.name)) byName.set(src.name, []);
          byName.get(src.name)!.push(src);
        }
        const picked: Source[] = [];
        for (const group of byName.values()) {
          const preferred = group.find((s) => s.lang === preferredLang);
          picked.push(preferred ?? group.sort((a, b) => a.lang.localeCompare(b.lang))[0]);
        }

        setSources(picked);
        if (picked.length === 0) { setLoadingPopular(false); return; }

        // Fetch POPULAR from all sources for the popular row
        return Promise.allSettled(
          picked.map((src) =>
            gql<{ fetchSourceManga: { mangas: Manga[] } }>(FETCH_SOURCE_MANGA, {
              source: src.id, type: "POPULAR", page: 1, query: null,
            }).then((d) => d.fetchSourceManga.mangas)
          )
        ).then((results) => {
          const seen = new Set<number>();
          const merged: Manga[] = [];
          for (const r of results)
            if (r.status === "fulfilled")
              for (const m of r.value)
                if (!seen.has(m.id)) { seen.add(m.id); merged.push(m); }
          setPopularManga(merged.slice(0, 30));
          // Return picked sources for genre search phase
          return picked;
        });
      })
      .catch(console.error)
      .finally(() => setLoadingPopular(false));
  }, []);

  // Once library loaded AND sources ready, search each frecency genre across sources
  const frecencyGenres = useMemo(() => {
    const mangaScores = new Map<number, number>();
    const mangaReadAt = new Map<number, number>();
    for (const entry of history) {
      mangaScores.set(entry.mangaId, (mangaScores.get(entry.mangaId) ?? 0) + 1);
      if (entry.readAt > (mangaReadAt.get(entry.mangaId) ?? 0))
        mangaReadAt.set(entry.mangaId, entry.readAt);
    }
    const genreWeights = new Map<string, number>();
    const mangaMap = new Map(allManga.map((m) => [m.id, m]));
    for (const [mangaId, count] of mangaScores.entries()) {
      const score = frecencyScore(mangaReadAt.get(mangaId) ?? 0, count);
      for (const genre of mangaMap.get(mangaId)?.genre ?? [])
        genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + score);
    }
    if (genreWeights.size === 0) {
      allManga.filter((m) => m.inLibrary).forEach((m) =>
        (m.genre ?? []).forEach((g) =>
          genreWeights.set(g, (genreWeights.get(g) ?? 0) + 1)));
    }
    return Array.from(genreWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)          // top 3 genres only
      .map(([g]) => g);
  }, [allManga, history]);

  // Fire genre searches once we have both genres and sources
  useEffect(() => {
    if (frecencyGenres.length === 0 || sources.length === 0) return;
    setLoadingGenres(true);

    // For each genre, search all sources concurrently, then merge results
    // Cap to top 3 sources to limit requests (3 genres × 3 sources = 9 searches max)
    const searchSources = sources.slice(0, 3);

    Promise.allSettled(
      frecencyGenres.map((genre) =>
        Promise.allSettled(
          searchSources.map((src) =>
            gql<{ fetchSourceManga: { mangas: Manga[] } }>(FETCH_SOURCE_MANGA, {
              source: src.id, type: "SEARCH", page: 1, query: genre,
            }).then((d) => d.fetchSourceManga.mangas)
          )
        ).then((results) => {
          const seen = new Set<number>();
          const merged: Manga[] = [];
          for (const r of results)
            if (r.status === "fulfilled")
              for (const m of r.value)
                if (!seen.has(m.id)) { seen.add(m.id); merged.push(m); }
          return { genre, mangas: merged.slice(0, 24) };
        })
      )
    ).then((results) => {
      const map = new Map<string, Manga[]>();
      for (const r of results)
        if (r.status === "fulfilled")
          map.set(r.value.genre, r.value.mangas);
      setGenreResults(map);
    })
    .catch(console.error)
    .finally(() => setLoadingGenres(false));
  }, [frecencyGenres.join(","), sources.map((s) => s.id).join(",")]);

  function openManga(m: Manga) {
    setActiveManga(m);
    setNavPage("library");
  }

  // ── Continue reading ────────────────────────────────────────────────────
  const continueReading = useMemo(() => {
    const mangaMap = new Map(allManga.map((m) => [m.id, m]));
    const seen = new Set<number>();
    const result: { manga: Manga; chapterName: string; progress: number }[] = [];
    for (const entry of history) {
      if (seen.has(entry.mangaId)) continue;
      seen.add(entry.mangaId);
      const manga = mangaMap.get(entry.mangaId);
      if (!manga) continue;
      result.push({
        manga,
        chapterName: entry.chapterName,
        progress: entry.pageNumber > 0 ? Math.min(entry.pageNumber / 20, 1) : 0,
      });
      if (result.length >= 12) break;
    }
    return result;
  }, [history, allManga]);

  // ── Recommended (frecency) ──────────────────────────────────────────────
  const recommended = useMemo(() => {
    if (allManga.length === 0 || frecencyGenres.length === 0) return [];
    const continueIds = new Set(continueReading.map((r) => r.manga.id));
    return allManga
      .filter((m) => m.inLibrary && !continueIds.has(m.id) &&
        frecencyGenres.some((g) => (m.genre ?? []).includes(g)))
      .slice(0, 20);
  }, [allManga, frecencyGenres, continueReading]);

  const genresLoading = loadingLib || loadingGenres;

  return (
    <div className={s.body}>

      {/* Continue Reading */}
      {(continueReading.length > 0 || loadingLib) && (
        <Section
          title="Continue Reading"
          icon={<BookOpen size={11} weight="bold" />}
          loading={loadingLib}
        >
          <div className={s.row}>
            {continueReading.map(({ manga, chapterName, progress }) => (
              <MiniCard
                key={manga.id}
                manga={manga}
                onClick={() => openManga(manga)}
                onContextMenu={(e) => openCtx(e, manga)}
                subtitle={chapterName}
                progress={progress}
              />
            ))}
            {Array.from({ length: GHOST_COUNT }).map((_, i) => (
              <GhostCard key={`ghost-cr-${i}`} />
            ))}
          </div>
        </Section>
      )}

      {/* Recommended */}
      {(recommended.length > 0 || loadingLib) && (
        <Section
          title="Recommended for You"
          icon={<Star size={11} weight="bold" />}
          loading={loadingLib}
        >
          <div className={s.row}>
            {recommended.map((m) => (
              <MiniCard key={m.id} manga={m} onClick={() => openManga(m)} onContextMenu={(e) => openCtx(e, m)} />
            ))}
            {Array.from({ length: GHOST_COUNT }).map((_, i) => (
              <GhostCard key={`ghost-rec-${i}`} />
            ))}
          </div>
        </Section>
      )}

      {/* Popular across deduplicated sources */}
      {(popularManga.length > 0 || loadingPopular) && (
        <Section
          title={
            sources.length === 1
              ? `Popular on ${sources[0].displayName}`
              : sources.length > 1
              ? `Popular across ${sources.length} sources`
              : "Popular"
          }
          icon={<Fire size={11} weight="bold" />}
          loading={loadingPopular}
        >
          {sources.length === 0 ? (
            <div className={s.noSource}>No sources installed. Add extensions first.</div>
          ) : (
            <div className={s.row}>
              {popularManga.map((m) => (
                <MiniCard key={m.id} manga={m} onClick={() => openManga(m)} onContextMenu={(e) => openCtx(e, m)} />
              ))}
              {Array.from({ length: GHOST_COUNT }).map((_, i) => (
                <GhostCard key={`ghost-pop-${i}`} />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Genre rows — searched from sources by genre name */}
      {frecencyGenres.map((genre) => {
        const items = genreResults.get(genre) ?? [];
        const isLoading = genresLoading && items.length === 0;
        if (!isLoading && items.length === 0) return null;
        return (
          <Section
            key={genre}
            title={genre}
            onSeeAll={() => onDrill({ type: "genre", genre })}
            loading={isLoading}
          >
            <div className={s.row}>
              {items.map((m) => (
                <MiniCard key={m.id} manga={m} onClick={() => openManga(m)} onContextMenu={(e) => openCtx(e, m)} />
              ))}
              {Array.from({ length: GHOST_COUNT }).map((_, i) => (
                <GhostCard key={`ghost-${genre}-${i}`} />
              ))}
            </div>
          </Section>
        );
      })}

      {/* Empty state */}
      {!loadingLib && !loadingPopular && !loadingGenres &&
        continueReading.length === 0 && recommended.length === 0 &&
        popularManga.length === 0 && frecencyGenres.every((g) => !genreResults.get(g)?.length) && (
        <div className={s.empty}>
          <span>Nothing to explore yet</span>
          <span className={s.emptyHint}>
            Add manga to your library or install sources to get started.
          </span>
        </div>
      )}

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={buildCtxItems(ctx.manga)}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  );
}