import type { HalftoneOptions, RasterLayer } from "../../core/types";
export const defaultHalftoneOptions: HalftoneOptions = { unit: "source", lpi: 45, shape: "circle", angle: 0, ink: "#000000", invert: false, gamma: 1 };
export interface ScreenSettings extends HalftoneOptions { cellX: number; cellY: number }
export const halftoneOptions = (layer: RasterLayer): HalftoneOptions => ({ ...defaultHalftoneOptions, ...layer.effects.halftoneOptions });

/** One resource for preview and export keeps screen phase and physical frequency stable. */
export function screenGeometry(layer: RasterLayer, dpi: number) {
  const scale = Math.min(1, 4096 / Math.max(layer.width, layer.height), Math.sqrt(12_000_000 / (layer.width * layer.height)));
  const width = Math.max(1, Math.round(layer.width * scale)), height = Math.max(1, Math.round(layer.height * scale));
  const options = halftoneOptions(layer);
  return { width, height, settings: { ...options,
    cellX: options.unit === "lpi" ? width * dpi / (layer.width * options.lpi) : layer.effects.halftoneCell * width / layer.pixelWidth,
    cellY: options.unit === "lpi" ? height * dpi / (layer.height * options.lpi) : layer.effects.halftoneCell * height / layer.pixelHeight,
  } };
}
// Invert the area of a disk clipped to a unit square. Full black covers the full cell.
const circleRadius = Float32Array.from({ length: 1025 }, (_, index) => {
  const area = index / 1024; let low = 0, high = Math.SQRT1_2;
  for (let i = 0; i < 18; i++) {
    const radius = (low + high) / 2, square = radius * radius;
    const covered = Math.PI * square - (radius > .5 ? 4 * (square * Math.acos(.5 / radius) - .5 * Math.sqrt(square - .25)) : 0);
    if (covered < area) low = radius; else high = radius;
  }
  return (low + high) / 2;
});

/** Alpha-weighted, rotated monochrome screen. Never modifies the original pixels. */
export function renderHalftone(image: ImageData, settings: ScreenSettings): ImageData {
  const { width, height, data } = image, { cellX, cellY, angle, shape, ink, invert, gamma } = settings;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 16_777_216 || data.length !== width * height * 4) throw new Error("Imagen inválida para semitonos.");
  if (![cellX, cellY].every(value => Number.isFinite(value) && value >= 1) || !Number.isFinite(angle) || !Number.isFinite(gamma) || gamma < .5 || gamma > 2 || !["circle", "square", "line"].includes(shape) || !/^#[0-9a-f]{6}$/i.test(ink)) throw new Error("La trama necesita al menos 1 píxel por celda. Reduce los LPI o aumenta el tamaño de trama; revisa también sus ajustes.");
  const radians = angle * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
  const corners = [[0, 0], [width / cellX, 0], [0, height / cellY], [width / cellX, height / cellY]].map(([x, y]) => [x * c + y * s, -x * s + y * c]);
  const minU = Math.floor(Math.min(...corners.map(point => point[0]))), minV = Math.floor(Math.min(...corners.map(point => point[1])));
  const columns = Math.ceil(Math.max(...corners.map(point => point[0]))) - minU + 1, rows = Math.ceil(Math.max(...corners.map(point => point[1]))) - minV + 1;
  if (columns * rows > 24_000_000) throw new Error("Trama demasiado densa. Reduce los LPI o aumenta el tamaño de trama.");
  const sums = new Float32Array(columns * rows), weights = new Float32Array(columns * rows);
  const du = c / cellX, dv = -s / cellX;
  for (let y = 0; y < height; y++) {
    let u = .5 * du + (y + .5) / cellY * s, v = .5 * dv + (y + .5) / cellY * c;
    for (let x = 0; x < width; x++, u += du, v += dv) {
      const i = (y * width + x) * 4, alpha = data[i + 3] / 255; if (!alpha) continue;
      const cell = (Math.floor(v) - minV) * columns + Math.floor(u) - minU;
      sums[cell] += (data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722) * alpha; weights[cell] += alpha;
    }
  }
  for (let i = 0; i < sums.length; i++) {
    const value = weights[i] ? Math.max(0, Math.min(1, sums[i] / weights[i] / 255)) : 1;
    const coverage = Math.pow(invert ? value : 1 - value, 1 / gamma);
    sums[i] = !weights[i] || coverage < .000001 ? -1 : coverage > .999999 ? -2 : shape === "circle" ? circleRadius[Math.round(coverage * 1024)] : shape === "square" ? Math.sqrt(coverage) / 2 : coverage / 2;
  }
  const output = new Uint8ClampedArray(data.length), rgb = [1, 3, 5].map(start => parseInt(ink.slice(start, start + 2), 16));
  const edgeScale = Math.min(cellX, cellY);
  for (let y = 0; y < height; y++) {
    let u = .5 * du + (y + .5) / cellY * s, v = .5 * dv + (y + .5) / cellY * c;
    for (let x = 0; x < width; x++, u += du, v += dv) {
      const i = (y * width + x) * 4; if (!data[i + 3]) continue;
      const floorU = Math.floor(u), floorV = Math.floor(v), radius = sums[(floorV - minV) * columns + floorU - minU];
      if (radius === -1) continue;
      const dx = Math.abs(u - floorU - .5), dy = Math.abs(v - floorV - .5);
      const distance = shape === "circle" ? Math.hypot(dx, dy) : shape === "square" ? Math.max(dx, dy) : dy;
      const coverage = radius === -2 ? 1 : Math.max(0, Math.min(1, (radius - distance) * edgeScale + .5));
      if (!coverage) continue;
      output[i] = rgb[0]; output[i + 1] = rgb[1]; output[i + 2] = rgb[2]; output[i + 3] = data[i + 3] * coverage;
    }
  }
  return typeof ImageData === "undefined" ? { data: output, width, height } as ImageData : new ImageData(output, width, height);
}
export const circularHalftone = (image: ImageData, cellSize: number) => renderHalftone(image, { ...defaultHalftoneOptions, cellX: cellSize, cellY: cellSize });
