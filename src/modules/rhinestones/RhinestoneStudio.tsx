import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent } from "react";
import { importImageFile, loadImage } from "../graphic-editor/render";
import { sheetPdf } from "../dtf/pdf";
import { pngWithDpi } from "../graphic-editor/png";
import { autoPositions, blankStoneProject, collisionIds, createStone, diameter, pathPositions, STONE_SIZES, templateSvg } from "./model";
import type { Stone, StoneProject, StoneSize } from "./model";
import { loadStoneProject, saveStoneProject } from "./storage";
import "./rhinestones.css";

type Tool = "select" | "brush" | "line" | "rectangle" | "ellipse";
let memory: StoneProject = blankStoneProject();
const validColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
const colors = [["Cristal", "#b7ecff"], ["Blanco", "#ffffff"], ["Negro", "#171717"], ["Rojo", "#e32636"], ["Rosa", "#ff70b8"], ["Morado", "#a855f7"], ["Azul", "#2563eb"], ["Verde", "#22c55e"], ["Dorado", "#dca92e"], ["Plateado", "#aeb9c6"]] as const;
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
function Dimension({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(+value.toFixed(2))), [value]);
  return <label>{label}<input type="number" min="1" max="100" step="0.1" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={() => { const parsed = Number(draft); if (draft.trim() && Number.isFinite(parsed) && parsed >= 1 && parsed <= 100) onCommit(parsed); else setDraft(String(+value.toFixed(2))); }} /></label>;
}
function pointsFor(tool: Tool, points: { x: number; y: number }[]) {
  const a = points[0], b = points.at(-1)!;
  if (tool === "brush") return points;
  if (tool === "line") return [a, b];
  if (tool === "rectangle") return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a];
  if (tool === "ellipse") { const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, rx = Math.abs(a.x - b.x) / 2, ry = Math.abs(a.y - b.y) / 2; return Array.from({ length: 129 }, (_, i) => ({ x: cx + rx * Math.cos(i * Math.PI / 64), y: cy + ry * Math.sin(i * Math.PI / 64) })); }
  return [];
}

export function RhinestoneStudio({ hasEditorDesign, onUseEditor }: { hasEditorDesign: boolean; onUseEditor: () => Promise<{ source: string; name: string }> }) {
  const [project, setProject] = useState<StoneProject>(() => memory);
  const [size, setSize] = useState<StoneSize>("SS10"), [color, setColor] = useState("#b7ecff"), [gap, setGap] = useState(.1), [threshold, setThreshold] = useState(220);
  const [pngBackground, setPngBackground] = useState<"white" | "transparent">("white");
  const [tool, setTool] = useState<Tool>("select"), [selection, setSelection] = useState<string[]>([]), [view, setView] = useState<"light" | "dark" | "shirt">("dark"), [shirtColor, setShirtColor] = useState("#30343b");
  const [status, setStatus] = useState("Carga una imagen o comienza a colocar piedras."), [error, setError] = useState(""), [busy, setBusy] = useState(false), [preview, setPreview] = useState<{ x: number; y: number }[]>([]);
  const svg = useRef<SVGSVGElement>(null), gesture = useRef<{ tool: Tool; points: { x: number; y: number }[]; original: Stone[]; moving?: string[] } | null>(null);
  const selected = useMemo(() => new Set(selection), [selection]), collisions = useMemo(() => collisionIds(project.stones, gap), [project.stones, gap]);
  useEffect(() => { memory = project; }, [project]);
  function changeColor(value: string) {
    if (!validColor(value)) return;
    setColor(value);
    if (selection.length) {
      setProject(current => ({ ...current, stones: current.stones.map(stone => selected.has(stone.id) ? { ...stone, color: value } : stone) }));
      setStatus("Color aplicado a las piedras seleccionadas.");
    } else setStatus("Color elegido para las piedras nuevas. Selecciona piedras para recolorearlas o pulsa Aplicar color a todas.");
  }
  function location(event: { clientX: number; clientY: number }) { const box = svg.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(project.width, (event.clientX - box.left) / box.width * project.width)), y: Math.max(0, Math.min(project.height, (event.clientY - box.top) / box.height * project.height)) }; }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || view === "shirt" || busy) return;
    const target = event.target as SVGElement, id = target.dataset.stone, point = location(event);
    if (tool === "select") {
      if (!id) { if (!event.shiftKey) setSelection([]); return; }
      const next = event.shiftKey ? selected.has(id) ? selection.filter(item => item !== id) : [...selection, id] : selected.has(id) ? selection : [id];
      setSelection(next); if (!next.includes(id)) return;
      gesture.current = { tool, points: [point], original: project.stones, moving: next };
    } else gesture.current = { tool, points: [point], original: project.stones };
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const g = gesture.current; if (!g) return; const p = location(event);
    if (g.tool === "select") {
      const originals = g.original.filter(stone => g.moving?.includes(stone.id)); if (!originals.length) return;
      const dx = Math.max(...originals.map(stone => diameter(stone.size) / 2 - stone.x), Math.min(p.x - g.points[0].x, ...originals.map(stone => project.width - diameter(stone.size) / 2 - stone.x)));
      const dy = Math.max(...originals.map(stone => diameter(stone.size) / 2 - stone.y), Math.min(p.y - g.points[0].y, ...originals.map(stone => project.height - diameter(stone.size) / 2 - stone.y)));
      setProject(current => ({ ...current, stones: g.original.map(stone => g.moving?.includes(stone.id) ? { ...stone, x: stone.x + dx, y: stone.y + dy } : stone) }));
    } else { if (g.tool === "brush") { if (Math.hypot(p.x - g.points.at(-1)!.x, p.y - g.points.at(-1)!.y) > .03) g.points.push(p); } else g.points = [g.points[0], p]; setPreview([...g.points]); }
  }
  function finish(event: PointerEvent<SVGSVGElement>, cancelled = false) {
    const g = gesture.current; if (!g) return;
    if (cancelled) setProject(current => ({ ...current, stones: g.original }));
    else if (g.tool !== "select") {
      const final = location(event); if (g.tool === "brush") g.points.push(final); else g.points = [g.points[0], final];
      try {
        const raw = pointsFor(g.tool, g.points), interval = diameter(size) + gap;
        let positions = pathPositions(raw, interval);
        if ((g.tool === "rectangle" || g.tool === "ellipse") && positions.length > 1 && Math.hypot(positions[0].x - positions.at(-1)!.x, positions[0].y - positions.at(-1)!.y) < interval - 1e-6) positions = positions.slice(0, -1);
        const radius = diameter(size) / 2;
        const stones = positions.filter(p => p.x >= radius && p.y >= radius && p.x <= project.width - radius && p.y <= project.height - radius).map(p => createStone(p.x, p.y, size, color));
        if (g.original.length + stones.length > 6000) throw new Error("El diseño supera el límite de 6000 piedras. Aumenta la separación.");
        setProject(current => ({ ...current, stones: [...g.original, ...stones] })); setStatus("Piedras añadidas al diseño.");
      } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo dibujar."); }
    }
    gesture.current = null; setPreview([]);
  }
  async function importSource(get: () => Promise<{ source: string; name: string }>) {
    setBusy(true); setError("");
    try {
      const image = await get();
      setProject(current => ({ ...current, source: image.source, name: image.name.replace(/\.[^.]+$/, "") || "Mi diseño" }));
      if (project.stones.length) { setStatus("Imagen cargada. Se conservaron tus piedras; pulsa Crear diseño automáticamente para añadir una propuesta."); return; }
      setStatus("Analizando imagen y creando diseño automáticamente…");
      try {
        const stones = await generate(image.source, "outline");
        setProject(current => ({ ...current, stones: [...current.stones, ...stones] }));
        setStatus("Diseño creado automáticamente siguiendo los contornos. Puedes ajustar o volver a generar la distribución.");
      } catch (failure) { setStatus("Imagen cargada. Puedes ajustar el umbral y crear el diseño automáticamente."); setError(failure instanceof Error ? failure.message : "No se pudo crear el diseño automáticamente."); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo cargar la imagen."); } finally { setBusy(false); }
  }
  function upload(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importSource(async () => ({ ...await importImageFile(file), name: file.name })); }
  async function generate(source: string, mode: "outline" | "grid" | "staggered") {
    const image = await loadImage(source), canvas = document.createElement("canvas"), scaleForAnalysis = 1200 / Math.max(project.width, project.height);
    canvas.width = Math.max(1, Math.round(project.width * scaleForAnalysis)); canvas.height = Math.max(1, Math.round(project.height * scaleForAnalysis));
    const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) throw new Error("No se pudo analizar la imagen.");
    const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight), w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    const positions = autoPositions(ctx.getImageData(0, 0, canvas.width, canvas.height), project.width, project.height, diameter(size) + gap, mode, threshold);
    if (!positions.length) throw new Error("No se encontraron áreas oscuras. Ajusta el umbral o carga otra imagen.");
    if (positions.length + project.stones.length > 6000) throw new Error("El diseño supera el límite de 6000 piedras. Aumenta la separación.");
    return positions.map(p => createStone(p.x, p.y, size, color));
  }
  async function distribute(mode: "outline" | "grid" | "staggered") {
    if (!project.source || busy) return; setBusy(true); setError("");
    try {
      const stones = await generate(project.source, mode);
      setProject(current => ({ ...current, stones: [...current.stones, ...stones] })); setStatus("Distribución añadida. Puedes seleccionar y editar las piedras.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo distribuir."); } finally { setBusy(false); }
  }
  async function save() { setBusy(true); setError(""); try { await saveStoneProject(project); setStatus("Proyecto editable guardado en este navegador; el siguiente guardado lo reemplazará."); } catch { setError("No se pudo guardar el proyecto."); } finally { setBusy(false); } }
  async function open() { setBusy(true); setError(""); try { const saved = await loadStoneProject(); if (!saved) setStatus("Todavía no hay un proyecto guardado en este navegador."); else { setProject(saved); setSelection([]); setStatus("Proyecto guardado recuperado."); } } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo abrir el proyecto."); } finally { setBusy(false); } }
  async function exportTemplate(format: "svg" | "pdf" | "png") {
    if (!project.stones.length) return; setBusy(true); setError("");
    try {
      const name = project.name.replace(/[<>:"/\\|?*]/g, "_") || "piedreria";
      if (format === "svg") download(new Blob([templateSvg(project)], { type: "image/svg+xml" }), `${name}-plantilla.svg`);
      else {
        const dpi = 150, width = Math.round(project.width / 2.54 * dpi), height = Math.round(project.height / 2.54 * dpi);
        if (width * height > 24_000_000) throw new Error(`La plantilla es demasiado grande para ${format.toUpperCase()}. Reduce las medidas o descarga SVG.`);
        const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("No se pudo crear la plantilla.");
        if (format === "pdf" || (format === "png" && pngBackground === "white")) { ctx.fillStyle = "white"; ctx.fillRect(0, 0, width, height); }
        ctx.fillStyle = "black";
        for (const stone of project.stones) { ctx.fillStyle = format === "png" && validColor(stone.color) ? stone.color : "black"; ctx.beginPath(); ctx.arc(stone.x / 2.54 * dpi, stone.y / 2.54 * dpi, diameter(stone.size) / 2 / 2.54 * dpi, 0, Math.PI * 2); ctx.fill(); }
        if (format === "png") {
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("No se pudo generar el PNG.")), "image/png"));
          download(new Blob([pngWithDpi(new Uint8Array(await blob.arrayBuffer()), dpi) as BlobPart], { type: "image/png" }), `${name}-plantilla.png`);
        } else download(await sheetPdf(ctx.getImageData(0, 0, width, height), project.width, project.height), `${name}-plantilla.pdf`);
      }
      setStatus(format === "png" ? `PNG preparado con fondo ${pngBackground === "white" ? "blanco" : "transparente"} a 150 DPI.` : `Plantilla ${format.toUpperCase()} descargada a escala. Imprime a tamaño real o 100 %.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo exportar la plantilla."); } finally { setBusy(false); }
  }
  const outside = project.stones.some(stone => { const r = diameter(stone.size) / 2; return stone.x - r < 0 || stone.y - r < 0 || stone.x + r > project.width || stone.y + r > project.height; });
  const previewPath = preview.length > 1 ? pointsFor(tool, preview).map(p => `${p.x},${p.y}`).join(" ") : "";
  return <div className="rh-studio"><div className="rh-header"><div><p className="eyebrow">DISEÑO TEXTIL</p><h1>Estudio de piedrería</h1><p>Diseña y prepara tu plantilla a escala.</p></div><div className="rh-actions"><label className="rh-upload">Cargar imagen<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={upload} /></label><button disabled={!hasEditorDesign || busy} onClick={() => void importSource(onUseEditor)}>Usar diseño del editor</button><button disabled={busy} onClick={() => void open()}>Abrir proyecto guardado</button><button disabled={busy} onClick={() => void save()}>Guardar proyecto</button><button className="accent" disabled={!project.stones.length || busy || outside} onClick={() => void exportTemplate("svg")}>Plantilla SVG</button><button className="accent" disabled={!project.stones.length || busy || outside} onClick={() => void exportTemplate("pdf")}>Plantilla PDF</button><button className="accent" disabled={!project.stones.length || busy || outside} onClick={() => void exportTemplate("png")}>Descargar PNG</button></div></div>
    <div className="rh-layout"><div className="rh-panel"><h2>Área de trabajo</h2><label>Nombre<input value={project.name} onChange={event => setProject(current => ({ ...current, name: event.target.value }))} /></label><div className="rh-grid"><Dimension label="Ancho (cm)" value={project.width} onCommit={width => setProject(current => ({ ...current, width }))} /><Dimension label="Alto (cm)" value={project.height} onCommit={height => setProject(current => ({ ...current, height }))} /></div><label>Tamaño de piedra<select value={size} onChange={event => setSize(event.target.value as StoneSize)}>{Object.entries(STONE_SIZES).map(([key, mm]) => <option key={key} value={key}>{key} · {mm} mm aprox.</option>)}</select></label>
      <label>Color de piedra<input type="color" value={color} disabled={busy} onInput={event => changeColor(event.currentTarget.value)} onChange={event => changeColor(event.target.value)} /></label>
      <div className="rh-colors" role="group" aria-label="Colores de piedra">{colors.map(([name, value]) => <button key={value} type="button" aria-label={`Color ${name}`} aria-pressed={color.toLowerCase() === value} title={name} disabled={busy} style={{ backgroundColor: value }} onClick={() => changeColor(value)} />)}</div>
      <p className="rh-help">El color se aplica al instante a la selección y a las piedras nuevas. Para cambiar el diseño completo, pulsa Aplicar color a todas.</p>
      <button disabled={!project.stones.length || busy} onClick={() => { setProject(current => ({ ...current, stones: current.stones.map(stone => ({ ...stone, color })) })); setStatus("Color aplicado a todas las piedras. Se conservaron sus tamaños y posiciones."); }}>Aplicar color a todas</button>
      <label>Fondo del PNG<select value={pngBackground} onChange={event => setPngBackground(event.target.value as "white" | "transparent")}><option value="white">Blanco</option><option value="transparent">Transparente</option></select></label>
      <label>Separación (mm)<input type="number" min="0" max="10" step="0.1" value={+(gap * 10).toFixed(1)} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) setGap(Math.min(1, Math.max(0, value / 10))); }} /></label><h2>Herramientas</h2><div className="rh-tools">{([ ["select", "Seleccionar"], ["brush", "Pincel"], ["line", "Línea"], ["rectangle", "Rectángulo"], ["ellipse", "Elipse"] ] as const).map(([value, label]) => <button key={value} aria-pressed={tool === value} onClick={() => setTool(value)}>{label}</button>)}</div><p className="rh-help">Selecciona piedras y arrástralas. Mantén Mayús para seleccionar varias. Con el pincel, arrastra para seguir una curva.</p><button disabled={!selection.length} onClick={() => { setProject(current => ({ ...current, stones: current.stones.map(stone => selected.has(stone.id) ? { ...stone, size, color } : stone) })); setStatus("Tamaño y color aplicados a la selección."); }}>Aplicar tamaño y color</button><button disabled={!selection.length} onClick={() => { setProject(current => ({ ...current, stones: current.stones.filter(stone => !selected.has(stone.id)) })); setSelection([]); }}>Eliminar selección</button><button disabled={!project.stones.length} onClick={() => setSelection(project.stones.map(stone => stone.id))}>Seleccionar todas</button></div>
    <div className="rh-center"><div className="rh-view"><button aria-pressed={view === "light"} onClick={() => setView("light")}>Fondo claro</button><button aria-pressed={view === "dark"} onClick={() => setView("dark")}>Fondo oscuro</button><button aria-pressed={view === "shirt"} onClick={() => setView("shirt")}>Vista en camiseta</button>{view === "shirt" && <label>Color de camiseta <input type="color" value={shirtColor} onChange={event => setShirtColor(event.target.value)} /></label>}</div><div className={`rh-stage rh-${view}`}>{view === "shirt" ? <svg className="rh-shirt" viewBox="0 0 400 480" aria-label="Vista previa en camiseta"><path d="M135 40 L100 50 L38 90 L10 155 L80 185 L96 150 L96 445 L304 445 L304 150 L320 185 L390 155 L362 90 L300 50 L265 40 Q250 75 200 75 Q150 75 135 40Z" fill={shirtColor} stroke="#8090a0" strokeWidth="2" /><svg x="125" y="115" width="150" height="190" viewBox={`0 0 ${project.width} ${project.height}`} preserveAspectRatio="xMidYMid meet">{project.stones.map(stone => <circle key={stone.id} cx={stone.x} cy={stone.y} r={diameter(stone.size) / 2} fill={stone.color} stroke="#ffffff" strokeWidth=".025" />)}</svg></svg> : <svg ref={svg} className={`rh-board ${tool !== "select" ? "drawing" : ""}`} aria-label="Lienzo de piedrería" viewBox={`0 0 ${project.width} ${project.height}`} style={{ aspectRatio: `${project.width} / ${project.height}` }} onPointerDown={start} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}>
      {project.source && <image href={project.source} x="0" y="0" width={project.width} height={project.height} preserveAspectRatio="xMidYMid meet" opacity=".4" pointerEvents="none" />}{project.stones.map(stone => <circle key={stone.id} data-stone={stone.id} cx={stone.x} cy={stone.y} r={diameter(stone.size) / 2} fill={validColor(stone.color) ? stone.color : "#ffffff"} stroke={selected.has(stone.id) ? "#b7ec55" : collisions.has(stone.id) ? "#ff506c" : "#eeeeee"} strokeWidth={selected.has(stone.id) || collisions.has(stone.id) ? .07 : .025} />)}{previewPath && <polyline points={previewPath} fill="none" stroke="#b7ec55" strokeWidth=".06" pointerEvents="none" />}</svg>}</div><p role="status" className="rh-status">{outside ? "Hay piedras fuera del área de trabajo. " : ""}{collisions.size ? "Hay piedras superpuestas o demasiado próximas (bordes rojos). " : ""}{status}</p>{error && <p role="alert" className="rh-error">{error}</p>}</div>
    <div className="rh-panel"><h2>Distribución automática</h2><p className="rh-help">Al cargar una imagen en una hoja vacía se crea un diseño automáticamente. Se detectan las zonas oscuras y se aproxima su contorno con piedras.</p><button className="accent" disabled={!project.source || busy} onClick={() => void distribute("outline")}>✦ Crear diseño automáticamente</button><label>Umbral de oscuridad <b>{threshold}</b><input type="range" min="1" max="255" value={threshold} onChange={event => setThreshold(Number(event.target.value))} /></label><button disabled={!project.source || busy} onClick={() => void distribute("grid")}>Rellenar en cuadrícula</button><button disabled={!project.source || busy} onClick={() => void distribute("staggered")}>Rellenar filas alternadas</button><p className="rh-help">Los botones añaden piedras al diseño actual. Para reemplazar una propuesta, selecciona todas las piedras y elimínalas antes de generar otra.</p><hr /><h2>Imagen de referencia</h2><p className="rh-help">La imagen se muestra como guía y no aparece en la plantilla.</p><button disabled={!project.source} onClick={() => setProject(current => ({ ...current, source: "" }))}>Quitar imagen</button><hr /><h2>Plantilla y guardado</h2><p className="rh-help">Las plantillas muestran círculos a escala real. El PDF se genera a 150 DPI; imprime al 100 %. Guarda una copia editable en este navegador y recupérala con Abrir proyecto guardado.</p><p className="rh-help">Los diámetros SS son aproximados; comprueba las medidas de tu proveedor antes de cortar.</p></div></div></div>;
}
