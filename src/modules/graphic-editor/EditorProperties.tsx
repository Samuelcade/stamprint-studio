import { useEffect, useRef, useState } from "react";
import type { DesignLayer, Project, RasterEffects, RemovalMode, Tool } from "../../core/types";
import { centimetersFromPixels } from "../../core/units";
import { measureTextLayer } from "./render";
import { resizeDocument } from "./model";
import { HalftonePanel } from "../halftone/HalftonePanel";
import { QualityPanel } from "../image-enhancement/QualityPanel";
import type { RasterLayer } from "../../core/types";

function NumberField({ label, value, min = -10000, max = 10000, step = .1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  const changed = useRef(false);
  useEffect(() => { if (!changed.current) setDraft(String(Math.round(value * 100) / 100)); }, [value]);
  return <label>{label}<input type="number" value={draft} min={min} max={max} step={step} onChange={event => { changed.current = true; setDraft(event.target.value); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={() => {
    if (!changed.current) return;
    changed.current = false;
    const parsed = Number(draft);
    if (!draft.trim() || !Number.isFinite(parsed)) { setDraft(String(Math.round(value * 100) / 100)); return; }
    const next = Math.min(max, Math.max(min, parsed)); setDraft(String(next)); if (next !== value) onChange(next);
  }} /></label>;
}

interface Props {
  project: Project; layer?: DesignLayer; tool: Tool; section: string; originalHalftone: boolean; onOriginalHalftone: (value: boolean) => void;
  onChange: (layer: DesignLayer, group?: string) => void; onProject: (project: Project, group?: string) => void; endGroup: () => void;
  onDelete: () => void; onDuplicate: () => void; onReorder: (direction: number) => void;
  mode: RemovalMode; setMode: (mode: RemovalMode) => void; tolerance: number; setTolerance: (value: number) => void;
  brush: number; setBrush: (value: number) => void; notice: (message: string) => void;
  onQualityApply: (original: RasterLayer, improved: RasterLayer) => void;
}

export function EditorProperties(props: Props) {
  const { project, layer, onChange, onProject, endGroup } = props;
  const [tab, setTab] = useState<"object" | "document">("object");
  useEffect(() => { if (props.section === "Semitonos") setTab("object"); }, [props.section]);
  const [proportional, setProportional] = useState(true);
  const [width, setWidth] = useState("25"), [height, setHeight] = useState("30"), [dpi, setDpi] = useState("300");
  useEffect(() => {
    setWidth((project.width / project.dpi * 2.54).toFixed(2)); setHeight((project.height / project.dpi * 2.54).toFixed(2)); setDpi(String(project.dpi));
  }, [project.width, project.height, project.dpi]);
  const patch = (changes: Partial<DesignLayer>, group?: string) => { if (layer && !layer.locked) onChange({ ...layer, ...changes } as DesignLayer, group); };
  const effects = (changes: Partial<RasterEffects>, group?: string) => { if (layer) patch({ effects: { ...layer.effects, ...changes } }, group); };
  const cm = (px: number) => centimetersFromPixels(px, project.dpi);
  const image = layer?.kind === "image";
  return <>
    <div className="editor-tabs"><button className={tab === "object" ? "selected" : ""} onClick={() => setTab("object")}>Objeto</button><button className={tab === "document" ? "selected" : ""} onClick={() => setTab("document")}>Documento</button></div>
    {tab === "document" ? <form className="editor-fields" onSubmit={event => { event.preventDefault(); try { onProject(resizeDocument(project, Number(width), Number(height), Number(dpi))); props.notice("Medidas del documento actualizadas"); } catch (error) { props.notice((error as Error).message); } }}>
      <h2>Documento de impresión</h2>
      <label>Nombre del proyecto<input value={project.name} onChange={event => onProject({ ...project, name: event.target.value }, "project-name")} onBlur={endGroup} /></label>
      <div className="editor-field-pair"><label>Ancho del documento (cm)<input type="number" step="0.01" min="0.1" required value={width} onChange={event => setWidth(event.target.value)} /></label><label>Alto del documento (cm)<input type="number" step="0.01" min="0.1" required value={height} onChange={event => setHeight(event.target.value)} /></label></div>
      <label>Resolución (DPI)<select value={dpi} onChange={event => setDpi(event.target.value)}>{[...new Set([72, 150, 300, 600, project.dpi])].sort((a, b) => a - b).map(value => <option key={value}>{value}</option>)}</select></label>
      <button type="submit" className="accent">Aplicar medidas</button>
      <p className="editor-help">Fondo transparente. Cambiar los DPI conserva las medidas de los objetos en cm. Cambiar el lienzo no estira el diseño.</p>
      <p className="editor-help">{project.width} × {project.height} px · {project.dpi} DPI</p>
    </form> : !layer ? <div className="editor-empty-properties"><h2>Compón tu diseño</h2><p>Agrega imágenes o texto. Haz clic en un objeto para editarlo.</p><button onClick={() => setTab("document")}>Configurar documento</button></div> : <fieldset key={layer.id} className="editor-fields" disabled={layer.locked}>
      <legend>{layer.kind === "text" ? "Texto seleccionado" : "Imagen seleccionada"}{layer.locked ? " · bloqueada" : ""}</legend>
      {props.section === "Semitonos" && (layer.kind === "image" ? <HalftonePanel layer={layer} dpi={project.dpi} change={effects} original={props.originalHalftone} onOriginal={props.onOriginalHalftone} /> : <p className="halftone-note">Los semitonos se aplican a capas de imagen. Selecciona una imagen en Capas o usa Agregar imágenes.</p>)}
      {layer.kind === "image" && props.section !== "Semitonos" && <QualityPanel key={layer.id} layer={layer} dpi={project.dpi} onApply={props.onQualityApply} notice={props.notice} />}
      <label>Nombre de capa<input value={layer.name} onChange={event => patch({ name: event.target.value }, `name:${layer.id}`)} onBlur={endGroup} /></label>
      {layer.kind === "text" && <>
        <label>Contenido del texto<textarea rows={3} value={layer.text} onChange={event => onChange(measureTextLayer(layer, event.target.value), `text:${layer.id}`)} onBlur={endGroup} /></label>
        <label>Tipografía<select value={layer.fontFamily} onChange={event => onChange(measureTextLayer(layer, layer.text, event.target.value))}>{["Arial", "Georgia", "Impact", "Verdana", "Courier New"].map(font => <option key={font}>{font}</option>)}</select></label>
        <div className="editor-inline"><label>Color del texto<input type="color" value={layer.color} onInput={event => patch({ color: event.currentTarget.value }, `color:${layer.id}`)} onChange={event => patch({ color: event.target.value }, `color:${layer.id}`)} onBlur={endGroup} /></label><button type="button" aria-pressed={layer.bold} onClick={() => onChange(measureTextLayer(layer, layer.text, layer.fontFamily, !layer.bold))}>Negrita</button><button type="button" aria-pressed={layer.italic} onClick={() => onChange(measureTextLayer(layer, layer.text, layer.fontFamily, layer.bold, !layer.italic))}>Cursiva</button></div>
        <label>Alineación del texto<select value={layer.align} onChange={event => patch({ align: event.target.value as "left" | "center" | "right" })}><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></label>
      </>}
      <div className="editor-field-pair"><NumberField label="Ancho del objeto (cm)" value={cm(layer.width)} min={.1} max={200} onChange={value => { const next = (value / 2.54 * project.dpi); patch({ width: next, height: proportional ? layer.height * next / layer.width : layer.height }); }} /><NumberField label="Alto del objeto (cm)" value={cm(layer.height)} min={.1} max={200} onChange={value => { const next = (value / 2.54 * project.dpi); patch({ height: next, width: proportional ? layer.width * next / layer.height : layer.width }); }} /></div>
      <label className="editor-check"><input type="checkbox" checked={proportional} onChange={event => setProportional(event.target.checked)} />Mantener proporciones</label>
      <div className="editor-field-pair"><NumberField label="Centro X (cm)" value={cm(layer.x)} onChange={value => patch({ x: (value / 2.54 * project.dpi) })} /><NumberField label="Centro Y (cm)" value={cm(layer.y)} onChange={value => patch({ y: (value / 2.54 * project.dpi) })} /></div>
      <NumberField label="Rotación (grados)" value={layer.rotation} min={-180} max={180} step={1} onChange={rotation => patch({ rotation })} />
      <label>Opacidad <output>{Math.round(layer.opacity * 100)}%</output><input aria-label="Opacidad" type="range" min="0" max="100" value={Math.round(layer.opacity * 100)} onPointerUp={endGroup} onBlur={endGroup} onChange={event => patch({ opacity: Number(event.target.value) / 100 }, `opacity:${layer.id}`)} /></label>
      <div className="editor-inline"><button type="button" onClick={() => patch({ x: project.width / 2, y: project.height / 2 })}>Centrar</button><button type="button" aria-pressed={layer.effects.mirror} onClick={() => effects({ mirror: !layer.effects.mirror })}>Espejo</button></div>
      <details className="editor-adjustments" open><summary>Acabado cromado</summary>
        <p className="editor-help">Cromado Y2K · espejo, reflejos de alto contraste y bordes biselados.</p>
        <button type="button" aria-pressed={!!layer.effects.chrome} onClick={() => effects({ chrome: layer.effects.chrome ? 0 : 100 })}>{layer.effects.chrome ? "Quitar cromado" : "Aplicar cromado"}</button>
        {!!layer.effects.chrome && <label>Intensidad del cromado <output>{layer.effects.chrome}%</output><input aria-label="Intensidad del cromado" type="range" min="1" max="100" value={layer.effects.chrome} onPointerUp={endGroup} onBlur={endGroup} onChange={event => effects({ chrome: Number(event.target.value) }, `chrome:${layer.id}`)} /></label>}
        {!!layer.effects.chrome && <><label>Estilo del cromado<select value={layer.effects.chromeStyle ?? "liquid"} onChange={event => effects({ chromeStyle: event.target.value as RasterEffects["chromeStyle"] })}><option value="liquid">Metal líquido · plata espejo</option><option value="blue">Cyber azul · acero frío</option><option value="holographic">Holográfico · rosa y cian</option></select></label>
          <label>Relieve del cromado <output>{layer.effects.chromeRelief ?? 70}%</output><input aria-label="Relieve del cromado" type="range" min="0" max="100" value={layer.effects.chromeRelief ?? 70} onPointerUp={endGroup} onBlur={endGroup} onChange={event => effects({ chromeRelief: Number(event.target.value) }, `chrome-relief:${layer.id}`)} /></label></>}
        <p className="editor-help">En imágenes aprovecha las luces y sombras originales; en texto crea bisel y reflejos. Conserva la transparencia y se incluye en el PNG.</p>
      </details>
      {image && <>
        <details className="editor-adjustments" open><summary>Limpieza de bordes</summary>
          <button type="button" aria-pressed={!!layer.effects.whiteHalo} onClick={() => { effects({ whiteHalo: layer.effects.whiteHalo ? 0 : 75 }); props.notice(layer.effects.whiteHalo ? "Corrección de halo desactivada." : "Corrección del halo blanco activada. Revisa el diseño sobre fondo oscuro."); }}>{layer.effects.whiteHalo ? "Desactivar limpieza de halo" : "Eliminar halo blanco"}</button>
          {!!layer.effects.whiteHalo && <label>Intensidad del halo <output>{layer.effects.whiteHalo}%</output><input aria-label="Intensidad del halo" type="range" min="1" max="100" value={layer.effects.whiteHalo} onPointerUp={endGroup} onBlur={endGroup} onChange={event => effects({ whiteHalo: Number(event.target.value) }, `white-halo:${layer.id}`)} /></label>}
          <p className="editor-help">Corrige restos blancos junto a la transparencia. Conserva el blanco del interior y puedes deshacer. Usa Eliminar color primero si la imagen tiene un fondo opaco.</p>
        </details>
        {props.tool === "remove" && <><h2>Eliminar color</h2><label>Modo<select value={props.mode} onChange={event => props.setMode(event.target.value as RemovalMode)}><option value="connected">Zona conectada</option><option value="global">Toda la imagen</option></select></label><label>Tolerancia <output>{props.tolerance}</output><input aria-label="Tolerancia" type="range" min="0" max="180" value={props.tolerance} onChange={event => props.setTolerance(Number(event.target.value))} /></label><p className="editor-help">Haz clic en el color de la imagen que quieres quitar.</p></>}
        {props.tool === "restore" && <label>Diámetro de restauración (px)<input aria-label="Diámetro de restauración (px)" type="range" min="4" max="160" step="2" value={props.brush} onChange={event => props.setBrush(Number(event.target.value))} /><output>{props.brush} px</output><span className="editor-help">Haz clic sobre la zona que quieres recuperar.</span></label>}
        <details className="editor-adjustments" open><summary>Ajustes de imagen (Mejoramiento)</summary>{([['brightness', 'Brillo'], ['contrast', 'Contraste'], ['saturation', 'Saturación']] as const).map(([key, label]) => <label key={key}>{label} <output>{layer.effects[key]}</output><input aria-label={label} type="range" min="-100" max="100" value={layer.effects[key]} onPointerUp={endGroup} onBlur={endGroup} onChange={event => effects({ [key]: Number(event.target.value) }, `${key}:${layer.id}`)} /></label>)}</details>
        {props.section !== "Semitonos" && <details className="editor-adjustments"><summary>Semitonos</summary>{layer.kind === "image" && <HalftonePanel layer={layer} dpi={project.dpi} change={effects} original={props.originalHalftone} onOriginal={props.onOriginalHalftone} />}</details>}
        <details className="editor-adjustments" open={props.section === "DTF" || undefined}><summary>Base blanca DTF</summary><label className="editor-check"><input type="checkbox" checked={layer.effects.whiteUnderbase} onChange={event => effects({ whiteUnderbase: event.target.checked })} />Previsualizar base blanca</label><p className="editor-help">La base blanca es una vista previa; no genera canales de tinta para RIP.</p></details>
      </>}
      <div className="editor-inline"><button type="button" onClick={() => props.onReorder(1)} disabled={project.layers.at(-1)?.id === layer.id}>Subir capa</button><button type="button" onClick={() => props.onReorder(-1)} disabled={project.layers[0]?.id === layer.id}>Bajar capa</button></div>
      <div className="editor-inline"><button type="button" onClick={props.onDuplicate}>Duplicar</button><button type="button" className="editor-delete" onClick={props.onDelete}>Eliminar capa</button></div>
    </fieldset>}
  </>;
}
