/** Basement / bounded horizontal broad phase. Owns index cells, never source geometry.
 * Rebuild after collider topology/transforms change; query visits only overlapping cells.
 * Very large boxes use a bounded overflow list instead of filling thousands of cells. */
import { circleOverlapsBox } from "./geometry.js";
export class SpatialGrid {
  /** cellSize and circle radii use world metres; maxCells bounds each indexed footprint. */
  constructor(cellSize = 4, maxCells = 64) {
    if (
      !Number.isFinite(cellSize) ||
      cellSize <= 0 ||
      !Number.isInteger(maxCells) ||
      maxCells < 1 ||
      maxCells > 256
    )
      throw new Error("Invalid spatial grid budget");
    this.cellSize = cellSize;
    this.maxCells = maxCells;
    this.cells = new Map();
    this.overflow = [];
    this.seen = new Set();
    this.count = 0;
    this.candidates = 0;
  }
  /** Replace derived membership from the caller's current collision list. */
  rebuild(boxes) {
    this.clear();
    for (const box of boxes) {
      const a = Math.floor((box.x - box.width / 2) / this.cellSize),
        b = Math.floor((box.x + box.width / 2) / this.cellSize),
        c = Math.floor((box.y - box.depth / 2) / this.cellSize),
        d = Math.floor((box.y + box.depth / 2) / this.cellSize);
      this.count++;
      if ((b - a + 1) * (d - c + 1) > this.maxCells) {
        this.overflow.push(box);
        continue;
      }
      for (let x = a; x <= b; x++)
        for (let y = c; y <= d; y++) {
          const key = x + "," + y;
          let cell = this.cells.get(key);
          if (!cell) {
            cell = [];
            this.cells.set(key, cell);
          }
          cell.push(box);
        }
    }
  }
  /** Exact circle/box narrow phase. Deduplicate multi-cell boxes; no per-query result arrays. */
  overlaps(x, y, radius) {
    if (![x, y, radius].every(Number.isFinite) || radius < 0)
      throw new Error("Invalid circle query");
    this.seen.clear();
    this.candidates = 0;
    const test = (box) => {
      if (this.seen.has(box)) return false;
      this.seen.add(box);
      this.candidates++;
      return circleOverlapsBox(x, y, radius, box);
    };
    for (const box of this.overflow) if (test(box)) return true;
    const queryCells =
      (Math.floor((x + radius) / this.cellSize) -
        Math.floor((x - radius) / this.cellSize) +
        1) *
      (Math.floor((y + radius) / this.cellSize) -
        Math.floor((y - radius) / this.cellSize) +
        1);
    // Large-radius tools may cover vast empty coordinate ranges. Scan existing cells
    // instead, still deduplicating boxes, rather than iterating millions of empty cells.
    if (queryCells > this.maxCells) {
      for (const cell of this.cells.values())
        for (const box of cell) if (test(box)) return true;
      return false;
    }
    for (
      let i = Math.floor((x - radius) / this.cellSize);
      i <= Math.floor((x + radius) / this.cellSize);
      i++
    )
      for (
        let j = Math.floor((y - radius) / this.cellSize);
        j <= Math.floor((y + radius) / this.cellSize);
        j++
      ) {
        const cell = this.cells.get(i + "," + j);
        if (cell) for (const box of cell) if (test(box)) return true;
      }
    return false;
  }
  /** Drop borrowed collider references when the owning scene is released. */
  clear() {
    this.cells.clear();
    this.overflow.length = 0;
    this.seen.clear();
    this.count = 0;
    this.candidates = 0;
  }
}
