<script lang="ts">
  import Thumbnail from "$lib/components/shared/manga/Thumbnail.svelte";

  interface Props {
    trackerKey: string;
    iconUrl?: string | null;
    size?: number;
    class?: string;
  }
  let { trackerKey, iconUrl = null, size = 20, class: cls = "" }: Props = $props();

  let imgFailed = $state(false);
  $effect(() => { iconUrl; imgFailed = false; });
</script>

{#if iconUrl && !imgFailed}
  <span class="trk-logo trk-logo-img {cls}" style="width:{size}px;height:{size}px">
    <Thumbnail src={iconUrl} alt="" class="trk-logo-img-el" onerror={() => (imgFailed = true)} />
  </span>
{:else if trackerKey === "anilist"}
  <svg
    class="trk-logo trk-logo-anilist {cls}"
    style="width:{size}px;height:{size}px"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M6.361 2.943 0 21.056h4.942l1.077-3.133H11.4l1.052 3.133H24c.71 0 1.29-.581 1.29-1.29V17.61c0-.71-.58-1.29-1.29-1.29h-4.017V2.943c0-.71-.58-1.29-1.29-1.29h-2.51c-.71 0-1.29.58-1.29 1.29v13.377h-1.29L9.372 2.943c-.191-.71-.771-1.29-1.481-1.29H6.361Zm2.036 6.807 1.317 5.09H6.947l1.45-5.09Z" />
  </svg>
{:else}
  <span
    class="trk-logo trk-logo-generic {cls}"
    style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.52)}px"
    aria-hidden="true"
  >{trackerKey.charAt(0).toUpperCase()}</span>
{/if}

<style>
  .trk-logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .trk-logo-img { border-radius: var(--radius-sm); overflow: hidden; }
  .trk-logo-img :global(.trk-logo-img-el) {
    width: 100%; height: 100%; object-fit: contain; display: block;
  }
  .trk-logo-anilist { color: #02a9ff; }
  .trk-logo-generic {
    border-radius: var(--radius-sm);
    background: var(--bg-raised);
    border: 1px solid var(--border-dim);
    color: var(--text-muted);
    font-family: var(--font-ui);
    font-weight: 600;
  }
</style>
