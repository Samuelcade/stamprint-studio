import { photoTemplate } from "./catalog";
import { colorHex, FORMAT_HEIGHT, TECHNIQUES } from "./model";
import type { Poster } from "./model";
const DB = "stamprint-marketing", STORE = "projects";
function db(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(DB, 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); }; request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); }; request.onerror = () => reject(request.error); }); }
const number = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const dataImage = (value: unknown) => typeof value === "string" && (value === "" || /^data:image\/(png|jpeg|webp);base64,/i.test(value));
export function readPoster(value: unknown): Poster {
  if (!value || typeof value !== "object") throw new Error("La plantilla guardada está dañada.");
  const p = value as Poster;
  if (!Object.prototype.hasOwnProperty.call(FORMAT_HEIGHT, p.format) || (!["shirt-front", "shirt-back", "hoodie", "photo"].includes(p.template) && !photoTemplate(p.template)) || !colorHex(p.garmentColor) || !colorHex(p.background) || !dataImage(p.photo) || !dataImage(p.mask) || (p.template === "photo" && !p.photo) || !Array.isArray(p.layers) || p.layers.length > 100) throw new Error("La plantilla guardada está dañada.");
  if ((p.photoFit !== undefined && !["contain", "cover"].includes(p.photoFit)) || (p.recolor !== undefined && typeof p.recolor !== "boolean")) throw new Error("La configuración de la fotografía no es válida.");
  const ids = new Set<string>();
  if (p.cutout !== undefined && typeof p.cutout !== "boolean") throw new Error("El recorte guardado no es válido.");
  if ((p.backgroundImage !== undefined && !dataImage(p.backgroundImage)) || (p.backgroundMask !== undefined && !dataImage(p.backgroundMask))) throw new Error("El fondo guardado no es válido.");
  for (const layer of p.layers) {
    if (!layer || typeof layer !== "object" || typeof layer.id !== "string" || !layer.id || ids.has(layer.id) || !number(layer.x, 0, 1) || !number(layer.y, 0, 1) || !number(layer.rotation, -180, 180)) throw new Error("La plantilla contiene elementos inválidos.");
    if (layer.kind === "image") { if (!dataImage(layer.source) || !layer.source || typeof layer.name !== "string" || !number(layer.width, .03, 1.5) || !number(layer.aspect, .00001, 100000) || (layer.technique !== undefined && !Object.hasOwn(TECHNIQUES, layer.technique)) || (layer.opacity !== undefined && !number(layer.opacity, 0, 1))) throw new Error("La plantilla contiene imágenes inválidas."); }
    else if (layer.kind === "text") { if (typeof layer.text !== "string" || layer.text.length > 400 || !colorHex(layer.color) || !number(layer.size, .02, .3) || (layer.font !== undefined && !["Arial", "Georgia", "Impact"].includes(layer.font)) || (layer.bold !== undefined && typeof layer.bold !== "boolean")) throw new Error("La plantilla contiene textos inválidos."); }
    else throw new Error("La plantilla contiene elementos desconocidos."); ids.add(layer.id);
  }
  return p;
}
export async function savePoster(project: Poster) { const database = await db(); try { await new Promise<void>((resolve, reject) => { const tx = database.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(readPoster(project), "current"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error("Guardado cancelado.")); }); } finally { database.close(); } }
export async function loadPoster(): Promise<Poster | undefined> { const database = await db(); try { return await new Promise((resolve, reject) => { const request = database.transaction(STORE).objectStore(STORE).get("current"); request.onsuccess = () => { try { resolve(request.result === undefined ? undefined : readPoster(request.result)); } catch (error) { reject(error); } }; request.onerror = () => reject(request.error); }); } finally { database.close(); } }
