<script lang="ts">
  import { seriesState } from "$lib/state/series.svelte";
  import { novelReaderState, type NovelFont, type NovelTheme } from "$lib/state/novelReader.svelte";
  import MediaSettingsPanel from "$lib/components/media/shared/MediaSettingsPanel.svelte";

  interface Props { onClose: () => void }
  let { onClose }: Props = $props();

  const st = novelReaderState;

  const FONTS: { k: NovelFont; label: string }[] = [
    { k: "serif", label: "Serif" },
    { k: "sans",  label: "Sans" },
    { k: "mono",  label: "Mono" },
  ];
  const THEMES: { k: NovelTheme; label: string; swatch: string }[] = [
    { k: "paper", label: "Paper", swatch: "#f5f2e9" },
    { k: "sepia", label: "Sepia", swatch: "#efe3c8" },
    { k: "dark",  label: "Dark",  swatch: "#14140f" },
  ];
</script>

<MediaSettingsPanel title="Novel Settings" subtitle={seriesState.activeManga?.title} onClose={onClose}>
  <div class="msp-group">
    <p class="msp-label">Font</p>
    <div class="msp-seg">
      {#each FONTS as f (f.k)}
        <button class="msp-seg-btn" class:on={st.fontFamily === f.k} onclick={() => st.setFont(f.k)}>{f.label}</button>
      {/each}
    </div>
  </div>

  <div class="msp-group">
    <p class="msp-label">Text</p>
    <div class="msp-row">
      <span>Size</span>
      <div class="msp-stepper">
        <button aria-label="Smaller" onclick={() => st.bumpFont(-0.05)}>−</button>
        <span class="msp-val">{Math.round(st.fontScale * 100)}%</span>
        <button aria-label="Larger" onclick={() => st.bumpFont(0.05)}>+</button>
      </div>
    </div>
    <div class="msp-row">
      <span>Line height</span>
      <div class="msp-stepper">
        <button aria-label="Tighter" onclick={() => st.bumpLine(-0.1)}>−</button>
        <span class="msp-val">{st.lineHeight.toFixed(1)}</span>
        <button aria-label="Looser" onclick={() => st.bumpLine(0.1)}>+</button>
      </div>
    </div>
    <div class="msp-row">
      <span>Paragraph gap</span>
      <div class="msp-stepper">
        <button aria-label="Less" onclick={() => st.bumpPara(-0.1)}>−</button>
        <span class="msp-val">{st.paraSpacing.toFixed(1)}</span>
        <button aria-label="More" onclick={() => st.bumpPara(0.1)}>+</button>
      </div>
    </div>
    <div class="msp-row">
      <span>Column width</span>
      <div class="msp-stepper">
        <button aria-label="Narrower" onclick={() => st.bumpWidth(-2)}>−</button>
        <span class="msp-val">{st.pageWidth}</span>
        <button aria-label="Wider" onclick={() => st.bumpWidth(2)}>+</button>
      </div>
    </div>
  </div>

  <div class="msp-group">
    <p class="msp-label">Alignment</p>
    <div class="msp-seg">
      <button class="msp-seg-btn" class:on={st.textAlign === "left"} onclick={() => st.setAlign("left")}>Left</button>
      <button class="msp-seg-btn" class:on={st.textAlign === "justify"} onclick={() => st.setAlign("justify")}>Justify</button>
    </div>
  </div>

  <div class="msp-group">
    <p class="msp-label">Theme</p>
    <div class="msp-tiles ns-themes">
      {#each THEMES as t (t.k)}
        <button class="msp-tile" class:on={st.theme === t.k} onclick={() => st.setTheme(t.k)}>
          <span class="ns-swatch" style="background:{t.swatch}"></span>
          <span class="msp-tile-label">{t.label}</span>
        </button>
      {/each}
    </div>
  </div>
</MediaSettingsPanel>

<style>
  .ns-themes { grid-template-columns: repeat(3, 1fr); }
  .ns-swatch {
    width: 20px; height: 20px; border-radius: var(--radius-sm);
    border: 1px solid color-mix(in srgb, #fff 22%, transparent);
  }
</style>
