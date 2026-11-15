// Fixed numbers that look like chance.
//
// Nothing on the band is random. Anything that seems to be is a hash of
// when it happened, so that two receivers listening at the same moment
// agree, and so that a moment can be listened to again.

function mix(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// FNV-1a, for turning a name into a number.
export function seed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// hash(a, b, c, ...) -> uint32. Arguments are integers (of any size a
// double can hold exactly) or strings.
export function hash(...xs) {
  let h = 0x9e3779b9;
  for (const x of xs) {
    const n = typeof x === 'string' ? seed(x) : x;
    h = mix(h ^ (n >>> 0));
    h = mix((h + (Math.floor(n / 4294967296) >>> 0)) >>> 0);
  }
  return h;
}

// unit(...) -> [0, 1)
export const unit = (...xs) => hash(...xs) / 4294967296;

// between(lo, hi, ...) -> [lo, hi)
export const between = (lo, hi, ...xs) => lo + (hi - lo) * unit(...xs);

// pick(list, ...) -> one of list
export const pick = (list, ...xs) => list[hash(...xs) % list.length];
