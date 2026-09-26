/**
 * EXIF reading and metadata removal, written from the byte layout up.
 *
 * Three containers are understood, and only three:
 *
 *  - JPEG: a chain of `FF xx` segments. Metadata lives in the APPn segments —
 *    Exif in APP1 with an `Exif\0\0` prefix, XMP in another APP1, IPTC inside
 *    the Photoshop IRB in APP13, ICC in APP2.
 *  - PNG: a chain of length-prefixed chunks. Exif lives in `eXIf`, free text in
 *    `tEXt` / `iTXt` / `zTXt`.
 *  - TIFF: the Exif IFD structure directly, no wrapper.
 *
 * Inside Exif itself the format is TIFF: a header naming the byte order, then
 * a linked list of IFDs, each a table of 12-byte entries. Values of four bytes
 * or fewer sit inside the entry; anything longer is an offset from the start of
 * the TIFF block. That offset-based design is why the parser carries the TIFF
 * block as its own `Uint8Array` and bounds-checks every read: a truncated or
 * hostile file otherwise walks off the end or loops forever, and this runs in
 * the reader's tab.
 *
 * Removal is a real rewrite, not a flag: the segments or chunks are dropped and
 * the remaining bytes are copied through untouched, so the compressed image
 * data is bit-identical and nothing is recoverable from the output. TIFF is
 * read-only here — stripping it would mean rebuilding every IFD and rewriting
 * every strip offset, and a half-correct TIFF writer is worse than none.
 */

/** Anything larger is refused rather than read into memory twice. */
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
/** A malformed IFD can claim 65535 entries per table; stop long before that. */
export const MAX_FIELDS = 4096;
/** An ASCII field is not a document. Long values are cut with an ellipsis. */
export const MAX_TEXT_CHARS = 512;

export type Container = 'jpeg' | 'png' | 'tiff' | 'unknown';
export type IfdName = 'ifd0' | 'exif' | 'gps' | 'interop' | 'ifd1';

export type BlockKind =
  | 'exif'
  | 'xmp'
  | 'photoshop'
  | 'icc'
  | 'comment'
  | 'app'
  | 'text'
  | 'time';

/** One removable run of bytes, addressed by its offset in the original file. */
export type MetaBlock = {
  /** Stable id: the container plus the byte offset the block starts at. */
  id: string;
  kind: BlockKind;
  /** What it is called in the spec, e.g. `APP1 Exif`, `iTXt`. */
  label: string;
  offset: number;
  /** Bytes the whole block occupies, marker/length/CRC included. */
  bytes: number;
  /** True when it can carry data about the person or the place. */
  identifying: boolean;
  /** Set when dropping it changes how the image is decoded or displayed. */
  affectsRendering: boolean;
};

export type Field = {
  ifd: IfdName;
  tag: number;
  name: string;
  typeName: string;
  count: number;
  /** Display form: already formatted, already length-capped. */
  value: string;
  /** True for GPS, serial numbers and owner names. */
  identifying: boolean;
};

export type GpsFix = {
  latitude: number;
  longitude: number;
  /** Metres above sea level; negative below. Absent when not recorded. */
  altitude?: number;
  /** `25.033889, 121.564444` — six decimals is about 0.1 m. */
  decimal: string;
  /** UTC timestamp assembled from GPSDateStamp + GPSTimeStamp, when present. */
  utc?: string;
};

export type Summary = {
  make?: string;
  model?: string;
  lens?: string;
  software?: string;
  dateTaken?: string;
  orientation?: string;
  exposure?: string;
  pixels?: string;
  serial?: string;
};

export type MetadataReport = {
  container: Container;
  fileBytes: number;
  fields: Field[];
  gps: GpsFix | null;
  summary: Summary;
  blocks: MetaBlock[];
  /** True when this container can be rewritten without metadata. */
  removable: boolean;
  warnings: string[];
};

/* ── byte readers ─────────────────────────── */

function u16be(data: Uint8Array, at: number): number {
  return (data[at] << 8) | data[at + 1];
}

function u32be(data: Uint8Array, at: number): number {
  return ((data[at] << 24) | (data[at + 1] << 16) | (data[at + 2] << 8) | data[at + 3]) >>> 0;
}

function ascii(data: Uint8Array, at: number, length: number): string {
  let out = '';
  for (let i = 0; i < length && at + i < data.length; i += 1) out += String.fromCharCode(data[at + i]);
  return out;
}

/* ── JPEG segments ────────────────────────── */

export type JpegSegment = {
  marker: number;
  /** Offset of the `FF` byte. */
  offset: number;
  payloadOffset: number;
  payloadLength: number;
  /** Bytes from the marker to the end of the payload. */
  totalLength: number;
};

/**
 * The JPEG header as a list of segments, stopping at the first scan.
 *
 * Parsing stops at SOS because entropy-coded data is not marker-delimited in
 * any useful way (it contains stuffed `FF 00` pairs and restart markers), and
 * because metadata after the first scan does not occur in files cameras and
 * phones produce. Everything from `tailOffset` on is copied verbatim on strip,
 * so stopping early can only ever keep bytes, never corrupt them.
 */
export function scanJpegSegments(data: Uint8Array): { segments: JpegSegment[]; tailOffset: number } {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    throw new Error('not a JPEG: missing SOI (FF D8)');
  }
  const segments: JpegSegment[] = [];
  let i = 2;
  while (i + 1 < data.length) {
    if (data[i] !== 0xff) throw new Error(`expected a marker at byte ${i}`);
    // Fill bytes: any number of FFs may precede the marker code.
    let code = data[i + 1];
    let skip = 0;
    while (code === 0xff && i + 2 + skip < data.length) {
      skip += 1;
      code = data[i + 1 + skip];
    }
    const markerAt = i + skip;
    if (code === 0xd8 || code === 0xd9 || code === 0x01 || (code >= 0xd0 && code <= 0xd7)) {
      i = markerAt + 2;
      continue;
    }
    if (code === 0xda) return { segments, tailOffset: markerAt };
    if (markerAt + 4 > data.length) throw new Error(`segment at byte ${markerAt} is truncated`);
    const length = u16be(data, markerAt + 2);
    if (length < 2) throw new Error(`segment FF${code.toString(16)} declares an impossible length`);
    if (markerAt + 2 + length > data.length) {
      throw new Error(`segment FF${code.toString(16)} at byte ${markerAt} runs past the end of the file`);
    }
    segments.push({
      marker: code,
      offset: markerAt,
      payloadOffset: markerAt + 4,
      payloadLength: length - 2,
      totalLength: 2 + length,
    });
    i = markerAt + 2 + length;
  }
  return { segments, tailOffset: data.length };
}

/* ── PNG chunks ───────────────────────────── */

export type PngChunk = {
  type: string;
  offset: number;
  dataOffset: number;
  dataLength: number;
  /** length + type + data + CRC. */
  totalLength: number;
};

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function scanPngChunks(data: Uint8Array): PngChunk[] {
  if (data.length < 8) throw new Error('not a PNG: file is too short');
  for (let i = 0; i < 8; i += 1) {
    if (data[i] !== PNG_MAGIC[i]) throw new Error('not a PNG: bad signature');
  }
  const chunks: PngChunk[] = [];
  let i = 8;
  while (i + 8 <= data.length) {
    const length = u32be(data, i);
    if (i + 12 + length > data.length) throw new Error(`chunk at byte ${i} runs past the end of the file`);
    const type = ascii(data, i + 4, 4);
    chunks.push({ type, offset: i, dataOffset: i + 8, dataLength: length, totalLength: length + 12 });
    i += length + 12;
    if (type === 'IEND') break;
  }
  return chunks;
}

/* ── TIFF / Exif ──────────────────────────── */

const TYPE_SIZES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
const TYPE_NAMES = [
  '?', 'BYTE', 'ASCII', 'SHORT', 'LONG', 'RATIONAL',
  'SBYTE', 'UNDEFINED', 'SSHORT', 'SLONG', 'SRATIONAL', 'FLOAT', 'DOUBLE',
];

export type Entry = {
  tag: number;
  type: number;
  count: number;
  text?: string;
  numbers: number[];
  /** numerator/denominator pairs, kept so `1/200` survives as written. */
  ratios?: [number, number][];
};

export type TiffBlock = {
  byteOrder: 'little' | 'big';
  ifds: { name: IfdName; entries: Entry[] }[];
  warnings: string[];
};

/**
 * Reads a TIFF block: header, IFD0, IFD1, and the Exif / GPS / Interop
 * sub-IFDs that IFD0 points at.
 *
 * Offsets are relative to the start of this block, which is why it is passed in
 * as its own array rather than as an offset into the file.
 */
export function parseTiffBlock(block: Uint8Array): TiffBlock {
  const warnings: string[] = [];
  if (block.length < 8) throw new Error('TIFF block is shorter than its header');
  const order = ascii(block, 0, 2);
  let little: boolean;
  if (order === 'II') little = true;
  else if (order === 'MM') little = false;
  else throw new Error(`unknown byte order marker ${JSON.stringify(order)}`);

  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);

  if (u16(2) !== 42) throw new Error('TIFF magic number 42 is missing');
  const first = u32(4);

  const ifds: { name: IfdName; entries: Entry[] }[] = [];
  const seen = new Set<number>();
  let fieldBudget = MAX_FIELDS;

  const readEntry = (at: number): Entry | null => {
    const tag = u16(at);
    const type = u16(at + 2);
    const count = u32(at + 4);
    if (type < 1 || type > 12) {
      warnings.push(`tag 0x${tag.toString(16)} has unknown type ${type}; skipped`);
      return null;
    }
    const unit = TYPE_SIZES[type];
    const size = unit * count;
    if (!Number.isSafeInteger(size) || size > block.length) {
      warnings.push(`tag 0x${tag.toString(16)} claims ${count} values, more than the block holds; skipped`);
      return null;
    }
    const at0 = size <= 4 ? at + 8 : u32(at + 8);
    if (at0 + size > block.length) {
      warnings.push(`tag 0x${tag.toString(16)} points outside the Exif block; skipped`);
      return null;
    }

    const entry: Entry = { tag, type, count, numbers: [] };
    if (type === 2) {
      // ASCII: NUL-terminated by spec, but trailing NULs and padding are common.
      let text = '';
      for (let i = 0; i < size; i += 1) {
        const c = block[at0 + i];
        if (c === 0) break;
        text += String.fromCharCode(c);
      }
      entry.text = text.trim();
      return entry;
    }
    if (type === 7 || type === 1 || type === 6) {
      // UNDEFINED / BYTE: keep a capped numeric view; these are blobs.
      const take = Math.min(count, 64);
      for (let i = 0; i < take; i += 1) entry.numbers.push(block[at0 + i]);
      return entry;
    }
    const take = Math.min(count, 256);
    for (let i = 0; i < take; i += 1) {
      const p = at0 + i * unit;
      if (type === 3) entry.numbers.push(u16(p));
      else if (type === 8) entry.numbers.push(view.getInt16(p, little));
      else if (type === 4) entry.numbers.push(u32(p));
      else if (type === 9) entry.numbers.push(view.getInt32(p, little));
      else if (type === 11) entry.numbers.push(view.getFloat32(p, little));
      else if (type === 12) entry.numbers.push(view.getFloat64(p, little));
      else if (type === 5 || type === 10) {
        const n = type === 5 ? u32(p) : view.getInt32(p, little);
        const d = type === 5 ? u32(p + 4) : view.getInt32(p + 4, little);
        entry.ratios ??= [];
        entry.ratios.push([n, d]);
        entry.numbers.push(d === 0 ? Number.NaN : n / d);
      }
    }
    return entry;
  };

  const readIfd = (name: IfdName, at: number): number => {
    if (at === 0 || at + 2 > block.length) return 0;
    if (seen.has(at)) {
      warnings.push(`IFD at offset ${at} links back to itself; stopped`);
      return 0;
    }
    seen.add(at);
    const declared = u16(at);
    const room = Math.floor((block.length - at - 2) / 12);
    const count = Math.min(declared, room, fieldBudget);
    if (count < declared) {
      warnings.push(`IFD at offset ${at} declares ${declared} entries; read ${count}`);
    }
    fieldBudget -= count;
    const entries: Entry[] = [];
    const subs: [IfdName, number][] = [];
    for (let i = 0; i < count; i += 1) {
      const entry = readEntry(at + 2 + i * 12);
      if (!entry) continue;
      if (entry.tag === 0x8769 || entry.tag === 0x8825 || entry.tag === 0xa005) {
        const target = entry.numbers[0] ?? 0;
        const sub: IfdName = entry.tag === 0x8769 ? 'exif' : entry.tag === 0x8825 ? 'gps' : 'interop';
        if (target > 0) subs.push([sub, target]);
        continue; // the pointer itself is plumbing, not a field
      }
      entries.push(entry);
    }
    ifds.push({ name, entries });
    for (const [sub, target] of subs) readIfd(sub, target);
    const nextAt = at + 2 + count * 12;
    return nextAt + 4 <= block.length ? u32(nextAt) : 0;
  };

  const second = readIfd('ifd0', first);
  if (second) readIfd('ifd1', second);
  return { byteOrder: little ? 'little' : 'big', ifds, warnings };
}

/* ── tag names and value shaping ──────────── */

const TIFF_TAGS: Record<number, string> = {
  0x0100: 'ImageWidth', 0x0101: 'ImageLength', 0x0102: 'BitsPerSample',
  0x0103: 'Compression', 0x0106: 'PhotometricInterpretation', 0x010e: 'ImageDescription',
  0x010f: 'Make', 0x0110: 'Model', 0x0111: 'StripOffsets', 0x0112: 'Orientation',
  0x0115: 'SamplesPerPixel', 0x011a: 'XResolution', 0x011b: 'YResolution',
  0x0128: 'ResolutionUnit', 0x0131: 'Software', 0x0132: 'DateTime',
  0x013b: 'Artist', 0x013e: 'WhitePoint', 0x013f: 'PrimaryChromaticities',
  0x0201: 'JPEGInterchangeFormat', 0x0202: 'JPEGInterchangeFormatLength',
  0x0211: 'YCbCrCoefficients', 0x0213: 'YCbCrPositioning',
  0x0214: 'ReferenceBlackWhite', 0x8298: 'Copyright', 0xc4a5: 'PrintIM',
};

const EXIF_TAGS: Record<number, string> = {
  0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8822: 'ExposureProgram',
  0x8827: 'ISOSpeedRatings', 0x8830: 'SensitivityType', 0x8832: 'RecommendedExposureIndex',
  0x9000: 'ExifVersion', 0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized',
  0x9010: 'OffsetTime', 0x9011: 'OffsetTimeOriginal', 0x9012: 'OffsetTimeDigitized',
  0x9101: 'ComponentsConfiguration', 0x9102: 'CompressedBitsPerPixel',
  0x9201: 'ShutterSpeedValue', 0x9202: 'ApertureValue', 0x9203: 'BrightnessValue',
  0x9204: 'ExposureBiasValue', 0x9205: 'MaxApertureValue', 0x9206: 'SubjectDistance',
  0x9207: 'MeteringMode', 0x9208: 'LightSource', 0x9209: 'Flash',
  0x920a: 'FocalLength', 0x927c: 'MakerNote', 0x9286: 'UserComment',
  0x9290: 'SubSecTime', 0x9291: 'SubSecTimeOriginal', 0x9292: 'SubSecTimeDigitized',
  0xa000: 'FlashpixVersion', 0xa001: 'ColorSpace', 0xa002: 'PixelXDimension',
  0xa003: 'PixelYDimension', 0xa20e: 'FocalPlaneXResolution',
  0xa20f: 'FocalPlaneYResolution', 0xa210: 'FocalPlaneResolutionUnit',
  0xa217: 'SensingMethod', 0xa300: 'FileSource', 0xa301: 'SceneType',
  0xa302: 'CFAPattern', 0xa401: 'CustomRendered', 0xa402: 'ExposureMode',
  0xa403: 'WhiteBalance', 0xa404: 'DigitalZoomRatio', 0xa405: 'FocalLengthIn35mmFilm',
  0xa406: 'SceneCaptureType', 0xa407: 'GainControl', 0xa408: 'Contrast',
  0xa409: 'Saturation', 0xa40a: 'Sharpness', 0xa40c: 'SubjectDistanceRange',
  0xa420: 'ImageUniqueID', 0xa430: 'CameraOwnerName', 0xa431: 'BodySerialNumber',
  0xa432: 'LensSpecification', 0xa433: 'LensMake', 0xa434: 'LensModel',
  0xa435: 'LensSerialNumber', 0xa460: 'CompositeImage',
};

const GPS_TAGS: Record<number, string> = {
  0x0000: 'GPSVersionID', 0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude',
  0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude', 0x0005: 'GPSAltitudeRef',
  0x0006: 'GPSAltitude', 0x0007: 'GPSTimeStamp', 0x0008: 'GPSSatellites',
  0x0009: 'GPSStatus', 0x000a: 'GPSMeasureMode', 0x000b: 'GPSDOP',
  0x000c: 'GPSSpeedRef', 0x000d: 'GPSSpeed', 0x000e: 'GPSTrackRef',
  0x000f: 'GPSTrack', 0x0010: 'GPSImgDirectionRef', 0x0011: 'GPSImgDirection',
  0x0012: 'GPSMapDatum', 0x0013: 'GPSDestLatitudeRef', 0x0014: 'GPSDestLatitude',
  0x0015: 'GPSDestLongitudeRef', 0x0016: 'GPSDestLongitude',
  0x001b: 'GPSProcessingMethod', 0x001c: 'GPSAreaInformation',
  0x001d: 'GPSDateStamp', 0x001e: 'GPSDifferential', 0x001f: 'GPSHPositioningError',
};

const INTEROP_TAGS: Record<number, string> = {
  0x0001: 'InteroperabilityIndex', 0x0002: 'InteroperabilityVersion',
};

/** Enumerated values from Exif 2.32. Unlisted codes are shown as numbers. */
const ENUMS: Record<string, Record<number, string>> = {
  Orientation: {
    1: '1 — normal', 2: '2 — mirrored', 3: '3 — rotated 180°',
    4: '4 — mirrored, 180°', 5: '5 — mirrored, 90° CW', 6: '6 — rotated 90° CW',
    7: '7 — mirrored, 90° CCW', 8: '8 — rotated 90° CCW',
  },
  ResolutionUnit: { 1: 'none', 2: 'inch', 3: 'cm' },
  ColorSpace: { 1: 'sRGB', 0xffff: 'uncalibrated' },
  ExposureProgram: {
    0: 'not defined', 1: 'manual', 2: 'program', 3: 'aperture priority',
    4: 'shutter priority', 5: 'creative', 6: 'action', 7: 'portrait', 8: 'landscape',
  },
  MeteringMode: {
    0: 'unknown', 1: 'average', 2: 'centre weighted', 3: 'spot', 4: 'multi spot',
    5: 'pattern', 6: 'partial', 255: 'other',
  },
  LightSource: {
    0: 'unknown', 1: 'daylight', 2: 'fluorescent', 3: 'tungsten', 4: 'flash',
    9: 'fine weather', 10: 'cloudy', 11: 'shade', 255: 'other',
  },
  WhiteBalance: { 0: 'auto', 1: 'manual' },
  ExposureMode: { 0: 'auto', 1: 'manual', 2: 'auto bracket' },
  SceneCaptureType: { 0: 'standard', 1: 'landscape', 2: 'portrait', 3: 'night' },
  SensingMethod: {
    1: 'not defined', 2: 'one-chip colour area', 3: 'two-chip colour area',
    4: 'three-chip colour area', 5: 'colour sequential area', 7: 'trilinear',
    8: 'colour sequential linear',
  },
  CustomRendered: { 0: 'normal', 1: 'custom' },
  Contrast: { 0: 'normal', 1: 'soft', 2: 'hard' },
  Saturation: { 0: 'normal', 1: 'low', 2: 'high' },
  Sharpness: { 0: 'normal', 1: 'soft', 2: 'hard' },
  GainControl: { 0: 'none', 1: 'low gain up', 2: 'high gain up', 3: 'low gain down', 4: 'high gain down' },
  SubjectDistanceRange: { 0: 'unknown', 1: 'macro', 2: 'close', 3: 'distant' },
  GPSAltitudeRef: { 0: 'above sea level', 1: 'below sea level' },
};

/** Tags whose content identifies a person, a device or a place. */
const IDENTIFYING = new Set([
  'Make', 'Model', 'Artist', 'Copyright', 'ImageDescription', 'Software',
  'DateTime', 'DateTimeOriginal', 'DateTimeDigitized', 'CameraOwnerName',
  'BodySerialNumber', 'LensSerialNumber', 'ImageUniqueID', 'UserComment',
  'MakerNote', 'LensModel', 'LensMake',
]);

export function tagName(ifd: IfdName, tag: number): string {
  const table =
    ifd === 'gps' ? GPS_TAGS : ifd === 'interop' ? INTEROP_TAGS : ifd === 'exif' ? EXIF_TAGS : TIFF_TAGS;
  return table[tag] ?? `Tag 0x${tag.toString(16).padStart(4, '0')}`;
}

function cap(text: string): string {
  return text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}…(${text.length} chars)` : text;
}

function trimNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(6)));
}

/** Degrees as `25° 2' 3.6"`, the way a camera writes the three rationals. */
function dms(values: number[]): string {
  const [d = 0, m = 0, s = 0] = values;
  return `${trimNumber(d)}° ${trimNumber(m)}' ${trimNumber(s)}"`;
}

/**
 * The display string for one entry.
 *
 * Exposure is the case that matters: cameras store 1/200 s as the rational
 * 1/200, and printing its decimal (0.005) is technically right and practically
 * useless, so the numerator and denominator are kept as written.
 */
export function formatEntry(ifd: IfdName, entry: Entry): string {
  const name = tagName(ifd, entry.tag);
  if (entry.text !== undefined) return cap(entry.text);

  if (name === 'ExposureTime' && entry.ratios?.length) {
    const [n, d] = entry.ratios[0];
    if (d === 0) return '—';
    if (n === 0) return '0 s';
    return n >= d ? `${trimNumber(n / d)} s` : `1/${trimNumber(Number((d / n).toFixed(1)))} s`;
  }
  if (name === 'ShutterSpeedValue' && entry.numbers.length) {
    const ev = entry.numbers[0];
    return Number.isFinite(ev) ? `${trimNumber(ev)} EV (≈1/${trimNumber(Math.round(2 ** ev))} s)` : '—';
  }
  if ((name === 'FNumber' || name === 'MaxApertureValue' || name === 'ApertureValue') && entry.numbers.length) {
    const v = name === 'FNumber' ? entry.numbers[0] : Math.SQRT2 ** entry.numbers[0];
    return Number.isFinite(v) ? `f/${trimNumber(Number(v.toFixed(2)))}` : '—';
  }
  if (name === 'FocalLength' && entry.numbers.length) return `${trimNumber(entry.numbers[0])} mm`;
  if (name === 'FocalLengthIn35mmFilm' && entry.numbers.length) return `${trimNumber(entry.numbers[0])} mm`;
  if (name === 'ExposureBiasValue' && entry.numbers.length) {
    const v = entry.numbers[0];
    return `${v > 0 ? '+' : ''}${trimNumber(v)} EV`;
  }
  if (name === 'Flash' && entry.numbers.length) {
    const v = entry.numbers[0];
    const parts = [(v & 1) === 1 ? 'fired' : 'did not fire'];
    if ((v & 0x18) === 0x10) parts.push('mode: off');
    if ((v & 0x18) === 0x08) parts.push('mode: on');
    if ((v & 0x18) === 0x18) parts.push('mode: auto');
    if ((v & 0x20) === 0x20) parts.push('no flash function');
    if ((v & 0x40) === 0x40) parts.push('red-eye reduction');
    return `0x${v.toString(16)} — ${parts.join(', ')}`;
  }
  if ((name === 'GPSLatitude' || name === 'GPSLongitude' || name === 'GPSDestLatitude' || name === 'GPSDestLongitude') && entry.numbers.length) {
    return dms(entry.numbers);
  }
  if (name === 'GPSTimeStamp' && entry.numbers.length === 3) {
    const [h, m, s] = entry.numbers;
    return `${pad2(h)}:${pad2(m)}:${pad2(Math.floor(s))} UTC`;
  }
  if (name === 'GPSAltitude' && entry.numbers.length) return `${trimNumber(entry.numbers[0])} m`;
  if ((name === 'ExifVersion' || name === 'FlashpixVersion') && entry.numbers.length) {
    return entry.numbers.map((c) => String.fromCharCode(c)).join('');
  }
  if (name === 'GPSVersionID') return entry.numbers.join('.');

  const table = ENUMS[name];
  if (table && entry.numbers.length === 1) {
    const hit = table[entry.numbers[0]];
    if (hit) return hit;
  }
  if (entry.type === 7 || entry.type === 1 || entry.type === 6) {
    const shown = entry.numbers.map((b) => b.toString(16).padStart(2, '0')).join(' ');
    return entry.count > entry.numbers.length ? `${shown} …(${entry.count} bytes)` : shown || '(empty)';
  }
  if (entry.ratios?.length && entry.ratios.length === entry.numbers.length) {
    return entry.ratios
      .map(([n, d], i) => (d === 1 ? trimNumber(n) : `${n}/${d} (${trimNumber(entry.numbers[i])})`))
      .join(', ');
  }
  const shown = entry.numbers.map(trimNumber).join(', ');
  return entry.count > entry.numbers.length ? `${shown} …(${entry.count} values)` : shown || '(empty)';
}

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

/* ── GPS ──────────────────────────────────── */

/**
 * Degrees/minutes/seconds to a signed decimal degree.
 *
 * The reference letter carries the sign — S and W are negative — and it is a
 * separate tag from the numbers, so a file can and does turn up with one and
 * not the other. Missing minutes and seconds are treated as zero, because some
 * devices write the whole angle into the degrees rational.
 */
export function dmsToDecimal(parts: number[], ref: string): number {
  if (parts.length === 0) throw new Error('no degrees value');
  const [d, m = 0, s = 0] = parts;
  for (const v of [d, m, s]) {
    if (!Number.isFinite(v)) throw new Error('degrees, minutes and seconds must be finite numbers');
  }
  const magnitude = Math.abs(d) + Math.abs(m) / 60 + Math.abs(s) / 3600;
  const letter = ref.trim().toUpperCase().charAt(0);
  if (letter !== 'N' && letter !== 'S' && letter !== 'E' && letter !== 'W') {
    throw new Error(`unknown hemisphere reference ${JSON.stringify(ref)}`);
  }
  const sign = letter === 'S' || letter === 'W' ? -1 : 1;
  return sign * magnitude;
}

function gpsFrom(entries: Entry[], warnings: string[]): GpsFix | null {
  const by = new Map<number, Entry>();
  for (const entry of entries) by.set(entry.tag, entry);
  const lat = by.get(0x0002);
  const latRef = by.get(0x0001);
  const lon = by.get(0x0004);
  const lonRef = by.get(0x0003);
  if (!lat || !lon) return null;
  if (!latRef?.text || !lonRef?.text) {
    warnings.push('GPS coordinates are present but the N/S/E/W reference is missing; hemisphere unknown');
    return null;
  }
  let latitude: number;
  let longitude: number;
  try {
    latitude = dmsToDecimal(lat.numbers, latRef.text);
    longitude = dmsToDecimal(lon.numbers, lonRef.text);
  } catch (problem) {
    warnings.push(`GPS coordinates could not be read: ${problem instanceof Error ? problem.message : String(problem)}`);
    return null;
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    warnings.push('GPS coordinates are out of range; the file may be damaged');
    return null;
  }
  const fix: GpsFix = {
    latitude,
    longitude,
    decimal: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
  };
  const alt = by.get(0x0006);
  if (alt && Number.isFinite(alt.numbers[0])) {
    const below = (by.get(0x0005)?.numbers[0] ?? 0) === 1;
    fix.altitude = (below ? -1 : 1) * alt.numbers[0];
  }
  const date = by.get(0x001d)?.text;
  const time = by.get(0x0007);
  if (date && time && time.numbers.length === 3) {
    fix.utc = `${date.replace(/:/g, '-')} ${pad2(time.numbers[0])}:${pad2(time.numbers[1])}:${pad2(Math.floor(time.numbers[2]))} UTC`;
  } else if (date) {
    fix.utc = date.replace(/:/g, '-');
  }
  return fix;
}

/* ── container walk ───────────────────────── */

const EXIF_PREFIX = 'Exif\0\0';
const XMP_NS = 'http://ns.adobe.com/x';

function jpegBlock(data: Uint8Array, segment: JpegSegment): MetaBlock | null {
  const marker = segment.marker;
  const head = ascii(data, segment.payloadOffset, Math.min(32, segment.payloadLength));
  const base = { id: `jpeg:${segment.offset}`, offset: segment.offset, bytes: segment.totalLength };
  if (marker === 0xfe) {
    return { ...base, kind: 'comment', label: 'COM comment', identifying: true, affectsRendering: false };
  }
  if (marker === 0xe1 && head.startsWith(EXIF_PREFIX)) {
    return { ...base, kind: 'exif', label: 'APP1 Exif', identifying: true, affectsRendering: false };
  }
  // Both the main XMP packet and Adobe's extended-XMP packet start this way.
  if (marker === 0xe1 && head.startsWith(XMP_NS)) {
    return { ...base, kind: 'xmp', label: 'APP1 XMP', identifying: true, affectsRendering: false };
  }
  if (marker === 0xed) {
    return { ...base, kind: 'photoshop', label: 'APP13 Photoshop / IPTC', identifying: true, affectsRendering: false };
  }
  if (marker === 0xe2 && head.startsWith('ICC_PROFILE')) {
    return { ...base, kind: 'icc', label: 'APP2 ICC profile', identifying: false, affectsRendering: true };
  }
  if (marker === 0xe2 && head.startsWith('MPF')) {
    return { ...base, kind: 'app', label: 'APP2 MPF (embedded images)', identifying: true, affectsRendering: false };
  }
  if (marker === 0xe0) {
    return { ...base, kind: 'app', label: 'APP0 JFIF', identifying: false, affectsRendering: true };
  }
  if (marker === 0xee) {
    return { ...base, kind: 'app', label: 'APP14 Adobe', identifying: false, affectsRendering: true };
  }
  if (marker >= 0xe0 && marker <= 0xef) {
    const tag = head.split('\0')[0].replace(/[^\x20-\x7e]/g, '');
    return {
      ...base,
      kind: 'app',
      label: `APP${marker - 0xe0}${tag ? ` ${tag.slice(0, 16)}` : ''}`,
      identifying: true,
      affectsRendering: false,
    };
  }
  return null;
}

/** tEXt is Latin-1 `keyword\0text`; uncompressed iTXt is UTF-8 with two extra strings. */
function pngTextField(data: Uint8Array, chunk: PngChunk): Field | null {
  const body = data.subarray(chunk.dataOffset, chunk.dataOffset + chunk.dataLength);
  const nul = body.indexOf(0);
  if (nul < 0) return null;
  const keyword = ascii(body, 0, nul);
  const make = (value: string): Field => ({
    ifd: 'ifd0',
    tag: 0,
    name: `${chunk.type}:${keyword}`,
    typeName: 'TEXT',
    count: value.length,
    value: cap(value),
    identifying: true,
  });
  if (chunk.type === 'tEXt') {
    let text = '';
    for (let i = nul + 1; i < body.length; i += 1) text += String.fromCharCode(body[i]);
    return make(text);
  }
  if (chunk.type === 'iTXt') {
    const compressed = body[nul + 1] === 1;
    if (compressed) return make('(zlib-compressed; not decoded here)');
    let at = nul + 3;
    for (let skipped = 0; skipped < 2 && at < body.length; skipped += 1) {
      const next = body.indexOf(0, at);
      if (next < 0) return null;
      at = next + 1;
    }
    return make(new TextDecoder().decode(body.subarray(at)));
  }
  return null;
}

function fieldsFrom(block: TiffBlock): Field[] {
  const out: Field[] = [];
  for (const ifd of block.ifds) {
    for (const entry of ifd.entries) {
      const name = tagName(ifd.name, entry.tag);
      out.push({
        ifd: ifd.name,
        tag: entry.tag,
        name,
        typeName: TYPE_NAMES[entry.type] ?? String(entry.type),
        count: entry.count,
        value: formatEntry(ifd.name, entry),
        identifying: ifd.name === 'gps' || IDENTIFYING.has(name),
      });
    }
  }
  return out;
}

function summaryFrom(fields: Field[]): Summary {
  const pick = (ifd: IfdName, name: string) =>
    fields.find((f) => f.ifd === ifd && f.name === name)?.value;
  const exposure = [pick('exif', 'ExposureTime'), pick('exif', 'FNumber'), pick('exif', 'FocalLength')]
    .filter(Boolean)
    .join('  ·  ');
  const iso = pick('exif', 'ISOSpeedRatings');
  const width = pick('exif', 'PixelXDimension') ?? pick('ifd0', 'ImageWidth');
  const height = pick('exif', 'PixelYDimension') ?? pick('ifd0', 'ImageLength');
  const summary: Summary = {};
  const make = pick('ifd0', 'Make');
  const model = pick('ifd0', 'Model');
  if (make) summary.make = make;
  if (model) summary.model = model;
  const lens = pick('exif', 'LensModel');
  if (lens) summary.lens = lens;
  const software = pick('ifd0', 'Software');
  if (software) summary.software = software;
  const taken = pick('exif', 'DateTimeOriginal') ?? pick('ifd0', 'DateTime');
  if (taken) summary.dateTaken = taken;
  const orientation = pick('ifd0', 'Orientation');
  if (orientation) summary.orientation = orientation;
  const full = [exposure, iso ? `ISO ${iso}` : ''].filter(Boolean).join('  ·  ');
  if (full) summary.exposure = full;
  if (width && height) summary.pixels = `${width} × ${height}`;
  const serial = pick('exif', 'BodySerialNumber') ?? pick('exif', 'ImageUniqueID');
  if (serial) summary.serial = serial;
  return summary;
}

/** The whole read: container detection, metadata blocks, Exif fields, GPS. */
export function readMetadata(data: Uint8Array): MetadataReport {
  const warnings: string[] = [];
  const report: MetadataReport = {
    container: 'unknown',
    fileBytes: data.length,
    fields: [],
    gps: null,
    summary: {},
    blocks: [],
    removable: false,
    warnings,
  };
  if (data.length > MAX_FILE_BYTES) {
    warnings.push(`file is larger than ${MAX_FILE_BYTES} bytes; refused`);
    return report;
  }

  const isJpeg = data.length > 3 && data[0] === 0xff && data[1] === 0xd8;
  const isPng = data.length > 8 && PNG_MAGIC.every((b, i) => data[i] === b);
  const head = ascii(data, 0, 4);
  const isTiff = head === 'II*\0' || head === 'MM\0*';

  let tiff: Uint8Array | null = null;

  if (isJpeg) {
    report.container = 'jpeg';
    report.removable = true;
    try {
      const { segments } = scanJpegSegments(data);
      for (const segment of segments) {
        const block = jpegBlock(data, segment);
        if (block) report.blocks.push(block);
        if (block?.kind === 'exif' && !tiff) {
          tiff = data.subarray(segment.payloadOffset + 6, segment.payloadOffset + segment.payloadLength);
        }
      }
    } catch (problem) {
      warnings.push(problem instanceof Error ? problem.message : String(problem));
      report.removable = false;
    }
  } else if (isPng) {
    report.container = 'png';
    report.removable = true;
    try {
      for (const chunk of scanPngChunks(data)) {
        const base = { id: `png:${chunk.offset}`, offset: chunk.offset, bytes: chunk.totalLength };
        if (chunk.type === 'eXIf') {
          report.blocks.push({ ...base, kind: 'exif', label: 'eXIf', identifying: true, affectsRendering: false });
          if (!tiff) tiff = data.subarray(chunk.dataOffset, chunk.dataOffset + chunk.dataLength);
        } else if (chunk.type === 'tEXt' || chunk.type === 'iTXt' || chunk.type === 'zTXt') {
          report.blocks.push({ ...base, kind: 'text', label: chunk.type, identifying: true, affectsRendering: false });
          const field = pngTextField(data, chunk);
          if (field) report.fields.push(field);
          else if (chunk.type === 'zTXt') {
            warnings.push('a zTXt chunk is zlib-compressed and is listed but not decoded');
          }
        } else if (chunk.type === 'tIME') {
          report.blocks.push({ ...base, kind: 'time', label: 'tIME', identifying: true, affectsRendering: false });
        } else if (chunk.type === 'iCCP') {
          report.blocks.push({ ...base, kind: 'icc', label: 'iCCP colour profile', identifying: false, affectsRendering: true });
        }
      }
    } catch (problem) {
      warnings.push(problem instanceof Error ? problem.message : String(problem));
      report.removable = false;
    }
  } else if (isTiff) {
    report.container = 'tiff';
    report.removable = false;
    tiff = data;
    warnings.push('TIFF is read-only here: removing its metadata means rewriting every IFD and strip offset');
  } else {
    warnings.push('not a JPEG, PNG or TIFF; nothing was parsed (HEIC, WebP and AVIF are not handled)');
    return report;
  }

  if (tiff) {
    try {
      const block = parseTiffBlock(tiff);
      warnings.push(...block.warnings);
      report.fields.push(...fieldsFrom(block));
      const gpsEntries = block.ifds.find((ifd) => ifd.name === 'gps')?.entries ?? [];
      report.gps = gpsFrom(gpsEntries, warnings);
    } catch (problem) {
      warnings.push(`Exif block could not be read: ${problem instanceof Error ? problem.message : String(problem)}`);
    }
  }
  report.summary = summaryFrom(report.fields);
  return report;
}

/* ── removal ──────────────────────────────── */

export type StripResult = {
  data: Uint8Array;
  removed: MetaBlock[];
  removedBytes: number;
};

/**
 * Rewrites the file without the chosen blocks.
 *
 * Everything not removed is copied byte for byte, including the entropy-coded
 * image data, so the picture is not re-encoded and loses nothing. PNG needs no
 * CRC work because chunks are only deleted, never edited — the surviving
 * chunks keep the CRCs they were written with.
 */
export function stripMetadata(data: Uint8Array, report: MetadataReport, ids: string[]): StripResult {
  if (!report.removable) {
    throw new Error(`${report.container} cannot be rewritten by this tool`);
  }
  const wanted = new Set(ids);
  const removed = report.blocks.filter((block) => wanted.has(block.id));
  if (removed.length === 0) {
    return { data: data.slice(), removed: [], removedBytes: 0 };
  }
  const cuts = removed
    .map((block) => [block.offset, block.offset + block.bytes] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const removedBytes = cuts.reduce((sum, [from, to]) => sum + (to - from), 0);
  const out = new Uint8Array(data.length - removedBytes);
  let write = 0;
  let read = 0;
  for (const [from, to] of cuts) {
    if (from < read) throw new Error('metadata blocks overlap; refusing to rewrite');
    out.set(data.subarray(read, from), write);
    write += from - read;
    read = to;
  }
  out.set(data.subarray(read), write);
  return { data: out, removed, removedBytes };
}

/** `photo.jpg` → `photo.clean.jpg`, so the original is never overwritten. */
export function cleanName(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}.clean`;
  return `${name.slice(0, dot)}.clean${name.slice(dot)}`;
}
