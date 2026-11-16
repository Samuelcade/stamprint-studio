// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { App } from "../../App";
import { installTestCanvas } from "../graphic-editor/testCanvas";
import { loadLatestProject } from "../storage/projectStore";

beforeEach(() => { localStorage.clear(); installTestCanvas(); vi.stubGlobal("indexedDB", new IDBFactory()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

it("aplica y recuerda las preferencias, incluido el guardado manual", async () => {
  const user = userEvent.setup(); render(<App />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Configuración" }) as HTMLButtonElement).disabled).toBe(false));
  await user.click(screen.getByRole("button", { name: "Configuración" }));
  await user.click(screen.getByLabelText("Guardado automático del editor"));
  await user.selectOptions(screen.getByLabelText("Sección al iniciar"), "Editor gráfico");
  await user.selectOptions(screen.getByLabelText("Fondo de vista del editor"), "dark");
  for (const [label, value] of [["Ancho predeterminado (cm)", "10"], ["Alto predeterminado (cm)", "12"], ["DPI predeterminados", "150"], ["Ancho predeterminado del rollo (cm)", "42"]]) { const field = screen.getByLabelText(label); await user.clear(field); await user.type(field, value); }
  await user.click(screen.getByRole("button", { name: "Guardar ajustes" })); expect(screen.getByRole("status").textContent).toContain("guardados");
  await user.click(screen.getByRole("button", { name: "Editor gráfico" }));
  expect((screen.getByLabelText("Fondo de vista") as HTMLSelectElement).value).toBe("dark");
  await user.click(screen.getByRole("button", { name: "Nuevo" }));
  await user.click(screen.getByRole("button", { name: "Documento" }));
  expect((screen.getByLabelText("Ancho del documento (cm)") as HTMLInputElement).valueAsNumber).toBeCloseTo(10, 1);
  expect((screen.getByLabelText("Resolución (DPI)") as HTMLSelectElement).value).toBe("150");
  await new Promise(resolve => setTimeout(resolve, 900)); expect(await loadLatestProject()).toBeUndefined();
  await user.click(screen.getByRole("button", { name: "Guardar proyecto" })); await waitFor(async () => expect((await loadLatestProject())?.dpi).toBe(150));
  await user.click(screen.getByRole("button", { name: "DTF" }));
  const dtfWidth = await screen.findByLabelText("Ancho del rollo (cm)", {}, { timeout: 5000 }) as HTMLInputElement; expect(dtfWidth.value).toBe("42");
  await user.clear(dtfWidth); await user.type(dtfWidth, "50"); await user.tab(); expect(dtfWidth.value).toBe("50");
  await user.click(screen.getByRole("button", { name: "Aplicar valores DTF predeterminados" })); expect(dtfWidth.value).toBe("42");
  cleanup(); render(<App />); await waitFor(() => expect(screen.getByLabelText("Fondo de vista")).toBeTruthy());
  expect((screen.getByLabelText("Fondo de vista") as HTMLSelectElement).value).toBe("dark");
}, 15000);
