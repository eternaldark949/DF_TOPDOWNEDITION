# Bloom art direction · subtle through enveloping

Implemented 2026-10-16 following the owner's request for a genuinely full bloom range. Extends [0012](0012-hdr-bloom.md), preserving [0013's Presentation/Bloom ownership](0013-presentation-and-materials.md). DAW application architecture remains a discussion; no audio system is implemented by this change.

## Controls and recipes

The shared **Image & effects** widget in Studio and Freelancer now exposes:

| Control | Range | Meaning |
| --- | --- | --- |
| Bloom strength | 0–16 | Additive glow radiance; independent of exposure |
| Bloom spread | 0.5–8 | Tent radius in coarse pyramid texels |
| Bloom scatter | 0–1 | Weight toward broader reconstructed scales |
| Bloom haze | 0–4 | Additional broad energy from the smallest reduction |
| Bloom threshold | 0–16 | Source selection in scene-linear peak RGB; zero admits all radiance |
| Bloom soft knee | 0–1 | Relative soft transition around the threshold |
| Exposure | 0.05–8 | Whole-scene Presentation setting, independent of recipes |

`bloom-settings.js` exports one frozen parameter catalog for validation and UI labels/bounds/help. No duplicated numeric ranges in the hosts. `bloom-presets.js` supplies immutable Subtle, Luxe, Dream and Full bloom recipes over ordinary settings. Selecting a recipe explicitly opts into Soft when Off, keeps an existing quality and leaves exposure unchanged. Manual/external edits derive the recipe label from actual values; unmatched values show Custom. Editing any shaping field reuses filter targets/programs and the shared HDR scene.

Defaults retain the previous Subtle values, with haze zero; opening a build still starts bloom Off. Quality remains separate from look. Soft/Fine retain existing resolution, level and memory budgets. These viewport preferences stay outside project JSON/history/recovery and survive Play/restart in the existing renderer.

## Broad haze without another target chain

The final reconstruction samples the already-owned smallest reduction through a normalized nine-tap tent and adds it with haze gain. Intermediate reconstructions use zero haze. This separates a broad luminous veil from the ordinary core/reconstruction balance, without another texture allocation, shader program, fullscreen submission, or loop. Nonzero haze adds nine texture reads on the final reconstruction; it has a real GPU cost despite unchanged storage/draw counts. Haze zero skips those reads. A one-level/tiny pyramid applies the gain during extraction, since no reconstruction exists.

Half-float writes clamp finite radiance to 65,000. Strength remains a separate gain in Presentation's generic additive composition. Brightness rolloff/display encoding and resolved guide depth remain Presentation responsibilities. Guides never seed the filter. Failure latching, context restore, partial cleanup and zero-strength bypass retain their existing ownership.

**Haze is screen-space bloom, not volumetric fog.** It has no world-space density, scattering through depth, or illumination of neighbouring surfaces. Low thresholds and high gains deliberately allow a washed, fully bloomed image; the recipe range is artistic headroom, not a requirement to use the extremes. Threshold/knee do not isolate every material perfectly: peak RGB radiance determines extraction. Source materials/light energy still affect the result.

## Editing points and verification

- [Settings/catalog](../../engine/basement/bloom-settings.js), [recipes/matching](../../engine/basement/bloom-presets.js).
- [Filter orchestration](../../engine/basement/bloom.js), [spatial shader](../../engine/basement/bloom-shaders.js).
- [Shared controls](../../engine/penthouse/appearance-controls.js); neither Studio nor Freelancer duplicates this UI.
- [Matched screenshots and verification](../milestones/bloom-tuning/README.md).

Use `npm test`, `npm run build`, `npm run test:bloom` and applicable runtime/editor regressions. Pixel tests compare glow coverage and independent haze at constant exposure, verify allocation/pass reuse, and preserve guide/depth/failure/restore checks. Browser UI checks cover both hosts, all shaping fields, recipes/Custom, exposure independence, Play/restart and quality disable. SwiftShader and emulated touch establish behavior, not physical-mobile performance.
