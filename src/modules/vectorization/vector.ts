export interface Point { x: number; y: number }
export interface VectorPath { id: string; color: string; visible: boolean; contours: Point[][] }
export interface VectorResult { width: number; height: number; paths: VectorPath[] }
export interface TraceOptions {
  mode: "color" | "mono"; colors: number; threshold: number; invert: boolean;
  removeWhite: boolean; whiteTolerance: number; alphaThreshold: number;
  minArea: number; simplification: number; resolution: number;
}
export const defaultTraceOptions: TraceOptions = { mode: "color", colors: 8, threshold: 160, invert: false, removeWhite: false, whiteTolerance: 20, alphaThreshold: 32, minArea: 4, simplification: 1, resolution: 768 };
export interface VectorSession { name: string; source: string; widthCm: number; options: TraceOptions; tracedOptions?: TraceOptions; result?: VectorResult; smoothing: boolean }
export const emptyVectorSession = (): VectorSession => ({ name: "Mi vector", source: "", widthCm: 25, options: { ...defaultTraceOptions }, smoothing: false });

const distance = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
function paletteFor(histogram: Map<number, number[]>, limit: number) {
  const samples = [...histogram.values()].map(([r, g, b, count]) => [r / count, g / count, b / count, count]);
  samples.sort((a, b) => b[3] - a[3]);
  if (!samples.length) return [];
  const centers = [samples[0].slice(0, 3)];
  while (centers.length < Math.min(limit, samples.length)) {
    let candidate = samples[0], score = -1;
    for (const sample of samples) {
      const value = Math.min(...centers.map(center => distance(sample, center))) * Math.sqrt(sample[3]);
      if (value > score) { score = value; candidate = sample; }
    }
    if (score <= 0) break;
    centers.push(candidate.slice(0, 3));
  }
  for (let pass = 0; pass < 7; pass++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const sample of samples) {
      let best = 0;
      for (let i = 1; i < centers.length; i++) if (distance(sample, centers[i]) < distance(sample, centers[best])) best = i;
      for (let c = 0; c < 3; c++) sums[best][c] += sample[c] * sample[3];
      sums[best][3] += sample[3];
    }
    sums.forEach((sum, index) => { if (sum[3]) centers[index] = sum.slice(0, 3).map(value => value / sum[3]); });
  }
  return centers.map(center => center.map(Math.round));
}
export function signedArea(points: Point[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; sum += a.x * b.y - b.x * a.y; }
  return sum / 2;
}
function simplifyLine(points: Point[], tolerance: number) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!, a = points[first], b = points[last];
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    let max = tolerance * tolerance, index = -1;
    for (let i = first + 1; i < last; i++) {
      const point = points[i], t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
      const d = (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
      if (d > max) { max = d; index = i; }
    }
    if (index >= 0) { keep[index] = 1; stack.push([first, index], [index, last]); }
  }
  return points.filter((_, index) => keep[index]);
}
export function simplifyContour(points: Point[], tolerance: number) {
  // First collapse collinear pixel edges, then split a closed ring into two open arcs.
  const corners = points.filter((point, i) => {
    const previous = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
    return (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x);
  });
  if (corners.length < 4 || tolerance <= 0) return corners;
  let split = 1, far = 0;
  corners.forEach((point, index) => { const d = (point.x - corners[0].x) ** 2 + (point.y - corners[0].y) ** 2; if (d > far) { far = d; split = index; } });
  const simplified = [...simplifyLine(corners.slice(0, split + 1), tolerance).slice(0, -1), ...simplifyLine([...corners.slice(split), corners[0]], tolerance).slice(0, -1)];
  return simplified.length >= 3 && Math.sign(signedArea(simplified)) === Math.sign(signedArea(corners)) ? simplified : corners;
}

/** Trace directed pixel boundaries with clockwise outer rings and counterclockwise holes. */
function contoursFor(labels: Int16Array, width: number, height: number, color: number, options: TraceOptions) {
  const stride = width + 1, edges = new Map<number, number[]>();
  let edgeCount = 0;
  const add = (from: number, to: number) => {
    if (++edgeCount > 350000) throw new Error("La imagen tiene demasiados bordes. Reduce el detalle de análisis o usa menos colores.");
    const list = edges.get(from); if (list) list.push(to); else edges.set(from, [to]);
  };
  const at = (x: number, y: number) => x < 0 || y < 0 || x >= width || y >= height ? -1 : labels[y * width + x];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (at(x, y) === color) {
    const a = y * stride + x, b = a + 1, c = a + stride + 1, d = a + stride;
    if (at(x, y - 1) !== color) add(a, b);
    if (at(x + 1, y) !== color) add(b, c);
    if (at(x, y + 1) !== color) add(c, d);
    if (at(x - 1, y) !== color) add(d, a);
  }
  const direction = (a: number, b: number) => b === a + 1 ? 0 : b === a + stride ? 1 : b === a - 1 ? 2 : 3;
  const result: Point[][] = []; let nodes = 0;
  while (edges.size) {
    const start = edges.keys().next().value!, ring: Point[] = [];
    let current = start, incoming = -1;
    do {
      ring.push({ x: current % stride, y: Math.floor(current / stride) });
      const choices = edges.get(current);
      if (!choices?.length) throw new Error("No se pudo cerrar un contorno. Reduce el detalle e inténtalo de nuevo.");
      let choice = 0;
      if (choices.length > 1 && incoming >= 0) {
        // Keep touching diagonal regions separate: prefer the right turn.
        const rank = (to: number) => [1, 0, 3, 2][(direction(current, to) - incoming + 4) % 4];
        for (let i = 1; i < choices.length; i++) if (rank(choices[i]) < rank(choices[choice])) choice = i;
      }
      const next = choices.splice(choice, 1)[0]; if (!choices.length) edges.delete(current);
      incoming = direction(current, next); current = next;
    } while (current !== start);
    if (Math.abs(signedArea(ring)) >= options.minArea) {
      const simplified = simplifyContour(ring, options.simplification); nodes += simplified.length;
      if (nodes > 40000) throw new Error("Demasiados nodos. Aumenta la limpieza o reduce colores y detalle.");
      if (simplified.length >= 3) result.push(simplified);
    }
  }
  return result;
}

export function tracePixels(image: { width: number; height: number; data: Uint8ClampedArray }, options: TraceOptions, progress = (_value: number, _stage: string) => {}): VectorResult {
  const { width, height, data } = image;
  if (width < 1 || height < 1 || width > 2048 || height > 2048 || data.length !== width * height * 4) throw new Error("Imagen inválida o demasiado grande para vectorizar.");
  if (!Number.isFinite(options.colors) || options.colors < 2 || options.colors > 16 || !Number.isFinite(options.simplification) || options.simplification < 0 || options.simplification > 5 || !Number.isFinite(options.minArea) || options.minArea < 0) throw new Error("Ajustes de vectorización inválidos.");
  const histogram = new Map<number, number[]>(), keys = new Int32Array(width * height).fill(-1);
  progress(5, "Analizando colores");
  for (let p = 0; p < keys.length; p++) {
    const i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    if (data[i + 3] < options.alphaThreshold || data[i + 3] === 0 || (options.removeWhite && Math.min(r, g, b) >= 255 - options.whiteTolerance)) continue;
    if (options.mode === "mono") {
      const dark = r * .2126 + g * .7152 + b * .0722 < options.threshold;
      if (options.invert ? !dark : dark) keys[p] = 0;
    } else {
      const key = (r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3); keys[p] = key;
      const sample = histogram.get(key); if (sample) { sample[0] += r; sample[1] += g; sample[2] += b; sample[3]++; } else histogram.set(key, [r, g, b, 1]);
    }
  }
  const palette = options.mode === "mono" ? [[0, 0, 0]] : paletteFor(histogram, options.colors);
  const lookup = new Map<number, number>();
  for (const [key, sample] of histogram) {
    const rgb = sample.slice(0, 3).map(value => value / sample[3]); let best = 0;
    for (let i = 1; i < palette.length; i++) if (distance(rgb, palette[i]) < distance(rgb, palette[best])) best = i;
    lookup.set(key, best);
  }
  const labels = Int16Array.from(keys, key => key < 0 ? -1 : options.mode === "mono" ? 0 : lookup.get(key)!);
  progress(35, "Trazando contornos");
  const paths: VectorPath[] = []; let total = 0;
  palette.forEach((rgb, index) => {
    const contours = contoursFor(labels, width, height, index, options);
    total += contours.reduce((sum, ring) => sum + ring.length, 0);
    if (total > 60000) throw new Error("El resultado supera 60.000 nodos. Reduce el detalle o aumenta la limpieza.");
    if (contours.length) paths.push({ id: `color-${index}`, color: `#${rgb.map(value => value.toString(16).padStart(2, "0")).join("")}`, visible: true, contours });
    progress(Math.round(35 + (index + 1) / palette.length * 60), "Simplificando trazados");
  });
  if (!paths.length) throw new Error("No quedan formas visibles. Baja el umbral o la limpieza, o desactiva Quitar blanco.");
  progress(100, "Vector listo"); return { width, height, paths };
}

const n = (value: number) => Number(value.toFixed(3));
export function pathData(contours: Point[][], smooth: boolean) {
  return contours.map(ring => {
    if (!ring.length) return "";
    if (!smooth) return `M${ring.map(point => `${n(point.x)} ${n(point.y)}`).join("L")}Z`;
    const mid = (a: Point, b: Point) => `${n((a.x + b.x) / 2)} ${n((a.y + b.y) / 2)}`;
    return `M${mid(ring.at(-1)!, ring[0])}${ring.map((point, i) => `Q${n(point.x)} ${n(point.y)} ${mid(point, ring[(i + 1) % ring.length])}`).join("")}Z`;
  }).join("");
}
export function vectorSvg(result: VectorResult, widthCm: number, smooth: boolean, rasterSize?: { width: number; height: number }) {
  if (!Number.isFinite(widthCm) || widthCm < .1 || widthCm > 300) throw new Error("El ancho debe estar entre 0,1 y 300 cm.");
  if (![result.width, result.height].every(value => Number.isInteger(value) && value > 0 && value <= 2048)) throw new Error("Las dimensiones del vector son inválidas.");
  if (rasterSize && (![rasterSize.width, rasterSize.height].every(value => Number.isInteger(value) && value > 0 && value <= 8192) || rasterSize.width * rasterSize.height > 64_000_000)) throw new Error("Las dimensiones del PNG son inválidas.");
  const paths = result.paths.filter(path => path.visible).map(path => {
    if (!/^#[0-9a-f]{6}$/i.test(path.color) || path.contours.some(ring => ring.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)))) throw new Error("El vector contiene valores inválidos.");
    return `<path fill="${path.color}" fill-rule="evenodd" d="${pathData(path.contours, smooth)}"/>`;
  });
  const width = rasterSize ? `${rasterSize.width}px` : `${n(widthCm)}cm`, height = rasterSize ? `${rasterSize.height}px` : `${Number((widthCm * result.height / result.width).toFixed(6))}cm`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${result.width} ${result.height}">${paths.join("")}</svg>`;
}
