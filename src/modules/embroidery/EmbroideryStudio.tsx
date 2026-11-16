import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent, SetStateAction } from "react";
import { createId } from "../../core/id";
import { importImageFile, loadImage } from "../graphic-editor/render";
import { pngWithDpi } from "../graphic-editor/png";
import { defaultTraceOptions } from "../vectorization/vector";
import type { VectorResult } from "../vectorization/vector";
import { blankEmbroidery, embroiderySvg, fillDarkAreas, sampleStitches, visibleStitches } from "./model";
import type { EmbroideryProject, Point, StitchPath } from "./model";
import { loadEmbroidery, saveEmbroidery } from "./storage";
import "./embroidery.css";

type Tool = "select" | "draw" | "line";
let session = blankEmbroidery();
const count = (paths: StitchPath[]) => paths.reduce((sum, path) => sum + path.points.length, 0);
function Dimension({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value)); useEffect(() => setDraft(String(+value.toFixed(2))), [value]);
  return <label>{label}<input type="number" min="1" max="50" step="0.1" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={() => { const n = Number(draft); if (draft.trim() && Number.isFinite(n) && n >= 1 && n <= 50) onCommit(n); else setDraft(String(+value.toFixed(2))); }} /></label>;
}
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }

export function EmbroideryStudio({ hasEditorDesign, onUseEditor }: { hasEditorDesign: boolean; onUseEditor: () => Promise<{ source: string; name: string }> }) {
  const [history, setHistory] = useState<{ present: EmbroideryProject; past: EmbroideryProject[]; future: EmbroideryProject[] }>(() => ({ present: session, past: [], future: [] }));
  const project = history.present;
  function setProject(action: SetStateAction<EmbroideryProject>) { setHistory(state => { const next = typeof action === "function" ? action(state.present) : action; return next === state.present ? state : { present: next, past: [...state.past.slice(-19), state.present], future: [] }; }); }
  function undo(redo = false) { setHistory(state => { const next = redo ? state.future[0] : state.past.at(-1); if (!next) return state; return redo ? { present: next, past: [...state.past.slice(-19), state.present], future: state.future.slice(1) } : { present: next, past: state.past.slice(0, -1), future: [state.present, ...state.future] }; }); setSelected(undefined); setPlaying(false); setSimulating(false); }
  const [color, setColor] = useState("#ef476f"), [length, setLength] = useState(2.5), [tool, setTool] = useState<Tool>("draw");
  const [threshold, setThreshold] = useState(180), [rowSpacing, setRowSpacing] = useState(1);
  const [simulating, setSimulating] = useState(false), [playing, setPlaying] = useState(false), [progress, setProgress] = useState(100);
  const [selected, setSelected] = useState<string>(), [view, setView] = useState<"light" | "dark" | "shirt">("light"), [shirtColor, setShirtColor] = useState("#30343b");
  const [preview, setPreview] = useState<Point[]>([]), [status, setStatus] = useState("Carga un diseño o dibuja trazos de puntada."), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const svg = useRef<SVGSVGElement>(null), gesture = useRef<Point[] | null>(null), worker = useRef<Worker | null>(null), version = useRef(0), mounted = useRef(true);
  useEffect(() => { session = project; }, [project]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; version.current++; worker.current?.terminate(); }; }, []);
  useEffect(() => { if (!playing) return; const timer = window.setInterval(() => setProgress(value => Math.min(100, value + 1)), 60); return () => clearInterval(timer); }, [playing]);
  useEffect(() => { if (playing && progress >= 100) setPlaying(false); }, [playing, progress]);
  function locate(event: { clientX: number; clientY: number }) { const box = svg.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(project.width, (event.clientX - box.left) / box.width * project.width)), y: Math.max(0, Math.min(project.height, (event.clientY - box.top) / box.height * project.height)) }; }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (busy || simulating || event.button !== 0) return;
    const path = (event.target as SVGElement).dataset.path;
    if (tool === "select") { setSelected(path); return; }
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); gesture.current = [locate(event)]; setPreview(gesture.current);
  }
  function move(event: PointerEvent<SVGSVGElement>) { if (!gesture.current) return; const point = locate(event); if (tool === "line") gesture.current = [gesture.current[0], point]; else if (Math.hypot(point.x - gesture.current.at(-1)!.x, point.y - gesture.current.at(-1)!.y) > .04) gesture.current.push(point); setPreview([...gesture.current]); }
  function finish(event: PointerEvent<SVGSVGElement>, cancel = false) {
    if (!gesture.current) return;
    const points = gesture.current; if (!cancel) points.push(locate(event)); gesture.current = null; setPreview([]); if (cancel) return;
    try {
      const sampled = sampleStitches(points, length / 10); if (sampled.length < 2) { setStatus("Arrastra para dibujar un trazo."); return; }
      if (count(project.paths) + sampled.length > 20000) throw new Error("El diseño supera el límite de 20.000 puntadas. Simplifica el diseño o aumenta la longitud.");
      const path = { id: createId(), color, points: sampled }; setProject(current => ({ ...current, paths: [...current.paths, path] })); setSelected(path.id); setStatus("Trazo añadido. Selecciona un trazo para cambiar el hilo o eliminarlo.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo crear el trazo."); }
  }
  async function source(get: () => Promise<{ source: string; name: string }>) { setBusy(true); setError(""); try { const image = await get(); if (!mounted.current) return; setProject(current => ({ ...current, source: image.source, name: image.name.replace(/\.[^.]+$/, "") || "Mi bordado" })); setStatus("Imagen de referencia cargada. Dibuja sobre ella o genera contornos."); } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "No se pudo cargar la imagen."); } finally { if (mounted.current) setBusy(false); } }
  function upload(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (file) void source(async () => ({ ...await importImageFile(file), name: file.name })); }
  function trace() {
    if (!project.source || busy) return; setBusy(true); setError(""); setStatus("Detectando contornos de la imagen…"); const id = ++version.current, snapshot = project;
    try {
      const task = new Worker(new URL("../vectorization/trace.worker.ts", import.meta.url), { type: "module" }); worker.current = task;
      task.onmessage = event => {
        if (!mounted.current || id !== version.current) return;
        if (event.data.type === "progress") { setStatus(`${event.data.stage} · ${event.data.progress}%`); return; }
        if (event.data.type === "done") {
          try {
            const vector = event.data.result as VectorResult, scale = Math.min(snapshot.width / vector.width, snapshot.height / vector.height), offsetX = (snapshot.width - vector.width * scale) / 2, offsetY = (snapshot.height - vector.height * scale) / 2;
            const paths: StitchPath[] = [];
            for (const shape of vector.paths) for (const ring of shape.contours) {
              const points = ring.map(p => ({ x: offsetX + p.x * scale, y: offsetY + p.y * scale })); if (points.length) points.push(points[0]);
              const sampled = sampleStitches(points, length / 10); if (sampled.length >= 2) paths.push({ id: createId(), color, points: sampled });
              if (count(paths) + count(snapshot.paths) > 20000) throw new Error("Demasiadas puntadas. Usa una imagen más sencilla o aumenta la longitud de puntada.");
            }
            if (!paths.length) throw new Error("No se encontraron contornos. Prueba otra imagen.");
            setProject(current => ({ ...current, paths: [...current.paths, ...paths] })); setSelected(paths[0].id); setStatus("Contornos añadidos como trazos de puntada. Revisa el resultado antes de usarlo.");
          } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudieron crear los contornos."); }
        } else setError(event.data.message || "No se pudo analizar la imagen.");
        task.terminate(); worker.current = null; setBusy(false);
      };
      task.onerror = event => { event.preventDefault(); if (mounted.current && id === version.current) { task.terminate(); worker.current = null; setBusy(false); setError("No se pudieron generar los contornos. Prueba una imagen más sencilla."); } };
      task.postMessage({ source: snapshot.source, options: { ...defaultTraceOptions, mode: "mono", threshold, resolution: 768, simplification: 1, minArea: 8 } });
    } catch (failure) { setBusy(false); setError(failure instanceof Error ? failure.message : "No se pudo iniciar el análisis."); }
  }
  async function fill() {
    if (!project.source || busy) return; setBusy(true); setError(""); setStatus("Preparando relleno visual…");
    try {
      const image = await loadImage(project.source), canvas = document.createElement("canvas"), scale = 800 / Math.max(project.width, project.height);
      canvas.width = Math.max(1, Math.round(project.width * scale)); canvas.height = Math.max(1, Math.round(project.height * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) throw new Error("No se pudo analizar la imagen.");
      const fit = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight), w = image.naturalWidth * fit, h = image.naturalHeight * fit;
      ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      const segments = fillDarkAreas(ctx.getImageData(0, 0, canvas.width, canvas.height), project.width, project.height, rowSpacing / 10, length / 10, threshold);
      if (!segments.length) throw new Error("No se encontraron zonas oscuras. Ajusta el umbral o usa otra imagen.");
      const paths = segments.map(points => ({ id: createId(), color, points }));
      if (count(paths) + count(project.paths) > 20000) throw new Error("El diseño supera el límite de puntadas. Aumenta la separación o elimina otros trazos.");
      setProject(current => ({ ...current, paths: [...current.paths, ...paths] })); setSelected(paths[0].id); setStatus("Relleno visual añadido en filas. Revisa el diseño antes de usarlo.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo crear el relleno."); } finally { setBusy(false); }
  }
  async function save() { setBusy(true); setError(""); try { await saveEmbroidery(project); setStatus("Proyecto editable guardado en este navegador. El siguiente guardado reemplazará esta copia."); } catch { setError("No se pudo guardar el proyecto."); } finally { setBusy(false); } }
  async function open() { setBusy(true); setError(""); try { const saved = await loadEmbroidery(); if (saved) { setProject(saved); setSelected(undefined); setStatus("Proyecto guardado recuperado."); } else setStatus("Todavía no hay un bordado guardado en este navegador."); } catch { setError("No se pudo abrir el proyecto."); } finally { setBusy(false); } }
  async function exportFile(format: "svg" | "png") {
    if (!project.paths.length || busy) return; setBusy(true); setError("");
    try {
      const name = project.name.replace(/[<>:"/\\|?*]/g, "_") || "bordado";
      if (format === "svg") download(new Blob([embroiderySvg(project)], { type: "image/svg+xml" }), `${name}-vista.svg`);
      else {
        const dpi = 300, w = Math.round(project.width / 2.54 * dpi), h = Math.round(project.height / 2.54 * dpi);
        if (w * h > 24_000_000) throw new Error("La vista PNG es demasiado grande. Reduce las medidas o descarga el SVG.");
        const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h; const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("No se pudo crear la imagen.");
        const scale = dpi / 2.54; ctx.lineWidth = .04 * scale; ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (const path of project.paths) { ctx.strokeStyle = path.color; ctx.beginPath(); path.points.forEach((p, i) => { if (!i) ctx.moveTo(p.x * scale, p.y * scale); else ctx.lineTo(p.x * scale, p.y * scale); }); ctx.stroke(); }
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("No se pudo crear el PNG.")), "image/png"));
        download(new Blob([pngWithDpi(new Uint8Array(await blob.arrayBuffer()), dpi) as BlobPart], { type: "image/png" }), `${name}-vista.png`);
      }
      setStatus(`Vista ${format.toUpperCase()} descargada. Es una imagen de referencia, no un archivo de máquina.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo exportar."); } finally { setBusy(false); }
  }
  const selectedPath = project.paths.find(path => path.id === selected);
  const displayedPaths = simulating ? visibleStitches(project.paths, Math.ceil(count(project.paths) * progress / 100)) : project.paths;
  function reorder(direction: -1 | 1) {
    const index = project.paths.findIndex(path => path.id === selected), target = index + direction;
    if (index < 0 || target < 0 || target >= project.paths.length) return;
    const paths = [...project.paths]; [paths[index], paths[target]] = [paths[target], paths[index]]; setProject(current => ({ ...current, paths })); setStatus("Orden de trazos actualizado.");
  }
  const pathElements = (thin = false) => displayedPaths.map(path => <polyline key={path.id} data-path={path.id} points={path.points.map(point => `${point.x},${point.y}`).join(" ")} fill="none" stroke={path.color} strokeWidth={thin ? .04 : .05} strokeLinecap="round" strokeLinejoin="round" className={path.id === selected && tool === "select" ? "emb-selected" : ""} />);
  return <div className="emb-studio"><div className="emb-heading"><div><p className="eyebrow">DISEÑO TEXTIL</p><h1>Estudio de bordado</h1><p>Diseña y previsualiza trazos de puntada.</p></div><div className="emb-actions"><label className="emb-upload">Cargar imagen<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={upload} /></label><button disabled={!hasEditorDesign || busy} onClick={() => void source(onUseEditor)}>Usar diseño del editor</button><button disabled={busy || !history.past.length} onClick={() => undo()}>Deshacer</button><button disabled={busy || !history.future.length} onClick={() => undo(true)}>Rehacer</button><button disabled={busy} onClick={() => void open()}>Abrir proyecto guardado</button><button disabled={busy} onClick={() => void save()}>Guardar proyecto</button><button className="accent" disabled={!project.paths.length || busy} onClick={() => void exportFile("svg")}>Descargar SVG</button><button disabled={!project.paths.length || busy} onClick={() => void exportFile("png")}>Descargar PNG</button></div></div>
    <div className="emb-layout"><div className="emb-panel"><h2>Área de bordado</h2><label>Nombre<input value={project.name} onChange={event => setProject(current => ({ ...current, name: event.target.value }))} /></label><div className="emb-grid"><Dimension label="Ancho (cm)" value={project.width} onCommit={width => setProject(current => ({ ...current, width }))} /><Dimension label="Alto (cm)" value={project.height} onCommit={height => setProject(current => ({ ...current, height }))} /></div><label>Color del hilo<input type="color" value={color} onChange={event => setColor(event.target.value)} /></label><label>Longitud de puntada <b>{length} mm</b><input type="range" min="1" max="6" step="0.5" value={length} onChange={event => setLength(Number(event.target.value))} /></label><h2>Herramientas</h2><div className="emb-tools">{([ ["select", "Seleccionar"], ["draw", "Dibujar"], ["line", "Línea"] ] as const).map(([id, label]) => <button key={id} aria-pressed={tool === id} onClick={() => { setTool(id); if (view === "shirt") setView("light"); }}>{label}</button>)}</div><p className="emb-help">Dibuja sobre la imagen para crear puntadas rectas a lo largo del trazo. Cambia el color para usar otro hilo.</p><button disabled={!selectedPath} onClick={() => { setProject(current => ({ ...current, paths: current.paths.map(path => path.id === selected ? { ...path, color } : path) })); }}>Aplicar color al trazo</button><button disabled={!selectedPath} onClick={() => { setProject(current => ({ ...current, paths: current.paths.filter(path => path.id !== selected) })); setSelected(undefined); }}>Eliminar trazo</button></div>
    <div className="emb-center"><div className="emb-view"><button aria-pressed={view === "light"} onClick={() => setView("light")}>Fondo claro</button><button aria-pressed={view === "dark"} onClick={() => setView("dark")}>Fondo oscuro</button><button aria-pressed={view === "shirt"} onClick={() => setView("shirt")}>Vista en camiseta</button>{view === "shirt" && <label>Color de camiseta <input type="color" value={shirtColor} onChange={event => setShirtColor(event.target.value)} /></label>}</div><div className={`emb-stage emb-${view}`}>{view === "shirt" ? <svg className="emb-shirt" viewBox="0 0 400 480" aria-label="Vista previa de bordado en camiseta"><path d="M135 40 L100 50 L38 90 L10 155 L80 185 L96 150 L96 445 L304 445 L304 150 L320 185 L390 155 L362 90 L300 50 L265 40 Q250 75 200 75 Q150 75 135 40Z" fill={shirtColor} stroke="#8090a0" strokeWidth="2" /><svg x="125" y="115" width="150" height="190" viewBox={`0 0 ${project.width} ${project.height}`} preserveAspectRatio="xMidYMid meet">{pathElements(true)}</svg></svg> : <svg ref={svg} className={`emb-board ${tool !== "select" ? "drawing" : ""}`} aria-label="Lienzo de bordado" viewBox={`0 0 ${project.width} ${project.height}`} style={{ aspectRatio: `${project.width} / ${project.height}` }} onPointerDown={start} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}>{project.source && <image href={project.source} width={project.width} height={project.height} preserveAspectRatio="xMidYMid meet" opacity=".35" pointerEvents="none" />}{pathElements()}{tool === "select" && project.paths.map(path => <polyline key={`hit-${path.id}`} data-path={path.id} points={path.points.map(point => `${point.x},${point.y}`).join(" ")} fill="none" stroke="transparent" strokeWidth=".35" pointerEvents="stroke" />)}{preview.length > 1 && <polyline points={preview.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth=".06" pointerEvents="none" />}</svg>}</div><p className="emb-status" role="status">{status}</p>{error && <p className="emb-error" role="alert">{error}</p>}</div>
    <div className="emb-panel"><h2>Digitalización visual</h2><p className="emb-help">Genera trazos a partir de las zonas oscuras. El relleno se representa en filas y los trazos se añaden al diseño actual.</p><label>Umbral de oscuridad <b>{threshold}</b><input type="range" min="1" max="255" value={threshold} onChange={event => setThreshold(Number(event.target.value))} /></label><label>Separación de filas <b>{rowSpacing} mm</b><input type="range" min="0.5" max="5" step="0.5" value={rowSpacing} onChange={event => setRowSpacing(Number(event.target.value))} /></label><button disabled={!project.source || busy} onClick={trace}>Crear contornos automáticamente</button><button disabled={!project.source || busy} onClick={() => void fill()}>Crear relleno automático</button>{worker.current && <button onClick={() => { version.current++; worker.current?.terminate(); worker.current = null; setBusy(false); setStatus("Análisis cancelado."); }}>Cancelar análisis</button>}<button disabled={!project.source || busy} onClick={() => setProject(current => ({ ...current, source: "" }))}>Quitar imagen de referencia</button><hr /><h2>Orden de trazos</h2><div className="emb-path-list">{project.paths.slice(0, 300).map((path, index) => <button key={path.id} aria-pressed={path.id === selected} onClick={() => { setSelected(path.id); setTool("select"); setSimulating(false); setPlaying(false); if (view === "shirt") setView("light"); }}><span style={{ background: path.color }} />Trazo {index + 1}</button>)}</div>{project.paths.length > 300 && <p className="emb-help">Se muestran los primeros 300 trazos en la lista; también puedes seleccionarlos en el lienzo.</p>}{project.paths.length > 0 && <div className="emb-tools"><button disabled={!selectedPath || project.paths[0]?.id === selected} onClick={() => reorder(-1)}>Subir trazo</button><button disabled={!selectedPath || project.paths.at(-1)?.id === selected} onClick={() => reorder(1)}>Bajar trazo</button></div>}<hr /><h2>Simulación visual</h2><p className="emb-help">Muestra el recorrido por orden de trazo; no simula saltos ni tiempos de una máquina.</p><button disabled={!project.paths.length || busy} onClick={() => { setSimulating(true); if (progress >= 100 || !simulating) setProgress(0); setPlaying(true); }}>▶ Reproducir</button><button disabled={!simulating || !playing} onClick={() => setPlaying(false)}>Pausar</button><label>Progreso <b>{progress}%</b><input aria-label="Progreso de simulación" type="range" min="0" max="100" value={progress} disabled={!project.paths.length} onChange={event => { setSimulating(true); setPlaying(false); setProgress(Number(event.target.value)); }} /></label><button disabled={!simulating} onClick={() => { setSimulating(false); setPlaying(false); setProgress(100); }}>Ver diseño completo</button><hr /><h2>Proyecto y descargas</h2><p className="emb-help">El proyecto editable se guarda en este navegador. SVG y PNG son vistas del diseño: no contienen instrucciones de máquina ni sustituyen una digitalización de bordado.</p><p className="emb-help">Antes de producir se necesitan ajustes de densidad, saltos, compensación y formatos compatibles con tu máquina.</p></div></div></div>;
}
