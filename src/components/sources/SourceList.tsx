import { useEffect, useState } from "react";
import { MagnifyingGlass, CircleNotch } from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import { GET_SOURCES } from "../../lib/queries";
import { useStore } from "../../store";
import type { Source } from "../../lib/types";
import s from "./SourceList.module.css";

export default function SourceList() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState("all");
  const [search, setSearch] = useState("");
  const setActiveSource = useStore((state) => state.setActiveSource);

  useEffect(() => {
    gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
      .then((d) => setSources(d.sources.nodes))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const langs = ["all", ...Array.from(new Set(sources.map((s) => s.lang))).sort()];

  const filtered = sources.filter((src) => {
    if (src.id === "0") return false; // hide local source
    const matchLang = lang === "all" || src.lang === lang;
    const matchSearch =
      src.name.toLowerCase().includes(search.toLowerCase()) ||
      src.displayName.toLowerCase().includes(search.toLowerCase());
    return matchLang && matchSearch;
  });

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
      ) : filtered.length === 0 ? (
        <div className={s.empty}>No sources found.</div>
      ) : (
        <div className={s.list}>
          {filtered.map((src) => (
            <button
              key={src.id}
              className={s.row}
              onClick={() => setActiveSource(src)}
            >
              <img
                src={thumbUrl(src.iconUrl)}
                alt={src.name}
                className={s.icon}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <div className={s.info}>
                <span className={s.name}>{src.displayName}</span>
                <span className={s.meta}>{src.lang.toUpperCase()}{src.isNsfw ? " · NSFW" : ""}</span>
              </div>
              <span className={s.arrow}>→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}