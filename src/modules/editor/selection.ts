import type { PixelColor } from "../../core/types";
import { colorDistance } from "../background-removal/colorRemoval";

export function magicWandSelect(image: ImageData, point: { x: number; y: number }, tolerance: number): Uint8ClampedArray {
  const { width, height, data } = image;
  const mask = new Uint8ClampedArray(width * height);
  const start = (point.y * width + point.x) * 4;
  const targetColor: PixelColor = { r: data[start], g: data[start + 1], b: data[start + 2], a: data[start + 3] };
  const queue = [point.y * width + point.x];
  mask[queue[0]] = 255;

  for (let head = 0; head < queue.length; head++) {
    const pixel = queue[head];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const index = pixel * 4;
    const current: PixelColor = { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] };

    if (colorDistance(current, targetColor) > tolerance) {
      mask[pixel] = 0;
      continue;
    }

    const neighbors = [
      x > 0 ? pixel - 1 : -1,
      x < width - 1 ? pixel + 1 : -1,
      y > 0 ? pixel - width : -1,
      y < height - 1 ? pixel + width : -1,
    ];

    for (const neighbor of neighbors) {
      if (neighbor >= 0 && mask[neighbor] === 0) {
        mask[neighbor] = 255;
        queue.push(neighbor);
      }
    }
  }

  return mask;
}
