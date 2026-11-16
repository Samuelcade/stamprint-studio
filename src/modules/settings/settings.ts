export interface Settings {
  autoSave: boolean;
  startSection: "Inicio" | "Editor gráfico" | "Vectorización" | "DTF" | "Serigrafía" | "Piedrería" | "Plantillas";
  editor: { widthCm: number; heightCm: number; dpi: number; background: "transparent" | "light" | "dark" };
  dtf: { width: number; height: number; gap: number; dpi: number; background: "transparent" | "white" };
}
export const DEFAULT_SETTINGS: Settings = { autoSave: true, startSection: "Inicio", editor: { widthCm: 25, heightCm: 30, dpi: 300, background: "transparent" }, dtf: { width: 58, height: 100, gap: 1, dpi: 150, background: "transparent" } };
const KEY = "stamprint-settings-v1";
const valid = (n: unknown, min: number, max: number) => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
export function validateSettings(value: unknown): Settings {
  if (!value || typeof value !== "object") throw new Error("La configuración no es válida.");
  const settings = value as Settings, e = settings.editor, d = settings.dtf;
  if (typeof settings.autoSave !== "boolean" || !["Inicio", "Editor gráfico", "Vectorización", "DTF", "Serigrafía", "Piedrería", "Plantillas"].includes(settings.startSection) || !e || !d) throw new Error("La configuración no es válida.");
  if (!valid(e.widthCm, .1, 100) || !valid(e.heightCm, .1, 100) || !valid(e.dpi, 72, 600) || !Number.isInteger(e.dpi) || !["transparent", "light", "dark"].includes(e.background)) throw new Error("Revisa las medidas y DPI del editor.");
  const width = Math.round(e.widthCm / 2.54 * e.dpi), height = Math.round(e.heightCm / 2.54 * e.dpi);
  if (width > 6000 || height > 6000 || width * height > 24_000_000 || width < 1 || height < 1) throw new Error("El documento supera 6000 px por lado o 24 megapíxeles. Reduce sus medidas o DPI.");
  if (!valid(d.width, 1, 100) || !valid(d.height, 1, 300) || !valid(d.gap, 0, 10) || !valid(d.dpi, 72, 600) || !Number.isInteger(d.dpi) || !["transparent", "white"].includes(d.background)) throw new Error("Revisa las medidas y DPI de la mesa DTF.");
  return { autoSave: settings.autoSave, startSection: settings.startSection, editor: { ...e }, dtf: { ...d } };
}
export function loadSettings(): Settings {
  try { const raw = localStorage.getItem(KEY); return raw ? validateSettings(JSON.parse(raw)) : structuredClone(DEFAULT_SETTINGS); }
  catch { return structuredClone(DEFAULT_SETTINGS); }
}
export function saveSettings(settings: Settings) { localStorage.setItem(KEY, JSON.stringify(validateSettings(settings))); }
