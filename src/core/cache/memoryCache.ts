interface MemEntry<T> {
  value:     T;
  expiresAt: number;
  key:       string;
}

export class MemoryCache<T> {
  readonly #cap: number;
  readonly #ttl: number;
  readonly #map = new Map<string, MemEntry<T>>();

  constructor(capacity: number, ttlMs: number) {
    this.#cap = capacity;
    this.#ttl = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.#map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { this.#map.delete(key); return undefined; }
    this.#map.delete(key);
    this.#map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.#map.has(key)) this.#map.delete(key);
    else if (this.#map.size >= this.#cap) this.#map.delete(this.#map.keys().next().value!);
    this.#map.set(key, { value, expiresAt: Date.now() + this.#ttl, key });
  }

  has(key: string): boolean {
    const entry = this.#map.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) { this.#map.delete(key); return false; }
    return true;
  }

  delete(key: string): void { this.#map.delete(key); }

  clear(): void { this.#map.clear(); }

  get size(): number { return this.#map.size; }
}