import * as THREE from "three";

/** Index triangles in XY once. A pointer move visits one small cell, not the full garment. */
export function createSurfaceSampler(meshes: THREE.Mesh[], bounds: THREE.Box3, resolution = 48) {
  const cells: number[][] = Array.from({ length: resolution * resolution }, () => []);
  const triangles: number[] = [];
  const width = Math.max(bounds.max.x - bounds.min.x, .001), height = Math.max(bounds.max.y - bounds.min.y, .001);
  const cellX = (x: number) => THREE.MathUtils.clamp(Math.floor((x - bounds.min.x) / width * resolution), 0, resolution - 1);
  const cellY = (y: number) => THREE.MathUtils.clamp(Math.floor((y - bounds.min.y) / height * resolution), 0, resolution - 1);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const edge1 = new THREE.Vector3(), edge2 = new THREE.Vector3();
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute("position"), index = mesh.geometry.index;
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      a.fromBufferAttribute(positions, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
      const normalZ = edge1.subVectors(b, a).cross(edge2.subVectors(c, a)).normalize().z;
      if (Math.abs(normalZ) <= .05) continue;
      const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (Math.abs(denominator) < 1e-12) continue;
      const offset = triangles.length;
      triangles.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, 1 / denominator, normalZ);
      const x0 = cellX(Math.min(a.x, b.x, c.x)), x1 = cellX(Math.max(a.x, b.x, c.x));
      const y0 = cellY(Math.min(a.y, b.y, c.y)), y1 = cellY(Math.max(a.y, b.y, c.y));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells[y * resolution + x].push(offset);
    }
  }
  const data = new Float64Array(triangles);
  return (x: number, y: number, side: 1 | -1): THREE.Vector3 | undefined => {
    if (x < bounds.min.x || x > bounds.max.x || y < bounds.min.y || y > bounds.max.y) return;
    let closest = -Infinity;
    for (const i of cells[cellY(y) * resolution + cellX(x)]) {
      if (data[i + 10] * side <= .05) continue;
      const u = ((data[i + 4] - data[i + 7]) * (x - data[i + 6]) + (data[i + 6] - data[i + 3]) * (y - data[i + 7])) * data[i + 9];
      const v = ((data[i + 7] - data[i + 1]) * (x - data[i + 6]) + (data[i] - data[i + 6]) * (y - data[i + 7])) * data[i + 9];
      if (u < -1e-7 || v < -1e-7 || u + v > 1.0000001) continue;
      const z = u * data[i + 2] + v * data[i + 5] + (1 - u - v) * data[i + 8];
      closest = Math.max(closest, z * side);
    }
    if (closest !== -Infinity) return new THREE.Vector3(x, y, closest * side);
  };
}
