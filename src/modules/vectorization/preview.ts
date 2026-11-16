/** Size a shared original/vector frame; zoom is always relative to the fitted image. */
export function previewLayout(viewport: { width: number; height: number }, aspect: number, compare: boolean, zoom: number) {
  const columns = compare ? 2 : 1, gap = compare ? 20 : 0, padding = 24, caption = 24;
  const availableWidth = Math.max(1, (viewport.width - padding * 2 - gap) / columns);
  const availableHeight = Math.max(1, viewport.height - padding * 2 - caption);
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const width = Math.min(availableWidth, availableHeight * ratio) * zoom, height = width / ratio;
  return { width, height, spaceWidth: Math.max(viewport.width, width * columns + gap + padding * 2), spaceHeight: Math.max(viewport.height, height + caption + padding * 2) };
}
