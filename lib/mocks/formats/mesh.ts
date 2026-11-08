/* 3D models: a simple mesh chosen by the seed (a box, a sphere, a torus, a cylinder, a gem), colored in the
 * seed's hue, as glTF 2.0 (binary .glb, or .gltf with its buffer inside as a data URL), OBJ, STL (binary) and PLY
 * (text). Every number is made here: the same seed, the same mesh, to the byte. */

import { toBase64, utf8 } from "../bytes";
import { hash53 } from "../rng";
import { Sink } from "./deflate";
import { hslRgb } from "./content";

export type Mesh = { name: string; positions: number[]; normals: number[]; indices: number[]; color: [number, number, number] };

export const SHAPES = ["box", "sphere", "torus", "cylinder", "gem"] as const;

/** the mesh of a seed, its size about one unit, centered */
export function meshOf(seed: string, name = "Mock model", detail = 1, only?: (typeof SHAPES)[number]): Mesh {
  const shape = only ?? SHAPES[hash53(`mesh:${seed}`) % SHAPES.length];
  const [r, g, b] = hslRgb(hash53(seed) % 360, 0.55, 0.55).map((v) => Math.round((v / 255) * 1000) / 1000);
  const m: Mesh = { name, positions: [], normals: [], indices: [], color: [r, g, b] };
  const seg = Math.max(6, Math.round(24 * Math.min(1, detail)));
  const vertex = (p: number[], n: number[]) => {
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    m.positions.push(...p.map((v) => Math.round(v * 1e5) / 1e5));
    m.normals.push(...n.map((v) => Math.round((v / len) * 1e5) / 1e5));
    return m.positions.length / 3 - 1;
  };
  /* a grid of (u, v) in [0, 1]², joined into triangles facing outwards (`flip` when its (u, v) turn the other way) */
  const grid = (nu: number, nv: number, at: (u: number, v: number) => { p: number[]; n: number[] }, flip = false) => {
    const base = m.positions.length / 3;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const { p, n } = at(i / nu, j / nv);
        vertex(p, n);
      }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i;
        const b2 = a + 1;
        const c = a + nu + 1;
        const d = c + 1;
        const tris = flip ? [[a, b2, c], [b2, d, c]] : [[a, c, b2], [b2, c, d]];
        /* a sphere's poles squeeze a row of corners into one point: those triangles have no area */
        const same = (x: number, y: number) => [0, 1, 2].every((k) => m.positions[x * 3 + k] === m.positions[y * 3 + k]);
        for (const [x, y, z] of tris) if (!same(x, y) && !same(y, z) && !same(x, z)) m.indices.push(x, y, z);
      }
  };
  const TAU = Math.PI * 2;
  if (shape === "sphere")
    grid(seg, Math.round(seg / 2), (u, v) => {
      const th = u * TAU;
      const ph = v * Math.PI;
      const p = [0.5 * Math.sin(ph) * Math.cos(th), 0.5 * Math.cos(ph), -0.5 * Math.sin(ph) * Math.sin(th)];
      return { p, n: p };
    });
  else if (shape === "torus")
    grid(seg, Math.round(seg / 2), (u, v) => {
      const th = u * TAU;
      const ph = v * TAU;
      const R = 0.36;
      const rr = 0.14;
      const p = [(R + rr * Math.cos(ph)) * Math.cos(th), rr * Math.sin(ph), -(R + rr * Math.cos(ph)) * Math.sin(th)];
      return { p, n: [Math.cos(ph) * Math.cos(th), Math.sin(ph), -Math.cos(ph) * Math.sin(th)] };
    }, true);
  else if (shape === "cylinder") {
    grid(seg, 1, (u, v) => {
      const th = u * TAU;
      return { p: [0.4 * Math.cos(th), v - 0.5, -0.4 * Math.sin(th)], n: [Math.cos(th), 0, -Math.sin(th)] };
    }, true);
    for (const y of [-0.5, 0.5]) {
      const center = vertex([0, y, 0], [0, y, 0]);
      const ring = Array.from({ length: seg }, (_, i) => vertex([0.4 * Math.cos((i / seg) * TAU), y, -0.4 * Math.sin((i / seg) * TAU)], [0, y, 0]));
      for (let i = 0; i < seg; i++) {
        const [a, b2] = [ring[i], ring[(i + 1) % seg]];
        m.indices.push(...(y > 0 ? [center, a, b2] : [center, b2, a]));
      }
    }
  } else {
    /* flat faces: a box, or a gem (two pyramids on an octagon) */
    const face = (pts: number[][]) => {
      const [p0, p1, p2] = pts;
      const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const v = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const ids = pts.map((p) => vertex(p, n));
      for (let i = 1; i + 1 < ids.length; i++) m.indices.push(ids[0], ids[i], ids[i + 1]);
    };
    if (shape === "box") {
      const s = 0.4;
      const c = (x: number, y: number, z: number) => [x * s, y * s, z * s];
      face([c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1)]);
      face([c(1, -1, -1), c(-1, -1, -1), c(-1, 1, -1), c(1, 1, -1)]);
      face([c(1, -1, 1), c(1, -1, -1), c(1, 1, -1), c(1, 1, 1)]);
      face([c(-1, -1, -1), c(-1, -1, 1), c(-1, 1, 1), c(-1, 1, -1)]);
      face([c(-1, 1, 1), c(1, 1, 1), c(1, 1, -1), c(-1, 1, -1)]);
      face([c(-1, -1, -1), c(1, -1, -1), c(1, -1, 1), c(-1, -1, 1)]);
    } else {
      const k = 8;
      const ring = Array.from({ length: k }, (_, i) => [0.45 * Math.cos((i / k) * TAU), 0.1, -0.45 * Math.sin((i / k) * TAU)]);
      for (let i = 0; i < k; i++) {
        const [a, b2] = [ring[i], ring[(i + 1) % k]];
        face([a, b2, [0, 0.5, 0]]);
        face([b2, a, [0, -0.5, 0]]);
      }
    }
  }
  return m;
}

/** the corners of the box the positions fill */
export function boundsOf(positions: readonly number[]): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  return { min, max };
}

const f32 = (list: readonly number[]) => {
  const out = new Uint8Array(list.length * 4);
  const view = new DataView(out.buffer);
  list.forEach((v, i) => view.setFloat32(i * 4, v, true));
  return out;
};

/** the glTF of a mesh: its JSON, and the binary buffer its accessors point into */
function gltfParts(m: Mesh): { json: Record<string, unknown>; bin: Uint8Array } {
  const pos = f32(m.positions);
  const nor = f32(m.normals);
  const count = m.positions.length / 3;
  const wide = count > 65535;
  const idx = new Uint8Array(m.indices.length * (wide ? 4 : 2));
  const view = new DataView(idx.buffer);
  m.indices.forEach((v, i) => (wide ? view.setUint32(i * 4, v, true) : view.setUint16(i * 2, v, true)));
  const pad = (n: number) => (4 - (n % 4)) % 4;
  const bin = new Sink();
  bin.put(pos);
  bin.put(nor);
  bin.put(idx);
  for (let i = pad(bin.length); i > 0; i--) bin.byte(0);
  const { min, max } = boundsOf(m.positions);
  const json = {
    asset: { version: "2.0", generator: "M3E Canvas Pro mocks" },
    scene: 0,
    scenes: [{ name: m.name, nodes: [0] }],
    nodes: [{ name: m.name, mesh: 0 }],
    meshes: [{ name: m.name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0, mode: 4 }] }],
    materials: [{ name: "Mock", pbrMetallicRoughness: { baseColorFactor: [...m.color, 1], metallicFactor: 0, roughnessFactor: 0.55 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: "VEC3", min: min.map((v) => Math.fround(v)), max: max.map((v) => Math.fround(v)) },
      { bufferView: 1, componentType: 5126, count, type: "VEC3" },
      { bufferView: 2, componentType: wide ? 5125 : 5123, count: m.indices.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length, byteLength: nor.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length + nor.length, byteLength: idx.length, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  return { json, bin: bin.done() };
}

/** binary glTF: the JSON chunk (padded with spaces) and the BIN chunk (padded with zeros) */
export function glbOf(m: Mesh): Uint8Array {
  const { json, bin } = gltfParts(m);
  const text = utf8(JSON.stringify(json));
  const jsonPad = (4 - (text.length % 4)) % 4;
  const out = new Sink();
  const total = 12 + 8 + text.length + jsonPad + 8 + bin.length;
  out.ascii("glTF");
  out.u32le(2);
  out.u32le(total);
  out.u32le(text.length + jsonPad);
  out.u32le(0x4e4f534a);
  out.put(text);
  for (let i = 0; i < jsonPad; i++) out.byte(0x20);
  out.u32le(bin.length);
  out.u32le(0x004e4942);
  out.put(bin);
  return out.done();
}

/** glTF as JSON, its buffer inside as a data URL */
export function gltfOf(m: Mesh): string {
  const { json, bin } = gltfParts(m);
  (json.buffers as Record<string, unknown>[])[0].uri = `data:application/octet-stream;base64,${toBase64(bin)}`;
  return `${JSON.stringify(json, null, 2)}\n`;
}

const num = (v: number) => String(Math.round(v * 1e5) / 1e5);

/** Wavefront OBJ: positions, normals and faces, counted from 1 */
export function objOf(m: Mesh): string {
  const lines = [`# ${m.name.replace(/[\r\n]+/g, " ")}`, "# made by M3E Canvas Pro mocks", `o ${m.name.replace(/\s+/g, "_") || "mock"}`];
  for (let i = 0; i < m.positions.length; i += 3) lines.push(`v ${num(m.positions[i])} ${num(m.positions[i + 1])} ${num(m.positions[i + 2])}`);
  for (let i = 0; i < m.normals.length; i += 3) lines.push(`vn ${num(m.normals[i])} ${num(m.normals[i + 1])} ${num(m.normals[i + 2])}`);
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [m.indices[i] + 1, m.indices[i + 1] + 1, m.indices[i + 2] + 1];
    lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
  }
  return `${lines.join("\n")}\n`;
}

/** binary STL: a header that does not begin with "solid", then each triangle with its normal */
export function stlOf(m: Mesh): Uint8Array {
  const tris = m.indices.length / 3;
  const out = new Uint8Array(84 + tris * 50);
  const view = new DataView(out.buffer);
  out.set(utf8(`M3E mock mesh: ${m.name}`.replace(/^solid/i, "mesh").slice(0, 80)).subarray(0, 80));
  view.setUint32(80, tris, true);
  for (let t = 0; t < tris; t++) {
    const at = 84 + t * 50;
    const [a, b, c] = [m.indices[t * 3], m.indices[t * 3 + 1], m.indices[t * 3 + 2]].map((i) => m.positions.slice(i * 3, i * 3 + 3));
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    [...n.map((x) => x / len), ...a, ...b, ...c].forEach((x, k) => view.setFloat32(at + k * 4, x, true));
  }
  return out;
}

/** PLY in text: positions, normals and the mesh's color on every vertex */
export function plyOf(m: Mesh): string {
  const count = m.positions.length / 3;
  const [r, g, b] = m.color.map((v) => Math.round(v * 255));
  const lines = ["ply", "format ascii 1.0", "comment made by M3E Canvas Pro mocks", `element vertex ${count}`, "property float x", "property float y", "property float z", "property float nx", "property float ny", "property float nz", "property uchar red", "property uchar green", "property uchar blue", `element face ${m.indices.length / 3}`, "property list uchar int vertex_indices", "end_header"];
  for (let i = 0; i < count; i++) lines.push(`${num(m.positions[i * 3])} ${num(m.positions[i * 3 + 1])} ${num(m.positions[i * 3 + 2])} ${num(m.normals[i * 3])} ${num(m.normals[i * 3 + 1])} ${num(m.normals[i * 3 + 2])} ${r} ${g} ${b}`);
  for (let i = 0; i < m.indices.length; i += 3) lines.push(`3 ${m.indices[i]} ${m.indices[i + 1]} ${m.indices[i + 2]}`);
  return `${lines.join("\n")}\n`;
}
