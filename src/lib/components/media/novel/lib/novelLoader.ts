import { pageServerUrl } from "$lib/core/cache/pageCache";

export interface NovelChapterContent {
  text?: string;
  format?: "html" | "text";
  unsupported?: boolean;
}

export async function getChapterText(mediaId: string, chapterId: string): Promise<NovelChapterContent> {
  const base = pageServerUrl();
  try {
    const res = await fetch(`${base}/content/${encodeURIComponent(mediaId)}/${encodeURIComponent(chapterId)}/text`);
    if (res.status === 404 || res.status === 400 || res.status === 501) return { unsupported: true };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("application/json")) {
      const j = await res.json();
      const t = typeof j?.text === "string" ? j.text : "";
      return { text: t, format: /<[a-z][\s\S]*>/i.test(t) ? "html" : "text" };
    }
    const body = await res.text();
    const format: "html" | "text" =
      ct.includes("text/html") || /<\/?(p|div|br|em|strong|h[1-6]|blockquote)\b/i.test(body) ? "html" : "text";
    return { text: body, format };
  } catch {
    return { unsupported: true };
  }
}
