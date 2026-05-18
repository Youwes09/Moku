export { shouldHideNsfw, shouldHideSource, dedupeSourcesByLang } from "@core/util";

export function buildFilter<T>(...predicates: ((item: T) => boolean)[]): (item: T) => boolean {
  return (item) => predicates.every((p) => p(item));
}