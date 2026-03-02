/**
 * Extract dominant colors from an image file using Canvas API.
 * No external dependencies — runs entirely in the browser.
 */

/** Convert RGB to HSL, returns [h, s, l] with s,l in 0-1 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

/** Convert RGB to hex string */
function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Quantize a color channel to reduce the color space */
function quantize(value: number, levels: number): number {
  const step = 256 / levels;
  return Math.round(Math.floor(value / step) * step + step / 2);
}

/** Euclidean distance between two RGB colors */
function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/**
 * Extract dominant colors from a File (image).
 * Draws to a small canvas (64x64), quantizes, filters grays,
 * and returns the top `count` most vibrant colors as hex strings.
 */
export async function extractColors(file: File, count = 4): Promise<string[]> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // Count quantized colors
  const colorMap = new Map<string, { rgb: [number, number, number]; count: number }>();
  const levels = 8; // quantize to 8 levels per channel

  for (let i = 0; i < data.length; i += 4) {
    const r = quantize(data[i], levels);
    const g = quantize(data[i + 1], levels);
    const b = quantize(data[i + 2], levels);
    const key = `${r},${g},${b}`;

    const existing = colorMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      colorMap.set(key, { rgb: [r, g, b], count: 1 });
    }
  }

  // Convert to array and filter out grays/near-blacks/near-whites
  const entries = Array.from(colorMap.values()).filter(({ rgb: [r, g, b] }) => {
    const [, s, l] = rgbToHsl(r, g, b);
    // Skip too dark, too light, or too desaturated
    return s > 0.15 && l > 0.15 && l < 0.85;
  });

  // Score by vibrance: saturation × frequency
  const totalPixels = size * size;
  const scored = entries.map((entry) => {
    const [, s] = rgbToHsl(...entry.rgb);
    const freq = entry.count / totalPixels;
    return { ...entry, score: s * freq };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Pick top colors that are distinct enough from each other
  const minDistance = 50; // minimum RGB distance between picked colors
  const picked: Array<{ rgb: [number, number, number]; hex: string }> = [];

  for (const entry of scored) {
    if (picked.length >= count) break;
    const tooClose = picked.some((p) => colorDistance(p.rgb, entry.rgb) < minDistance);
    if (!tooClose) {
      picked.push({ rgb: entry.rgb, hex: rgbToHex(...entry.rgb) });
    }
  }

  return picked.map((p) => p.hex);
}

/** Load a File as an HTMLImageElement */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}
