import { angle, dimensions } from "./layout";
import type { Design } from "./layout";

export type CropRect = { x: number; y: number; width: number; height: number };

/** Includes every non-transparent pixel, including partially transparent edges. */
export function alphaBounds(data: Uint8ClampedArray, width: number, height: number): CropRect | null {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] === 0) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Keep pixels at the same physical scale and position on the sheet at any rotation. */
export function croppedDesign(item: Design, rect: CropRect, imageWidth: number, imageHeight: number, source: string): Design {
  const sx = item.width / imageWidth, sy = item.height / imageHeight;
  const old = dimensions(item), next = { ...item, source, width: rect.width * sx, height: rect.height * sy }, size = dimensions(next);
  const dx = (rect.x + rect.width / 2) * sx - item.width / 2, dy = (rect.y + rect.height / 2) * sy - item.height / 2;
  const radians = angle(item) * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
  return { ...next, x: item.x + old.width / 2 + dx * cos - dy * sin - size.width / 2,
    y: item.y + old.height / 2 + dx * sin + dy * cos - size.height / 2 };
}
