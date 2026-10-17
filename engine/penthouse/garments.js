/**
 * Penthouse / garments: clothing as data, generated from the body it is worn on.
 *
 * The idea is ported from the 2D game's wardrobe (src/ui/wardrobe.js on main): a garment
 * does not carry its own geometry. It names which parts of the body it covers and how
 * thick it is; the humanoid generator then grows those same body shapes outward by that
 * thickness over the covered span. Every garment therefore fits every gender, build and
 * height with no per-body authoring, and a new garment is a few lines of JSON.
 *
 * Body regions (paired regions apply to both sides). Spans are [from, to] fractions along
 * the region, measured from the end nearest the head (0) to the far end (1):
 *   neck, chest (shoulders → waist), pelvis (waist → crotch), upperArm, forearm, hand,
 *   thigh, calf, foot. `bust` is implied: a garment over the chest also covers it.
 * Shorthands, as in the 2D wardrobe (explicit spans win when both are given):
 *   sleeve  none | cap | short | elbow | long          (tops, outerwear)
 *   legs    none | brief | shorts | knee | full        (bottoms, legwear)
 *   skirt   { length: × thigh length, flare: hem width ÷ hip width }
 * Layering comes from the slot: legwear sits on the skin, then tops, bottoms (tops tuck in),
 * shoes, outerwear. `thickness` (metres) overrides the slot's default growth.
 *
 * Finishes map to existing surface response only (decision 0018): matte, satin, gloss.
 * The 2D game's velvet and sparkle need new shader terms and are not implemented yet.
 */

/** Wear order and default growth over the layer beneath (metres). */
export const GARMENT_SLOTS = Object.freeze({
  legwear: Object.freeze({ order: 1, thickness: 0.003 }),
  top: Object.freeze({ order: 2, thickness: 0.006 }),
  bottom: Object.freeze({ order: 3, thickness: 0.008 }),
  shoes: Object.freeze({ order: 4, thickness: 0.009 }),
  outer: Object.freeze({ order: 5, thickness: 0.016 }),
});

/** Surface response per finish, in the material fields of decision 0018. */
export const GARMENT_FINISHES = Object.freeze({
  matte: Object.freeze({ specularSharpness: 0.25, reflectivity: 0.02 }),
  satin: Object.freeze({ specularSharpness: 0.55, reflectivity: 0.05 }),
  gloss: Object.freeze({ specularSharpness: 0.86, reflectivity: 0.1 }),
});

/** Regions a garment may name, in generation order. */
export const GARMENT_REGIONS = Object.freeze(["neck", "chest", "pelvis", "upperArm", "forearm", "hand", "thigh", "calf", "foot"]);

/** Shorthand expansions. Kept as data so the review UI and docs can list them. */
export const GARMENT_SHORTHANDS = Object.freeze({
  sleeve: Object.freeze({
    none: {},
    cap: { upperArm: [0, 0.18] },
    short: { upperArm: [0, 0.45] },
    elbow: { upperArm: [0, 1] },
    long: { upperArm: [0, 1], forearm: [0, 0.94] },
  }),
  legs: Object.freeze({
    none: {},
    brief: { thigh: [0, 0.08] },
    shorts: { thigh: [0, 0.4] },
    knee: { thigh: [0, 1] },
    full: { thigh: [0, 1], calf: [0, 0.94] },
  }),
});

const span = (value, where) => {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite) || value[0] < 0 || value[1] > 1 || value[1] - value[0] < 0.02)
    throw new RangeError(`${where} must be [from, to] with 0 ≤ from < to ≤ 1`);
};
const colour = (value, where) => {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => Number.isFinite(n) && n >= 0 && n <= 1))
    throw new RangeError(`${where} needs three linear RGB values in 0–1`);
};

/** Validate one garment definition. Throws with the garment's id in the message. */
export function validateGarment(g) {
  if (!g || typeof g !== "object") throw new TypeError("Garment must be an object");
  const where = `Garment ${g.id ?? "?"}`;
  const known = new Set(["id", "name", "slot", "color", "finish", "thickness", "sleeve", "legs", "skirt", ...GARMENT_REGIONS]);
  for (const key of Object.keys(g)) if (!known.has(key)) throw new Error(`${where}: unknown field ${key}`);
  for (const key of ["id", "name"])
    if (typeof g[key] !== "string" || !g[key].length || g[key].length > 60) throw new Error(`${where}: ${key} must contain 1–60 characters`);
  if (!GARMENT_SLOTS[g.slot]) throw new RangeError(`${where}: slot must be one of ${Object.keys(GARMENT_SLOTS).join(", ")}`);
  colour(g.color, `${where} color`);
  if (!GARMENT_FINISHES[g.finish]) throw new RangeError(`${where}: finish must be one of ${Object.keys(GARMENT_FINISHES).join(", ")}`);
  if (g.thickness !== undefined && (!Number.isFinite(g.thickness) || g.thickness < 0.001 || g.thickness > 0.05))
    throw new RangeError(`${where}: thickness must be 0.001–0.05 m`);
  for (const key of ["sleeve", "legs"])
    if (g[key] !== undefined && !GARMENT_SHORTHANDS[key][g[key]])
      throw new RangeError(`${where}: ${key} must be one of ${Object.keys(GARMENT_SHORTHANDS[key]).join(", ")}`);
  for (const region of GARMENT_REGIONS) if (g[region] !== undefined) span(g[region], `${where} ${region}`);
  if (g.skirt !== undefined) {
    const s = g.skirt;
    if (!s || !Number.isFinite(s.length) || s.length < 0.1 || s.length > 2.2 || !Number.isFinite(s.flare) || s.flare < 1 || s.flare > 2.5 || Object.keys(s).some((k) => k !== "length" && k !== "flare"))
      throw new RangeError(`${where}: skirt needs length 0.1–2.2 (× thigh) and flare 1–2.5`);
  }
  if (!Object.keys(garmentCoverage(g)).length && !g.skirt) throw new Error(`${where} covers nothing`);
  return g;
}

/**
 * Expand shorthands into explicit region spans: { region: [from, to] }. Pure and cheap,
 * so the generator calls it per build rather than caching expanded copies.
 */
export function garmentCoverage(g) {
  const out = {};
  for (const key of ["sleeve", "legs"]) if (g[key]) Object.assign(out, GARMENT_SHORTHANDS[key][g[key]]);
  for (const region of GARMENT_REGIONS) if (g[region]) out[region] = g[region];
  return out;
}

/**
 * Validate a wardrobe document: { schemaVersion: 1, kind: "wardrobe", id, garments: [...] }.
 * Returns a frozen copy plus a Map from garment id to definition for lookups.
 */
export function validateWardrobe(doc) {
  if (!doc || doc.schemaVersion !== 1 || doc.kind !== "wardrobe") throw new Error("Expected a schema-1 wardrobe document");
  if (typeof doc.id !== "string" || !doc.id.length) throw new Error("Wardrobe id is required");
  if (!Array.isArray(doc.garments) || !doc.garments.length || doc.garments.length > 256) throw new RangeError("Wardrobe needs 1–256 garments");
  const ids = new Set();
  for (const g of doc.garments) {
    validateGarment(g);
    if (ids.has(g.id)) throw new Error(`Duplicate garment id ${g.id}`);
    ids.add(g.id);
  }
  const frozen = freeze(structuredClone(doc));
  return Object.freeze({ document: frozen, garments: new Map(frozen.garments.map((g) => [g.id, g])) });
}

/**
 * Resolve an outfit (the humanoid document's list) against a validated wardrobe.
 * Entries are { garment: id, color?, finish? }; colour/finish override the catalogue so one
 * garment definition yields many looks. Returns definitions sorted into wear order.
 */
export function resolveOutfit(outfit, wardrobe) {
  if (!outfit.length) return [];
  if (!wardrobe?.garments) throw new Error("This outfit needs a wardrobe");
  return outfit
    .map((entry, index) => {
      const base = wardrobe.garments.get(entry.garment);
      if (!base) throw new Error(`Outfit garment ${entry.garment} is not in wardrobe ${wardrobe.document.id}`);
      return { ...base, color: entry.color ?? base.color, finish: entry.finish ?? base.finish, index };
    })
    .sort((a, b) => GARMENT_SLOTS[a.slot].order - GARMENT_SLOTS[b.slot].order || a.index - b.index);
}

/**
 * Generate an outfit from a wardrobe: always a top, a bottom and shoes, sometimes legwear
 * and outerwear. `random` returns [0, 1) (inject a seeded one for repeatable crowds);
 * `colors`, when given, recolours each piece from that list, so one catalogue yields
 * many looks. Returns outfit entries ready for a humanoid document.
 */
export function generateOutfit(wardrobe, { random = Math.random, colors = null } = {}) {
  const bySlot = {};
  for (const g of wardrobe.garments.values()) (bySlot[g.slot] ??= []).push(g);
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  const chances = { top: 1, bottom: 1, shoes: 1, legwear: 0.5, outer: 0.3 };
  const outfit = [];
  for (const [slot, chance] of Object.entries(chances)) {
    if (!bySlot[slot] || random() >= chance) continue;
    const g = pick(bySlot[slot]),
      entry = { garment: g.id };
    if (colors?.length) entry.color = [...pick(colors)];
    outfit.push(entry);
  }
  return outfit;
}

/** Validate the shape of outfit entries (wardrobe membership is checked at generation). */
export function validateOutfit(outfit) {
  if (!Array.isArray(outfit) || outfit.length > 12) throw new RangeError("Outfit must be a list of up to 12 garments");
  for (const entry of outfit) {
    if (!entry || typeof entry.garment !== "string" || Object.keys(entry).some((k) => !["garment", "color", "finish"].includes(k)))
      throw new Error("Outfit entries are { garment, color?, finish? }");
    if (entry.color !== undefined) colour(entry.color, `Outfit ${entry.garment} color`);
    if (entry.finish !== undefined && !GARMENT_FINISHES[entry.finish]) throw new RangeError(`Outfit ${entry.garment}: unknown finish`);
  }
}

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
