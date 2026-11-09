/* 3D models read and drawn with no library (docs/模拟库.md): the triangles of a glTF (binary .glb, or .gltf with its
 * buffers as data URLs), an OBJ, a PLY in text and an STL (binary or text), flat-shaded on a 2D canvas, turned about
 * the upright axis. What the mock library's file preview shows a model with, and what a world view's stand-in draws a
 * mock world's picture with when it is a 3D model (World.tsx): a turntable in place of the engine's 3D scene. */

import { fromUtf8, parseDataUrl } from "@/lib/mocks/bytes";
import { formatOf } from "@/lib/mocks/formats/table";

export type Mesh = { positions: Float32Array; indices: Uint32Array; color: [number, number, number] };

/** the extensions of the 3D models read here */
export const MESH_EXTS = ["glb", "gltf", "obj", "stl", "ply"] as const;

/** the triangles of a glTF's meshes (binary or with its buffers as data URLs) */
export function gltfMesh(json: Record<string, unknown>, bin: Uint8Array | undefined): Mesh | undefined {
  type Acc = { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string };
  type View = { buffer: number; byteOffset?: number; byteStride?: number };
  const accessors = (json.accessors ?? []) as Acc[];
  const views = (json.bufferViews ?? []) as View[];
  const buffers = ((json.buffers ?? []) as { uri?: string }[]).map((b, i) => (b.uri ? parseDataUrl(b.uri)?.bytes : i === 0 ? bin : undefined));
  const read = (index: number, size: number): number[] => {
    const a = accessors[index];
    const v = a?.bufferView !== undefined ? views[a.bufferView] : undefined;
    const buf = v ? buffers[v.buffer] : undefined;
    if (!a || !v || !buf) return [];
    const width = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType] ?? 4;
    const stride = v.byteStride ?? width * size;
    const view = new DataView(buf.buffer, buf.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0));
    const out: number[] = [];
    for (let i = 0; i < Math.min(a.count, 200_000); i++)
      for (let k = 0; k < size; k++) {
        const at = i * stride + k * width;
        out.push(a.componentType === 5126 ? view.getFloat32(at, true) : a.componentType === 5125 ? view.getUint32(at, true) : a.componentType === 5123 ? view.getUint16(at, true) : a.componentType === 5122 ? view.getInt16(at, true) : view.getUint8(at));
      }
    return out;
  };
  const positions: number[] = [];
  const indices: number[] = [];
  let color: [number, number, number] = [0.6, 0.55, 0.85];
  for (const mesh of (json.meshes ?? []) as { primitives?: { attributes?: { POSITION?: number }; indices?: number; material?: number; mode?: number }[] }[])
    for (const prim of mesh.primitives ?? []) {
      if (prim.attributes?.POSITION === undefined || (prim.mode !== undefined && prim.mode !== 4)) continue;
      const base = positions.length / 3;
      const pos = read(prim.attributes.POSITION, 3);
      positions.push(...pos);
      const idx = prim.indices !== undefined ? read(prim.indices, 1) : Array.from({ length: pos.length / 3 }, (_, i) => i);
      indices.push(...idx.map((i) => i + base));
      const mat = prim.material !== undefined ? ((json.materials ?? []) as { pbrMetallicRoughness?: { baseColorFactor?: number[] } }[])[prim.material] : undefined;
      const f = mat?.pbrMetallicRoughness?.baseColorFactor;
      if (f && f.length >= 3) color = [f[0], f[1], f[2]];
    }
  return positions.length ? { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), color } : undefined;
}

/** the triangles of an OBJ, a PLY in text, or an STL (binary or text) */
export function meshOfText(text: string, ext: string): Mesh | undefined {
  const positions: number[] = [];
  const indices: number[] = [];
  const lines = text.split(/\r?\n/);
  if (ext === "obj") {
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === "v") positions.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
      else if (parts[0] === "f") {
        const ids = parts.slice(1).map((x) => {
          const n = parseInt(x, 10);
          return n < 0 ? positions.length / 3 + n : n - 1;
        });
        for (let i = 1; i + 1 < ids.length; i++) indices.push(ids[0], ids[i], ids[i + 1]);
      }
    }
  } else if (ext === "ply") {
    const end = lines.indexOf("end_header");
    const vertices = Number(/element vertex (\d+)/.exec(text)?.[1] ?? 0);
    const faces = Number(/element face (\d+)/.exec(text)?.[1] ?? 0);
    for (let i = 0; i < vertices; i++) {
      const [x, y, z] = lines[end + 1 + i].trim().split(/\s+/).map(Number);
      positions.push(x, y, z);
    }
    for (let i = 0; i < faces; i++) {
      const [n, ...ids] = lines[end + 1 + vertices + i].trim().split(/\s+/).map(Number);
      for (let k = 1; k + 1 < n; k++) indices.push(ids[0], ids[k], ids[k + 1]);
    }
  } else
    for (const line of lines) {
      const m = /^\s*vertex\s+(\S+)\s+(\S+)\s+(\S+)/.exec(line);
      if (m) {
        positions.push(Number(m[1]), Number(m[2]), Number(m[3]));
        indices.push(indices.length);
      }
    }
  return positions.length && positions.every(Number.isFinite) ? { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), color: [0.6, 0.55, 0.85] } : undefined;
}

export function binaryStl(bytes: Uint8Array): Mesh | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes.length >= 84 ? view.getUint32(80, true) : 0;
  if (84 + n * 50 !== bytes.length) return undefined;
  const positions = new Float32Array(n * 9);
  for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) positions[t * 9 + k] = view.getFloat32(84 + t * 50 + 12 + k * 4, true);
  return { positions, indices: Uint32Array.from({ length: n * 3 }, (_, i) => i), color: [0.6, 0.55, 0.85] };
}

/** the mesh of a 3D model's bytes, by its extension (glb, gltf, obj, stl, ply); undefined when it holds none */
export function meshOfBytes(bytes: Uint8Array, ext: string): Mesh | undefined {
  try {
    if (ext === "glb") {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const jsonLen = view.getUint32(12, true);
      const json = JSON.parse(fromUtf8(bytes.subarray(20, 20 + jsonLen))) as Record<string, unknown>;
      const binAt = 20 + jsonLen;
      const bin = binAt + 8 <= bytes.length ? bytes.subarray(binAt + 8, binAt + 8 + view.getUint32(binAt, true)) : undefined;
      return gltfMesh(json, bin);
    }
    if (ext === "gltf") return gltfMesh(JSON.parse(fromUtf8(bytes)) as Record<string, unknown>, undefined);
    if (ext === "stl") return binaryStl(bytes) ?? meshOfText(fromUtf8(bytes), "stl");
    if (ext === "obj" || ext === "ply") return meshOfText(fromUtf8(bytes), ext);
  } catch {
    /* not the model it says it is */
  }
  return undefined;
}

/** the extension of a 3D model, by its media type or its address's end; undefined for anything else */
export function meshExt(url: string): string | undefined {
  const type = /^data:([^;,]*)/.exec(url)?.[1];
  const ext = type ? formatOf(type)?.ext : /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
  return ext && (MESH_EXTS as readonly string[]).includes(ext) ? ext : undefined;
}

/** the mesh of a 3D model given as a data URL; undefined when it is none (or not one read here) */
export function meshOfDataUrl(url: string): Mesh | undefined {
  const ext = meshExt(url);
  const parsed = ext ? parseDataUrl(url) : null;
  return ext && parsed ? meshOfBytes(parsed.bytes, ext) : undefined;
}

/** a mesh flat-shaded on a 2D canvas (over `background`, a CSS colour or "transparent"), turned `yaw` about its upright axis, the nearest triangles drawn last */
export function drawMesh(canvas: HTMLCanvasElement, mesh: Mesh, yaw: number, background: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  /* a picture under it shows through where the background is "transparent" */
  ctx.clearRect(0, 0, w, h);
  if (background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  const p = mesh.positions;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[i + k]);
      max[k] = Math.max(max[k], p[i + k]);
    }
  const center = [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
  const radius = Math.max(1e-6, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  const scale = (Math.min(w, h) * 0.42) / radius;
  const pitch = 0.45;
  const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
  const at = (i: number) => {
    const x = p[i * 3] - center[0];
    const y = p[i * 3 + 1] - center[1];
    const z = p[i * 3 + 2] - center[2];
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
  };
  const tris: { pts: number[][]; depth: number; light: number }[] = [];
  const idx = mesh.indices;
  for (let t = 0; t + 2 < idx.length && tris.length < 60_000; t += 3) {
    const [a, b, c] = [at(idx[t]), at(idx[t + 1]), at(idx[t + 2])];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    /* facing the viewer (who looks down -z): its normal points to +z */
    if (n[2] / len <= 0) continue;
    const light = Math.max(0, (n[0] * -0.35 + n[1] * 0.55 + n[2] * 0.75) / len);
    tris.push({ pts: [a, b, c], depth: a[2] + b[2] + c[2], light });
  }
  tris.sort((x, y) => x.depth - y.depth);
  for (const tri of tris) {
    const k = 0.35 + 0.65 * tri.light;
    const [r, g, b] = mesh.color.map((v) => Math.round(Math.min(1, v * k + 0.04) * 255));
    ctx.fillStyle = `rgb(${r} ${g} ${b})`;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.beginPath();
    tri.pts.forEach(([x, y], i) => (i ? ctx.lineTo(w / 2 + x * scale, h / 2 - y * scale) : ctx.moveTo(w / 2 + x * scale, h / 2 - y * scale)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
