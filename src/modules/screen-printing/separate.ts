export type Ink = { id: number; color: string; visible: boolean };
export type Separation = { width: number; height: number; labels: Uint8Array; alpha: Uint8ClampedArray; inks: Ink[] };
const distance = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Quantize colors; index 255 is reserved for transparent pixels. */
export function separatePixels(width: number, height: number, pixels: Uint8ClampedArray, count: number, removeWhite: boolean): Separation {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || pixels.length !== width * height * 4 || width * height > 4_000_000 || !Number.isInteger(count) || count < 2 || count > 12) throw new Error("Imagen o cantidad de tintas no válida.");
  const keys = new Int32Array(width * height).fill(-1), alpha = new Uint8ClampedArray(width * height), histogram = new Map<number, number[]>();
  for (let p = 0; p < keys.length; p++) {
    const i = p * 4, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
    if (!a || (removeWhite && r >= 245 && g >= 245 && b >= 245)) continue;
    alpha[p] = a;
    const key = (r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3); keys[p] = key;
    const sample = histogram.get(key);
    if (sample) { sample[0] += r; sample[1] += g; sample[2] += b; sample[3]++; } else histogram.set(key, [r, g, b, 1]);
  }
  const samples = [...histogram.values()].map(([r, g, b, n]) => [r / n, g / n, b / n, n]).sort((a, b) => b[3] - a[3]);
  if (!samples.length) throw new Error("No quedan píxeles visibles. Desactiva Quitar blanco o carga otra imagen.");
  const centers = [samples[0].slice(0, 3)];
  while (centers.length < Math.min(count, samples.length)) {
    let candidate = samples[0], best = 0;
    for (const sample of samples) { const score = Math.min(...centers.map(center => distance(sample, center))) * Math.sqrt(sample[3]); if (score > best) { best = score; candidate = sample; } }
    if (!best) break; centers.push(candidate.slice(0, 3));
  }
  const closest = (rgb: number[]) => { let best = 0; for (let i = 1; i < centers.length; i++) if (distance(rgb, centers[i]) < distance(rgb, centers[best])) best = i; return best; };
  for (let pass = 0; pass < 6; pass++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const sample of samples) { const sum = sums[closest(sample)]; for (let c = 0; c < 3; c++) sum[c] += sample[c] * sample[3]; sum[3] += sample[3]; }
    sums.forEach((sum, i) => { if (sum[3]) centers[i] = sum.slice(0, 3).map(value => value / sum[3]); });
  }
  const lookup = new Map<number, number>();
  for (const [key, sample] of histogram) lookup.set(key, closest(sample.slice(0, 3).map(value => value / sample[3])));
  const labels = Uint8Array.from(keys, key => key < 0 ? 255 : lookup.get(key)!);
  const inks = centers.map((rgb, id) => ({ id, visible: true, color: `#${rgb.map(value => Math.round(value).toString(16).padStart(2, "0")).join("")}` }));
  return { width, height, labels, alpha, inks };
}

export function recolorLabels(labels: Uint8Array, from: number, to: number) {
  return Uint8Array.from(labels, value => value === from ? to : value);
}

export function renderSeparation(data: Separation, selected: number | null) {
  const colors = new Map(data.inks.filter(ink => ink.visible && (selected === null || selected === ink.id)).map(ink => [ink.id, [parseInt(ink.color.slice(1, 3), 16), parseInt(ink.color.slice(3, 5), 16), parseInt(ink.color.slice(5, 7), 16)]]));
  const pixels = new Uint8ClampedArray(data.width * data.height * 4);
  for (let p = 0; p < data.labels.length; p++) { const color = colors.get(data.labels[p]); if (!color) continue; const i = p * 4; pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = data.alpha[p]; }
  return pixels;
}
