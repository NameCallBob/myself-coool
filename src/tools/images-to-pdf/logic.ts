/**
 * Building a PDF out of images, by hand, in the browser.
 *
 * A PDF that holds nothing but pictures is one of the few file formats that is
 * genuinely reasonable to emit without a library: a header, a handful of
 * dictionaries, one content stream per page saying "draw this image into this
 * rectangle", a cross-reference table of byte offsets, and a trailer. No
 * fonts, no encryption, no object streams — those are what make PDF writers
 * large, and none of them are needed here.
 *
 * Three things in this file are worth knowing before changing anything:
 *
 *  - **The xref offsets are the whole ballgame.** Every entry in the
 *    cross-reference table is the absolute byte offset of `N 0 obj`, and the
 *    `startxref` at the end is the byte offset of the table itself. Get one
 *    byte wrong and a viewer either repairs the file silently (Acrobat, so you
 *    never notice) or shows nothing (everything else). That is why the whole
 *    document is assembled through one writer that counts bytes, and why the
 *    tests re-parse the output rather than eyeballing it.
 *
 *  - **JPEG bytes go in untouched.** `/DCTDecode` means the stream *is* a JPEG
 *    scan, so a baseline JPEG is embedded verbatim: no decode, no re-encode, no
 *    generation loss, and the PDF ends up roughly the size of the inputs. But
 *    PDF's DCTDecode filter does not cover progressive JPEG, so those have to
 *    be re-encoded by the caller — hence `parseJpeg` and `jpegEmbedVerdict`.
 *
 *  - **The lossless path is stored deflate.** `zlibStore` wraps raw bytes in a
 *    valid zlib stream made of uncompressed deflate blocks. It compresses
 *    nothing; it exists so the tool still produces a correct `/FlateDecode`
 *    stream where `CompressionStream` is unavailable. The caller is expected to
 *    prefer real deflate and fall back to this.
 *
 * Coordinates: PDF user space has its origin at the bottom-left of the page and
 * its unit is 1/72 inch (a point). All geometry here is in points.
 */

export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

export const PT_PER_IN = 72;
export const PT_PER_MM = 72 / 25.4;

/** PDF's own limit on a page edge: 14400 units, i.e. 200 inches. */
export const MAX_PAGE_PT = 14400;

export function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

export function inToPt(inches: number): number {
  return inches * PT_PER_IN;
}

/**
 * Paper sizes, in millimetres, portrait.
 *
 * ISO A-series is defined in mm, so mm is the honest unit to store and the pt
 * values follow from it (A4 comes out 595.276 x 841.89 pt, which is what every
 * other producer writes). US sizes are defined in inches and are exact in pt.
 * The UI lets a custom size be typed in, because this list will never be
 * complete.
 */
export type Paper = { id: string; label: string; widthMm: number; heightMm: number };

export const PAPERS: Paper[] = [
  { id: 'a3', label: 'A3', widthMm: 297, heightMm: 420 },
  { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297 },
  { id: 'a5', label: 'A5', widthMm: 148, heightMm: 210 },
  { id: 'letter', label: 'Letter', widthMm: 215.9, heightMm: 279.4 },
  { id: 'legal', label: 'Legal', widthMm: 215.9, heightMm: 355.6 },
];

export function paperById(id: string): Paper | null {
  return PAPERS.find((paper) => paper.id === id) ?? null;
}

export type Orientation = 'auto' | 'portrait' | 'landscape';

export type PagePlanInput = {
  /** Image size in pixels. */
  image: Size;
  /** Page size in points, or 'original' to size the page from the image. */
  paper: Size | 'original';
  /** Margin on every side, in points. */
  marginPt: number;
  orientation: Orientation;
  /** Pixels per inch assumed when converting image pixels to points. */
  dpi: number;
  /** Allow an image smaller than the content box to be enlarged to fill it. */
  upscale: boolean;
};

export type PagePlan = {
  page: Size;
  /** Where the image is drawn, in points from the bottom-left of the page. */
  rect: Rect;
  /** Drawn size ÷ natural size at the chosen dpi. 1 means pixel-for-point. */
  scale: number;
  /** Effective resolution of the placed image, in dots per inch. */
  effectiveDpi: number;
};

/**
 * Work out the page box and where the image sits on it.
 *
 * `original` gives a page exactly the size of the image at the chosen dpi plus
 * the margins, which is what you want for scans that are already the right
 * size. Orientation is ignored in that mode: the page follows the image.
 */
export function planPage(input: PagePlanInput): PagePlan {
  const { image, marginPt, dpi, upscale } = input;
  if (!(image.width > 0) || !(image.height > 0)) throw new Error('image has a zero dimension');
  if (!(dpi > 0) || !Number.isFinite(dpi)) throw new Error('dpi must be positive');
  if (!(marginPt >= 0) || !Number.isFinite(marginPt)) throw new Error('margin must be >= 0');

  const naturalWidth = (image.width / dpi) * PT_PER_IN;
  const naturalHeight = (image.height / dpi) * PT_PER_IN;

  if (input.paper === 'original') {
    const page = {
      width: naturalWidth + marginPt * 2,
      height: naturalHeight + marginPt * 2,
    };
    assertPageFits(page);
    return {
      page,
      rect: { x: marginPt, y: marginPt, width: naturalWidth, height: naturalHeight },
      scale: 1,
      effectiveDpi: dpi,
    };
  }

  const paper = input.paper;
  if (!(paper.width > 0) || !(paper.height > 0)) throw new Error('paper has a zero dimension');
  const wantLandscape =
    input.orientation === 'landscape'
      ? true
      : input.orientation === 'portrait'
        ? false
        : image.width > image.height;
  const long = Math.max(paper.width, paper.height);
  const short = Math.min(paper.width, paper.height);
  const page = wantLandscape
    ? { width: long, height: short }
    : { width: short, height: long };
  assertPageFits(page);

  const boxWidth = page.width - marginPt * 2;
  const boxHeight = page.height - marginPt * 2;
  if (boxWidth <= 0 || boxHeight <= 0) {
    throw new Error('margins leave no room on the page');
  }

  const fit = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
  const scale = upscale ? fit : Math.min(1, fit);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    page,
    rect: {
      x: (page.width - width) / 2,
      y: (page.height - height) / 2,
      width,
      height,
    },
    scale,
    effectiveDpi: (image.width / width) * PT_PER_IN,
  };
}

function assertPageFits(page: Size): void {
  if (page.width > MAX_PAGE_PT || page.height > MAX_PAGE_PT) {
    throw new Error(
      `page would be ${page.width.toFixed(0)}x${page.height.toFixed(0)} pt, past PDF's ${MAX_PAGE_PT} pt limit`
    );
  }
}

/* ── JPEG inspection ──────────────────────── */

export type JpegMode = 'baseline' | 'extended' | 'progressive' | 'lossless' | 'other';

export type JpegInfo = {
  width: number;
  height: number;
  /** 1 = greyscale, 3 = YCbCr, 4 = CMYK/YCCK. */
  components: number;
  bits: number;
  mode: JpegMode;
  /** The SOF marker byte, e.g. 0xc0 for baseline. */
  marker: number;
};

const SOF_MODES: Record<number, JpegMode> = {
  0xc0: 'baseline',
  0xc1: 'extended',
  0xc2: 'progressive',
  0xc3: 'lossless',
  0xc5: 'other', // differential sequential
  0xc6: 'other', // differential progressive
  0xc7: 'other', // differential lossless
  0xc9: 'other', // arithmetic extended
  0xca: 'other', // arithmetic progressive
  0xcb: 'other', // arithmetic lossless
  0xcd: 'other',
  0xce: 'other',
  0xcf: 'other',
};

/**
 * Read the frame header of a JPEG.
 *
 * Only the marker segments are walked — the entropy-coded scan is never
 * touched — so this is cheap even on a 40 MP photo. It exists to answer one
 * question: can these bytes be handed to a PDF viewer as-is?
 */
export function parseJpeg(data: Uint8Array): JpegInfo {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    throw new Error('not a JPEG (no SOI marker)');
  }
  let at = 2;
  while (at < data.length) {
    if (data[at] !== 0xff) throw new Error(`expected a marker at byte ${at}`);
    // Any number of 0xff fill bytes may precede the marker code.
    let code = data[at + 1];
    let cursor = at + 1;
    while (code === 0xff && cursor + 1 < data.length) {
      cursor += 1;
      code = data[cursor];
    }
    if (code === undefined) throw new Error('JPEG ends inside a marker');

    if (code === 0xd8 || code === 0x01 || (code >= 0xd0 && code <= 0xd7)) {
      at = cursor + 1; // standalone marker, no payload
      continue;
    }
    if (code === 0xd9) throw new Error('JPEG ended before any frame header');
    if (code === 0xda) throw new Error('JPEG scan starts before any frame header');

    if (cursor + 3 >= data.length) throw new Error('JPEG truncated in a segment header');
    const length = (data[cursor + 1] << 8) | data[cursor + 2];
    if (length < 2) throw new Error('JPEG segment claims an impossible length');
    if (cursor + 1 + length > data.length) throw new Error('JPEG segment runs past the end');

    const mode = SOF_MODES[code];
    if (mode !== undefined) {
      // SOF payload: precision(1) height(2) width(2) components(1)
      if (length < 8) throw new Error('SOF segment is too short');
      const base = cursor + 3;
      const bits = data[base];
      const height = (data[base + 1] << 8) | data[base + 2];
      const width = (data[base + 3] << 8) | data[base + 4];
      const components = data[base + 5];
      if (width === 0 || height === 0) throw new Error('JPEG reports a zero dimension');
      return { width, height, components, bits, mode, marker: code };
    }
    at = cursor + 1 + length;
  }
  throw new Error('JPEG ended before any frame header');
}

export type EmbedVerdict =
  | { ok: true; colorSpace: 'DeviceRGB' | 'DeviceGray' }
  | { ok: false; reason: 'progressive' | 'mode' | 'components' | 'bits' };

/**
 * Can this JPEG go into the PDF verbatim?
 *
 * `/DCTDecode` is specified against baseline and extended sequential Huffman
 * JPEG at 8 bits. Progressive files are the common real-world failure: many
 * viewers show a blank page rather than complaining, so they are refused here
 * and re-encoded by the caller instead. Four-component (CMYK/YCCK) JPEGs are
 * refused too: getting them right needs the Adobe APP14 transform and a
 * `/Decode` array, and guessing produces inverted colour.
 */
export function jpegEmbedVerdict(info: JpegInfo): EmbedVerdict {
  if (info.mode === 'progressive') return { ok: false, reason: 'progressive' };
  if (info.mode !== 'baseline' && info.mode !== 'extended') return { ok: false, reason: 'mode' };
  if (info.bits !== 8) return { ok: false, reason: 'bits' };
  if (info.components === 3) return { ok: true, colorSpace: 'DeviceRGB' };
  if (info.components === 1) return { ok: true, colorSpace: 'DeviceGray' };
  return { ok: false, reason: 'components' };
}

/* ── zlib / FlateDecode ───────────────────── */

export function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  // 5552 is the largest block length that cannot overflow a 32-bit
  // accumulator, so the modulo can be deferred.
  for (let start = 0; start < data.length; start += 5552) {
    const end = Math.min(start + 5552, data.length);
    for (let i = start; i < end; i += 1) {
      a += data[i];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * Wrap bytes in a zlib stream of *stored* (uncompressed) deflate blocks.
 *
 * This is a real, spec-valid `/FlateDecode` stream that any inflater accepts —
 * it simply saves nothing, costing 5 bytes per 65535-byte block. It is the
 * fallback for browsers without `CompressionStream`; anything modern should use
 * that instead and only fall back here.
 */
export function zlibStore(data: Uint8Array): Uint8Array {
  const BLOCK = 0xffff;
  const blocks = Math.max(1, Math.ceil(data.length / BLOCK));
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4);
  let at = 0;
  // zlib header: deflate, 32K window, no preset dictionary, and
  // (0x78 << 8 | 0x01) % 31 === 0 as the spec requires.
  out[at++] = 0x78;
  out[at++] = 0x01;
  for (let index = 0; index < blocks; index += 1) {
    const start = index * BLOCK;
    const len = Math.min(BLOCK, data.length - start);
    const last = index === blocks - 1;
    out[at++] = last ? 1 : 0; // BFINAL bit, BTYPE 00 = stored
    out[at++] = len & 0xff;
    out[at++] = (len >> 8) & 0xff;
    out[at++] = ~len & 0xff;
    out[at++] = (~len >> 8) & 0xff;
    if (len > 0) {
      out.set(data.subarray(start, start + len), at);
      at += len;
    }
  }
  const sum = adler32(data);
  out[at++] = (sum >>> 24) & 0xff;
  out[at++] = (sum >>> 16) & 0xff;
  out[at++] = (sum >>> 8) & 0xff;
  out[at++] = sum & 0xff;
  return out.subarray(0, at);
}

/**
 * Drop the alpha channel by compositing over a solid colour.
 *
 * PDF images carry transparency only through a separate soft mask; this tool
 * flattens instead, which is both simpler and what you want for scans and
 * screenshots. RGBA in, RGB out.
 */
export function rgbaToRgb(rgba: Uint8Array, background: [number, number, number]): Uint8Array {
  if (rgba.length % 4 !== 0) throw new Error('RGBA data length must be a multiple of 4');
  const pixels = rgba.length / 4;
  const out = new Uint8Array(pixels * 3);
  for (let i = 0; i < pixels; i += 1) {
    const alpha = rgba[i * 4 + 3];
    if (alpha === 255) {
      out[i * 3] = rgba[i * 4];
      out[i * 3 + 1] = rgba[i * 4 + 1];
      out[i * 3 + 2] = rgba[i * 4 + 2];
      continue;
    }
    const a = alpha / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      out[i * 3 + channel] = Math.round(
        rgba[i * 4 + channel] * a + background[channel] * (1 - a)
      );
    }
  }
  return out;
}

/* ── PDF assembly ─────────────────────────── */

export type PdfFilter = 'DCTDecode' | 'FlateDecode';

export type PdfImage = {
  /** Either a JPEG scan (DCTDecode) or a zlib stream of raw samples (FlateDecode). */
  data: Uint8Array;
  width: number;
  height: number;
  filter: PdfFilter;
  colorSpace: 'DeviceRGB' | 'DeviceGray';
};

export type PdfPageSpec = {
  /** Page box in points. */
  width: number;
  height: number;
  image: PdfImage;
  /** Where to draw the image, in points from the bottom-left. */
  rect: Rect;
};

export type PdfMeta = {
  title?: string;
  producer?: string;
  /** PDF date string, e.g. D:20240131120000Z. Omitted when absent. */
  creationDate?: string;
};

/**
 * Format a number for PDF syntax.
 *
 * PDF has no exponent notation, so `1e-7` written literally is a syntax error
 * that most viewers quietly read as 1. Four decimals is well below a printer
 * dot at any sane page size.
 */
export function pdfNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`cannot write ${value} into a PDF`);
  const rounded = Math.round(value * 10000) / 10000;
  if (Object.is(rounded, -0)) return '0';
  const text = rounded.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return text === '' || text === '-' ? '0' : text;
}

/**
 * Encode a text string for a PDF dictionary.
 *
 * ASCII goes in as a literal string with the three characters that would break
 * the syntax escaped. Anything else goes in as a UTF-16BE hex string with a
 * byte-order mark, which is how PDF 1.4 carries non-Latin text — and it is the
 * only form that survives a Chinese title or an emoji.
 */
export function pdfTextString(text: string): string {
  let ascii = true;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 || code > 126) {
      ascii = false;
      break;
    }
  }
  if (ascii) {
    return `(${text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
  }
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i += 1) {
    hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  }
  return `<${hex}>`;
}

function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code > 0xff) throw new Error('non-Latin-1 byte in PDF syntax');
    out[i] = code;
  }
  return out;
}

/**
 * Assemble the file.
 *
 * Object numbering is fixed and deliberately boring — 1 catalog, 2 page tree,
 * then three objects per page (page, content stream, image), then the info
 * dictionary last. Predictable numbering is what makes the xref check in the
 * tests meaningful.
 */
export function buildPdf(pages: PdfPageSpec[], meta: PdfMeta = {}): Uint8Array {
  if (pages.length === 0) throw new Error('a PDF needs at least one page');

  for (const page of pages) {
    if (!(page.width > 0) || !(page.height > 0)) throw new Error('page has a zero dimension');
    if (page.width > MAX_PAGE_PT || page.height > MAX_PAGE_PT) {
      throw new Error(`page edge past PDF's ${MAX_PAGE_PT} pt limit`);
    }
    const image = page.image;
    if (image.data.length === 0) throw new Error('image stream is empty');
    if (!Number.isInteger(image.width) || image.width < 1) throw new Error('image width must be a positive integer');
    if (!Number.isInteger(image.height) || image.height < 1) throw new Error('image height must be a positive integer');
    if (!(page.rect.width > 0) || !(page.rect.height > 0)) throw new Error('draw rectangle is empty');
  }

  const chunks: Uint8Array[] = [];
  let length = 0;
  const put = (part: Uint8Array | string) => {
    const bytes = typeof part === 'string' ? asciiBytes(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };

  const infoNumber = 3 + pages.length * 3;
  const objectCount = infoNumber;
  /** Byte offset of each `N 0 obj`, indexed by object number. */
  const offsets = new Array<number>(objectCount + 1).fill(0);

  const begin = (number: number) => {
    offsets[number] = length;
    put(`${number} 0 obj\n`);
  };
  const end = () => put('endobj\n');
  const stream = (dict: string, data: Uint8Array) => {
    put(`<<${dict === '' ? '' : ` ${dict}`} /Length ${data.length} >>\nstream\n`);
    put(data);
    put('\nendstream\n');
  };

  // %PDF-1.4 plus a comment of high bytes, which is how the format tells
  // transfer tools it is binary and must not be newline-translated.
  put('%PDF-1.4\n');
  put(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  begin(1);
  put('<< /Type /Catalog /Pages 2 0 R >>\n');
  end();

  const kids = pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
  begin(2);
  put(`<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>\n`);
  end();

  pages.forEach((page, index) => {
    const pageNumber = 3 + index * 3;
    const contentNumber = pageNumber + 1;
    const imageNumber = pageNumber + 2;

    begin(pageNumber);
    put(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(page.width)} ${pdfNumber(
        page.height
      )}] /Resources << /ProcSet [/PDF /ImageB /ImageC] /XObject << /Im0 ${imageNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>\n`
    );
    end();

    // q/Q brackets the graphics state; the cm matrix maps the image's unit
    // square onto the target rectangle, then Do paints it.
    const content =
      `q\n${pdfNumber(page.rect.width)} 0 0 ${pdfNumber(page.rect.height)} ` +
      `${pdfNumber(page.rect.x)} ${pdfNumber(page.rect.y)} cm\n/Im0 Do\nQ\n`;
    begin(contentNumber);
    stream('', asciiBytes(content));
    end();

    const image = page.image;
    begin(imageNumber);
    stream(
      `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height}` +
        ` /ColorSpace /${image.colorSpace} /BitsPerComponent 8 /Filter /${image.filter}`,
      image.data
    );
    end();
  });

  begin(infoNumber);
  const info = [`/Producer ${pdfTextString(meta.producer ?? 'tools bench')}`];
  if (meta.title) info.push(`/Title ${pdfTextString(meta.title)}`);
  if (meta.creationDate) info.push(`/CreationDate ${pdfTextString(meta.creationDate)}`);
  put(`<< ${info.join(' ')} >>\n`);
  end();

  const xrefAt = length;
  put(`xref\n0 ${objectCount + 1}\n`);
  // Every entry is exactly 20 bytes: 10 digits, space, 5 digits, space, type,
  // space, newline. Viewers index into this table arithmetically.
  put('0000000000 65535 f \n');
  for (let number = 1; number <= objectCount; number += 1) {
    put(`${String(offsets[number]).padStart(10, '0')} 00000 n \n`);
  }
  put(
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R /Info ${infoNumber} 0 R >>\n` +
      `startxref\n${xrefAt}\n%%EOF\n`
  );

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
