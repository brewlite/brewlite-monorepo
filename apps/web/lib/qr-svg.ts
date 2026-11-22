/**
 * Lightweight ISO/IEC 18004 QR Code encoder (Byte mode, ECC Level M, Versions 1..6).
 * Generates a scannable boolean module matrix for counter QR payment display.
 */

type VersionSpec = {
  version: number;
  size: number;
  dataBytes: number;
  blocks: number;
  eccPerBlock: number;
  align: number[];
};

const VERSIONS: VersionSpec[] = [
  { version: 1, size: 21, dataBytes: 16, blocks: 1, eccPerBlock: 10, align: [] },
  { version: 2, size: 25, dataBytes: 28, blocks: 1, eccPerBlock: 16, align: [6, 18] },
  { version: 3, size: 29, dataBytes: 44, blocks: 1, eccPerBlock: 26, align: [6, 22] },
  { version: 4, size: 33, dataBytes: 64, blocks: 2, eccPerBlock: 18, align: [6, 26] },
  { version: 5, size: 37, dataBytes: 86, blocks: 2, eccPerBlock: 24, align: [6, 30] },
  { version: 6, size: 41, dataBytes: 108, blocks: 4, eccPerBlock: 16, align: [6, 34] },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsRemainder(data: Uint8Array, eccCount: number): Uint8Array {
  let gen = [1];
  for (let i = 0; i < eccCount; i += 1) {
    const next = new Array<number>(gen.length + 1).fill(0);
    const root = GF_EXP[i];
    for (let j = 0; j < gen.length; j += 1) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], root);
    }
    gen = next;
  }
  const rem = new Uint8Array(eccCount);
  for (let i = 0; i < data.length; i += 1) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[eccCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < eccCount; j += 1) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

function encodeCodewords(payload: string): { spec: VersionSpec; codewords: Uint8Array } {
  const bytes = new TextEncoder().encode(payload);
  // Byte mode needs 4 mode bits + 8 length bits + 8*n data bits => 2 + n bytes.
  const spec = VERSIONS.find((v) => v.dataBytes >= bytes.length + 2) ?? VERSIONS[VERSIONS.length - 1];
  const clipped = bytes.slice(0, spec.dataBytes - 2);
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(clipped.length, 8);
  for (const b of clipped) pushBits(b, 8);
  const maxBits = spec.dataBytes * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const data = new Uint8Array(spec.dataBytes);
  for (let i = 0; i < bits.length / 8; i += 1) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | bits[i * 8 + b];
    data[i] = byte;
  }
  for (let i = bits.length / 8, toggle = 0; i < spec.dataBytes; i += 1, toggle ^= 1) {
    data[i] = toggle === 0 ? 0xec : 0x11;
  }

  const blockDataSize = spec.dataBytes / spec.blocks;
  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  for (let b = 0; b < spec.blocks; b += 1) {
    const slice = data.slice(b * blockDataSize, (b + 1) * blockDataSize);
    dataBlocks.push(slice);
    eccBlocks.push(rsRemainder(slice, spec.eccPerBlock));
  }

  const out = new Uint8Array(spec.dataBytes + spec.blocks * spec.eccPerBlock);
  let idx = 0;
  for (let i = 0; i < blockDataSize; i += 1) {
    for (let b = 0; b < spec.blocks; b += 1) out[idx++] = dataBlocks[b][i];
  }
  for (let i = 0; i < spec.eccPerBlock; i += 1) {
    for (let b = 0; b < spec.blocks; b += 1) out[idx++] = eccBlocks[b][i];
  }
  return { spec, codewords: out };
}

function formatBits(mask: number): number {
  // Error correction level M = 00
  const data = (0b00 << 3) | (mask & 7);
  let rem = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function applyFormat(modules: boolean[][], size: number, mask: number) {
  const bits = formatBits(mask);
  const bit = (i: number) => Boolean((bits >>> i) & 1);
  for (let i = 0; i <= 5; i += 1) modules[8][i] = bit(14 - i);
  modules[8][7] = bit(8);
  modules[8][8] = bit(7);
  modules[7][8] = bit(6);
  for (let i = 0; i <= 5; i += 1) modules[5 - i][8] = bit(5 - i);
  for (let i = 0; i < 8; i += 1) modules[8][size - 8 + i] = bit(7 - i);
  for (let i = 0; i < 7; i += 1) modules[size - 1 - i][8] = bit(14 - i);
}

function maskCondition(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function penalty(modules: boolean[][]): number {
  const n = modules.length;
  let score = 0;
  for (let r = 0; r < n; r += 1) {
    let run = 1;
    for (let c = 1; c < n; c += 1) {
      if (modules[r][c] === modules[r][c - 1]) run += 1;
      else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    if (run >= 5) score += run - 2;
  }
  for (let c = 0; c < n; c += 1) {
    let run = 1;
    for (let r = 1; r < n; r += 1) {
      if (modules[r][c] === modules[r - 1][c]) run += 1;
      else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    if (run >= 5) score += run - 2;
  }
  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
        score += 3;
      }
    }
  }
  return score;
}

export function generateQrMatrix(payload: string): boolean[][] {
  const { spec, codewords } = encodeCodewords(payload);
  const { size, align } = spec;
  const base: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  const setFn = (r: number, c: number, dark: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    base[r][c] = dark;
    reserved[r][c] = true;
  };

  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const dark =
          inOuter &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setFn(top + dr, left + dc, dark);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i += 1) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }

  for (const ar of align) {
    for (const ac of align) {
      if ((ar === 6 && ac === 6) || (ar === 6 && ac === size - 7) || (ar === size - 7 && ac === 6)) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const d = Math.max(Math.abs(dr), Math.abs(dc));
          setFn(ar + dr, ac + dc, d !== 1);
        }
      }
    }
  }

  // Reserve format info + dark module
  for (let i = 0; i <= 8; i += 1) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i += 1) reserved[8][size - 1 - i] = true;
  for (let i = 0; i < 7; i += 1) reserved[size - 7 + i][8] = true;
  setFn(size - 8, 8, true);

  // Place data bits
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const r = upward ? size - 1 - step : step;
      for (let dx = 0; dx < 2; dx += 1) {
        const c = right - dx;
        if (reserved[r][c]) continue;
        let dark = false;
        if (bitIdx < totalBits) {
          dark = Boolean((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1);
          bitIdx += 1;
        }
        base[r][c] = dark;
      }
    }
    upward = !upward;
  }

  let bestMask = 0;
  let bestScore = Infinity;
  let bestMatrix = base;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = base.map((row, r) =>
      row.map((val, c) => (reserved[r][c] ? val : val !== maskCondition(mask, r, c))),
    );
    applyFormat(candidate, size, mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
      bestMatrix = candidate;
    }
  }
  void bestMask;
  return bestMatrix;
}
