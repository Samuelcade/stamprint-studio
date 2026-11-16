export interface Design {
  id: string; name: string; source: string; width: number; height: number;
  x: number; y: number; rotated: boolean; rotation?: number;
}
export interface Sheet { width: number; height: number; gap: number; dpi: number; background: "transparent" | "white"; items: Design[] }

export const angle = (item: Design) => item.rotation ?? (item.rotated ? 90 : 0);
export const normalizeAngle = (degrees: number) => ((degrees % 360) + 360) % 360;
export const dimensions = (item: Design) => {
  const radians = angle(item) * Math.PI / 180, cos = Math.abs(Math.cos(radians)) < 1e-12 ? 0 : Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians)) < 1e-12 ? 0 : Math.abs(Math.sin(radians));
  return { width: item.width * cos + item.height * sin, height: item.width * sin + item.height * cos };
};
/** Rotate about the center so the artwork does not jump when its bounding box changes. */
export function rotateDesign(item: Design, degrees: number): Design {
  const old = dimensions(item), next = { ...item, rotation: normalizeAngle(degrees) }, size = dimensions(next);
  return { ...next, x: item.x + (old.width - size.width) / 2, y: item.y + (old.height - size.height) / 2 };
}

/** Find an open position without disturbing designs already placed on the sheet. */
export function place(item: Design, items: Design[], width: number, height: number, gap: number): Design | null {
  const xs = [0, ...items.map(other => other.x + dimensions(other).width + gap)];
  const ys = [0, ...items.map(other => other.y + dimensions(other).height + gap)];
  for (const y of ys.sort((a, b) => a - b)) for (const x of xs.sort((a, b) => a - b)) {
    const candidate = { ...item, x, y };
    const size = dimensions(candidate);
    if (x + size.width > width + 1e-6 || y + size.height > height + 1e-6) continue;
    if (!items.some(other => layoutIssues([candidate, other], width, height, gap).overlaps)) return candidate;
  }
  return null;
}

/** Deterministic shelf packing. Leave the original layout untouched if it cannot fit. */
export function arrange(items: Design[], width: number, height: number, gap: number): Design[] | null {
  let x = 0, y = 0, rowHeight = 0;
  const result: Design[] = [];
  for (const item of [...items].sort((a, b) => dimensions(b).height - dimensions(a).height)) {
    const size = dimensions(item);
    if (size.width > width || size.height > height) return null;
    if (x > 0 && x + size.width > width + 1e-8) { x = 0; y += rowHeight + gap; rowHeight = 0; }
    if (y + size.height > height + 1e-8) return null;
    result.push({ ...item, x, y });
    x += size.width + gap; rowHeight = Math.max(rowHeight, size.height);
  }
  return result;
}

export function layoutIssues(items: Design[], width: number, height: number, gap: number) {
  let outside = 0, overlaps = 0;
  items.forEach((item, index) => {
    const a = dimensions(item);
    if (item.x < -1e-6 || item.y < -1e-6 || item.x + a.width > width + 1e-6 || item.y + a.height > height + 1e-6) outside++;
    for (const other of items.slice(index + 1)) {
      const b = dimensions(other);
      if (item.x < other.x + b.width + gap - 1e-6 && item.x + a.width + gap > other.x + 1e-6 && item.y < other.y + b.height + gap - 1e-6 && item.y + a.height + gap > other.y + 1e-6) overlaps++;
    }
  });
  return { outside, overlaps };
}
