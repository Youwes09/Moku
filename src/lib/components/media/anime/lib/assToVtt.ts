
export function assToVtt(ass: string): string {
  const lines = ass.split(/\r?\n/);
  let fmt: string[] | null = null;
  let inEvents = false;
  const cues: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[.*\]$/.test(line)) {
      inEvents = /^\[events\]$/i.test(line);
      continue;
    }
    if (!inEvents) continue;

    if (/^format:/i.test(line)) {
      fmt = line.slice(line.indexOf(":") + 1).split(",").map((s) => s.trim().toLowerCase());
      continue;
    }
    if (!fmt || !/^dialogue:/i.test(line)) continue;

    const parts = splitN(line.slice(line.indexOf(":") + 1), fmt.length);
    const row: Record<string, string> = {};
    fmt.forEach((k, i) => (row[k] = (parts[i] ?? "").trim()));

    const start = toVttTime(row.start);
    const end = toVttTime(row.end);
    if (!start || !end) continue;

    const text = cleanText(row.text);
    if (!text) continue;

    cues.push(`${start} --> ${end}\n${text}`);
  }

  return "WEBVTT\n\n" + cues.join("\n\n") + "\n";
}

function splitN(s: string, n: number): string[] {
  const out: string[] = [];
  let i = 0;
  for (let k = 0; k < n - 1; k++) {
    const c = s.indexOf(",", i);
    if (c === -1) break;
    out.push(s.slice(i, c));
    i = c + 1;
  }
  out.push(s.slice(i));
  return out;
}

function toVttTime(t: string | undefined): string | null {
  const m = /^(\d+):(\d{2}):(\d{2})[.,](\d{1,3})$/.exec((t ?? "").trim());
  if (!m) return null;
  const [, h, mm, ss, frac] = m;
  const ms = frac.padEnd(3, "0").slice(0, 3);
  return `${h.padStart(2, "0")}:${mm}:${ss}.${ms}`;
}

function cleanText(t: string | undefined): string {
  return (t ?? "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\\N/g, "\n")
    .replace(/\\h/g, " ")
    .replace(/\\n/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
