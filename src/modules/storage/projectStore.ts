import type { Project } from "../../core/types";

const DB = "stamprint-studio";
const STORE = "projects";

export interface ProjectSummary {
  id: string; name: string; width: number; height: number; dpi: number; updatedAt: string; layerCount: number;
  section: "Editor gráfico" | "Semitonos";
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
      if (!request.result.objectStoreNames.contains("models")) request.result.createObjectStore("models", { keyPath: "id" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project: Project) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(project);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Guardado cancelado"));
  }); } finally { db.close(); }
}

export async function loadLatestProject(): Promise<Project | undefined> {
  const db = await database();
  try { return await new Promise<Project | undefined>((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result.sort((a: Project, b: Project) => b.updatedAt.localeCompare(a.updatedAt))[0]);
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as Project[]).map(project => ({
      id: project.id, name: project.name, width: project.width, height: project.height, dpi: project.dpi,
      updatedAt: project.updatedAt, layerCount: project.layers.length,
      section: project.layers.some(layer => layer.effects.halftone) ? "Semitonos" as const : "Editor gráfico" as const,
    })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result as Project | undefined);
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}

export async function deleteProject(id: string): Promise<void> {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("No se pudo eliminar el proyecto."));
  }); } finally { db.close(); }
}
