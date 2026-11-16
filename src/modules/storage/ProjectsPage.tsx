import { useEffect, useRef, useState } from "react";
import { listProjects } from "./projectStore";
import type { ProjectSummary } from "./projectStore";
import "./projects.css";

interface Props { onOpen: (project: ProjectSummary) => Promise<void>; onDelete: (project: ProjectSummary) => Promise<void> }

export function ProjectsPage({ onOpen, onDelete }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]), [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true), [opening, setOpening] = useState<string>(), [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string>(), [status, setStatus] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    listProjects().then(saved => { if (alive.current) setProjects(saved); })
      .catch(() => { if (alive.current) setError("No se pudieron leer los proyectos guardados."); })
      .finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
  }, []);
  async function open(project: ProjectSummary) {
    setOpening(project.id); setError("");
    try { await onOpen(project); }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "No se pudo abrir el proyecto."); }
    finally { if (alive.current) setOpening(undefined); }
  }
  async function remove(project: ProjectSummary) {
    setDeleting(project.id); setError(""); setStatus("");
    try {
      await onDelete(project);
      if (alive.current) { setProjects(saved => saved.filter(item => item.id !== project.id)); setStatus(`Proyecto eliminado: ${project.name || "Sin título"}`); }
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : "No se pudo eliminar el proyecto."); }
    finally { if (alive.current) setDeleting(undefined); }
  }
  const visible = projects.filter(project => `${project.name} ${project.section}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="project-library">
    <p className="eyebrow">BIBLIOTECA LOCAL</p><h1>Proyectos guardados</h1>
    <p>Editor gráfico y Semitonos. Selecciona el trabajo que quieras recuperar con sus capas y ajustes.</p>
    <label className="project-search">Buscar proyecto<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
    {error && <p role="alert" className="project-error">{error}</p>}
    {status && <p role="status">{status}</p>}
    {loading ? <p role="status">Cargando proyectos…</p> : !projects.length ? <p>No hay proyectos guardados del editor. Usa Guardar proyecto para añadir uno.</p> : !visible.length ? <p>No hay proyectos que coincidan con la búsqueda.</p> : <ul className="project-library-list">{visible.map(project => <li key={project.id}>
      <div><h2>{project.name || "Sin título"}</h2><span className="project-section">{project.section}</span>
        <p>{(project.width / project.dpi * 2.54).toFixed(1)} × {(project.height / project.dpi * 2.54).toFixed(1)} cm · {project.dpi} DPI · {project.layerCount} capas</p>
        <time dateTime={project.updatedAt}>{new Date(project.updatedAt).toLocaleString("es")}</time></div>
      <div className="project-card-actions"><button className="accent" disabled={!!opening || !!deleting} aria-label={`Abrir ${project.name || "Sin título"}`} onClick={() => void open(project)}>{opening === project.id ? "Abriendo…" : "Abrir proyecto"}</button>
      <button className="project-delete" disabled={!!opening || !!deleting} aria-label={`Eliminar ${project.name || "Sin título"}`} onClick={() => void remove(project)}>{deleting === project.id ? "Eliminando…" : "Eliminar proyecto"}</button></div>
    </li>)}</ul>}
  </div>;
}

export function ProjectPicker({ onOpen, onDelete, onClose }: Props & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      if (typeof element.showModal === "function") element.showModal(); else element.setAttribute("open", "");
    }
  }, []);
  return <dialog ref={dialog} className="project-picker" aria-label="Cargar proyecto" onCancel={event => { event.preventDefault(); onClose(); }}>
    <button className="project-picker-close" onClick={onClose}>Cerrar selector</button>
    <ProjectsPage onOpen={onOpen} onDelete={onDelete} />
  </dialog>;
}
