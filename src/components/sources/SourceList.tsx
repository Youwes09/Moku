import { useEffect, useState } from "react";
import { MagnifyingGlass, CircleNotch, CaretDown, CaretRight } from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import { GET_SOURCES } from "../../lib/queries";
import { useStore } from "../../store";
import type { Source } from "../../lib/types";
import s from "./SourceList.module.css";

type Group = { name: string; icon: string; sources: Source[] };

export default function SourceList() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const setActiveSource = useStore((state) => state.setActiveSource);

  useEffect(() => {
    gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
      .then((d) => setSources(d.sources.nodes))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const langs = ["all", ...Array.from(new Set(sources.map((src) => src.lang))).sort()];

  const filtered = sources.filter((src) => {
    if (src.id === "0") return false;
    const matchLang = lang === "all" || src.lang === lang;
    const matchSearch =
      src.name.toLowerCase().includes(search.toLowerCase()) ||
      src.displayName.toLowerCase().includes(search.toLowerCase());
    return matchLang && matchSearch;
  });

  const groups: Group[] = [];
  const seen = new Map<string, Group>();
  for (const src of filtered) {
    const key = src.name;
    if (!seen.has(key)) {
      const g: Group = { name: src.name, icon: src.iconUrl, sources: [] };
      seen.set(key, g);
      groups.push(g);
    }
    seen.get(key)!.sources.push(src);
  }

  function toggleGroup(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  return (
    <div className={s.root}>
      <div className={s.header}>
        <h1 className={s.heading}>Sources</h1>
        <div className={s.searchWrap}>
          <MagnifyingGlass size={12} className={s.searchIcon} weight="light" />
          <input
            className={s.search}
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={s.langRow}>
        {langs.map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={[s.langBtn, lang === l ? s.langBtnActive : ""].join(" ").trim()}
          >
            {l === "all" ? "All" : l.toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={s.empty}>
          <CircleNotch size={16} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />
        </div>
      ) : groups.length === 0 ? (
        <div className={s.empty}>No sources found.</div>
      ) : (
        <div className={s.list}>
          {groups.map((g) => {
            const single = g.sources.length === 1;
            const open = expanded.has(g.name);

            return (
              <div key={g.name}>
                <button
                  className={s.row}
                  onClick={() => single ? setActiveSource(g.sources[0]) : toggleGroup(g.name)}
                >
                  <img
                    src={thumbUrl(g.icon)}
                    alt={g.name}
                    className={s.icon}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <div className={s.info}>
                    <span className={s.name}>{g.name}</span>
                    <span className={s.meta}>
                      {single
                        ? `${g.sources[0].lang.toUpperCase()}${g.sources[0].isNsfw ? " · NSFW" : ""}`
                        : `${g.sources.length} languages`}
                    </span>
                  </div>
                  <span className={s.arrow}>
                    {single ? "→" : open ? <CaretDown size={12} weight="light" /> : <CaretRight size={12} weight="light" />}
                  </span>
                </button>

                {!single && open && g.sources.map((src) => (
                  <button
                    key={src.id}
                    className={[s.row, s.rowIndented].join(" ")}
                    onClick={() => setActiveSource(src)}
                  >
                    <div className={s.indentSpacer} />
                    <div className={s.info}>
                      <span className={s.name}>{src.lang.toUpperCase()}{src.isNsfw ? " · NSFW" : ""}</span>
                    </div>
                    <span className={s.arrow}>→</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}