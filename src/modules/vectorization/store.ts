import type { VectorSession } from "./vector";
import { readVectorSession } from "./session";
let pendingSave = Promise.resolve();
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("stamprint-vectors", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("session");
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
  });
}
export async function loadVectorSession(): Promise<VectorSession | undefined> {
  await pendingSave.catch(() => undefined);
  const db = await database();
  try { return await new Promise((resolve, reject) => { const request = db.transaction("session").objectStore("session").get("current"); request.onsuccess = () => { try { resolve(request.result === undefined ? undefined : readVectorSession(request.result)); } catch (error) { reject(error); } }; request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
async function writeSession(session: VectorSession) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => { const transaction = db.transaction("session", "readwrite"); transaction.objectStore("session").put(session, "current"); transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("Guardado cancelado")); }); }
  finally { db.close(); }
}
export function saveVectorSession(session: VectorSession) {
  pendingSave = pendingSave.catch(() => undefined).then(() => writeSession(session));
  return pendingSave;
}
