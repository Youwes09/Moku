import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { addToast } from "@store/state.svelte";

function parse(tag: string): number[] {
  return tag.replace(/^v/, "").split(".").map(Number);
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (b[i] ?? 0) - (a[i] ?? 0);
  }
  return 0;
}

export async function checkForUpdateSilently(): Promise<void> {
  try {
    const [currentVersion, releases] = await Promise.all([
      getVersion(),
      invoke<Array<{ tag_name: string; html_url: string }>>("list_releases"),
    ]);

    const valid = releases.filter(r => typeof r.tag_name === "string" && r.tag_name.trim());
    if (!valid.length) return;

    const latestTag = valid
      .map(r => r.tag_name)
      .sort((a, b) => compare(parse(a), parse(b)))[0]
      .replace(/^v/, "");

    if (compare(parse(latestTag), parse(currentVersion)) < 0) {
      addToast({
        kind:     "info",
        title:    `Update available — v${latestTag}`,
        body:     "Open Settings → About to install.",
        duration: 8000,
      });
    }
  } catch {}
}
