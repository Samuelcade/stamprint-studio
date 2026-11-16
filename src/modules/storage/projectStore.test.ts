import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { blankProject } from "../graphic-editor/model";
import { deleteProject, listProjects, loadProject, saveProject } from "./projectStore";

beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); });
afterEach(() => { vi.unstubAllGlobals(); });

it("conserva varios proyectos y recupera exactamente el ID seleccionado", async () => {
  const first = { ...blankProject(), id: "one", name: "Trabajo uno", updatedAt: "2026-11-01T12:00:00.000Z" };
  const second = { ...blankProject(), id: "two", name: "Trabajo dos", updatedAt: "2026-11-02T12:00:00.000Z", dpi: 150 };
  await saveProject(first); await saveProject(second);
  expect((await listProjects()).map(project => project.id)).toEqual(["two", "one"]);
  expect(await loadProject("one")).toEqual(first);
  expect(await loadProject("two")).toEqual(second);
  await saveProject({ ...first, name: "Trabajo uno actualizado" });
  expect((await listProjects()).length).toBe(2);
  expect((await loadProject("two"))?.name).toBe("Trabajo dos");
  expect(await loadProject("missing")).toBeUndefined();
});

it("elimina solo el proyecto elegido y mantiene el resto al volver a consultar", async () => {
  const first = { ...blankProject(), id: "one" }, second = { ...blankProject(), id: "two" };
  await saveProject(first); await saveProject(second);
  await deleteProject("one");
  expect(await loadProject("one")).toBeUndefined();
  expect(await loadProject("two")).toEqual(second);
  expect((await listProjects()).map(project => project.id)).toEqual(["two"]);
});
