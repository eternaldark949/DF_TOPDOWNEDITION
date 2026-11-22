// ===== LV0 BASEMENT =====
// UNITS: the engine's one length unit. Every position, size, radius, speed and height in every level is in
// world units; a world unit is 1 / UNITS_PER_METRE of a metre. Mass is in kilograms, time in seconds and
// angles in radians. Data may write a length as "1.75 m" or "24 cm"; the Directory turns it into world
// units when a library is registered, so nothing past loading ever sees a metre.

/** How many world units make one metre. */
export const UNITS_PER_METRE = 50;

const finite = (value, name) => { if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`); return value; };
/** World units in `n` metres. */
export const metres = n => finite(n, 'metres') * UNITS_PER_METRE;
/** World units in `n` centimetres. */
export const centimetres = n => finite(n, 'centimetres') * UNITS_PER_METRE / 100;
/** Metres in `units` world units. */
export const toMetres = units => finite(units, 'units') / UNITS_PER_METRE;

const LENGTH = /^\s*(-?\d+(?:\.\d+)?)\s*(m|cm)\s*$/;
/** True for a string written as a length: "3 m", "1.75m", "24 cm". */
export const isLength = value => typeof value === 'string' && LENGTH.test(value);
/** A length as world units: a number is already world units; "3 m" or "24 cm" is converted. Anything else throws. */
export function readLength(value, name = 'length') {
    if (typeof value === 'number') return finite(value, name);
    const match = typeof value === 'string' && value.match(LENGTH);
    if (!match) throw new TypeError(`${name} is world units (a number) or a length such as "1.75 m" or "24 cm", not ${JSON.stringify(value)}`);
    return match[2] === 'm' ? metres(Number(match[1])) : centimetres(Number(match[1]));
}
/** A copy of plain data with every length string ("3 m", "24 cm") turned into world units, at any depth. */
export function readLengths(value) {
    if (isLength(value)) return readLength(value);
    if (Array.isArray(value)) return value.map(readLengths);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, readLengths(entry)]));
    return value;
}
