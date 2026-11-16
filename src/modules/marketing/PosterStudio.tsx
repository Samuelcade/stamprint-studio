import { useCanvasView } from "../../components/useCanvasView";
import { ViewControls } from "../../components/ViewControls";
import { useEffect, useRef, useState } from "react";
import { createId } from "../../core/id";
import type { ChangeEvent, PointerEvent } from "react";
import { importImageFile, loadImage } from "../graphic-editor/render";
import { removeColor } from "../background-removal/colorRemoval";
import { blankPoster, FORMAT_HEIGHT, TECHNIQUES } from "./model";
import type { Poster, PosterLayer, PosterFormat, Template, Technique } from "./model";
import { drawPhoto, drawPosterBackground, drawPosterLayer, photoPlacement, preparePosterPrint } from "./render";
import { PHOTO_TEMPLATES, photoTemplate } from "./catalog";
import { loadPoster, savePoster } from "./storage";
import { automaticCutout, photoCanvas } from "./cutout";
import "./poster.css";

type ImageInput = { source: string; name: string; width: number; height: number };
type MaskMode = "off" | "pick" | "add" | "erase" | "background" | "contour";
let memory: Poster = blankPoster();
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const previewWidth = 540;
function nameSafe(value: string) { return value.replace(/[<>:"/\\|?*]/g, "_") || "publicidad"; }

export function PosterStudio({ hasEditorDesign, onUseEditor }: { hasEditorDesign: boolean; onUseEditor: () => Promise<ImageInput> }) {
  const [history, setHistory] = useState<{ present: Poster; past: Poster[]; future: Poster[]; group?: string }>(() => ({ present: memory, past: [], future: [] }));
  const current = useRef(history); current.current = history;
  const poster = history.present;
  function setPoster(value: Poster | ((previous: Poster) => Poster), group?: string) {
    const state = current.current, next = typeof value === "function" ? value(state.present) : value;
    if (next === state.present) return;
    const updated = { present: next, past: group && group === state.group ? state.past : [...state.past.slice(-29), state.present], future: [], group };
    current.current = updated; setHistory(updated);
  }
  function endGroup() { if (current.current.group) { const updated = { ...current.current, group: undefined }; current.current = updated; setHistory(updated); } }
  function undo(redo = false) {
    if (busy) return;
    drag.current = null; painting.current = false; setDraft(undefined); setMode("off");
    const state = current.current, next = redo ? state.future[0] : state.past.at(-1); if (!next) return;
    const updated = redo ? { present: next, past: [...state.past, state.present], future: state.future.slice(1) } : { present: next, past: state.past.slice(0, -1), future: [state.present, ...state.future] };
    current.current = updated; setHistory(updated); setSelectedId(undefined);
  }
  const [mobilePanel, setMobilePanel] = useState("canvas");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const view = useCanvasView(1080, FORMAT_HEIGHT[poster.format], cancelGesture);
  const [selectedId, setSelectedId] = useState<string>(), [draft, setDraft] = useState<PosterLayer>(), [clean, setClean] = useState(false);
  const [assets, setAssets] = useState(new Map<string, CanvasImageSource>()), [backgroundVersion, setBackgroundVersion] = useState(0);
  const assetCache = useRef(new Map<string, Promise<CanvasImageSource>>()), backgroundCanvas = useRef<HTMLCanvasElement | null>(null);
  const catalog = photoTemplate(poster.template), photoSource = catalog?.source ?? (poster.template === "photo" ? poster.photo : "");
  const photographic = !!catalog || poster.template === "photo";
  const [loadedPhotoSource, setLoadedPhotoSource] = useState("");
  const [backgroundAssets, setBackgroundAssets] = useState<{ image?: HTMLImageElement; mask?: HTMLImageElement; key: string }>({ key: "" });
  const backgroundKey = JSON.stringify([poster.backgroundImage || "", poster.backgroundMask || ""]);
  const backgroundReady = backgroundAssets.key === backgroundKey;
  const [backgroundTolerance, setBackgroundTolerance] = useState(35);
  const [contour, setContour] = useState<{ x: number; y: number }[]>([]);
  const layers = draft ? poster.layers.map(layer => layer.id === draft.id ? draft : layer) : poster.layers;
  const assetKey = (layer: PosterLayer) => layer.kind === "image" ? layer.source + "|" + (layer.technique ?? "dtf") : "";
  const assetsReady = poster.layers.every(layer => layer.kind !== "image" || assets.has(assetKey(layer)));
  const [maskReset, setMaskReset] = useState(0);
  const [photo, setPhoto] = useState<HTMLImageElement>(), [maskVersion, setMaskVersion] = useState(0), [maskReady, setMaskReady] = useState(false), [mode, setMode] = useState<MaskMode>("off"), [tolerance, setTolerance] = useState(55), [brushSize, setBrushSize] = useState(24);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("Elige una plantilla o carga una fotografía para empezar."), [error, setError] = useState("");
  const base = useRef<HTMLCanvasElement>(null), stage = useRef<HTMLDivElement>(null), mask = useRef<HTMLCanvasElement | null>(null), alive = useRef(true);
  const drag = useRef<{ layer: PosterLayer; dx: number; dy: number; pointerId: number } | null>(null), painting = useRef(false), last = useRef<{ x: number; y: number } | null>(null);
  const selected = poster.layers.find(item => item.id === selectedId), previewHeight = Math.round(previewWidth * FORMAT_HEIGHT[poster.format] / 1080);
  useEffect(() => { memory = poster; }, [poster]);
  useEffect(() => { if (mode !== "off") setMobilePanel("canvas"); }, [mode]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.all([poster.backgroundImage ? loadImage(poster.backgroundImage) : undefined, poster.backgroundMask ? loadImage(poster.backgroundMask) : undefined])
      .then(([image, mask]) => { if (!cancelled) setBackgroundAssets({ image, mask, key: backgroundKey }); })
      .catch(() => { if (!cancelled) setError("No se pudo abrir el fondo. Vuelve a cargarlo."); });
    return () => { cancelled = true; };
  }, [backgroundKey]);
  useEffect(() => {
    let cancelled = false; setPhoto(undefined); setLoadedPhotoSource("");
    if (photoSource) loadImage(photoSource).then(image => { if (!cancelled) { setPhoto(image); setLoadedPhotoSource(photoSource); } }).catch(() => { if (!cancelled) setError("No se pudo abrir la fotografía. Vuelve a elegir la plantilla."); });
    return () => { cancelled = true; };
  }, [photoSource]);
  useEffect(() => {
    let cancelled = false; const keys = new Set(poster.layers.filter(layer => layer.kind === "image").map(assetKey));
    for (const key of assetCache.current.keys()) if (!keys.has(key)) assetCache.current.delete(key);
    Promise.all(poster.layers.filter(layer => layer.kind === "image").map(async layer => {
      const key = assetKey(layer); let asset = assetCache.current.get(key);
      if (!asset) { asset = loadImage(layer.source).then(image => preparePosterPrint(image, layer.technique)); assetCache.current.set(key, asset); }
      return [key, await asset] as const;
    })).then(entries => { if (!cancelled) setAssets(new Map(entries)); }).catch(() => { if (!cancelled) setError("No se pudo preparar un estampado."); });
    return () => { cancelled = true; };
  }, [poster.layers]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as Element).closest("input,textarea,select")) return;
      if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); undo(event.key.toLowerCase() === "y" || event.shiftKey); }
      if (event.key === "Escape") { cancelGesture(); setSelectedId(undefined); setMode("off"); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    let cancelled = false; const canvas = document.createElement("canvas"); canvas.width = previewWidth; canvas.height = previewHeight; mask.current = canvas; setMaskReady(false);
    if (poster.mask) loadImage(poster.mask).then(image => { if (!cancelled) { canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height); setMaskVersion(v => v + 1); setMaskReady(true); } }).catch(() => { if (!cancelled) setError("No se pudo recuperar la selección de la prenda."); });
    else { setMaskVersion(v => v + 1); setMaskReady(true); }
    return () => { cancelled = true; };
  }, [poster.mask, previewHeight, maskReset]);
  useEffect(() => {
    const canvas = document.createElement("canvas"); backgroundCanvas.current = canvas; canvas.width = previewWidth; canvas.height = previewHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) return;
    try { drawPosterBackground(ctx, previewWidth, previewHeight, mode === "contour" ? { ...poster, recolor: false } : poster, loadedPhotoSource === photoSource ? photo : undefined, mask.current ?? undefined, backgroundReady ? backgroundAssets.image : undefined, mode !== "contour" && backgroundReady ? backgroundAssets.mask : undefined); setBackgroundVersion(v => v + 1); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo mostrar la plantilla."); }
  }, [poster.template, poster.garmentColor, poster.background, poster.recolor, poster.photoFit, poster.cutout, poster.mask, photo, loadedPhotoSource, photoSource, maskVersion, previewHeight, backgroundAssets, backgroundReady, mode]);
  useEffect(() => {
    const canvas = base.current; if (!canvas || !backgroundCanvas.current) return;
    canvas.width = previewWidth; canvas.height = previewHeight; const ctx = canvas.getContext("2d")!;
    ctx.drawImage(backgroundCanvas.current, 0, 0);
    for (const layer of layers) drawPosterLayer(ctx, previewWidth, previewHeight, layer, layer.kind === "image" ? assets.get(assetKey(layer)) : undefined);
    if (mode === "contour" && photo && contour.length) {
      const p = photoPlacement(photo.naturalWidth, photo.naturalHeight, previewWidth, previewHeight, poster.photoFit ?? "contain");
      const points = contour.map(point => ({ x: p.x + point.x * p.width, y: p.y + point.y * p.height }));
      ctx.beginPath(); points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.closePath(); ctx.fillStyle = "#b7ec5522"; ctx.fill(); ctx.strokeStyle = "#b7ec55"; ctx.lineWidth = 2; ctx.stroke();
      for (const point of points) { ctx.beginPath(); ctx.arc(point.x, point.y, 3, 0, Math.PI * 2); ctx.fillStyle = "#b7ec55"; ctx.fill(); }
    }
  }, [backgroundVersion, poster.layers, draft, assets, previewHeight, contour, mode, photo, poster.photoFit]);
  function updateLayer(id: string, update: Partial<PosterLayer>) { setPoster(current => ({ ...current, layers: current.layers.map(layer => layer.id === id ? { ...layer, ...update } as PosterLayer : layer) }), "element:" + id); }
  async function importDesign(get: () => Promise<ImageInput>) {
    if (poster.layers.length >= 100) { setError("La plantilla admite hasta 100 elementos."); return; }
    setBusy(true); setError("");
    try {
      const input = await get(); if (!alive.current) return;
      if (!input.width || !input.height) throw new Error("La imagen no tiene dimensiones válidas.");
      const id = createId();
      const placement = catalog ? photoPlacement(catalog.width, catalog.height, 1080, FORMAT_HEIGHT[poster.format], poster.photoFit ?? "contain", catalog.crop) : undefined;
      const x = placement && catalog ? (placement.x + catalog.print.x * placement.width) / 1080 : .5;
      const y = placement && catalog ? (placement.y + catalog.print.y * placement.height) / FORMAT_HEIGHT[poster.format] : .43;
      const size = placement && catalog ? catalog.print.width * placement.width / 1080 : .3;
      setPoster(current => ({ ...current, layers: [...current.layers, { id, kind: "image", source: input.source, name: input.name, x, y, width: size, aspect: input.width / input.height, rotation: 0, technique: "dtf", opacity: 1 }] }));
      setSelectedId(id); setMobilePanel("canvas"); setMode("off"); setStatus("Estampado añadido. Arrástralo para ubicarlo.");
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "No se pudo abrir el estampado."); } finally { if (alive.current) setBusy(false); }
  }
  function fileDesign(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importDesign(async () => ({ ...await importImageFile(file), name: file.name })); }
  async function filePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    setBusy(true); setError("");
    try {
      const image = await importImageFile(file), loaded = await loadImage(image.source), cutout = automaticCutout(loaded);
      if (!alive.current) return;
      setPoster(current => ({ ...current, template: "photo", photo: image.source, mask: "", backgroundMask: cutout ?? "", cutout: cutout !== undefined, recolor: false, photoFit: "contain" })); setMode("off"); setContour([]);
      setStatus(cutout !== undefined ? "Prenda preparada. Puedes cambiar su color y colocar un fondo sin seleccionar zonas." : "Foto cargada. Usa Recortar prenda por contorno para separar la prenda de un fondo complejo.");
    }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "No se pudo abrir la fotografía."); } finally { if (alive.current) setBusy(false); }
  }
  function addText() {
    if (poster.layers.length >= 100) { setError("La plantilla admite hasta 100 elementos."); return; }
    const id = createId(); setPoster(current => ({ ...current, layers: [...current.layers, { id, kind: "text", text: "TU TEXTO", color: "#17202c", x: .5, y: .84, size: .065, rotation: 0 }] }));
    setSelectedId(id); setMobilePanel("canvas"); setMode("off"); setStatus("Texto añadido. Escríbelo en el panel y arrástralo para ubicarlo.");
  }
  async function fileBackground(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    setBusy(true); setError("");
    try {
      const image = await importImageFile(file); if (!alive.current) return;
      const prepared = poster.template === "photo" && photo && !poster.cutout && !poster.backgroundMask ? automaticCutout(photo) : undefined;
      setPoster(current => ({ ...current, backgroundImage: image.source, ...(prepared !== undefined ? { backgroundMask: prepared, cutout: true, mask: "" } : {}) }));
      setMode("off"); setClean(false);
      setStatus(photographic && !poster.cutout && prepared === undefined && !poster.backgroundMask ? "Fondo cargado detrás de la foto. Prepara o recorta la prenda para mostrarlo sin borrar partes de la ropa." : "Imagen de fondo aplicada detrás de la prenda.");
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "No se pudo cargar el fondo."); }
    finally { if (alive.current) setBusy(false); }
  }
  function selectBackground(point: { x: number; y: number }) {
    if (!photo || !backgroundReady) return;
    try {
      const placement = photoPlacement(photo.naturalWidth, photo.naturalHeight, previewWidth, previewHeight, poster.photoFit ?? "cover", catalog?.crop);
      const x = (point.x * previewWidth - placement.x) / placement.scale + placement.source.x;
      const y = (point.y * previewHeight - placement.y) / placement.scale + placement.source.y;
      if (x < 0 || y < 0 || x >= photo.naturalWidth || y >= photo.naturalHeight) return;
      const scale = Math.min(1, 1200 / Math.max(photo.naturalWidth, photo.naturalHeight));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) throw new Error("No se pudo seleccionar el fondo.");
      ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = removeColor(pixels, { x: Math.min(canvas.width - 1, Math.floor(x / photo.naturalWidth * canvas.width)), y: Math.min(canvas.height - 1, Math.floor(y / photo.naturalHeight * canvas.height)) }, backgroundTolerance, "connected");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (backgroundAssets.mask) ctx.drawImage(backgroundAssets.mask, 0, 0, canvas.width, canvas.height);
      const selection = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < found.length; i++) if (found[i] === 0) { const offset = i * 4; selection.data[offset] = selection.data[offset + 1] = selection.data[offset + 2] = selection.data[offset + 3] = 255; }
      ctx.putImageData(selection, 0, 0);
      setPoster(current => ({ ...current, backgroundMask: canvas.toDataURL("image/png") }));
      setStatus("Fondo sustituido. Toca otras zonas para añadirlas; usa Deshacer si seleccionaste parte de la prenda.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo seleccionar el fondo."); }
  }
  function prepareGarment() {
    if (!photo || loadedPhotoSource !== photoSource) return;
    try {
      const cutout = automaticCutout(photo);
      if (cutout === undefined) { setError("No se detectó un fondo uniforme. Usa Recortar prenda por contorno para conservar toda la prenda."); return; }
      setPoster(current => ({ ...current, backgroundMask: cutout, mask: "", cutout: true })); setMode("off"); setError("");
      setStatus("Prenda preparada. El color y el fondo se aplican por separado.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo preparar la prenda."); }
  }
  function repairGarment() {
    if (!photo || loadedPhotoSource !== photoSource || !backgroundReady) return;
    try {
      const cutout = automaticCutout(photo);
      setPoster(current => ({ ...current, mask: "", backgroundMask: cutout ?? "", cutout: cutout !== undefined, recolor: cutout !== undefined && current.recolor }));
      setContour([]); setClean(false); setError("");
      setMode(cutout === undefined ? "contour" : "off");
      setStatus(cutout === undefined ? "Se restauró la tela original. La prenda y el fondo son demasiado parecidos para recortar por color: marca el contorno y pulsa Aplicar recorte." : "Recorte reparado desde la fotografía original. El color cubre toda la prenda y conserva sus pliegues.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo reparar la selección."); }
  }
  function applyContour() {
    if (!photo || contour.length < 3) return;
    const canvas = photoCanvas(photo), ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "destination-out"; ctx.beginPath();
    contour.forEach((point, i) => i ? ctx.lineTo(point.x * canvas.width, point.y * canvas.height) : ctx.moveTo(point.x * canvas.width, point.y * canvas.height));
    ctx.closePath(); ctx.fill();
    setPoster(current => ({ ...current, backgroundMask: canvas.toDataURL("image/png"), mask: "", cutout: true }));
    setMode("off"); setContour([]); setError(""); setStatus("Prenda recortada. Ya puedes cambiar su color y el fondo sin selección por colores.");
  }
  function position(event: { clientX: number; clientY: number }) {
    const rect = stage.current!.getBoundingClientRect(); return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  }
  function startLayer(event: PointerEvent<HTMLDivElement>, layer: PosterLayer) {
    if (mode !== "off" || busy || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (clean) return; endGroup(); event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setSelectedId(layer.id);
    const p = position(event); drag.current = { layer, dx: p.x - layer.x, dy: p.y - layer.y, pointerId: event.pointerId };
  }
  function paintMask(point: { x: number; y: number }) {
    const canvas = mask.current, ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    const p = { x: point.x * canvas.width, y: point.y * canvas.height }, from = last.current ?? p;
    ctx.save(); ctx.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = brushSize; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(p.x + .001, p.y + .001); ctx.stroke(); ctx.restore(); last.current = p; setMaskVersion(v => v + 1);
  }
  function selectGarment(point: { x: number; y: number }) {
    const canvas = mask.current; if (!canvas || !photo) return;
    if (poster.cutout) {
      setPoster(current => ({ ...current, mask: "", recolor: true }));
      setMode("off"); setStatus("Prenda completa seleccionada. El color se aplica a toda la tela, incluidos los pliegues."); return;
    }
    try {
      const scratch = document.createElement("canvas"); scratch.width = canvas.width; scratch.height = canvas.height; const ctx = scratch.getContext("2d", { willReadFrequently: true }), maskCtx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx || !maskCtx) throw new Error("No se pudo seleccionar la prenda.");
      drawPhoto(ctx, photo, photo.naturalWidth, photo.naturalHeight, canvas.width, canvas.height, poster.photoFit ?? "cover");
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = removeColor(pixels, { x: Math.min(canvas.width - 1, Math.floor(point.x * canvas.width)), y: Math.min(canvas.height - 1, Math.floor(point.y * canvas.height)) }, tolerance, "connected");
      const image = maskCtx.getImageData(0, 0, canvas.width, canvas.height);
      for (let p = 0; p < found.length; p++) if (found[p] === 0) { const i = p * 4; image.data[i] = image.data[i + 1] = image.data[i + 2] = image.data[i + 3] = 255; }
      maskCtx.putImageData(image, 0, 0); setMaskVersion(v => v + 1); setPoster(current => ({ ...current, mask: canvas.toDataURL("image/png") }));
      setStatus("Área seleccionada. Elige el color y usa los pinceles para corregir los bordes.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo seleccionar la prenda."); }
  }
  function stageDown(event: PointerEvent<HTMLDivElement>) {
    if (mode === "off" || !photo || !maskReady || busy) return; event.preventDefault(); const point = position(event);
    if (mode === "contour") {
      const p = photoPlacement(photo.naturalWidth, photo.naturalHeight, previewWidth, previewHeight, poster.photoFit ?? "contain");
      const x = (point.x * previewWidth - p.x) / p.width, y = (point.y * previewHeight - p.y) / p.height;
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) setContour(points => [...points, { x, y }]);
    }
    else if (mode === "background") selectBackground(point);
    else if (mode === "pick") selectGarment(point);
    else { event.currentTarget.setPointerCapture(event.pointerId); painting.current = true; last.current = null; paintMask(point); }
  }
  function stageMove(event: PointerEvent<HTMLDivElement>) {
    if (drag.current && drag.current.pointerId === event.pointerId) { const p = position(event), d = drag.current; setDraft({ ...d.layer, x: clamp(p.x - d.dx, 0, 1), y: clamp(p.y - d.dy, 0, 1) }); }
    else if (painting.current) paintMask(position(event));
  }
  function stageFinish(event: PointerEvent<HTMLDivElement>) {
    if (drag.current && drag.current.pointerId === event.pointerId) {
      const p = position(event), d = drag.current, x = clamp(p.x - d.dx, 0, 1), y = clamp(p.y - d.dy, 0, 1);
      if (x !== d.layer.x || y !== d.layer.y) updateLayer(d.layer.id, { x, y });
      drag.current = null; setDraft(undefined); endGroup();
    }
    if (painting.current && mask.current) { painting.current = false; last.current = null; setPoster(current => ({ ...current, mask: mask.current!.toDataURL("image/png"), recolor: true })); }
  }
  function cancelGesture() { drag.current = null; setDraft(undefined); if (painting.current) { painting.current = false; last.current = null; setMaskReset(v => v + 1); } }
  function chooseTemplate(template: Template) { setGalleryOpen(false); setMobilePanel("canvas"); setPoster(current => ({ ...current, template, mask: "", backgroundMask: "", cutout: false, recolor: false, photoFit: "contain" })); setMode("off"); setContour([]); setError(""); setStatus("Plantilla seleccionada. Cambia su color y añade tu estampado."); }

  async function save() { setBusy(true); setError(""); try { await savePoster(poster); if (alive.current) setStatus("Plantilla guardada en este navegador. El siguiente guardado reemplaza esta copia."); } catch { if (alive.current) setError("No se pudo guardar la plantilla en este navegador."); } finally { if (alive.current) setBusy(false); } }
  async function open() { setBusy(true); setError(""); try { const value = await loadPoster(); if (!alive.current) return; if (value) { setPoster(value); setSelectedId(undefined); setMode("off"); setStatus("Plantilla guardada recuperada."); } else setStatus("Todavía no hay una plantilla guardada en este navegador."); } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "No se pudo abrir la plantilla."); } finally { if (alive.current) setBusy(false); } }
  async function exportPng() {
    if (!backgroundReady) { setError("Espera a que termine de cargar el fondo."); return; }
    if (photographic && (!photo || loadedPhotoSource !== photoSource || (poster.template === "photo" && !maskReady))) { setError("Espera a que termine de cargar la selección de la prenda."); return; }
    setBusy(true); setError("");
    try {
      const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = FORMAT_HEIGHT[poster.format];
      const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) throw new Error("No se pudo crear la imagen.");
      if (poster.template === "photo" && !photo) throw new Error("Espera a que termine de cargar la fotografía.");
      drawPosterBackground(ctx, canvas.width, canvas.height, poster, photo, mask.current ?? undefined, backgroundAssets.image, backgroundAssets.mask);
      for (const layer of poster.layers) { const image = layer.kind === "image" ? preparePosterPrint(await loadImage(layer.source), layer.technique) : undefined; drawPosterLayer(ctx, canvas.width, canvas.height, layer, image); }
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("No se pudo generar el PNG.")), "image/png"));
      const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `${nameSafe("publicidad-estampado")}.png`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (alive.current) setStatus(`Imagen publicitaria descargada: ${canvas.width} × ${canvas.height} px.`);
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "No se pudo descargar la imagen."); } finally { if (alive.current) setBusy(false); }
  }
  return <div className={`poster-studio ${galleryOpen ? "is-gallery-open" : ""}`} data-panel={mobilePanel} onPointerUp={endGroup} onBlur={endGroup}><div className="poster-heading"><div><p className="eyebrow">CONTENIDO PARA TU NEGOCIO</p><h1>Plantillas publicitarias</h1><p>Personaliza una prenda, coloca tus diseños y crea una imagen para compartir.</p></div><div className="poster-actions"><button disabled={busy || !history.past.length} onClick={() => undo()}>Deshacer</button><button disabled={busy || !history.future.length} onClick={() => undo(true)}>Rehacer</button><button disabled={busy} onClick={() => void open()}>Abrir plantilla guardada</button><button disabled={busy} onClick={() => void save()}>Guardar plantilla</button><button className="accent" disabled={busy || !assetsReady || (photographic && (!photo || loadedPhotoSource !== photoSource || (poster.template === "photo" && !maskReady)))} onClick={() => void exportPng()}>Descargar imagen PNG</button></div></div>
    <button className="poster-gallery-toggle" aria-expanded={galleryOpen} onClick={() => setGalleryOpen(value => !value)}>Cambiar plantilla · {catalog?.title ?? "Mi prenda"}</button><div className="poster-gallery" aria-label="Tus fotografías para plantillas">{PHOTO_TEMPLATES.map(item => { const crop = item.crop ?? { x: 0, y: 0, width: item.width, height: item.height }; return <button key={item.id} disabled={busy} aria-pressed={poster.template === item.id} onClick={() => chooseTemplate(item.id as Template)}><svg viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`} aria-hidden="true"><image href={item.source} width={item.width} height={item.height} /></svg><span>{item.title}</span></button>; })}</div><div className="poster-mobile-panels" role="group" aria-label="Panel de plantillas">{[["canvas", "Vista previa"], ["garment", "Prenda"], ["layers", "Elementos"]].map(([id, title]) => <button key={id} aria-pressed={mobilePanel === id} onClick={() => { cancelGesture(); setMobilePanel(id); }}>{title}</button>)}</div><div className="poster-layout"><fieldset className="poster-panel" disabled={busy}><h2>Plantilla y prenda</h2><label>Plantilla<select value={poster.template} onChange={event => chooseTemplate(event.target.value as Template)}>{PHOTO_TEMPLATES.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}<option value="shirt-front">Camiseta ilustrada · frente</option><option value="shirt-back">Camiseta ilustrada · espalda</option><option value="hoodie">Buzo ilustrado</option>{poster.photo && <option value="photo">Mi fotografía</option>}</select></label><label className="poster-file">Cargar mi fotografía<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => void filePhoto(event)} /></label><label>Formato<select value={poster.format} onChange={event => { const format = event.target.value as PosterFormat; setPoster(current => ({ ...current, format, mask: current.photo ? "" : current.mask })); if (poster.photo && poster.mask) { setMode("off"); setStatus("Cambió el encuadre. Vuelve a seleccionar la prenda en tu foto para colorearla."); } }}><option value="portrait">Publicación vertical · 1080 × 1350</option><option value="square">Publicación cuadrada · 1080 × 1080</option><option value="story">Historia · 1080 × 1920</option></select></label>{photographic && <label>Encuadre de fotografía<select value={poster.photoFit ?? "cover"} onChange={event => { const photoFit = event.target.value as "contain" | "cover"; setPoster(current => ({ ...current, photoFit, mask: "" })); setMode("off"); }}><option value="contain">Mostrar foto completa</option><option value="cover">Llenar publicación</option></select></label>}<label>Color de la prenda<input type="color" value={poster.garmentColor} onChange={event => setPoster(current => ({ ...current, garmentColor: event.target.value, recolor: true }), "garment-color")} /></label><div className="poster-swatches">{["#ffffff", "#1c2028", "#75889a", "#b51e38", "#348c65", "#e1bd82", "#142c63", "#734a91", "#e9a1bc", "#ed782c", "#f0d550", "#77513b"].map(value => <button key={value} title={value} aria-label={`Color de prenda ${value}`} style={{ background: value }} onClick={() => setPoster(current => ({ ...current, garmentColor: value, recolor: true }))} />)}</div>{photographic && <button onClick={() => setPoster(current => ({ ...current, recolor: false }))}>Restaurar color original</button>}<label>Color del fondo<input type="color" value={poster.background} onChange={event => setPoster(current => ({ ...current, background: event.target.value }))} /></label>
    {poster.template === "photo" && <><hr /><h2>Colorear mi foto</h2><p className="poster-help">Selecciona la prenda sobre la foto y después elige su color. Puedes tocar varias zonas o corregirlas con el pincel.</p><div className="poster-tool-group">{([ ["off", "Mover elementos"], ["pick", "Seleccionar prenda"], ["add", "Añadir área"], ["erase", "Quitar área"] ] as const).map(([value, label]) => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}</div>{mode === "pick" && <label>Similitud de color <b>{tolerance}</b><input type="range" min="5" max="150" value={tolerance} onChange={event => setTolerance(Number(event.target.value))} /></label>}{(mode === "add" || mode === "erase") && <label>Tamaño de pincel <b>{brushSize}</b><input type="range" min="5" max="100" value={brushSize} onChange={event => setBrushSize(Number(event.target.value))} /></label>}<button onClick={() => { setPoster(current => ({ ...current, mask: "" })); setStatus("Selección borrada. Vuelve a seleccionar la prenda."); }}>Borrar selección</button><p className="poster-help">La selección es aproximada; revisa los bordes antes de descargar.</p></>}
    {poster.template === "photo" && <><hr /><h2>Preparar mi prenda</h2><p className="poster-help">Para una plantilla de buzo o camiseta: preparación automática si tiene fondo uniforme o transparente. Si la foto es compleja, marca el contorno de la prenda.</p>
    <button disabled={!photo || loadedPhotoSource !== photoSource || !backgroundReady} onClick={repairGarment}>Reparar recorte y color</button>
    <button disabled={!photo || loadedPhotoSource !== photoSource || !backgroundReady} onClick={prepareGarment}>Preparar prenda automáticamente</button>
    <button disabled={!photo || loadedPhotoSource !== photoSource} aria-pressed={mode === "contour"} onClick={() => { setContour([]); setMode(mode === "contour" ? "off" : "contour"); setClean(false); setError(""); setStatus("Marca puntos alrededor del borde de la prenda y pulsa Aplicar recorte. El estampado se añade después con Cargar estampado."); }}>Recortar prenda por contorno</button>
    {mode === "contour" && <><p className="poster-help">{contour.length} puntos. Rodea únicamente la prenda; añade puntos en curvas y esquinas.</p><button disabled={contour.length < 3} onClick={applyContour}>Aplicar recorte</button><button disabled={!contour.length} onClick={() => setContour(points => points.slice(0, -1))}>Quitar último punto</button><button onClick={() => { setContour([]); setMode("off"); }}>Cancelar recorte</button></>}
    {poster.cutout && <p className="poster-help">Prenda recortada: el fondo queda detrás y el color solo afecta a la prenda. Carga el diseño con Cargar estampado para conservar sus colores.</p>}</>}
    <hr /><h2>Fondo de la imagen</h2><p className="poster-help">Elige un color o carga una imagen. En una prenda preparada se aplica directamente. La selección por color queda disponible para retoques.</p>
    <label>Color del nuevo fondo<input type="color" value={poster.background} onChange={event => { const background = event.target.value; setPoster(current => ({ ...current, background, backgroundImage: "" }), "background-color"); }} /></label>
    <label className="poster-file">Cargar imagen de fondo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void fileBackground(event)} /></label>
    {poster.backgroundImage && <button onClick={() => setPoster(current => ({ ...current, backgroundImage: "" }))}>Quitar imagen de fondo</button>}
    {photographic && <><button disabled={!photo || loadedPhotoSource !== photoSource || !backgroundReady} aria-pressed={mode === "background"} onClick={() => { setMode(mode === "background" ? "off" : "background"); setClean(false); setStatus("Toca el fondo de la fotografía. Ajusta la similitud si hace falta y selecciona otras zonas."); }}>{mode === "background" ? "Terminar selección del fondo" : "Seleccionar fondo"}</button>
    {mode === "background" && <label>Similitud del fondo <b>{backgroundTolerance}</b><input type="range" min="5" max="150" value={backgroundTolerance} onChange={event => setBackgroundTolerance(Number(event.target.value))} /></label>}
    <button disabled={!poster.backgroundMask} onClick={() => { setPoster(current => ({ ...current, backgroundMask: "", cutout: false })); setMode("off"); }}>Restaurar fondo original</button></>}
    <p className="poster-help">Las fotos de la galería tienen el área de la camiseta preparada. Para un buzo u otra prenda, carga tu fotografía y selecciona el área que quieras colorear.</p><hr /><h2>Añadir contenido</h2><label className="poster-file">Cargar estampado<input type="file" accept="image/png,image/jpeg,image/webp" multiple={false} disabled={busy} onChange={fileDesign} /></label><button disabled={!hasEditorDesign || busy} onClick={() => void importDesign(onUseEditor)}>Usar diseño del editor</button><button onClick={addText}>+ Añadir texto</button><p className="poster-help">Puedes usar PNG de DTF, serigrafía u otra técnica. Los archivos transparentes se integran mejor.</p></fieldset>
    <div className="poster-center"><div className="poster-canvas-heading"><span>VISTA DE LA PUBLICACIÓN</span><button aria-pressed={clean} onClick={() => { setClean(!clean); setMode("off"); }}>Vista limpia</button><span>{poster.format === "story" ? "HISTORIA" : poster.format === "square" ? "CUADRADA" : "VERTICAL"}</span></div><ViewControls {...view} /><div className={`poster-scroll ${view.pan ? "is-panning" : ""}`} ref={view.viewportRef} {...view.events}><div className="poster-sheet-space" style={view.space}><div className={`poster-stage ${mode !== "off" ? "is-masking" : ""} ${clean ? "is-clean" : ""}`} ref={stage} style={{ width: 1080 * view.scale, height: FORMAT_HEIGHT[poster.format] * view.scale }} onPointerDown={stageDown} onPointerMove={stageMove} onPointerUp={stageFinish} onPointerCancel={cancelGesture} onClick={event => { if (mode === "off" && event.target === event.currentTarget) setSelectedId(undefined); }}><canvas ref={base} aria-label="Fondo de la plantilla" />{layers.map(layer => <div key={layer.id} className={`poster-layer ${layer.id === selectedId && !clean ? "is-selected" : ""}`} style={{ left: `${layer.x * 100}%`, top: `${layer.y * 100}%`, transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`, ...(layer.kind === "image" ? { width: `${layer.width * 100}%` } : { fontSize: `${layer.size * 100}cqw`, color: layer.color, fontFamily: layer.font ?? "Arial", fontWeight: layer.bold === false ? 400 : 700 }) }} onPointerDown={event => startLayer(event, layer)}>{layer.kind === "image" ? <img src={layer.source} alt={layer.name} draggable={false} style={{ opacity: 0 }} /> : <span style={{ opacity: 0 }}>{layer.text}</span>}</div>)}</div></div></div><p className="poster-status" role="status">{status}</p>{error && <p className="poster-error" role="alert">{error}</p>}</div>
    <fieldset className="poster-panel" disabled={busy}><h2>Elementos</h2>{poster.layers.length === 0 ? <p className="poster-help">Añade un estampado o un texto.</p> : <div className="poster-list">{poster.layers.map((layer, index) => <button key={layer.id} aria-pressed={layer.id === selectedId} onClick={() => { setSelectedId(layer.id); setMode("off"); setClean(false); }}>{layer.kind === "image" ? `▧ ${layer.name}` : `T ${layer.text || "Texto"}`} <small>#{index + 1}</small></button>)}</div>}
    {selected && <><hr /><h2>Elemento seleccionado</h2>{selected.kind === "image" && <><label>Acabado del estampado<select value={selected.technique ?? "dtf"} onChange={event => updateLayer(selected.id, { technique: event.target.value as Technique })}>{Object.entries(TECHNIQUES).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label><p className="poster-help">Simulación visual aproximada para publicidad. Puedes cargar el PNG que preparaste en cada técnica.</p><label>Opacidad <b>{Math.round((selected.opacity ?? 1) * 100)}%</b><input aria-label="Opacidad del estampado" type="range" min="0" max="100" value={(selected.opacity ?? 1) * 100} onChange={event => updateLayer(selected.id, { opacity: Number(event.target.value) / 100 })} /></label></>}{selected.kind === "text" && <><label>Texto<textarea value={selected.text} maxLength={400} rows={3} onChange={event => updateLayer(selected.id, { text: event.target.value })} /></label><label>Fuente<select value={selected.font ?? "Arial"} onChange={event => updateLayer(selected.id, { font: event.target.value as "Arial" | "Georgia" | "Impact" })}><option>Arial</option><option>Georgia</option><option>Impact</option></select></label><button aria-pressed={selected.bold !== false} onClick={() => updateLayer(selected.id, { bold: selected.bold === false })}>Negrita</button><label>Color del texto<input type="color" value={selected.color} onChange={event => updateLayer(selected.id, { color: event.target.value })} /></label></>}<label>Tamaño <b>{Math.round((selected.kind === "image" ? selected.width : selected.size) * 100)}%</b><input aria-label="Tamaño del elemento" type="range" min={selected.kind === "image" ? "3" : "2"} max={selected.kind === "image" ? "150" : "30"} value={(selected.kind === "image" ? selected.width : selected.size) * 100} onChange={event => updateLayer(selected.id, selected.kind === "image" ? { width: Number(event.target.value) / 100 } : { size: Number(event.target.value) / 100 })} /></label><label>Giro <b>{selected.rotation}°</b><input aria-label="Giro del elemento" type="range" min="-180" max="180" value={selected.rotation} onChange={event => updateLayer(selected.id, { rotation: Number(event.target.value) })} /></label><div className="poster-element-actions"><button disabled={poster.layers.length >= 100} onClick={() => { const id = createId(); setPoster(current => ({ ...current, layers: [...current.layers, { ...selected, id, x: Math.min(1, selected.x + .03), y: Math.min(1, selected.y + .03) }] })); setSelectedId(id); }}>Duplicar</button><button onClick={() => updateLayer(selected.id, { x: .5, y: .5 })}>Centrar</button><button disabled={poster.layers[0]?.id === selected.id} onClick={() => { const index = poster.layers.findIndex(item => item.id === selected.id), next = [...poster.layers]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setPoster(current => ({ ...current, layers: next })); }}>Enviar atrás</button><button disabled={poster.layers.at(-1)?.id === selected.id} onClick={() => { const index = poster.layers.findIndex(item => item.id === selected.id), next = [...poster.layers]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setPoster(current => ({ ...current, layers: next })); }}>Traer adelante</button><button onClick={() => { setPoster(current => ({ ...current, layers: current.layers.filter(item => item.id !== selected.id) })); setSelectedId(undefined); }}>Eliminar</button></div></>}
    {selected && <><label>Posición horizontal <b>{Math.round(selected.x * 100)}%</b><input aria-label="Posición horizontal" type="range" min="0" max="100" value={selected.x * 100} onChange={event => updateLayer(selected.id, { x: Number(event.target.value) / 100 })} /></label><label>Posición vertical <b>{Math.round(selected.y * 100)}%</b><input aria-label="Posición vertical" type="range" min="0" max="100" value={selected.y * 100} onChange={event => updateLayer(selected.id, { y: Number(event.target.value) / 100 })} /></label></>}
    <hr /><h2>Guardar y compartir</h2><p className="poster-help">La plantilla editable se guarda en este navegador; un nuevo guardado reemplaza la copia anterior. Descarga el PNG para compartirlo como imagen publicitaria.</p></fieldset></div></div>;
}
