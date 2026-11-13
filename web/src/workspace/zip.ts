/**
 * A small ZIP writer and reader for the export bundle (spec 04 design "Export bundle").
 *
 * Entries are stored, not compressed: bundles are a few text files, and a stored archive is
 * byte-for-byte reproducible and easy to inspect. The reader accepts only what the writer makes
 * (stored entries, no zip64, no encryption) and refuses anything else with a plain message.
 */

export type ZipEntry = { path: string; text: string };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date words for a UTC instant (years 1980 to 2107). */
function dosStamp(at: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, at.getUTCFullYear()));
  return {
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  };
}

export function writeZip(entries: readonly ZipEntry[], at: Date): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosStamp(at);
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const data = encoder.encode(entry.text);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, data);

    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 20, true);
    head.setUint16(8, 0x0800, true);
    head.setUint16(10, 0, true);
    head.setUint16(12, time, true);
    head.setUint16(14, date, true);
    head.setUint32(16, crc, true);
    head.setUint32(20, data.length, true);
    head.setUint32(24, data.length, true);
    head.setUint16(28, name.length, true);
    head.setUint32(42, offset, true);
    central.push(new Uint8Array(head.buffer), name);

    offset += 30 + name.length + data.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, c) => n + c.length, 0));
  let position = 0;
  for (const part of parts) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}

export class ZipReadError extends Error {}

export function readZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipReadError('This file is not a zip archive.');
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  try {
    for (let n = 0; n < count; n++) {
      if (view.getUint32(p, true) !== 0x02014b50) throw new ZipReadError('The zip directory is damaged.');
      const method = view.getUint16(p + 10, true);
      const crc = view.getUint32(p + 16, true);
      const size = view.getUint32(p + 24, true);
      const nameLength = view.getUint16(p + 28, true);
      const extraLength = view.getUint16(p + 30, true);
      const commentLength = view.getUint16(p + 32, true);
      const local = view.getUint32(p + 42, true);
      const path = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
      if (method !== 0) throw new ZipReadError(`${path} is compressed; only bundles made by Buried can be read.`);
      if (view.getUint32(local, true) !== 0x04034b50) throw new ZipReadError('The zip contents are damaged.');
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      if (data.length !== size || crc32(data) !== crc) throw new ZipReadError(`${path} is damaged (checksum mismatch).`);
      entries.push({ path, text: decoder.decode(data) });
      p += 46 + nameLength + extraLength + commentLength;
    }
  } catch (error) {
    if (error instanceof ZipReadError) throw error;
    throw new ZipReadError('The zip file is damaged.');
  }
  return entries;
}
