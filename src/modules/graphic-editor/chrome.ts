import type { RasterEffects } from "../../core/types";
type ChromeOptions = Pick<RasterEffects, "chromeStyle" | "chromeRelief">;
const palettes = {
  liquid: [[0, 255, 255, 255], [.14, 145, 153, 165], [.28, 248, 251, 255], [.43, 20, 25, 32], [.50, 4, 6, 10], [.515, 252, 254, 255], [.66, 106, 115, 128], [.80, 16, 22, 30], [.92, 232, 239, 250], [1, 255, 255, 255]],
  blue: [[0, 246, 254, 255], [.14, 34, 132, 224], [.28, 232, 250, 255], [.43, 4, 27, 66], [.50, 0, 3, 13], [.515, 249, 255, 255], [.66, 45, 156, 244], [.80, 2, 16, 43], [.92, 194, 238, 255], [1, 255, 255, 255]],
  holographic: [[0, 255, 255, 255], [.14, 92, 226, 248], [.28, 245, 187, 255], [.43, 111, 20, 115], [.50, 7, 5, 18], [.515, 253, 255, 255], [.66, 255, 78, 210], [.80, 44, 17, 68], [.92, 121, 241, 255], [1, 255, 255, 255]],
};
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

/** Small analysis maps keep the relief calculation bounded even for print-sized PNGs. */
function surface(image: { width: number; height: number; data: Uint8ClampedArray }, relief: number) {
  const { width, height, data } = image, scale = Math.min(1, 1024 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale)), count = w * h;
  const light = new Float32Array(count), distance = new Uint8Array(count), histogram = new Uint32Array(256);
  let visible = 0, top = h, bottom = -1, left = w, right = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = (Math.min(height - 1, Math.floor((y + .5) / scale)) * width + Math.min(width - 1, Math.floor((x + .5) / scale))) * 4;
    light[p] = (data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722) / 255;
    if (data[i + 3] > 16) {
      histogram[Math.round(light[p] * 255)]++; visible++; distance[p] = 64;
      top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x);
    }
  }
  const percentile = (fraction: number) => {
    let total = 0; for (let i = 0; i < 256; i++) { total += histogram[i]; if (total >= visible * fraction) return i / 255; } return 1;
  };
  const low = percentile(.05), high = percentile(.95), textured = high - low > .12;
  // Distance to transparency forms a rounded bevel, rather than a flat gradient fill.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (!distance[p]) continue;
    distance[p] = Math.min(distance[p], x ? distance[p - 1] + 1 : 64, y ? distance[p - w] + 1 : 64);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const p = y * w + x; if (!distance[p]) continue;
    distance[p] = Math.min(distance[p], x + 1 < w ? distance[p + 1] + 1 : 64, y + 1 < h ? distance[p + w] + 1 : 64);
  }
  // Separable blur of source shading: reflections bend around existing facial/object detail.
  const smooth = new Float32Array(count), radius = Math.max(1, Math.round(Math.min(w, h) * .004));
  for (let y = 0; y < h; y++) {
    let sum = 0; for (let x = -radius; x <= radius; x++) sum += light[y * w + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      smooth[y * w + x] = sum / (radius * 2 + 1);
      sum += light[y * w + clamp(x + radius + 1, 0, w - 1)] - light[y * w + clamp(x - radius, 0, w - 1)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0; for (let y = -radius; y <= radius; y++) sum += smooth[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      light[y * w + x] = sum / (radius * 2 + 1);
      sum += smooth[clamp(y + radius + 1, 0, h - 1) * w + x] - smooth[clamp(y - radius, 0, h - 1) * w + x];
    }
  }
  const bevel = Math.max(2, Math.min(28, Math.min(right - left + 1, bottom - top + 1) * (.03 + relief * .08)));
  for (let p = 0; p < count; p++) {
    const t = clamp(distance[p] / bevel);
    smooth[p] = distance[p] ? Math.sqrt(t * (2 - t)) * relief + (textured ? light[p] * relief * .8 : 0) : 0;
  }
  const normals = new Float32Array(count * 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    normals[p * 2] = (smooth[y * w + Math.max(0, x - 1)] - smooth[y * w + Math.min(w - 1, x + 1)]) * bevel;
    normals[p * 2 + 1] = (smooth[Math.max(0, y - 1) * w + x] - smooth[Math.min(h - 1, y + 1) * w + x]) * bevel;
  }
  return { w, h, normals, distance, low, high, textured, top, bottom, left, right };
}

/** Recolor visible pixels only; alpha and the original source remain intact. */
export function chromePixels(image: { width: number; height: number; data: Uint8ClampedArray }, intensity: number, options: ChromeOptions = {}): Uint8ClampedArray {
  const { width, height, data } = image, result = new Uint8ClampedArray(data);
  const strength = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity / 100)) : 0;
  if (!strength) return result;
  const relief = clamp((options.chromeRelief ?? 70) / 100), map = surface(image, relief);
  if (map.bottom < map.top) return result;
  const reflections = palettes[options.chromeStyle ?? "liquid"] ?? palettes.liquid;
  const sample = (x: number, y: number, axis: number) => {
    const px = clamp(x, 0, map.w - 1), py = clamp(y, 0, map.h - 1), x0 = Math.floor(px), y0 = Math.floor(py);
    const x1 = Math.min(map.w - 1, x0 + 1), y1 = Math.min(map.h - 1, y0 + 1), fx = px - x0, fy = py - y0;
    const a = map.normals[(y0 * map.w + x0) * 2 + axis] * (1 - fx) + map.normals[(y0 * map.w + x1) * 2 + axis] * fx;
    const b = map.normals[(y1 * map.w + x0) * 2 + axis] * (1 - fx) + map.normals[(y1 * map.w + x1) * 2 + axis] * fx;
    return a * (1 - fy) + b * fy;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4; if (!data[i + 3]) continue;
    const mx = (x + .5) / width * map.w - .5, my = (y + .5) / height * map.h - .5;
    const nx = sample(mx, my, 0), ny = sample(mx, my, 1);
    const luminance = (data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722) / 255;
    const tone = map.textured ? clamp((luminance - map.low) / (map.high - map.low)) : .5;
    const vertical = (my - map.top) / Math.max(1, map.bottom - map.top);
    const position = clamp(vertical + ny * .30 + nx * .14 + (map.textured ? (tone - .5) * .30 : 0));
    let stop = 1; while (stop < reflections.length - 1 && reflections[stop][0] < position) stop++;
    const a = reflections[stop - 1], b = reflections[stop], mix = (position - a[0]) / (b[0] - a[0]);
    const distance = map.distance[clamp(Math.round(my), 0, map.h - 1) * map.w + clamp(Math.round(mx), 0, map.w - 1)];
    const shadow = map.textured ? clamp(luminance / .06) : 1;
    const specular = 150 * Math.exp(-((nx + .55) ** 2 + (ny + .7) ** 2) * 12) * relief * shadow;
    const shade = map.textured ? (.15 + .85 * Math.sqrt(tone)) * shadow : 1;
    for (let c = 0; c < 3; c++) {
      let silver = (a[c + 1] + (b[c + 1] - a[c + 1]) * mix) * shade + specular;
      if (relief > .1 && distance === 1) silver = Math.max(silver, 235 + c * 6);
      else if (relief > .1 && distance === 2) silver *= .35;
      silver = clamp(silver, 0, 255);
      result[i + c] = data[i + c] + (silver - data[i + c]) * strength;
    }
  }
  return result;
}

export function applyChrome(canvas: HTMLCanvasElement, intensity: number, options: ChromeOptions = {}) {
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("No se pudo generar el acabado cromado.");
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  image.data.set(chromePixels(image, intensity, options)); ctx.putImageData(image, 0, 0);
}
