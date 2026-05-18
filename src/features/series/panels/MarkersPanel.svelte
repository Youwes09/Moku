<script lang="ts">
  import { X, MapPin, Trash, PencilSimple, Check } from "phosphor-svelte";
  import { store, removeMarker, updateMarker, openReader } from "@store/state.svelte";
  import type { MarkerEntry, MarkerColor } from "@store/state.svelte";
  import type { Chapter } from "@types";

  interface Props {
    mangaId:  number;
    chapters: Chapter[];
    onClose:  () => void;
  }

  let { mangaId, chapters, onClose }: Props = $props();

  const COLOR_HEX: Record<MarkerColor, string> = {
    yellow: "#c4a94a",
    red:    "#c47a7a",
    blue:   "#7a9ec4",
    green:  "#7aab7a",
    purple: "#a07ac4",
  };

  const markers = $derived(store.getMarkersForManga(mangaId));

  const grouped = $derived.by(() => {
    const map = new Map<number, MarkerEntry[]>();
    for (const m of markers) {
      if (!map.has(m.chapterId)) map.set(m.chapterId, []);
      map.get(m.chapterId)!.push(m);
    }
    const entries = [...map.entries()].map(([chapterId, items]) => ({
      chapterId,
      chapterName: items[0].chapterName,
      items: [...items].sort((a, b) => a.pageNumber - b.pageNumber),
    }));
    const chapterOrder = new Map(chapters.map((c, i) => [c.id, i]));
    entries.sort((a, b) => (chapterOrder.get(a.chapterId) ?? 9999) - (chapterOrder.get(b.chapterId) ?? 9999));
    return entries;
  });

  let editingId: string      = $state("");
  let editNote:  string      = $state("");
  let editColor: MarkerColor = $state("yellow");

  function startEdit(m: MarkerEntry) {
    editingId = m.id;
    editNote  = m.note;
    editColor = m.color;
  }

  function commitEdit() {
    if (!editingId) return;
    updateMarker(editingId, { note: editNote.trim(), color: editColor });
    editingId = "";
  }

  function jumpToMarker(m: MarkerEntry) {
    const chapter = chapters.find(c => c.id === m.chapterId);
    if (!chapter) return;
    const chaptersAsc = [...chapters].sort((a, b) => a.sourceOrder - b.sourceOrder);
    openReader(chapter, chaptersAsc);
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
</script>

<div class="panel">
  <div class="panel-header">
    <div class="panel-title">
      <MapPin size={13} weight="fill" />
      <span>Markers</span>
      {#if markers.length > 0}
        <span class="count">{markers.length}</span>
      {/if}
    </div>
    <button class="close-btn" onclick={onClose}><X size={14} weight="light" /></button>
  </div>

  <div class="panel-body">
    {#if grouped.length === 0}
      <div class="empty">
        <MapPin size={22} weight="light" style="color:var(--text-faint);opacity:0.4" />
        <p>No markers yet</p>
        <p class="empty-sub">Mark pages while reading with the marker button or keybind</p>
      </div>
    {:else}
      {#each grouped as group}
        <div class="group">
          <div class="group-header">
            <span class="group-name">{group.chapterName}</span>
            <span class="group-count">{group.items.length}</span>
          </div>
          {#each group.items as m (m.id)}
            <div class="marker-row" class:editing={editingId === m.id}>
              <div class="marker-dot" style="background:{COLOR_HEX[m.color]}"></div>
              <div class="marker-body">
                {#if editingId === m.id}
                  <div class="edit-wrap">
                    <div class="color-row">
                      {#each Object.entries(COLOR_HEX) as [c, hex]}
                        <button
                          class="color-swatch"
                          class:color-active={editColor === c}
                          style="background:{hex}"
                          onclick={() => editColor = c as MarkerColor}
                          title={c}
                        ></button>
                      {/each}
                    </div>
                    <textarea
                      class="edit-input"
                      rows={3}
                      bind:value={editNote}
                      placeholder="Add a note…"
                      onkeydown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(); } if (e.key === "Escape") editingId = ""; }}
                    ></textarea>
                    <div class="edit-actions">
                      <button class="edit-save" onclick={commitEdit}><Check size={12} weight="bold" /> Save</button>
                      <button class="edit-cancel" onclick={() => editingId = ""}>Cancel</button>
                    </div>
                  </div>
                {:else}
                  <button class="marker-jump" onclick={() => jumpToMarker(m)}>
                    <span class="page-label">p.{m.pageNumber}</span>
                    {#if m.note}
                      <span class="marker-note">{m.note}</span>
                    {:else}
                      <span class="marker-note marker-note-empty">No note</span>
                    {/if}
                    <span class="marker-date">{formatDate(m.updatedAt ?? m.createdAt)}</span>
                  </button>
                  <div class="marker-actions">
                    <button class="marker-action-btn" onclick={() => startEdit(m)} title="Edit"><PencilSimple size={11} weight="light" /></button>
                    <button class="marker-action-btn danger" onclick={() => removeMarker(m.id)} title="Delete"><Trash size={11} weight="light" /></button>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

  .panel-header { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .panel-title { display: flex; align-items: center; gap: var(--sp-2); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); color: var(--text-muted); }
  .count { background: var(--bg-overlay); border: 1px solid var(--border-dim); border-radius: var(--radius-full); font-size: var(--text-2xs); padding: 0 5px; color: var(--text-faint); }
  .close-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--radius-sm); color: var(--text-faint); transition: color var(--t-base), background var(--t-base); }
  .close-btn:hover { color: var(--text-muted); background: var(--bg-raised); }

  .panel-body { flex: 1; overflow-y: auto; padding: var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-1); }

  .empty { display: flex; flex-direction: column; align-items: center; gap: var(--sp-2); padding: var(--sp-8) var(--sp-4); text-align: center; }
  .empty p { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .empty-sub { font-size: var(--text-2xs) !important; opacity: 0.7; max-width: 180px; line-height: var(--leading-snug); }

  .group { display: flex; flex-direction: column; gap: 2px; }
  .group-header { display: flex; align-items: center; justify-content: space-between; padding: 6px var(--sp-2) 4px; }
  .group-name { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .group-count { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); opacity: 0.6; flex-shrink: 0; }

  .marker-row { display: flex; align-items: flex-start; gap: var(--sp-2); padding: 5px var(--sp-2); border-radius: var(--radius-md); transition: background var(--t-fast); }
  .marker-row:hover { background: var(--bg-raised); }
  .marker-row.editing { background: var(--bg-raised); }
  .marker-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }

  .marker-body { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: var(--sp-1); }
  .marker-jump { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; text-align: left; background: none; border: none; padding: 0; cursor: pointer; }
  .page-label { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--accent-fg); letter-spacing: var(--tracking-wide); }
  .marker-note { font-size: var(--text-xs); color: var(--text-secondary); line-height: var(--leading-snug); white-space: pre-wrap; word-break: break-word; }
  .marker-note-empty { color: var(--text-faint); font-style: italic; }
  .marker-date { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }

  .marker-actions { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; opacity: 0; transition: opacity var(--t-fast); }
  .marker-row:hover .marker-actions { opacity: 1; }
  .marker-action-btn { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: var(--radius-sm); color: var(--text-faint); transition: color var(--t-base), background var(--t-base); }
  .marker-action-btn:hover { color: var(--text-muted); background: var(--bg-overlay); }
  .marker-action-btn.danger:hover { color: var(--color-error); background: var(--color-error-bg); }

  .edit-wrap { flex: 1; display: flex; flex-direction: column; gap: var(--sp-2); }
  .color-row { display: flex; gap: 5px; }
  .color-swatch { width: 14px; height: 14px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: border-color var(--t-fast), transform var(--t-fast); flex-shrink: 0; }
  .color-swatch:hover { transform: scale(1.15); }
  .color-active { border-color: var(--text-primary) !important; }
  .edit-input { width: 100%; background: var(--bg-overlay); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 6px 8px; font-size: var(--text-xs); color: var(--text-secondary); outline: none; resize: none; font-family: inherit; line-height: var(--leading-snug); transition: border-color var(--t-base); }
  .edit-input:focus { border-color: var(--border-focus); }
  .edit-actions { display: flex; align-items: center; gap: var(--sp-2); }
  .edit-save { display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: var(--radius-sm); border: 1px solid var(--accent-dim); background: var(--accent-muted); color: var(--accent-fg); font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); cursor: pointer; transition: filter var(--t-fast); }
  .edit-save:hover { filter: brightness(1.15); }
  .edit-cancel { padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); cursor: pointer; transition: color var(--t-base), border-color var(--t-base); }
  .edit-cancel:hover { color: var(--text-muted); border-color: var(--border-strong); }
</style>
