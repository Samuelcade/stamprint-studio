import type { PixelColor, RemovalMode } from "../../core/types";

export const colorDistance = (a: PixelColor, b: PixelColor) =>
  Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

const matches = (data: Uint8ClampedArray, offset: number, color: PixelColor, tolerance: number) =>
  colorDistance({ r: data[offset], g: data[offset + 1], b: data[offset + 2], a: data[offset + 3] }, color) <= tolerance;

/** Produces an alpha mask while retaining original pixels in a separate source canvas. */
export function removeColor(
  image: ImageData,
  point: { x: number; y: number },
  tolerance: number,
  mode: RemovalMode,
  existingMask?: Uint8ClampedArray,
): Uint8ClampedArray {
  const { width, height, data } = image;
  const mask = existingMask ? new Uint8ClampedArray(existingMask) : new Uint8ClampedArray(width * height).fill(255);
  const start = (point.y * width + point.x) * 4;
  const color = { r: data[start], g: data[start + 1], b: data[start + 2], a: data[start + 3] };
  if (mode === "global") {
    for (let i = 0; i < width * height; i++) if (matches(data, i * 4, color, tolerance)) mask[i] = 0;
    return mask;
  }
  const seen = new Uint8Array(width * height);
  const queue = [point.y * width + point.x];
  seen[queue[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const pixel = queue[head];
    if (!matches(data, pixel * 4, color, tolerance)) continue;
    mask[pixel] = 0;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    for (const neighbour of [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, y > 0 ? pixel - width : -1, y < height - 1 ? pixel + width : -1]) {
      if (neighbour >= 0 && !seen[neighbour]) { seen[neighbour] = 1; queue.push(neighbour); }
    }
  }
  return mask;
}

export function restoreCircle(mask: Uint8ClampedArray, width: number, point: { x: number; y: number }, radius: number) {
  const next = new Uint8ClampedArray(mask);
  for (let y = Math.max(0, point.y - radius); y <= Math.min(Math.floor(mask.length / width) - 1, point.y + radius); y++) {
    for (let x = Math.max(0, point.x - radius); x <= Math.min(width - 1, point.x + radius); x++) {
      if ((x - point.x) ** 2 + (y - point.y) ** 2 <= radius ** 2) next[y * width + x] = 255;
    }
  }
  return next;
}
