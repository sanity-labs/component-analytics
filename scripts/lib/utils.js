/**
 * @module lib/utils
 *
 * Pure utility functions shared across every analysis script.
 *
 * All functions in this module are stateless — they take values in and
 * return values out with no side-effects.  This makes them trivial to
 * test and safe to call from any context.
 */

// ─── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Sort the entries of a `{ key: number }` object by value, descending.
 *
 * @example
 *   sortByCount({ a: 10, b: 50, c: 25 })
 *   // => [["b", 50], ["c", 25], ["a", 10]]
 *
 * @param {Object<string, number>} obj
 * @returns {Array<[string, number]>}
 */
function sortByCount(obj) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

// ─── Maths ────────────────────────────────────────────────────────────────────

/**
 * Calculate a percentage, returning `"0.0"` when the denominator is zero.
 *
 * @example
 *   pct(30, 200) // => "15.0"
 *   pct(0, 0)    // => "0.0"
 *
 * @param {number} numerator
 * @param {number} denominator
 * @param {number} [decimals=1] - Number of decimal places.
 * @returns {string} The percentage as a fixed-precision string.
 */
function pct(numerator, denominator, decimals = 1) {
  if (denominator === 0) return (0).toFixed(decimals);
  return ((numerator / denominator) * 100).toFixed(decimals);
}

// ─── Counter helpers ──────────────────────────────────────────────────────────

/**
 * Increment a key inside a counter object, creating the key if absent.
 *
 * This mutates `counter` in place and returns the new value for
 * convenience.
 *
 * @example
 *   const c = {};
 *   incr(c, "div");    // c => { div: 1 }
 *   incr(c, "div", 5); // c => { div: 6 }
 *
 * @param {Object<string, number>} counter
 * @param {string} key
 * @param {number} [amount=1]
 * @returns {number} The updated count for `key`.
 */
function incr(counter, key, amount = 1) {
  counter[key] = (counter[key] || 0) + amount;
  return counter[key];
}

/**
 * Merge one counter object into another, summing values for shared keys.
 *
 * Mutates `target` and returns it.
 *
 * @example
 *   const a = { div: 3, span: 1 };
 *   const b = { div: 2, p: 4 };
 *   mergeCounters(a, b); // a => { div: 5, span: 1, p: 4 }
 *
 * @param {Object<string, number>} target
 * @param {Object<string, number>} source
 * @returns {Object<string, number>} The mutated `target`.
 */
function mergeCounters(target, source) {
  for (const [key, count] of Object.entries(source)) {
    incr(target, key, count);
  }
  return target;
}

/**
 * Sum all numeric values in an object.
 *
 * @example
 *   sumValues({ a: 10, b: 20 }) // => 30
 *
 * @param {Object<string, number>} obj
 * @returns {number}
 */
function sumValues(obj) {
  let total = 0;
  for (const v of Object.values(obj)) {
    total += v;
  }
  return total;
}

// ─── Collection helpers ───────────────────────────────────────────────────────

/**
 * Return only the non-`null` / non-`undefined` values from an object,
 * preserving keys.
 *
 * Useful for filtering out codebases that were skipped (returned `null`).
 *
 * @example
 *   compact({ sanity: {…}, canvas: null })
 *   // => { sanity: {…} }
 *
 * @template T
 * @param {Object<string, T | null | undefined>} obj
 * @returns {Object<string, T>}
 */
function compact(obj) {
  /** @type {Object<string, T>} */
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v != null) out[k] = v;
  }
  return out;
}

/**
 * Return the top `n` entries from a sorted `[key, value]` array.
 *
 * A small convenience over `.slice(0, n)` that reads more clearly in
 * report-generation code.
 *
 * @param {Array<[string, number]>} sorted - Already sorted descending.
 * @param {number} n - Maximum entries to return.
 * @returns {Array<[string, number]>}
 */
function topN(sorted, n) {
  return sorted.slice(0, n);
}

// ─── String helpers ───────────────────────────────────────────────────────────

/**
 * Pad a number to a fixed width, right-aligned.
 *
 * @example
 *   padNum(42, 8) // => "      42"
 *
 * @param {number} n
 * @param {number} width
 * @returns {string}
 */
function padNum(n, width) {
  return String(n).padStart(width);
}

module.exports = {
  sortByCount,
  pct,
  incr,
  mergeCounters,
  sumValues,
  compact,
  topN,
  padNum,
};
