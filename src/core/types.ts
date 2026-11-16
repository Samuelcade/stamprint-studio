export type RemovalMode = "connected" | "global";
export type Tool = "select" | "remove" | "restore";

export interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  effects: RasterEffects;
}

export interface RasterLayer extends LayerBase {
  kind: "image";
  source: string;
  mask: string;
  pixelWidth: number;
  pixelHeight: number;
}

export interface TextLayer extends LayerBase {
  kind: "text";
  text: string;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  color: string;
  align: "left" | "center" | "right";
}

export type DesignLayer = RasterLayer | TextLayer;

export interface RasterEffects {
  brightness: number;
  contrast: number;
  saturation: number;
  halftone: boolean;
  halftoneCell: number;
  halftoneOptions?: HalftoneOptions;
  mirror: boolean;
  whiteUnderbase: boolean;
  whiteHalo?: number;
  chrome?: number;
  chromeStyle?: "liquid" | "blue" | "holographic";
  chromeRelief?: number;
}

export interface Project {
  id: string;
  name: string;
  width: number;
  height: number;
  dpi: number;
  updatedAt: string;
  layers: DesignLayer[];
  version?: number;
}

export interface PixelColor { r: number; g: number; b: number; a: number }
export interface HalftoneOptions {
  unit: "source" | "lpi";
  lpi: number;
  shape: "circle" | "square" | "line";
  angle: number;
  ink: string;
  invert: boolean;
  gamma: number;
}
