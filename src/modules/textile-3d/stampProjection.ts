import * as THREE from "three";

export const STAMP_UNITS_PER_CM = .08;

export const MAX_STAMP_SIZE_CM = 60;
export function stampDimensionsCm(sizeCm: number, aspect: number) {
  return { width: sizeCm * Math.min(1, aspect), height: sizeCm / Math.max(1, aspect) };
}

export function stampDimensions(sizeCm: number, aspect: number, unitsPerCm = STAMP_UNITS_PER_CM) {
  const cm = stampDimensionsCm(sizeCm, aspect);
  return { width: cm.width * unitsPerCm, height: cm.height * unitsPerCm };
}

// Keep a fixed printing plane: a wrinkle must never tilt or stretch the artwork.
// Negative angle makes positive UI rotation clockwise, like a 2D design editor.
export function stampOrientation(rotation: number, side: 1 | -1 = 1) {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side === 1 ? 0 : Math.PI)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -THREE.MathUtils.degToRad(rotation)));
}

export function stampCorners(center: THREE.Vector3, sizeCm: number, aspect: number, rotation: number, side: 1 | -1 = 1, unitsPerCm = STAMP_UNITS_PER_CM) {
  const { width, height } = stampDimensions(sizeCm, aspect, unitsPerCm);
  const orientation = stampOrientation(rotation, side);
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) =>
    new THREE.Vector3(x * width / 2, y * height / 2, 0).applyQuaternion(orientation).add(center));
}

