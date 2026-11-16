import { STONE_SIZES } from "./model";
import type { StoneProject } from "./model";
const DB = "stamprint-rhinestones", STORE = "projects";
function database(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(DB, 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); }; request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); }; request.onerror = () => reject(request.error); }); }
export async function saveStoneProject(project: StoneProject) { const db = await database(); try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(project, "current"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); } finally { db.close(); } }
export function readStoneProject(value: unknown): StoneProject {
  const invalid = () => { throw new Error("El proyecto de piedrería guardado está dañado."); };
  if (!value || typeof value !== "object") return invalid();
  const project = value as StoneProject;
  if (!Number.isFinite(project.width) || project.width < 1 || project.width > 100 || !Number.isFinite(project.height) || project.height < 1 || project.height > 100 || typeof project.name !== "string" || typeof project.source !== "string" || (project.source !== "" && !/^data:image\/(png|jpeg|webp);base64,/i.test(project.source)) || !Array.isArray(project.stones) || project.stones.length > 6000) return invalid();
  const ids = new Set<string>();
  for (const stone of project.stones) {
    if (!stone || typeof stone !== "object" || typeof stone.id !== "string" || !stone.id || ids.has(stone.id) || !Number.isFinite(stone.x) || Math.abs(stone.x) > 1000 || !Number.isFinite(stone.y) || Math.abs(stone.y) > 1000 || !Object.prototype.hasOwnProperty.call(STONE_SIZES, stone.size) || typeof stone.color !== "string" || !/^#[0-9a-f]{6}$/i.test(stone.color)) return invalid();
    ids.add(stone.id);
  }
  return project;
}
export async function loadStoneProject(): Promise<StoneProject | undefined> { const db = await database(); try { return await new Promise((resolve, reject) => { const request = db.transaction(STORE).objectStore(STORE).get("current"); request.onsuccess = () => { try { resolve(request.result === undefined ? undefined : readStoneProject(request.result)); } catch (error) { reject(error); } }; request.onerror = () => reject(request.error); }); } finally { db.close(); } }
