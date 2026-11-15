// Facsimile. A picture is sent a line at a time, top line first, each
// dark run of the line as a block of energy at the matching place in the
// station's width. Nothing decodes it. It simply arrives on the paper.

export const LINE = 0.15; // seconds per line
export const COLUMN = 75; // Hz per picture element

// print(image, { t0 }) -> { strokes, end }
//
// image is { w, h, at(x, y) } where at() gives darkness 0..1.
export function print(image, { t0, a = 1, line = LINE, column = COLUMN, f0 = 0 } = {}) {
  const strokes = [];
  for (let y = 0; y < image.h; y++) {
    const ta = t0 + y * line;
    let x = 0;
    while (x < image.w) {
      const d = image.at(x, y);
      if (d <= 0) {
        x++;
        continue;
      }
      let x1 = x + 1;
      while (x1 < image.w && image.at(x1, y) === d) x1++;
      const w = (x1 - x) * column;
      strokes.push({ t0: ta, t1: ta + line, f: f0 + x * column + w / 2, w, a: a * d });
      x = x1;
    }
  }
  return { strokes, end: t0 + image.h * line };
}

// A plain bitmap to draw on.
export function bitmap(w, h) {
  const px = new Uint8Array(w * h);
  return {
    w,
    h,
    px,
    at: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : px[y * w + x] / 255),
    set(x, y, d = 1) {
      x = Math.round(x);
      y = Math.round(y);
      if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = Math.round(d * 255);
    },
    // Rows of '#' and '.', for looking at a picture without a receiver.
    toString() {
      let out = '';
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) out += px[y * w + x] > 127 ? '#' : px[y * w + x] > 0 ? ':' : ' ';
        out += '\n';
      }
      return out;
    },
  };
}
