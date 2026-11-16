import type { Sheet } from "./layout";
const DB = "stamprint-dtf", STORE = "projects", KEY = "current";
const number = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function readSheet(value: unknown): Sheet {
  if (!object(value) || !number(value.width, 1, 100) || !number(value.height, 1, 300) || !number(value.gap, 0, 10) || !number(value.dpi, 72, 600) || !Number.isInteger(value.dpi) || !["transparent", "white"].includes(String(value.background)) || !Array.isArray(value.items)) throw new Error("La mesa guardada está dañada.");
  const ids = new Set<string>();
  for (const item of value.items) {
    if (!object(item) || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.name !== "string" || typeof item.source !== "string" || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(item.source) || !number(item.width, .00001, 100000) || !number(item.height, .00001, 100000) || !number(item.x, -100000, 100000) || !number(item.y, -100000, 100000) || typeof item.rotated !== "boolean" || (item.rotation !== undefined && !number(item.rotation, 0, 360))) throw new Error("La mesa guardada contiene un diseño inválido.");
    ids.add(item.id);
  }
  return value as unknown as Sheet;
}
function database(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(DB, 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); }; request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); }; request.onerror = () => reject(request.error); }); }
export async function saveSheet(sheet: Sheet) { const db = await database(); try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(readSheet(sheet), KEY); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error("Guardado cancelado.")); }); } finally { db.close(); } }
export async function loadSheet(): Promise<Sheet | undefined> { const db = await database(); try { return await new Promise((resolve, reject) => { const request = db.transaction(STORE).objectStore(STORE).get(KEY); request.onsuccess = () => { try { resolve(request.result === undefined ? undefined : readSheet(request.result)); } catch (error) { reject(error); } }; request.onerror = () => reject(request.error); }); } finally { db.close(); } }
