import { createId } from "../../core/id";
export const STONE_SIZES = { SS6: 2, SS10: 2.8, SS16: 4, SS20: 4.8 } as const;
export type StoneSize = keyof typeof STONE_SIZES;
export interface Stone { id: string; x: number; y: number; size: StoneSize; color: string }
export interface StoneProject { width: number; height: number; stones: Stone[]; source: string; name: string }
export const blankStoneProject = (): StoneProject => ({ width: 25, height: 30, stones: [], source: "", name: "Mi diseño" });
export const diameter = (size: StoneSize) => STONE_SIZES[size] / 10;
export const createStone = (x: number, y: number, size: StoneSize, color: string): Stone => ({ id: createId(), x, y, size, color });

/** Equidistant stones along a path, including line and closed shapes. */
export function pathPositions(points: { x: number; y: number }[], spacing: number) {
  if (!points.length || !Number.isFinite(spacing) || spacing <= 0) return [];
  const output = [points[0]]; let remaining = spacing;
  for (let i = 1; i < points.length; i++) {
    let a = { ...points[i - 1] }; const b = points[i]; let length = Math.hypot(b.x - a.x, b.y - a.y);
    while (length >= remaining && length > 1e-9) {
      a = { x: a.x + (b.x - a.x) * remaining / length, y: a.y + (b.y - a.y) * remaining / length }; output.push(a);
      if (output.length > 6000) throw new Error("El diseño supera el límite de 6000 piedras. Aumenta la separación.");
      length = Math.hypot(b.x - a.x, b.y - a.y); remaining = spacing;
    }
    remaining -= length;
  }
  return output;
}

/** Identify overlapping/too-close stones using a spatial grid. */
export function collisionIds(stones: Stone[], gap: number) {
  const cell = Math.max(.1, 0.48 + Math.max(0, gap)), grid = new Map<string, Stone[]>(), issues = new Set<string>();
  for (const stone of stones) {
    const cx = Math.floor(stone.x / cell), cy = Math.floor(stone.y / cell);
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (const other of grid.get(`${x},${y}`) ?? []) {
      if (Math.hypot(stone.x - other.x, stone.y - other.y) < (diameter(stone.size) + diameter(other.size)) / 2 + gap - 1e-6) { issues.add(stone.id); issues.add(other.id); }
    }
    const key = `${cx},${cy}`, items = grid.get(key) ?? []; items.push(stone); grid.set(key, items);
  }
  return issues;
}

/** SVG cut/placement guide in millimeters; white background and black circles. */
export function templateSvg(project: StoneProject) {
  const w = project.width * 10, h = project.height * 10;
  const circles = project.stones.map(stone => `<circle cx="${(stone.x * 10).toFixed(3)}" cy="${(stone.y * 10).toFixed(3)}" r="${(STONE_SIZES[stone.size] / 2).toFixed(3)}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="white"/><g fill="black">${circles}</g></svg>`;
}

/** Raster mask placement. Input pixels represent the whole work area. */
export function autoPositions(image: { width: number; height: number; data: Uint8ClampedArray }, widthCm: number, heightCm: number, spacing: number, mode: "outline" | "grid" | "staggered", threshold: number) {
  const { width, height, data } = image;
  const dark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= widthCm || y >= heightCm) return false;
    const px = Math.min(width - 1, Math.floor(x / widthCm * width)), py = Math.min(height - 1, Math.floor(y / heightCm * height)), i = (py * width + px) * 4;
    return data[i + 3] >= 32 && (data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722) < threshold;
  };
  const result: { x: number; y: number }[] = [], rowStep = mode === "staggered" ? spacing * Math.sqrt(3) / 2 : spacing;
  for (let row = 0, y = spacing / 2; y < heightCm; row++, y += rowStep) for (let x = spacing / 2 + (mode === "staggered" && row % 2 ? spacing / 2 : 0); x < widthCm; x += spacing) {
    if (!dark(x, y)) continue;
    if (mode === "outline" && dark(x - spacing, y) && dark(x + spacing, y) && dark(x, y - spacing) && dark(x, y + spacing)) continue;
    result.push({ x, y }); if (result.length > 6000) throw new Error("El resultado supera 6000 piedras. Aumenta la separación o reduce el área.");
  }
  return result;
}
