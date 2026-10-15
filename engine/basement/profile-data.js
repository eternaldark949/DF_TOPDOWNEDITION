/**
 * Basement / profile data: bounded copies for diagnostics, never live engine references.
 * Used only for on-demand captures/export, not for each recorded frame.
 */

/**
 * Copy JSON-like data within one shared node budget. Truncate strings/collections,
 * omit accessors, detect cycles, and never traverse a world/DOM/class instance.
 */
export function boundedCopy(value, budget = { remaining: 1024 }, depth = 0, seen = new WeakSet()) {
  if (--budget.remaining < 0) return '[node budget]';
  if (typeof value === 'string') return value.slice(0, 256);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value !== 'object') return '[not JSON data]';
  if (depth >= 6) return '[depth limit]';
  if (seen.has(value)) return '[circular]';
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return '[instance omitted]';
  seen.add(value);
  const result = Array.isArray(value) ? [] : {};
  let count = 0;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (count++ >= 64 || budget.remaining <= 0) {
      if (Array.isArray(result)) result.push('[truncated]'); else result.$truncated = true;
      break;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const copy = descriptor && 'value' in descriptor
      ? boundedCopy(descriptor.value, budget, depth + 1, seen) : '[accessor omitted]';
    // defineProperty avoids treating an author's __proto__ diagnostic key as a setter.
    Object.defineProperty(result, key.slice(0, 80), { value: copy, enumerable: true, configurable: true });
  }
  seen.delete(value);
  return result;
}

/** Percentile by nearest rank; callers pass a sorted bounded scratch array. */
export function percentile(sorted, fraction) {
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : null;
}


/** Freeze a bounded owned capture recursively; readers cannot add live resource references later. */
export function freezeData(value){
  if(value&&typeof value==='object'){
    for(const key of Object.keys(value))freezeData(value[key]);
    Object.freeze(value);
  }
  return value;
}


/** Reporting must remain isolated even when a provider throws null or a hostile object. */
export function diagnosticError(error){
  try{return String(error?.message??error).slice(0,160);}
  catch{return '[unreadable diagnostic error]';}
}
