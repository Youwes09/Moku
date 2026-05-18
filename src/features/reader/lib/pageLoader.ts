export { fetchPages, resolveUrl, preloadImage, measureAspect, clearPageCache } from "@core/cache/pageCache";

export function buildPageGroups(urls: string[], aspects: number[], offsetSpreads: boolean): number[][] {
  const groups: number[][] = [[1]];
  if (offsetSpreads) groups.push([2]);
  let i = offsetSpreads ? 3 : 2;
  while (i <= urls.length) {
    const a = aspects[i - 1];
    if (a > 1.2 || i === urls.length) { groups.push([i++]); }
    else { groups.push([i, i + 1]); i += 2; }
  }
  return groups;
}