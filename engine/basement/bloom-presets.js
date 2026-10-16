/** Basement / named bloom recipes over ordinary validated effect settings.
 * No scene/material/exposure/quality policy lives here. Hosts may apply or edit these freely. */
export const BLOOM_PRESETS = Object.freeze(
  [
    {
      id: "subtle",
      name: "Subtle",
      settings: {
        strength: 0.65,
        threshold: 1,
        knee: 0.6,
        radius: 1.25,
        scatter: 0.8,
        haze: 0,
      },
    },
    {
      id: "luxe",
      name: "Luxe",
      settings: {
        strength: 2.2,
        threshold: 0.6,
        knee: 0.75,
        radius: 2,
        scatter: 0.85,
        haze: 0.35,
      },
    },
    {
      id: "dream",
      name: "Dream",
      settings: {
        strength: 5,
        threshold: 0.25,
        knee: 0.85,
        radius: 3.5,
        scatter: 0.9,
        haze: 0.8,
      },
    },
    {
      id: "full",
      name: "Full bloom",
      settings: {
        strength: 10,
        threshold: 0.05,
        knee: 1,
        radius: 5,
        scatter: 0.92,
        haze: 1.5,
      },
    },
  ].map((p) => Object.freeze({ ...p, settings: Object.freeze(p.settings) })),
);
/** Derive the displayed recipe from actual values; external edits must never leave a stale label. */
export function matchingBloomPreset(settings) {
  return (
    BLOOM_PRESETS.find((p) =>
      Object.entries(p.settings).every(
        ([key, value]) => settings[key] === value,
      ),
    )?.id ?? "custom"
  );
}
