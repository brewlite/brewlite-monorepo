import { describe, expect, it } from "vitest";
import { generateQrMatrix } from "../lib/qr-svg";

describe("QR matrix generator for counter payment", () => {
  it("produces a valid square QR matrix with 3 finder patterns and deterministic output", () => {
    const payload = "BREWLITE|POS-1795358827840-c296f1|50000";
    const m1 = generateQrMatrix(payload);
    const m2 = generateQrMatrix(payload);
    const n = m1.length;

    expect(n).toBe(29); // Version 3 for 39-byte payload at ECC M
    expect(m1).toEqual(m2);

    // Verify 7x7 outer ring of all 3 finder patterns
    for (const [top, left] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      for (let i = 0; i < 7; i += 1) {
        expect(m1[top][left + i]).toBe(true);
        expect(m1[top + 6][left + i]).toBe(true);
        expect(m1[top + i][left]).toBe(true);
        expect(m1[top + i][left + 6]).toBe(true);
      }
      // 3x3 dark center
      for (let r = 2; r <= 4; r += 1) {
        for (let c = 2; c <= 4; c += 1) {
          expect(m1[top + r][left + c]).toBe(true);
        }
      }
    }
    // Dark module at (size - 8, 8)
    expect(m1[n - 8][8]).toBe(true);
  });
});
