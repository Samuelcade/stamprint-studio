import type { Separation } from "./separate";

export type ScreenProject = { input: { source: string; name: string }; result: Separation; selected?: number; colors: number; removeWhite: boolean };
const DB = "stamprint-screen-printing", STORE = "projects", KEY = "current";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function readScreenProject(value: unknown): ScreenProject {
  if (!object(value) || !object(value.input) || typeof value.input.name !== "string" || typeof value.input.source !== "string" || !/^data:image\/(png|jpeg|webp);base64,/i.test(value.input.source) || !object(value.result) || typeof value.removeWhite !== "boolean" || !Number.isInteger(value.colors) || (value.colors as number) < 2 || (value.colors as number) > 12) throw new Error("El proyecto de serigrafía guardado está dañado.");
  const result = value.result;
  if (!Number.isInteger(result.width) || !Number.isInteger(result.height) || (result.width as number) < 1 || (result.height as number) < 1 || (result.width as number) > 1600 || (result.height as number) > 1600 || Object.prototype.toString.call(result.labels) !== "[object Uint8Array]" || Object.prototype.toString.call(result.alpha) !== "[object Uint8ClampedArray]" || (result.labels as Uint8Array).length !== (result.width as number) * (result.height as number) || (result.alpha as Uint8ClampedArray).length !== (result.labels as Uint8Array).length || !Array.isArray(result.inks) || result.inks.length > 12) throw new Error("Las tintas guardadas no son válidas.");
  const ids = new Set<number>();
  for (const ink of result.inks) {
    if (!object(ink) || !Number.isInteger(ink.id) || (ink.id as number) < 0 || (ink.id as number) > 254 || ids.has(ink.id as number) || typeof ink.color !== "string" || !/^#[0-9a-f]{6}$/i.test(ink.color) || typeof ink.visible !== "boolean") throw new Error("Las tintas guardadas no son válidas.");
    ids.add(ink.id as number);
  }
  if (value.selected !== undefined && (!Number.isInteger(value.selected) || !ids.has(value.selected as number))) throw new Error("La selección guardada no es válida.");
  for (const label of result.labels as Uint8Array) if (label !== 255 && !ids.has(label)) throw new Error("El proyecto contiene zonas de tinta inválidas.");
  return value as unknown as ScreenProject;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir el almacenamiento local."));
  });
}

export async function saveScreenProject(project: ScreenProject) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite"); transaction.objectStore(STORE).put(project, KEY);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error ?? new Error("Guardado cancelado."));
  }); } finally { db.close(); }
}

export async function loadScreenProject(): Promise<ScreenProject | undefined> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(KEY);
    request.onsuccess = () => { try { resolve(request.result === undefined ? undefined : readScreenProject(request.result)); } catch (error) { reject(error); } };
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
