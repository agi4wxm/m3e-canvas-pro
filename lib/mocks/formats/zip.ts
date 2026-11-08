/* Archives: ZIP (APPNOTE 6.3, the container of the Office files too) and tar (POSIX ustar). Names in UTF-8, every
 * date the same (1980-01-01 in ZIP, 1970 in tar), so the same files give the same bytes. */

import { utf8 } from "../bytes";
import { crc32, deflateRaw, Sink } from "./deflate";

export type ArchiveEntry = { name: string; data: Uint8Array | string };

const bytesOf = (d: Uint8Array | string) => (typeof d === "string" ? utf8(d) : d);

/** A ZIP of the entries in their order, each deflated when that makes it smaller. */
export function zip(entries: readonly ArchiveEntry[]): Uint8Array {
  const out = new Sink();
  const central = new Sink();
  for (const e of entries) {
    const data = bytesOf(e.data);
    const name = utf8(e.name);
    const packed = data.length > 64 ? deflateRaw(data) : data;
    const deflated = packed.length < data.length;
    const body = deflated ? packed : data;
    const crc = crc32(data);
    const offset = out.length;
    /* bit 11: the name is UTF-8; DOS time 0, date 1980-01-01 */
    const head = (s: Sink) => {
      s.u16le(20);
      s.u16le(0x0800);
      s.u16le(deflated ? 8 : 0);
      s.u16le(0);
      s.u16le(0x21);
      s.u32le(crc);
      s.u32le(body.length);
      s.u32le(data.length);
      s.u16le(name.length);
      s.u16le(0);
    };
    out.u32le(0x04034b50);
    head(out);
    out.put(name);
    out.put(body);
    central.u32le(0x02014b50);
    central.u16le(20);
    head(central);
    central.u16le(0);
    central.u16le(0);
    central.u16le(0);
    central.u32le(0);
    central.u32le(offset);
    central.put(name);
  }
  const at = out.length;
  const dir = central.done();
  out.put(dir);
  out.u32le(0x06054b50);
  out.u16le(0);
  out.u16le(0);
  out.u16le(entries.length);
  out.u16le(entries.length);
  out.u32le(dir.length);
  out.u32le(at);
  out.u16le(0);
  return out.done();
}

/** A tar archive (ustar): a header of 512 bytes before each file, two empty blocks at the end. */
export function tar(entries: readonly ArchiveEntry[]): Uint8Array {
  const out = new Sink();
  for (const e of entries) {
    const data = bytesOf(e.data);
    const head = new Uint8Array(512);
    const put = (at: number, s: string | Uint8Array, len: number) => head.set((typeof s === "string" ? utf8(s) : s).subarray(0, len), at);
    let name: Uint8Array = utf8(e.name);
    let prefix: Uint8Array = new Uint8Array(0);
    if (name.length > 100) {
      /* a long name is split at a slash into the prefix and the name, else cut */
      const text = e.name;
      const cut = text.lastIndexOf("/", 154);
      if (cut > 0 && utf8(text.slice(cut + 1)).length <= 100) {
        prefix = utf8(text.slice(0, cut));
        name = utf8(text.slice(cut + 1));
      } else name = name.subarray(0, 100);
    }
    put(0, name, 100);
    put(100, "0000644\0", 8);
    put(108, "0000000\0", 8);
    put(116, "0000000\0", 8);
    put(124, `${data.length.toString(8).padStart(11, "0")}\0`, 12);
    put(136, "00000000000\0", 12);
    put(148, "        ", 8);
    put(156, "0", 1);
    put(257, "ustar\0", 6);
    put(263, "00", 2);
    put(345, prefix, 155);
    let sum = 0;
    for (const b of head) sum += b;
    put(148, `${sum.toString(8).padStart(6, "0")}\0 `, 8);
    out.put(head);
    out.put(data);
    if (data.length % 512) out.put(new Uint8Array(512 - (data.length % 512)));
  }
  out.put(new Uint8Array(1024));
  return out.done();
}
