declare const process: { cwd(): string };
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createCanvas, Path2D, loadImage as readCanvasImage } from "@napi-rs/canvas";
import { installTestCanvas, testImage } from "../graphic-editor/testCanvas";
import * as imageIO from "../graphic-editor/render";
import { PHOTO_TEMPLATES } from "./catalog";
import { PosterStudio } from "./PosterStudio";
import { blankPoster } from "./model";
import { loadPoster, savePoster } from "./storage";
import { drawPosterBackground } from "./render";

beforeEach(() => { installTestCanvas(); vi.stubGlobal("Path2D", Path2D);
  const originalLoad = imageIO.loadImage;
  vi.spyOn(imageIO, "loadImage").mockImplementation(source => PHOTO_TEMPLATES.some(item => item.source === source) ? readCanvasImage(process.cwd() + source.split("?")[0]).then(image => image as unknown as HTMLImageElement) : originalLoad(source));
  vi.stubGlobal("indexedDB", new IDBFactory()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("colorea la prenda antes de componer el fondo, incluso con transparencias y selecciones amplias", async () => {
  const source = createCanvas(100, 100), sourceCtx = source.getContext("2d");
  sourceCtx.fillStyle = "#ffffff"; sourceCtx.fillRect(30, 20, 40, 60);
  sourceCtx.fillStyle = "#ffffff80"; sourceCtx.fillRect(29, 20, 1, 60);
  const photo = await imageIO.loadImage(source.toDataURL("image/png"));
  const mask = document.createElement("canvas"); mask.width = mask.height = 100; const maskCtx = mask.getContext("2d")!;
  maskCtx.fillStyle = "white"; maskCtx.fillRect(0, 0, 100, 100);
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 100;
  const ctx = canvas.getContext("2d")!;
  drawPosterBackground(ctx, 100, 100, { ...blankPoster(), template: "photo", background: "#0000ff", garmentColor: "#00ff00", recolor: true }, photo, mask);
  expect([...ctx.getImageData(0, 0, 1, 1).data]).toEqual([0, 0, 255, 255]);
  const center = ctx.getImageData(50, 50, 1, 1).data; expect(center[1]).toBeGreaterThan(220); expect(center[2]).toBeLessThan(20);
  const edge = ctx.getImageData(29, 50, 1, 1).data; expect(edge[1]).toBeGreaterThan(100); expect(edge[2]).toBeGreaterThan(120); expect(edge[0]).toBeLessThan(10);
});

it("colorea toda la silueta preparada aunque haya una selección antigua por parches", async () => {
  const source = createCanvas(100, 100), sourceCtx = source.getContext("2d");
  sourceCtx.fillStyle = "white"; sourceCtx.fillRect(20, 20, 60, 60);
  sourceCtx.fillStyle = "#aaaaaa"; sourceCtx.fillRect(45, 20, 5, 60);
  const photo = await imageIO.loadImage(source.toDataURL("image/png"));
  const mask = document.createElement("canvas"); mask.width = mask.height = 100;
  mask.getContext("2d")!.fillRect(20, 20, 5, 60);
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 100; const ctx = canvas.getContext("2d")!;
  drawPosterBackground(ctx, 100, 100, { ...blankPoster(), template: "photo", background: "#0088ff", garmentColor: "#e5a3ba", recolor: true, cutout: true, mask: "old-patch-selection" }, photo, mask);
  const cloth = ctx.getImageData(60, 50, 1, 1).data, fold = ctx.getImageData(47, 50, 1, 1).data;
  expect(cloth[0]).toBeGreaterThan(cloth[1]); expect(fold[0]).toBeGreaterThan(fold[1]);
  expect(fold[0]).toBeLessThan(cloth[0]); expect(cloth[3]).toBe(255); expect(fold[3]).toBe(255);
  expect([...ctx.getImageData(0, 0, 1, 1).data]).toEqual([0, 136, 255, 255]);
});

it("repara huecos y selecciones antiguas desde la foto original sin perder las sombras", async () => {
  const user = userEvent.setup(), source = createCanvas(100, 100), ctx = source.getContext("2d");
  ctx.fillStyle = "#888888"; ctx.fillRect(0, 0, 100, 100); ctx.fillStyle = "white"; ctx.fillRect(20, 20, 60, 60);
  ctx.fillStyle = "#bbbbbb"; ctx.fillRect(45, 20, 5, 60);
  const damaged = createCanvas(100, 100), damagedCtx = damaged.getContext("2d"); damagedCtx.fillRect(40, 20, 20, 60);
  render(<PosterStudio hasEditorDesign={false} onUseEditor={async () => { throw new Error("Sin diseño"); }} />);
  await savePoster({ ...blankPoster(), template: "photo", photo: source.toDataURL("image/png"), background: "#0088ff", backgroundMask: damaged.toDataURL("image/png"), mask: damaged.toDataURL("image/png"), cutout: true, recolor: true, garmentColor: "#348c65" });
  await user.click(screen.getByRole("button", { name: "Abrir plantilla guardada" }));
  const repair = await screen.findByRole("button", { name: "Reparar recorte y color" });
  await waitFor(() => expect((repair as HTMLButtonElement).disabled).toBe(false));
  await user.click(repair);
  const canvas = screen.getByLabelText("Fondo de la plantilla") as HTMLCanvasElement;
  await waitFor(() => {
    const cloth = canvas.getContext("2d")!.getImageData(280, 337, 1, 1).data;
    expect(cloth[1]).toBeGreaterThan(cloth[0]); expect(cloth[2]).toBeLessThan(120);
  });
  const cloth = canvas.getContext("2d")!.getImageData(280, 337, 1, 1).data;
  const fold = canvas.getContext("2d")!.getImageData(250, 337, 1, 1).data;
  expect(fold[1]).toBeLessThan(cloth[1]); expect(fold[1]).toBeGreaterThan(fold[0]);
  await user.click(screen.getByRole("button", { name: "Seleccionar prenda" }));
  fireEvent.pointerDown(document.querySelector(".poster-stage")!, { clientX: 410, clientY: 500, button: 0 });
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Prenda completa seleccionada"));
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Plantilla guardada"));
  expect((await loadPoster())?.mask).toBe("");
  expect((await loadPoster())?.cutout).toBe(true);
}, 15000);

it("prepara una plantilla de prenda al cargarla y permite fondo y color sin seleccionar zonas", async () => {
  const user = userEvent.setup(), photo = createCanvas(100, 100), ctx = photo.getContext("2d");
  ctx.fillStyle = "#888888"; ctx.fillRect(0, 0, 100, 100); ctx.fillStyle = "#ffffff"; ctx.fillRect(25, 20, 50, 60);
  const bytes = new Uint8Array(photo.toBuffer("image/png"));
  render(<PosterStudio hasEditorDesign={false} onUseEditor={async () => { throw new Error("Sin diseño"); }} />);
  await user.upload(screen.getByLabelText("Cargar mi fotografía"), new File([bytes], "buzo.png", { type: "image/png" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Prenda preparada"));
  await user.click(screen.getByRole("button", { name: "Color de prenda #348c65" }));
  fireEvent.change(screen.getByLabelText("Color del nuevo fondo"), { target: { value: "#0088ff" } });
  const canvas = screen.getByLabelText("Fondo de la plantilla") as HTMLCanvasElement;
  await waitFor(() => expect([...canvas.getContext("2d")!.getImageData(20, 150, 1, 1).data]).toEqual([0, 136, 255, 255]));
  await waitFor(() => { const pixel = canvas.getContext("2d")!.getImageData(160, 300, 1, 1).data; expect(pixel[1]).toBeGreaterThan(pixel[0]); expect(pixel[2]).toBeLessThan(120); });
  await user.selectOptions(screen.getByLabelText("Formato"), "square");
  await waitFor(() => expect([...canvas.getContext("2d")!.getImageData(20, 20, 1, 1).data]).toEqual([0, 136, 255, 255]));
  await user.selectOptions(screen.getByLabelText("Formato"), "portrait");
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Plantilla guardada"));
  expect((await loadPoster())?.cutout).toBe(true);
}, 15000);

it("recorta por contorno sin seleccionar colores y exporta prenda, fondo y estampado separados", async () => {
  const user = userEvent.setup(), photo = createCanvas(100, 100), ctx = photo.getContext("2d");
  ctx.fillStyle = "#aaaaaa"; ctx.fillRect(0, 0, 100, 100); ctx.fillStyle = "white"; ctx.fillRect(20, 20, 60, 60);
  render(<PosterStudio hasEditorDesign onUseEditor={async () => ({ source: testImage(), name: "Diseño separado", width: 100, height: 100 })} />);
  await savePoster({ ...blankPoster(), template: "photo", photo: photo.toDataURL("image/png"), background: "#0088ff" });
  await user.click(screen.getByRole("button", { name: "Abrir plantilla guardada" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Recortar prenda por contorno" }) as HTMLButtonElement).disabled).toBe(false));
  await user.click(screen.getByRole("button", { name: "Recortar prenda por contorno" }));
  const stage = document.querySelector(".poster-stage")!;
  for (const [clientX, clientY] of [[160, 260], [640, 260], [640, 740], [160, 740]]) fireEvent.pointerDown(stage, { clientX, clientY, button: 0 });
  await user.click(screen.getByRole("button", { name: "Aplicar recorte" }));
  await user.click(screen.getByRole("button", { name: "Usar diseño del editor" }));
  await screen.findByAltText("Diseño separado");
  await user.click(screen.getByRole("button", { name: "Color de prenda #348c65" }));
  const canvas = screen.getByLabelText("Fondo de la plantilla") as HTMLCanvasElement;
  await waitFor(() => expect([...canvas.getContext("2d")!.getImageData(20, 150, 1, 1).data]).toEqual([0, 136, 255, 255]));
  let output: Blob | undefined;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((blob: Blob) => { output = blob; return "blob:cutout"; }) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const link = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await user.click(screen.getByRole("button", { name: "Descargar imagen PNG" }));
  await waitFor(() => expect(link).toHaveBeenCalled(), { timeout: 5000 });
  const image = await readCanvasImage(new Uint8Array(await output!.arrayBuffer())), exported = createCanvas(image.width, image.height), out = exported.getContext("2d"); out.drawImage(image, 0, 0);
  expect([...out.getImageData(40, 300, 1, 1).data]).toEqual([0, 136, 255, 255]);
  const garment = out.getImageData(350, 750, 1, 1).data; expect(garment[1]).toBeGreaterThan(garment[0]); expect(garment[2]).toBeLessThan(120);
  const print = out.getImageData(540, 580, 1, 1).data; expect(print[0]).toBeGreaterThan(200); expect(print[1]).toBeLessThan(50);
}, 15000);

it("personaliza una foto, mueve estampado y texto, guarda y descarga el PNG", async () => {
  const user = userEvent.setup(), source = testImage();
  render(<PosterStudio hasEditorDesign onUseEditor={async () => ({ source, name: "Estampado", width: 100, height: 100 })} />);
  const bytes = Uint8Array.from(atob(source.split(",")[1]), c => c.charCodeAt(0));
  await user.upload(screen.getByLabelText("Cargar mi fotografía"), new File([bytes], "foto.png", { type: "image/png" }));
  await waitFor(() => expect((screen.getByLabelText("Plantilla") as HTMLSelectElement).value).toBe("photo"));
  await waitFor(() => expect((screen.getByRole("button", { name: "Descargar imagen PNG" }) as HTMLButtonElement).disabled).toBe(false));
  await user.selectOptions(screen.getByLabelText("Encuadre de fotografía"), "cover");
  await user.click(screen.getByRole("button", { name: "Seleccionar prenda" }));
  const stage = document.querySelector(".poster-stage")!;
  fireEvent.pointerDown(stage, { clientX: 120, clientY: 200, button: 0 });
  await user.click(screen.getByRole("button", { name: "Color de prenda #348c65" }));
  const base = screen.getByLabelText("Fondo de la plantilla") as HTMLCanvasElement;
  await waitFor(() => { const pixel = base.getContext("2d")!.getImageData(81, 135, 1, 1).data; expect(pixel[1]).toBeGreaterThan(pixel[0]); });
  await user.click(screen.getByRole("button", { name: "Usar diseño del editor" }));
  await screen.findByAltText("Estampado"); await user.click(screen.getByRole("button", { name: "+ Añadir texto" }));
  await user.clear(screen.getByLabelText("Texto")); await user.type(screen.getByLabelText("Texto"), "OFERTA");
  const layer = document.querySelector(".poster-layer.is-selected") as HTMLElement;
  fireEvent.pointerDown(layer, { clientX: 400, clientY: 840, button: 0 }); fireEvent.pointerMove(layer, { clientX: 500, clientY: 700 }); fireEvent.pointerUp(layer, { clientX: 500, clientY: 700 });
  expect(layer.style.left).toBe("62.5%"); expect(layer.style.top).toBe("70%");
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Plantilla guardada"));
  await user.click(screen.getByRole("button", { name: "Eliminar" }));
  await user.click(screen.getByRole("button", { name: "Abrir plantilla guardada" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /T OFERTA/ })).toBeTruthy());
  await waitFor(() => expect((screen.getByRole("button", { name: "Descargar imagen PNG" }) as HTMLButtonElement).disabled).toBe(false));
  let output: Blob | undefined;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((blob: Blob) => { output = blob; return "blob:test"; }) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const link = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await user.click(screen.getByRole("button", { name: "Descargar imagen PNG" })); await waitFor(() => expect(link).toHaveBeenCalled());
  const image = await readCanvasImage(new Uint8Array(await output!.arrayBuffer())); expect([image.width, image.height]).toEqual([1080, 1350]);
  const exported = createCanvas(image.width, image.height), ctx = exported.getContext("2d"); ctx.drawImage(image, 0, 0);
  const garmentPixel = ctx.getImageData(162, 270, 1, 1).data; expect(garmentPixel[1]).toBeGreaterThan(garmentPixel[0]);
  const stampPixel = ctx.getImageData(540, 580, 1, 1).data; expect(stampPixel[0]).toBeGreaterThan(200); expect(stampPixel[1]).toBeLessThan(50);
}, 15000);


it("usa las fotos originales, cambia acabados, deshace y conserva la plantilla guardada", async () => {
  const user = userEvent.setup();
  render(<PosterStudio hasEditorDesign onUseEditor={async () => ({ source: testImage(), name: "Arte", width: 100, height: 100 })} />);
  for (const item of PHOTO_TEMPLATES) {
    await user.click(screen.getByRole("button", { name: item.title }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Descargar imagen PNG" }) as HTMLButtonElement).disabled).toBe(false), { timeout: 5000 });
    expect((screen.getByLabelText("Plantilla") as HTMLSelectElement).value).toBe(item.id);
  }
  await user.click(screen.getByRole("button", { name: "Color de prenda #734a91" }));
  await user.click(screen.getByRole("button", { name: "Usar diseño del editor" }));
  await screen.findByAltText("Arte");
  for (const finish of ["embroidery", "rhinestones", "sublimation", "screen", "vinyl", "dtf"]) {
    await user.selectOptions(screen.getByLabelText("Acabado del estampado"), finish);
    await waitFor(() => expect((screen.getByRole("button", { name: "Descargar imagen PNG" }) as HTMLButtonElement).disabled).toBe(false));
  }
  const count = document.querySelectorAll(".poster-layer").length;
  await user.click(screen.getByRole("button", { name: "Duplicar" }));
  expect(document.querySelectorAll(".poster-layer").length).toBe(count + 1);
  await user.click(screen.getByRole("button", { name: "Deshacer" }));
  expect(document.querySelectorAll(".poster-layer").length).toBe(count);
  await user.click(screen.getByRole("button", { name: "Rehacer" }));
  expect(document.querySelectorAll(".poster-layer").length).toBe(count + 1);
  await user.click(screen.getByRole("button", { name: "Vista limpia" }));
  expect(document.querySelector(".poster-layer.is-selected")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Plantilla guardada"));
  await user.click(screen.getByRole("button", { name: "Camiseta en percha" }));
  await user.click(screen.getByRole("button", { name: "Abrir plantilla guardada" }));
  await waitFor(() => expect((screen.getByLabelText("Plantilla") as HTMLSelectElement).value).toBe("photo-shirt-back"));
}, 20000);

it("reemplaza el fondo fotográfico por color o imagen y lo conserva al guardar y exportar", async () => {
  const user = userEvent.setup(), photo = createCanvas(100, 100), photoCtx = photo.getContext("2d");
  photoCtx.fillStyle = "#888888"; photoCtx.fillRect(0, 0, 100, 100);
  photoCtx.fillStyle = "#ffffff"; photoCtx.fillRect(30, 20, 40, 60);
  const source = photo.toDataURL("image/png");
  render(<PosterStudio hasEditorDesign={false} onUseEditor={async () => { throw new Error("Sin diseño"); }} />);
  const bytes = Uint8Array.from(atob(source.split(",")[1]), c => c.charCodeAt(0));
  await user.upload(screen.getByLabelText("Cargar mi fotografía"), new File([bytes], "prenda.png", { type: "image/png" }));
  // Open a clean project to make the test independent of the module's session memory.
  await savePoster({ ...blankPoster(), template: "photo", photo: source });
  await user.click(screen.getByRole("button", { name: "Abrir plantilla guardada" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Seleccionar fondo" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText("Color del nuevo fondo"), { target: { value: "#ff0000" } });
  await user.click(screen.getByRole("button", { name: "Seleccionar fondo" }));
  fireEvent.pointerDown(document.querySelector(".poster-stage")!, { clientX: 40, clientY: 200, button: 0 });
  const canvas = screen.getByLabelText("Fondo de la plantilla") as HTMLCanvasElement;
  await waitFor(() => expect([...canvas.getContext("2d")!.getImageData(20, 150, 1, 1).data]).toEqual([255, 0, 0, 255]));
  expect([...canvas.getContext("2d")!.getImageData(270, 337, 1, 1).data]).toEqual([255, 255, 255, 255]);
  const background = createCanvas(10, 10), ctx = background.getContext("2d"); ctx.fillStyle = "#0088ff"; ctx.fillRect(0, 0, 10, 10);
  await user.upload(screen.getByLabelText("Cargar imagen de fondo"), new File([new Uint8Array(background.toBuffer("image/png"))], "fondo.png", { type: "image/png" }));
  await waitFor(() => expect([...canvas.getContext("2d")!.getImageData(20, 150, 1, 1).data]).toEqual([0, 136, 255, 255]));
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Plantilla guardada"));
  expect((await loadPoster())?.backgroundMask).toMatch(/^data:image\/png/);
  expect((await loadPoster())?.backgroundImage).toMatch(/^data:image\/png/);
  let output: Blob | undefined;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((blob: Blob) => { output = blob; return "blob:background"; }) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const link = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await user.click(screen.getByRole("button", { name: "Descargar imagen PNG" }));
  await waitFor(() => expect(link).toHaveBeenCalled(), { timeout: 5000 });
  const image = await readCanvasImage(new Uint8Array(await output!.arrayBuffer())), exported = createCanvas(image.width, image.height), exportedCtx = exported.getContext("2d");
  exportedCtx.drawImage(image, 0, 0);
  expect([...exportedCtx.getImageData(40, 300, 1, 1).data]).toEqual([0, 136, 255, 255]);
  expect([...exportedCtx.getImageData(540, 675, 1, 1).data]).toEqual([255, 255, 255, 255]);
  expect([...exportedCtx.getImageData(10, 10, 1, 1).data]).toEqual([0, 136, 255, 255]);
  await user.click(screen.getByRole("button", { name: "Restaurar fondo original" }));
  await waitFor(() => expect([...canvas.getContext("2d")!.getImageData(20, 150, 1, 1).data]).toEqual([136, 136, 136, 255]));
}, 15000);
