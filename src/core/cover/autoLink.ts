import { store, linkManga } from "@store/state.svelte";
import type { Manga } from "@types";

export function autoLinkLibrary(focal: Manga, allManga: Manga[]): Promise<number> {
  return new Promise((resolve) => {
    const worker = new Worker(
      new URL("./autoLinkWorker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (e: MessageEvent<number[]>) => {
      const matches = e.data;
      for (const id of matches) linkManga(focal.id, id);
      worker.terminate();
      resolve(matches.length);
    };

    worker.onerror = () => { worker.terminate(); resolve(0); };

    worker.postMessage({
      focalTitle: focal.title,
      focalId:    focal.id,
      allManga:   allManga.map(m => ({ id: m.id, title: m.title })),
      linkedIds:  store.settings.mangaLinks?.[focal.id] ?? [],
    });
  });
}