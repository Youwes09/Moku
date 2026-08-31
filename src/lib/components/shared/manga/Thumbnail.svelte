<script lang="ts">
  import { settingsState } from "$lib/state/settings.svelte";
  import { getBlobUrl }    from "$lib/core/cache/imageCache";
  import { appState } from "$lib/state/app.svelte";
  import { coverBust } from "$lib/core/cover/coverBust.svelte";



  let {
    src,
    id         = undefined,
    alt        = "",
    class: cls = "",
    loading    = "lazy",
    decoding   = "async",
    priority   = 0,
    onerror    = undefined,
    ...rest
  }: {
    src:       string | null | undefined;
    id?:       string | number;
    alt?:      string;
    class?:    string;
    loading?:  "lazy" | "eager";
    decoding?: "async" | "auto" | "sync";
    priority?: number;
    onerror?:  ((e: Event) => void) | undefined;
    [key: string]: any;
  } = $props();

  function getServerUrl(): string {
    const url = settingsState.settings.serverUrl;
    return typeof url === "string" && url.trim() ? url.replace(/\/$/, "") : "http://localhost:6007";
  }

  function coverKey(url: string): string | null {
    if (id != null) return String(id);
    const m = /\/(?:proxy\/cover|cover|thumbnail)\/([^/?#]+)/.exec(url);
    return m ? m[1] : null;
  }

  function withBust(url: string): string {
    const key = coverKey(url);
    if (key == null) return url;
    const sep = url.includes('?') ? '&' : '?';
    const v = coverBust[key];
    return `${url}${sep}id=${key}${v ? `&v=${v}` : ''}`;
  }

  function plainThumbUrl(path: string | null | undefined): string {
    if (!path) return "";
    const base = path.startsWith("http") ? path : `${getServerUrl()}${path}`;
    return withBust(base);
  }

  const isAuth = false;

  let blobUrl = $state("");
  let reqId   = 0;

  $effect(() => {
    const _src      = src;
    const _priority = priority;
    const _isAuth   = isAuth;

    if (!_isAuth || !_src) { blobUrl = ""; return; }

    const myId    = ++reqId;
    const bareUrl = _src.startsWith("http") ? _src : `${getServerUrl()}${_src}`;
    getBlobUrl(withBust(bareUrl), _priority)
      .then(u  => { if (myId === reqId) blobUrl = u; })
      .catch(() => { if (myId === reqId) blobUrl = ""; });
  });

  const plainUrl = $derived(plainThumbUrl(src));
  const resolved = $derived(isAuth ? (blobUrl || undefined) : (plainUrl || undefined));
</script>

<img src={resolved} {alt} class={cls} {loading} {decoding} {onerror} {...rest} />
