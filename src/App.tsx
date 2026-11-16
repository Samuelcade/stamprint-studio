import { AppIcon } from "./components/AppIcon";
import { APP_VERSION, ReleaseNotes } from "./components/ReleaseNotes";
import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Project } from "./core/types";
import { createId } from "./core/id";
import { deleteProject, loadLatestProject, loadProject, saveProject } from "./modules/storage/projectStore";
import type { ProjectSummary } from "./modules/storage/projectStore";
import { ProjectPicker, ProjectsPage } from "./modules/storage/ProjectsPage";
import { GraphicEditor, CommitProject } from "./modules/graphic-editor/GraphicEditor";
import { blankProject, defaultEffects, historyReducer, HistoryAction, normalizeProject, resizeDocument } from "./modules/graphic-editor/model";
import { ProjectRenderer } from "./modules/graphic-editor/render";
import { loadSettings, saveSettings } from "./modules/settings/settings";
import type { Settings } from "./modules/settings/settings";
import { SettingsPage } from "./modules/settings/SettingsPage";
const Textile3DStudio = lazy(() => import("./modules/textile-3d/Textile3DStudio").then(module => ({ default: module.Textile3DStudio })));

const VectorStudio = lazy(() => import("./modules/vectorization/VectorStudio").then(module => ({ default: module.VectorStudio })));
const GangSheet = lazy(() => import("./modules/dtf/GangSheet").then(module => ({ default: module.GangSheet })));
const ScreenPrinting = lazy(() => import("./modules/screen-printing/ScreenPrinting").then(module => ({ default: module.ScreenPrinting })));
const RhinestoneStudio = lazy(() => import("./modules/rhinestones/RhinestoneStudio").then(module => ({ default: module.RhinestoneStudio })));
const PosterStudio = lazy(() => import("./modules/marketing/PosterStudio").then(module => ({ default: module.PosterStudio })));

const sections = ["Inicio", "Proyectos", "Editor gráfico", "Vectorización", "Semitonos", "Simulador 3D", "DTF", "Serigrafía", "Piedrería", "Plantillas", "Configuración"];
const canvasSections = new Set(["Editor gráfico", "Semitonos"]);
const moduleNotes: Record<string, string> = {
  "Vectorización": "Conversión a SVG, simplificación y edición de nodos.", "Simulador 3D": "Modelos GLB/GLTF, coordenadas UV y materiales textiles.", "Serigrafía": "Separaciones CMYK/tintas planas, tramas y positivos.", "Piedrería": "Distribución de piedras y plantilla a escala.", "Configuración": "Unidades, perfiles de trabajo, rendimiento y accesibilidad."
};
export function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [history, dispatch] = useReducer(historyReducer, settings, initial => ({ present: resizeDocument(blankProject(), initial.editor.widthCm, initial.editor.heightCm, initial.editor.dpi), past: [], future: [] }));
  const stateRef = useRef(history); stateRef.current = history;
  const [renderer] = useState(() => new ProjectRenderer());
  const [section, setSection] = useState<string>(() => settings.startSection);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Documento local listo");
  const [pickingProject, setPickingProject] = useState(false);
  const autoSaveTimer = useRef<number | undefined>(undefined);
  const [preview, setPreview] = useState<{ source?: string; sizeCm?: number }>({});
  const edited = useRef(false), navigation = useRef(0), saveQueue = useRef(Promise.resolve());
  const menu = useRef<HTMLDialogElement>(null);
  const project = history.present;
  const showCanvas = canvasSections.has(section);

  const send = useCallback((action: HistoryAction) => {
    stateRef.current = historyReducer(stateRef.current, action); dispatch(action);
    if (action.type === "load") edited.current = false;
    if (action.type !== "load" && action.type !== "end-group") edited.current = true;
  }, []);
  const commit: CommitProject = useCallback((next, group) => {
    const current = stateRef.current.present;
    const resolved = typeof next === "function" ? next(current) : next;
    if (resolved !== current) send({ type: "commit", project: resolved, group });
  }, [send]);
  const endGroup = useCallback(() => send({ type: "end-group" }), [send]);

  useEffect(() => {
    let cancelled = false;
    loadLatestProject().then(saved => { if (!cancelled && saved) send({ type: "load", project: normalizeProject(saved) }); })
      .catch(() => { if (!cancelled) setNotice("No se pudo recuperar el proyecto local"); })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; navigation.current++; };
  }, [send]);
  useEffect(() => {
    if (!ready || !edited.current || !settings.autoSave) return;
    const timer = window.setTimeout(() => {
      autoSaveTimer.current = undefined;
      const snapshot = { ...project, updatedAt: new Date().toISOString() };
      saveQueue.current = saveQueue.current.catch(() => undefined).then(() => saveProject(snapshot)).then(() => {
        if (stateRef.current.present === project) setNotice("Guardado local automático");
      }).catch(() => setNotice("No se pudo guardar localmente. Exporta tu PNG antes de cerrar."));
    }, 700);
    autoSaveTimer.current = timer;
    return () => { clearTimeout(timer); if (autoSaveTimer.current === timer) autoSaveTimer.current = undefined; };
  }, [project, ready, settings.autoSave]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!showCanvas || pickingProject || busy || event.defaultPrevented) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") { event.preventDefault(); void saveCurrentProject(event.shiftKey); return; }
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (key === "z") { event.preventDefault(); send({ type: event.shiftKey ? "redo" : "undo" }); }
      else if (key === "y") { event.preventDefault(); send({ type: "redo" }); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [send, showCanvas, pickingProject, busy]);

  async function selectSection(next: string) {
    if (menu.current?.open) menu.current.close();
    const version = ++navigation.current; endGroup();
    if (next !== "Simulador 3D") { setSection(next); return; }
    const snapshot = stateRef.current.present;
    setBusy(true); setNotice("Preparando la composición para la camiseta…");
    try {
      const composite = snapshot.layers.some(layer => layer.visible) ? await renderer.render(snapshot, 2048, true) : undefined;
      if (version !== navigation.current) return;
      setPreview({ source: composite?.toDataURL("image/png"), sizeCm: Math.max(snapshot.width, snapshot.height) / snapshot.dpi * 2.54 });
      setSection(next); setNotice("Composición del editor enviada al simulador 3D");
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function exportPng() {
    setBusy(true); endGroup();
    const snapshot = stateRef.current.present;
    try {
      const blob = await renderer.exportPng(snapshot), url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.download = `${snapshot.name.trim() || "diseno"}.png`; link.href = url; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`PNG exportado: ${snapshot.width} × ${snapshot.height} px a ${snapshot.dpi} DPI`);
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function saveCurrentProject(copy = false) {
    setBusy(true); endGroup(); setNotice("Guardando proyecto…");
    const current = stateRef.current.present;
    const snapshot = { ...current, ...(copy ? { id: createId(), name: `${current.name.trim() || "Diseño"} (copia)` } : {}), updatedAt: new Date().toISOString() };
    try {
      saveQueue.current = saveQueue.current.catch(() => undefined).then(() => saveProject(snapshot)); await saveQueue.current;
      if (copy && stateRef.current.present === current) send({ type: "load", project: snapshot });
      setNotice(copy ? "Copia guardada en Proyectos" : "Proyecto guardado en Proyectos");
    }
    catch { setNotice("No se pudo guardar localmente. Exporta tu PNG antes de cerrar."); }
    finally { setBusy(false); }
  }
  async function openSavedProject(entry: ProjectSummary) {
    setBusy(true); endGroup(); navigation.current++;
    clearTimeout(autoSaveTimer.current); autoSaveTimer.current = undefined;
    try {
      // Finish writes for the current document before loading another ID.
      if (settings.autoSave && edited.current) {
        const snapshot = { ...stateRef.current.present, updatedAt: new Date().toISOString() };
        saveQueue.current = saveQueue.current.catch(() => undefined).then(() => saveProject(snapshot));
      }
      await saveQueue.current;
      const saved = await loadProject(entry.id);
      if (!saved) throw new Error("El proyecto seleccionado ya no está disponible.");
      send({ type: "load", project: normalizeProject(saved) });
      setPickingProject(false); setSection(entry.section); setNotice(`Proyecto abierto: ${saved.name}`);
    } finally { setBusy(false); }
  }
  async function deleteSavedProject(entry: ProjectSummary) {
    setBusy(true);
    if (stateRef.current.present.id === entry.id) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = undefined; }
    try {
      await saveQueue.current.catch(() => undefined);
      await deleteProject(entry.id);
      if (stateRef.current.present.id === entry.id) {
        send({ type: "load", project: { ...stateRef.current.present, id: createId() } });
      }
    } finally { setBusy(false); }
  }
  function updateSettings(next: Settings) {
    try { saveSettings(next); } catch { throw new Error("No se pudieron guardar los ajustes en este navegador."); }
    setSettings(next); setNotice(next.autoSave ? "Guardado automático activado" : "Guardado automático desactivado; usa Guardar proyecto en el editor.");
  }
  const physical = `${(project.width / project.dpi * 2.54).toFixed(1)} × ${(project.height / project.dpi * 2.54).toFixed(1)} cm`;

  return <div className={`app-shell ${showCanvas ? "is-editing" : section === "Vectorización" ? "is-vectorizing" : ""}`}>
    <div className="mobile-appbar"><div className="brand"><span>STAM</span>PRINT <small>STUDIO · v{APP_VERSION}</small></div><button aria-label="Abrir menú de secciones" onClick={() => menu.current?.showModal()}><span aria-hidden="true">☰</span> Menú</button></div><dialog ref={menu} className="navigation-dialog" aria-label="Secciones de Stamprint" onClick={event => { if (event.target === event.currentTarget) menu.current?.close(); }}><div className="navigation-heading"><strong>Tu estudio</strong><button aria-label="Cerrar menú" onClick={() => menu.current?.close()}>Cerrar ×</button></div><nav aria-label="Navegación móvil">{sections.map(item => <button key={item} aria-current={section === item ? "page" : undefined} disabled={!ready || busy} onClick={() => void selectSection(item)}><AppIcon name={item} /><span>{item}</span></button>)}</nav></dialog><aside className="app-navigation"><div className="brand"><span>STAM</span>PRINT <small>STUDIO · v{APP_VERSION}</small></div>
      <nav aria-label="Secciones principales">{sections.map(item => <button key={item} aria-label={item} title={item} aria-current={section === item ? "page" : undefined} className={section === item ? "active" : ""} disabled={!ready || busy} onClick={() => void selectSection(item)}><AppIcon name={item} /><span>{item}</span></button>)}</nav>
      <div className="offline">● Trabajo local<br /><span>Tus diseños, en tu dispositivo</span></div>
    </aside>
    <main><header className="app-header"><div><strong>{section}</strong><span>{section === "Plantillas" ? "Prendas · Estampados · Imágenes publicitarias" : section === "Configuración" ? "Preferencias locales · Editor y DTF" : section === "Piedrería" ? "Diseño de piedras · Plantillas a escala" : section === "Serigrafía" ? "Separación de colores · Tintas" : section === "DTF" ? "Mesa de impresión · Gang sheet · Medidas en cm" : section === "Vectorización" ? "Trazados editables · SVG / PNG · Medidas en cm" : `${project.name} · ${physical} · ${project.dpi} DPI`}</span></div><div className="header-actions" hidden={!showCanvas}>
      {showCanvas && <><button onClick={() => void saveCurrentProject()} disabled={!ready || busy}>Guardar proyecto</button><button onClick={() => void saveCurrentProject(true)} disabled={!ready || busy}>Guardar copia</button><button onClick={() => setPickingProject(true)} disabled={!ready || busy}>Cargar proyecto</button></>}
      <button onClick={() => send({ type: "undo" })} disabled={!ready || busy || !history.past.length}>Deshacer</button>
      <button onClick={() => send({ type: "redo" })} disabled={!ready || busy || !history.future.length}>Rehacer</button>
      <button className="accent" onClick={() => void exportPng()} disabled={!ready || busy || !project.layers.length || !showCanvas}>{busy ? "Preparando…" : "Exportar PNG"}</button>
    </div></header>
    <section className={`workspace ${showCanvas ? "workspace-editor" : section === "Vectorización" ? "workspace-vector" : ""}`}>
      {!ready ? <div className="module-page"><p>Cargando proyecto local…</p></div> : section === "Configuración" ? <SettingsPage settings={settings} onSave={updateSettings} /> : showCanvas ? <GraphicEditor key={project.id} project={project} section={section} renderer={renderer} commit={commit} endGroup={endGroup} notice={setNotice} status={notice} defaultBackground={settings.editor.background} onPreview={() => void selectSection("Simulador 3D")} onNew={() => { commit(resizeDocument(blankProject(), settings.editor.widthCm, settings.editor.heightCm, settings.editor.dpi)); setNotice("Documento nuevo. Puedes deshacer para recuperar el anterior."); }} busy={busy} /> : section === "Plantillas" ? <Suspense fallback={<div className="module-page"><p>Cargando plantillas…</p></div>}><PosterStudio hasEditorDesign={project.layers.some(layer => layer.visible)} onUseEditor={async () => {
        const snapshot = stateRef.current.present;
        const canvas = await renderer.render(snapshot, 2048, true);
        return { source: canvas.toDataURL("image/png"), name: snapshot.name, width: canvas.width, height: canvas.height };
      }} /></Suspense> : section === "Piedrería" ? <Suspense fallback={<div className="module-page"><p>Cargando piedrería…</p></div>}><RhinestoneStudio hasEditorDesign={project.layers.some(layer => layer.visible)} onUseEditor={async () => {
        const snapshot = stateRef.current.present;
        const canvas = await renderer.render(snapshot, 1600, true);
        return { source: canvas.toDataURL("image/png"), name: snapshot.name };
      }} /></Suspense> : section === "Serigrafía" ? <Suspense fallback={<div className="module-page"><p>Cargando serigrafía…</p></div>}><ScreenPrinting hasEditorDesign={project.layers.some(layer => layer.visible)} onUseEditor={async () => {
        const snapshot = stateRef.current.present;
        const canvas = await renderer.render(snapshot, 1600, true);
        return { source: canvas.toDataURL("image/png"), name: snapshot.name };
      }} /></Suspense> : section === "DTF" ? <Suspense fallback={<div className="module-page"><p>Cargando mesa DTF…</p></div>}><GangSheet defaults={settings.dtf} hasEditorDesign={project.layers.some(layer => layer.visible)} onUseEditor={async () => {
        const snapshot = stateRef.current.present;
        const canvas = await renderer.render(snapshot, Math.max(snapshot.width, snapshot.height), true);
        return { source: canvas.toDataURL("image/png"), name: snapshot.name, widthCm: snapshot.width / snapshot.dpi * 2.54, heightCm: snapshot.height / snapshot.dpi * 2.54 };
      }} onOpenEditor={() => void selectSection("Editor gráfico")} /></Suspense> : section === "Vectorización" ? <Suspense fallback={<div className="module-page"><p>Cargando vectorización…</p></div>}><VectorStudio hasEditorDesign={project.layers.some(layer => layer.visible)} onUseEditor={async () => {
        const snapshot = stateRef.current.present;
        const canvas = await renderer.render(snapshot, 2048, true);
        return { source: canvas.toDataURL("image/png"), name: snapshot.name, widthCm: snapshot.width / snapshot.dpi * 2.54 };
      }} onAddToEditor={image => {
        commit(previous => ({ ...previous, layers: [...previous.layers, { kind: "image", id: createId(), name: image.name + " (vector)", source: image.source, mask: "", pixelWidth: image.width, pixelHeight: image.height, width: image.widthCm / 2.54 * previous.dpi, height: image.widthCm / 2.54 * previous.dpi * image.height / image.width, x: previous.width / 2, y: previous.height / 2, rotation: 0, visible: true, locked: false, opacity: 1, effects: { ...defaultEffects } }] }));
        setSection("Editor gráfico"); setNotice("Copia PNG del vector añadida; sus medidas en cm se conservan.");
      }} /></Suspense> : section === "Simulador 3D" ? <Suspense fallback={<div className="module-page"><p>Cargando simulador 3D…</p></div>}><Textile3DStudio designSource={preview.source} designSizeCm={preview.sizeCm} /></Suspense> : <div className="module-page">
        {section === "Inicio" ? <><p className="eyebrow">TU ESTUDIO TEXTIL · v{APP_VERSION}</p><h1>De tu idea<br />al estampado.</h1><p>Diseña, prepara tus archivos y muestra cómo se verá tu próxima colección. Todo desde tu espacio de trabajo.</p><div className="home-actions"><button className="accent" onClick={() => void selectSection("Editor gráfico")}>Crear un diseño <span aria-hidden="true">↗</span></button><button onClick={() => void selectSection("Proyectos")}>Mis proyectos</button></div><div className="home-grid">{[["Editor gráfico", "Imágenes, texto y medidas listas para imprimir."], ["Plantillas", "Prueba tus estampados y crea imágenes para vender."], ["Simulador 3D", "Mira tu diseño sobre una camiseta desde cada ángulo."], ["DTF", "Organiza tus diseños y aprovecha la mesa de impresión."]].map(([title, description]) => <button className="home-card" key={title} onClick={() => void selectSection(title)}><AppIcon name={title} /><strong>{title}</strong><span>{description}</span><small>Abrir herramienta ↗</small></button>)}</div><ReleaseNotes /></> : section === "Proyectos" ? <ProjectsPage onOpen={openSavedProject} onDelete={deleteSavedProject} /> : <><p className="eyebrow">MÓDULO INDEPENDIENTE</p><h1>{section}</h1><p>{moduleNotes[section]}</p><p className="module-warning">El motor de este módulo aún no está incluido. Esta vista no reutiliza el editor ni aparenta estar operativa.</p></>}
      </div>}
    </section></main>
    {pickingProject && <ProjectPicker onOpen={openSavedProject} onDelete={deleteSavedProject} onClose={() => { if (!busy) setPickingProject(false); }} />}
  </div>;
}
