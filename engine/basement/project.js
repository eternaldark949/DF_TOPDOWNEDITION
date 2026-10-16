/**
 * Basement / authored project contract. JSON is data, never executable behavior.
 * This first portable package contains scenes and assembly assets together. Validation
 * happens before adoption and packaging; IDs survive serialization independently of World IDs.
 * Limits bound synchronous parsing, history and procedural construction on mobile devices.
 */
import { validateMaterial } from "./material.js";
export const PROJECT_LIMITS = Object.freeze({
  bytes: 524288,
  scenes: 8,
  assets: 256,
  entities: 256,
  parts: 128,
  totalParts: 4096,
  materials: 4096,
});

/** Return an independent plain-data value; never share authoring storage with simulation. */
export function copyData(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Validate version, graph, numeric domains and the explicitly supported generator catalog. */
function validateProjectData(
  project,
  { generators = null } = {},
  legacy = false,
) {
  const fail = (path, message) => {
    throw new Error(`${path}: ${message}`);
  };
  const check = (ok, path, message) => {
    if (!ok) fail(path, message);
  };
  const number = (v, path, min = -10000, max = 10000) =>
    check(
      Number.isFinite(v) && v >= min && v <= max,
      path,
      `expected finite ${min}…${max}`,
    );
  const vector = (v, n, path, min = -10000, max = 10000) => {
    check(Array.isArray(v) && v.length === n, path, `expected ${n} components`);
    v.forEach((x, i) => number(x, `${path}[${i}]`, min, max));
  };
  const text = (v, path) =>
    check(
      typeof v === "string" && v.length > 0 && v.length <= 120,
      path,
      "expected 1–120 characters",
    );
  const list = (v, max, path) =>
    check(
      Array.isArray(v) && v.length > 0 && v.length <= max,
      path,
      `expected 1–${max} entries`,
    );
  const ids = (items, path) => {
    const seen = new Set();
    for (const item of items) {
      text(item?.id, `${path}.id`);
      check(!seen.has(item.id), path, `duplicate ID ${item.id}`);
      seen.add(item.id);
    }
    return seen;
  };
  const rotation = (q, path) => {
    vector(q, 4, path, -1, 1);
    check(
      Math.abs(Math.hypot(...q) - 1) < 0.001,
      path,
      "expected unit quaternion",
    );
  };
  const json = JSON.stringify(project, (_k, v) => {
    if (typeof v === "number" && !Number.isFinite(v))
      fail("project", "non-finite number");
    return v;
  });
  check(
    typeof json === "string" &&
      new TextEncoder().encode(json).length <= PROJECT_LIMITS.bytes,
    "project",
    "package exceeds 512 KiB",
  );
  check(
    project?.schemaVersion === (legacy ? 1 : 2),
    "schemaVersion",
    "expected material-linked schema version 2",
  );
  text(project.id, "id");
  text(project.name, "name");
  list(project.assets, PROJECT_LIMITS.assets, "assets");
  list(project.scenes, PROJECT_LIMITS.scenes, "scenes");
  let materialIds = new Set();
  if (!legacy) {
    check(
      Array.isArray(project.materials) &&
        project.materials.length <= PROJECT_LIMITS.materials,
      "materials",
      "expected 0–4096 material definitions",
    );
    materialIds = ids(project.materials, "materials");
    project.materials.forEach((m, i) => {
      text(m.name, `materials[${i}].name`);
      validateMaterial(m);
    });
  }
  const assets = ids(project.assets, "assets");
  ids(project.scenes, "scenes");
  let total = 0;
  for (const [ai, a] of project.assets.entries()) {
    const p = `assets[${ai}]`;
    text(a.name, p + ".name");
    text(a.generator, p + ".generator");
    check(
      Number.isInteger(a.generatorVersion) && a.generatorVersion > 0,
      p + ".generatorVersion",
      "expected positive version",
    );
    if (generators)
      check(
        Object.hasOwn(generators, a.generator) &&
          generators[a.generator] === a.generatorVersion,
        p,
        "unsupported generator/version",
      );
    list(a.parts, PROJECT_LIMITS.parts, p + ".parts");
    ids(a.parts, p + ".parts");
    total += a.parts.length;
    check(total <= PROJECT_LIMITS.totalParts, p, "part budget exceeded");
    a.parts.forEach((part, i) => {
      const q = `${p}.parts[${i}]`;
      check(
        part.parent === null ||
          (Number.isInteger(part.parent) &&
            part.parent >= 0 &&
            part.parent < i),
        q + ".parent",
        "parent must precede child",
      );
      vector(part.position, 3, q + ".position");
      rotation(part.rotation, q + ".rotation");
      if (part.shape) {
        const s = part.shape;
        vector(s.size, 3, q + ".shape.size", 0.001, 1000);
        if (legacy) {
          vector(s.color, 3, q + ".shape.color", 0, 16);
          number(s.emission, q + ".shape.emission", 0, 32);
        } else {
          check(
            materialIds.has(s.material),
            q + ".shape.material",
            "unresolved material",
          );
          check(
            !Object.hasOwn(s, "color") && !Object.hasOwn(s, "emission"),
            q + ".shape",
            "inline appearance is not supported in version 2",
          );
        }
        for (const key of ["castShadow", "ambientBlocker"])
          if (s[key] !== undefined)
            check(
              typeof s[key] === "boolean",
              q + ".shape." + key,
              "expected boolean",
            );
      }
    });
    check(
      Array.isArray(a.colliders) && a.colliders.length <= 128,
      p + ".colliders",
      "expected bounded collider list",
    );
    for (const c of a.colliders) {
      number(c.x, p + ".collider.x");
      number(c.y, p + ".collider.y");
      number(c.width, p + ".collider.width", 0.001, 1000);
      number(c.depth, p + ".collider.depth", 0.001, 1000);
    }
  }
  for (const [si, s] of project.scenes.entries()) {
    const p = `scenes[${si}]`;
    text(s.name, p + ".name");
    text(s.key, p + ".key");
    check(
      !project.scenes.slice(0, si).some((o) => o.key === s.key),
      p + ".key",
      "duplicate realm key",
    );
    check(typeof s.ethereal === "boolean", p + ".ethereal", "expected boolean");
    vector(s.ambient, 3, p + ".ambient", 0, 16);
    vector(s.sun?.direction, 3, p + ".sun.direction");
    check(
      Math.hypot(...s.sun.direction) > 0.001,
      p + ".sun.direction",
      "zero direction",
    );
    vector(s.sun.color, 3, p + ".sun.color", 0, 16);
    list(s.entities, PROJECT_LIMITS.entities, p + ".entities");
    check(
      s.entities.reduce(
        (n, e) =>
          n + (project.assets.find((a) => a.id === e.asset)?.parts.length ?? 0),
        0,
      ) <= 1800,
      p + ".entities",
      "placed geometry exceeds 1800 parts",
    );
    ids(s.entities, p + ".entities");
    s.entities.forEach((e, i) => {
      const q = `${p}.entities[${i}]`;
      text(e.name, q + ".name");
      check(assets.has(e.asset), q + ".asset", "unresolved asset");
      vector(e.position, 3, q + ".position");
      rotation(e.rotation, q + ".rotation");
      number(e.scale, q + ".scale", 0.05, 20);
      check(typeof e.locked === "boolean", q + ".locked", "expected boolean");
      if (e.materialOverrides !== undefined) {
        check(
          !legacy &&
            e.materialOverrides !== null &&
            typeof e.materialOverrides === "object" &&
            !Array.isArray(e.materialOverrides),
          q + ".materialOverrides",
          "expected material binding map",
        );
        const asset = project.assets.find((a) => a.id === e.asset);
        for (const [part, material] of Object.entries(e.materialOverrides)) {
          check(
            asset.parts.some((p) => p.id === part && p.shape),
            q + ".materialOverrides",
            "unresolved surface part",
          );
          check(
            materialIds.has(material),
            q + ".materialOverrides",
            "unresolved material",
          );
        }
      }
    });
    if (s.lightVariants)
      for (const [name, v] of Object.entries(s.lightVariants)) {
        check(
          ["cool", "warm"].includes(name),
          p + ".lightVariants",
          "unknown variant",
        );
        vector(v.crystal, 3, p + ".lightVariants." + name + ".crystal", 0, 16);
        vector(
          v.irradiance,
          3,
          p + ".lightVariants." + name + ".irradiance",
          0,
          16,
        );
      }
    check(
      Array.isArray(s.lights) && s.lights.length === 8,
      p + ".lights",
      "expected eight light slots",
    );
    ids(s.lights, p + ".lights");
    s.lights.forEach((l, i) => {
      vector(l.position, 3, `${p}.lights[${i}].position`);
      vector(l.color, 3, `${p}.lights[${i}].color`, 0, 16);
      number(l.radius, `${p}.lights[${i}].radius`, 0.1, 100);
    });
  }
  return project;
}

/** Parse only after checking source bytes, so oversized files never enter JSON.parse. */
export function parseProject(text, validate = validateProject) {
  if (new TextEncoder().encode(text).length > PROJECT_LIMITS.bytes)
    throw new Error("Project exceeds 512 KiB");
  return validate(upgradeProject(JSON.parse(text)));
}

/** Current schema validation never mutates or implicitly upgrades its argument. */
export function validateProject(project, options = {}) {
  return validateProjectData(project, options);
}
/** One explicit ingress migration. Existing geometry/placement IDs and radiance are preserved.
 * Sharing is scoped to equal appearances inside each source asset, avoiding accidental links
 * between unrelated assets merely because their RGB values happen to match. */
export function upgradeProject(source) {
  if (source?.schemaVersion !== 1) return source;
  validateProjectData(source, {}, true);
  const p = copyData(source);
  p.schemaVersion = 2;
  p.materials = [];
  let next = 1;
  for (const asset of p.assets) {
    const appearances = new Map();
    for (const part of asset.parts) {
      const shape = part.shape;
      if (!shape) continue;
      const key = JSON.stringify([shape.color, shape.emission]);
      let id = appearances.get(key);
      if (!id) {
        id = `material:${next++}`;
        appearances.set(key, id);
        p.materials.push({
          id,
          name: `${asset.name} · ${appearances.size}`.slice(0, 120),
          baseColor: [...shape.color],
          emissionColor: [...shape.color],
          emissionStrength: shape.emission,
        });
      }
      shape.material = id;
      delete shape.color;
      delete shape.emission;
    }
  }
  return validateProject(p);
}
