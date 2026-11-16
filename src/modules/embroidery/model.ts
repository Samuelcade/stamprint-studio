export type Point = { x: number; y: number };
export type StitchPath = { id: string; color: string; points: Point[] };
export type EmbroideryProject = { name: string; width: number; height: number; source: string; paths: StitchPath[] };
export const blankEmbroidery = (): EmbroideryProject => ({ name: "Mi bordado", width: 15, height: 15, source: "", paths: [] });

/** Resample drawn strokes at a maximum stitch length in centimeters. */
export function sampleStitches(points: Point[], maxLength: number): Point[] {
  if (!points.length || !Number.isFinite(maxLength) || maxLength <= 0) return [];
  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], distance = Math.hypot(b.x - a.x, b.y - a.y);
    if (distance < 1e-8) continue;
    const steps = Math.ceil(distance / maxLength);
    if (result.length + steps > 20000) throw new Error("El trazado supera el límite de puntadas. Aumenta la longitud o dibuja trazos más cortos.");
    for (let j = 1; j <= steps; j++) result.push({ x: a.x + (b.x - a.x) * j / steps, y: a.y + (b.y - a.y) * j / steps });
  }
  return result;
}

/** Row-based visual fill of dark pixels. Separate spans stay separate paths. */
export function fillDarkAreas(image: { width: number; height: number; data: Uint8ClampedArray }, width: number, height: number, rowSpacing: number, stitchLength: number, threshold: number): Point[][] {
  if (![width, height, rowSpacing, stitchLength].every(n => Number.isFinite(n) && n > 0) || image.width < 1 || image.height < 1 || image.data.length !== image.width * image.height * 4) throw new Error("Ajustes de relleno inválidos.");
  const isDark = (x: number, y: number) => {
    const px = Math.min(image.width - 1, Math.max(0, Math.floor(x / width * image.width))), py = Math.min(image.height - 1, Math.max(0, Math.floor(y / height * image.height)));
    const p = (py * image.width + px) * 4, data = image.data;
    return data[p + 3] >= 32 && data[p] * .2126 + data[p + 1] * .7152 + data[p + 2] * .0722 < threshold;
  };
  const paths: Point[][] = []; let total = 0;
  const columns = Math.ceil(width / Math.max(width / image.width, stitchLength / 4));
  for (let row = 0, y = rowSpacing / 2; y < height; row++, y += rowSpacing) {
    let start: number | null = null;
    for (let col = 0; col <= columns; col++) {
      const x = Math.min(width, col * width / columns), dark = col < columns && isDark(x, y);
      if (dark && start === null) start = x;
      if (!dark && start !== null) {
        const a = { x: start, y }, b = { x, y }, points = sampleStitches(row % 2 ? [b, a] : [a, b], stitchLength);
        total += points.length; if (total > 20000 || paths.length >= 5000) throw new Error("El relleno supera el límite de puntadas. Aumenta la separación o reduce el área.");
        paths.push(points); start = null;
      }
    }
  }
  return paths;
}

export function visibleStitches(paths: StitchPath[], progress: number): StitchPath[] {
  let left = Math.max(0, Math.floor(progress));
  return paths.flatMap(path => { const n = Math.min(left, path.points.length); left -= n; return n >= 2 ? [{ ...path, points: path.points.slice(0, n) }] : []; });
}

export function embroiderySvg(project: EmbroideryProject) {
  const safe = (n: number) => Number(n.toFixed(3));
  const paths = project.paths.map(path => {
    if (!/^#[0-9a-f]{6}$/i.test(path.color) || path.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error("El diseño contiene datos inválidos.");
    return `<polyline points="${path.points.map(p => `${safe(p.x * 10)},${safe(p.y * 10)}`).join(" ")}" fill="none" stroke="${path.color}" stroke-width="0.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${safe(project.width * 10)}mm" height="${safe(project.height * 10)}mm" viewBox="0 0 ${safe(project.width * 10)} ${safe(project.height * 10)}">${paths}</svg>`;
}
