const THUMB_SIZE  = 16;
const DUPE_THRESH = 0.12;

const hashCache = new Map<string, Uint8ClampedArray>();

function toGray(data: Uint8ClampedArray, pixels: number): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(pixels);
  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    gray[i] = (data[o] * 299 + data[o + 1] * 587 + data[o + 2] * 114) / 1000;
  }
  return gray;
}

function loadThumb(url: string): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = THUMB_SIZE;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, THUMB_SIZE, THUMB_SIZE);
      resolve(toGray(ctx.getImageData(0, 0, THUMB_SIZE, THUMB_SIZE).data, THUMB_SIZE * THUMB_SIZE));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function similarity(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
  return diff / (a.length * 255);
}

export async function getHash(url: string): Promise<Uint8ClampedArray | null> {
  if (hashCache.has(url)) return hashCache.get(url)!;
  try {
    const thumb = await loadThumb(url);
    hashCache.set(url, thumb);
    return thumb;
  } catch {
    return null;
  }
}

export function areDuplicates(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  return similarity(a, b) <= DUPE_THRESH;
}

export function clearHashCache(): void {
  hashCache.clear();
}