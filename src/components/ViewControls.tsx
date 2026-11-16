type Props = { zoom: number; pan: boolean; zoomTo: (value: number) => void; reset: () => void; togglePan: () => void };
export function ViewControls({ zoom, pan, zoomTo, reset, togglePan }: Props) {
  return <div className="view-controls" role="group" aria-label="Controles de la vista">
    <button aria-label="Alejar lienzo" disabled={zoom <= .25} onClick={() => zoomTo(zoom / 1.2)}>−</button>
    <output role="meter" aria-valuemin={25} aria-valuemax={800} aria-valuenow={Math.round(zoom * 100)} aria-label="Zoom del lienzo">{Math.round(zoom * 100)}%</output>
    <button aria-label="Acercar lienzo" disabled={zoom >= 8} onClick={() => zoomTo(zoom * 1.2)}>+</button>
    <button onClick={reset} title="Mostrar el diseño completo">Ajustar</button>
    <button aria-pressed={pan} onClick={togglePan} title="Arrastra la vista sin mover el estampado">Mover vista</button>
  </div>;
}
