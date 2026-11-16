export type QualitySize = "original" | "2x" | "4k" | "8k";
export interface PixelImage { width: number; height: number; data: Uint8ClampedArray }

export function qualityDimensions(width: number, height: number, size: QualitySize) {
  if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 4096)) throw new Error("La imagen debe tener hasta 4096 píxeles por lado.");
  const longest = Math.max(width, height);
  const target = size === "original" ? longest : size === "2x" ? Math.min(4096, longest * 2) : size === "8k" ? 7680 : 4096;
  return { width: Math.max(1, Math.round(width * target / longest)), height: Math.max(1, Math.round(height * target / longest)) };
}

function cubic(x: number) {
  x = Math.abs(x);
  return x <= 1 ? 1.5 * x ** 3 - 2.5 * x ** 2 + 1 : x < 2 ? -.5 * x ** 3 + 2.5 * x ** 2 - 4 * x + 2 : 0;
}
function samples(input: number, output: number) {
  const indices = new Int32Array(output * 4), weights = new Float32Array(output * 4);
  for (let i = 0; i < output; i++) {
    const position = (i + .5) * input / output - .5, base = Math.floor(position);
    for (let tap = 0; tap < 4; tap++) {
      indices[i * 4 + tap] = Math.min(input - 1, Math.max(0, base + tap - 1));
      weights[i * 4 + tap] = cubic(position - (base + tap - 1));
    }
  }
  return { indices, weights };
}

/** Bicubic interpolation in premultiplied alpha; four cached rows bound temporary memory. */
export function upscaleBicubic(image: PixelImage, width: number, height: number, progress?: (value: number) => void): PixelImage {
  if (width === image.width && height === image.height) return { width, height, data: new Uint8ClampedArray(image.data) };
  const horizontal = samples(image.width, width), vertical = samples(image.height, height);
  const data = new Uint8ClampedArray(width * height * 4), rows = new Map<number, Float32Array>();
  for (let y = 0; y < height; y++) {
    const needed = new Set(Array.from(vertical.indices.subarray(y * 4, y * 4 + 4)));
    for (const key of rows.keys()) if (!needed.has(key)) rows.delete(key);
    for (const sourceY of needed) {
      if (rows.has(sourceY)) continue;
      const row = new Float32Array(width * 4);
      for (let x = 0; x < width; x++) {
        const dst = x * 4;
        for (let tap = 0; tap < 4; tap++) {
          const src = (sourceY * image.width + horizontal.indices[dst + tap]) * 4, weight = horizontal.weights[dst + tap];
          const alpha = image.data[src + 3] / 255;
          row[dst] += image.data[src] * alpha * weight;
          row[dst + 1] += image.data[src + 1] * alpha * weight;
          row[dst + 2] += image.data[src + 2] * alpha * weight;
          row[dst + 3] += alpha * weight;
        }
      }
      rows.set(sourceY, row);
    }
    const row0 = rows.get(vertical.indices[y * 4])!, row1 = rows.get(vertical.indices[y * 4 + 1])!;
    const row2 = rows.get(vertical.indices[y * 4 + 2])!, row3 = rows.get(vertical.indices[y * 4 + 3])!;
    const w0 = vertical.weights[y * 4], w1 = vertical.weights[y * 4 + 1], w2 = vertical.weights[y * 4 + 2], w3 = vertical.weights[y * 4 + 3];
    for (let x = 0; x < width; x++) {
      const p = x * 4, dst = (y * width + x) * 4;
      const alpha = row0[p + 3] * w0 + row1[p + 3] * w1 + row2[p + 3] * w2 + row3[p + 3] * w3;
      data[dst + 3] = Math.min(1, Math.max(0, alpha)) * 255;
      if (!data[dst + 3]) continue;
      for (let c = 0; c < 3; c++) data[dst + c] = (row0[p + c] * w0 + row1[p + c] * w1 + row2[p + c] * w2 + row3[p + c] * w3) / alpha;
    }
    if (y % 64 === 0) progress?.(y / height);
  }
  progress?.(1); return { width, height, data };
}

/** Alpha-weighted unsharp mask. Preserve alpha and suppress small noise/large halos. */
export function sharpenImage(image: PixelImage, strength: number, progress?: (value: number) => void): PixelImage {
  const amount = Math.min(100, Math.max(0, strength)) / 100 * 1.5;
  if (!amount) return image;
  const { width, height, data } = image, output = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4; if (!data[dst + 3]) continue;
      let r = 0, g = 0, b = 0, total = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const src = (Math.max(0, Math.min(height - 1, y + dy)) * width + Math.max(0, Math.min(width - 1, x + dx))) * 4;
        const weight = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1) * data[src + 3];
        total += weight; r += data[src] * weight; g += data[src + 1] * weight; b += data[src + 2] * weight;
      }
      for (let c = 0; c < 3; c++) {
        const difference = data[dst + c] - (c === 0 ? r : c === 1 ? g : b) / total;
        if (Math.abs(difference) > 2) output[dst + c] = data[dst + c] + Math.min(20, Math.max(-20, difference * amount));
      }
    }
    if (y % 64 === 0) progress?.(y / height);
  }
  progress?.(1); return { width, height, data: output };
}
