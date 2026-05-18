<script lang="ts">
  import { store } from "@store/state.svelte";
  import Sidebar        from "@shared/chrome/Sidebar.svelte";
  import RecentActivity from "@shared/chrome/RecentActivity.svelte";
  import Library        from "@features/library/components/Library.svelte";
  import SeriesDetail   from "@features/series/components/SeriesDetail.svelte";
  import Home           from "@features/home/components/Home.svelte";
  import Search         from "@features/discover/components/Search.svelte";
  import GenreDrillPage from "@features/discover/components/GenreDrillPage.svelte";
  import Downloads      from "@features/downloads/components/Downloads.svelte";
  import Extensions     from "@features/extensions/components/Extensions.svelte";
  import Tracking       from "@features/tracking/components/Tracking.svelte";
</script>

<div class="frame">
  <div class="shell">
    <Sidebar />
    <main class="main">
      {#if store.activeManga}
        <SeriesDetail />
      {:else if store.genreFilter}
        <GenreDrillPage />
      {:else if store.navPage === "home"}
        <Home />
      {:else if store.navPage === "library"}
        <Library />
      {:else if store.navPage === "search"}
        <Search />
      {:else if store.navPage === "history"}
        <RecentActivity />
      {:else if store.navPage === "downloads"}
        <Downloads />
      {:else if store.navPage === "extensions"}
        <Extensions />
      {:else if store.navPage === "tracking"}
        <Tracking />
      {:else}
        <Home />
      {/if}
    </main>
  </div>
</div>

<style>
  .frame { display: flex; padding: 6px 15px 15px; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; }
  .shell { display: flex; flex: 1; border-radius: 14px; overflow: hidden; border: 1px solid var(--border-dim); background: var(--bg-base); background-image: var(--bg-image); min-height: 0; min-width: 0; }
  .main { flex: 1; overflow: hidden; background: var(--bg-surface); transform: translateZ(0); contain: layout style; min-width: 0; }
</style>