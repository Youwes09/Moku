<script lang="ts">
  export interface MenuItem {
    label:      string;
    icon?:      any;
    onClick:    () => void;
    danger?:    boolean;
    disabled?:  boolean;
    separator?: never;
    children?:  MenuEntry[];
  }
  export interface MenuSeparator { separator: true }
  export type MenuEntry = MenuItem | MenuSeparator;

  interface Props {
    x:       number;
    y:       number;
    items:   MenuEntry[];
    onClose: () => void;
  }

  let { x, y, items, onClose }: Props = $props();

  let focused  = $state(-1);
  let el       = $state<HTMLDivElement | undefined>(undefined);
  let measured = $state(false);
  let pos      = $state({ left: 0, top: 0 });
  let subOpen  = $state(-1);
  let subEls   = $state<(HTMLDivElement | null)[]>([]);

  const actionable = $derived(
    items
      .map((_, i) => i)
      .filter((i) => !("separator" in items[i]) && !(items[i] as MenuItem).disabled)
  );

  $effect(() => { if (actionable.length && focused === -1) focused = actionable[0]; });

  function getZoom(): number {
    const raw = parseFloat(document.documentElement.style.zoom || "1") || 1;
    return raw > 10 ? raw / 100 : raw;
  }

  $effect(() => {
    if (!el) return;
    const zoom      = getZoom();
    const style     = getComputedStyle(document.documentElement);
    const sidebarW  = parseFloat(style.getPropertyValue('--sidebar-width'))  || 52;
    const titlebarH = parseFloat(style.getPropertyValue('--titlebar-height')) || 36;
    const vw    = window.innerWidth  / zoom;
    const vh    = window.innerHeight / zoom;
    const sx    = x / zoom - sidebarW  / zoom;
    const sy    = y / zoom - titlebarH / zoom;
    const menuW = el.offsetWidth;
    const menuH = el.offsetHeight;
    pos = {
      left: Math.max(4, sx + menuW > vw ? sx - menuW : sx),
      top:  Math.max(4, sy + menuH > vh ? sy - menuH : sy),
    };
    measured = true;
  });

  $effect(() => {
    if (subOpen < 0) return;
    const sub = subEls[subOpen];
    if (!sub) return;
    requestAnimationFrame(() => {
      const zoom = getZoom();
      const vw   = window.innerWidth / zoom;
      const rect = sub.getBoundingClientRect();
      if (rect.right / zoom > vw) sub.classList.add("sub-flip");
      else sub.classList.remove("sub-flip");
    });
  });

  function onMouseDown(e: MouseEvent) {
    const inMain = el?.contains(e.target as Node);
    const inSub  = subOpen >= 0 && subEls[subOpen]?.contains(e.target as Node);
    if (!inMain && !inSub) onClose();
  }

  function onTouchStartOutside(e: TouchEvent) {
    const inMain = el?.contains(e.target as Node);
    const inSub  = subOpen >= 0 && subEls[subOpen]?.contains(e.target as Node);
    if (!inMain && !inSub) onClose();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (subOpen >= 0) { subOpen = -1; } else { onClose(); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const cur = actionable.indexOf(focused);
      focused = actionable[(cur + 1) % actionable.length] ?? actionable[0];
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const cur = actionable.indexOf(focused);
      focused = actionable[(cur - 1 + actionable.length) % actionable.length] ?? actionable[0];
      return;
    }
    if (e.key === "ArrowRight" && focused >= 0) {
      const item = items[focused] as MenuItem;
      if (item?.children?.length) { subOpen = focused; return; }
    }
    if (e.key === "ArrowLeft") { subOpen = -1; return; }
    if (e.key === "Enter" && focused >= 0) {
      e.preventDefault();
      const item = items[focused] as MenuItem;
      if (item?.children?.length) { subOpen = focused; return; }
      if (item && !item.disabled) { item.onClick(); onClose(); }
    }
  }

  $effect(() => {
    document.addEventListener("mousedown",  onMouseDown,         true);
    document.addEventListener("touchstart", onTouchStartOutside, true);
    document.addEventListener("keydown",    onKey,               true);
    return () => {
      document.removeEventListener("mousedown",  onMouseDown,         true);
      document.removeEventListener("touchstart", onTouchStartOutside, true);
      document.removeEventListener("keydown",    onKey,               true);
    };
  });
</script>

<div bind:this={el} class="menu" role="menu" tabindex="-1"
  style="left:{pos.left}px;top:{pos.top}px;visibility:{measured ? 'visible' : 'hidden'}"
  oncontextmenu={(e) => e.preventDefault()}>
  {#each items as item, i}
    {#if "separator" in item}
      <div class="sep"></div>
    {:else}
      {@const mi = item as MenuItem}
      {@const hasSub = !!mi.children?.length}
      <div class="item-wrap">
        <button
          class="item"
          class:danger={mi.danger}
          class:disabled={mi.disabled}
          class:focused={focused === i}
          class:has-sub={hasSub}
          disabled={mi.disabled}
          onclick={() => {
            if (mi.disabled) return;
            if (hasSub) { subOpen = subOpen === i ? -1 : i; return; }
            mi.onClick(); onClose();
          }}
          onmouseenter={() => { if (!mi.disabled) { focused = i; subOpen = hasSub ? i : -1; } }}
          onmouseleave={() => { focused = -1; }}
        >
          <span class="icon" class:icon-danger={mi.danger}>
            {#if mi.icon}<mi.icon size={13} weight="light" />{/if}
          </span>
          <span class="label">{mi.label}</span>
          {#if hasSub}<span class="sub-arrow">›</span>{/if}
        </button>
        {#if hasSub && subOpen === i}
          <div bind:this={subEls[i]} class="menu submenu" role="menu" tabindex="-1"
            onmouseenter={() => { subOpen = i; }}>
            {#each mi.children as child}
              {#if "separator" in child}
                <div class="sep"></div>
              {:else}
                {@const sc = child as MenuItem}
                <button
                  class="item"
                  class:danger={sc.danger}
                  class:disabled={sc.disabled}
                  disabled={sc.disabled}
                  onclick={() => { if (!sc.disabled) { sc.onClick(); onClose(); } }}
                >
                  <span class="icon" class:icon-danger={sc.danger}>
                    {#if sc.icon}<sc.icon size={13} weight="light" />{/if}
                  </span>
                  <span class="label">{sc.label}</span>
                </button>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .menu {
    position: fixed; z-index: 200;
    background: var(--bg-raised); border: 1px solid var(--border-base);
    border-radius: var(--radius-lg); padding: var(--sp-1); min-width: 190px;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.35), 0 16px 40px rgba(0,0,0,0.25);
    animation: scaleIn 0.1s ease both; transform-origin: top left;
  }
  .item-wrap { position: relative; }
  .submenu {
    position: absolute;
    left: 100%;
    top: 0;
    z-index: 201;
    animation: scaleIn 0.08s ease both;
    transform-origin: top left;
  }
  :global(.submenu.sub-flip) {
    left: auto;
    right: 100%;
    transform-origin: top right;
  }
  .item {
    display: flex; align-items: center; gap: var(--sp-2);
    width: 100%; padding: 5px var(--sp-2); border-radius: var(--radius-md);
    font-size: var(--text-sm); color: var(--text-secondary);
    text-align: left; cursor: pointer; background: none; border: none; outline: none;
    transition: background var(--t-fast), color var(--t-fast);
    position: relative;
  }
  .item:hover:not(.disabled), .item.focused:not(.disabled) { background: var(--bg-overlay); color: var(--text-primary); }
  .item.danger { color: var(--color-error); }
  .item.danger:hover:not(.disabled), .item.danger.focused:not(.disabled) { background: var(--color-error-bg); }
  .item.disabled { opacity: 0.3; cursor: default; pointer-events: none; }
  .icon { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; flex-shrink: 0; color: var(--text-faint); border-radius: var(--radius-sm); }
  .icon-danger { color: var(--color-error); opacity: 0.7; }
  .label { flex: 1; line-height: 1.3; }
  .sub-arrow { font-size: 14px; color: var(--text-faint); line-height: 1; margin-left: auto; padding-left: var(--sp-1); }
  .sep { height: 1px; background: var(--border-dim); margin: 3px var(--sp-1); }

  @keyframes scaleIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
</style>