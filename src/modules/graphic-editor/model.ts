import type { DesignLayer, Project, RasterEffects } from "../../core/types";
import { pixelsFromCentimeters } from "../../core/units";
import { createId } from "../../core/id";

export const defaultEffects: RasterEffects = { brightness: 0, contrast: 0, saturation: 0, halftone: false, halftoneCell: 8, mirror: false, whiteUnderbase: false };
export const blankProject = (): Project => ({ version: 2, id: createId(), name: "Diseño sin título", width: pixelsFromCentimeters(25, 300), height: pixelsFromCentimeters(30, 300), dpi: 300, updatedAt: new Date().toISOString(), layers: [] });

/** Old single-image documents used the document rectangle as their layer rectangle. */
export function normalizeProject(project: Project): Project {
  return { ...project, version: 2, layers: project.layers.map(layer => ({
    ...layer, x: layer.x ?? project.width / 2, y: layer.y ?? project.height / 2,
    width: layer.width ?? project.width, height: layer.height ?? project.height, rotation: layer.rotation ?? 0,
    kind: layer.kind ?? "image", pixelWidth: "pixelWidth" in layer ? layer.pixelWidth : project.width,
    pixelHeight: "pixelHeight" in layer ? layer.pixelHeight : project.height,
    mask: "mask" in layer ? layer.mask : "", effects: { ...defaultEffects, ...layer.effects },
  } as DesignLayer)) };
}

export function toLocalPoint(layer: DesignLayer, point: { x: number; y: number }) {
  const angle = -layer.rotation * Math.PI / 180;
  const dx = point.x - layer.x, dy = point.y - layer.y;
  return { x: dx * Math.cos(angle) - dy * Math.sin(angle), y: dx * Math.sin(angle) + dy * Math.cos(angle) };
}

export function hitLayer(layers: DesignLayer[], point: { x: number; y: number }) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]; if (!layer.visible || layer.opacity === 0) continue;
    const local = toLocalPoint(layer, point);
    if (Math.abs(local.x) <= layer.width / 2 && Math.abs(local.y) <= layer.height / 2) return layer;
  }
}

export function resizeDocument(project: Project, widthCm: number, heightCm: number, dpi: number): Project {
  const width = pixelsFromCentimeters(widthCm, dpi), height = pixelsFromCentimeters(heightCm, dpi);
  if (![widthCm, heightCm, dpi].every(Number.isFinite) || widthCm <= 0 || heightCm <= 0 || dpi < 72 || dpi > 600 || width > 6000 || height > 6000 || width * height > 24_000_000 || width < 1 || height < 1) {
    throw new Error("Usa medidas positivas, de 72 a 600 DPI, hasta 6000 px por lado y 24 megapíxeles. Reduce las medidas o los DPI.");
  }
  // Changing DPI preserves the physical size and position of every element.
  const scale = dpi / project.dpi;
  return { ...project, width, height, dpi, layers: project.layers.map(layer => ({ ...layer, x: layer.x * scale, y: layer.y * scale, width: layer.width * scale, height: layer.height * scale })) };
}

export interface HistoryState { present: Project; past: Project[]; future: Project[]; group?: string }
export type HistoryAction = { type: "commit"; project: Project; group?: string } | { type: "undo" | "redo" | "end-group" } | { type: "load"; project: Project };
export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === "load") return { present: action.project, past: [], future: [] };
  if (action.type === "end-group") return { ...state, group: undefined };
  if (action.type === "commit") {
    if (action.project === state.present) return state;
    return { present: action.project, past: action.group && action.group === state.group ? state.past : [...state.past.slice(-29), state.present], future: [], group: action.group };
  }
  if (action.type === "undo" && state.past.length) return { present: state.past.at(-1)!, past: state.past.slice(0, -1), future: [state.present, ...state.future] };
  if (action.type === "redo" && state.future.length) return { present: state.future[0], past: [...state.past, state.present], future: state.future.slice(1) };
  return state;
}
