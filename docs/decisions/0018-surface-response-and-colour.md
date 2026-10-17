# Surface response · colour as a first-class control

**Object/control update:** [decision 0019](0019-origins-locks-and-number-surfaces.md) advances canonical objects to schema v3 and reuses NumberControl inside the color dialog and inspector.


Implemented 2026-10-17 following the owner's request for specular colour, sharpness,
reflectivity and a pill that opens a complete colour wheel. Extends
[materials/presentation](0013-presentation-and-materials.md); the forward WebGL2
renderer and single Lobby scheduler remain the same.

## Surface data and rendering

All opaque materials now accept three optional version-two fields:

| Field | Bounds / default | Meaning |
| --- | --- | --- |
| `specularColor` | Linear RGB 0–1 / white | Tint of direct-light surface reflection |
| `specularSharpness` | 0–1 / 0.5 | 0 broad/soft, 1 narrow/polished |
| `reflectivity` | 0–1 / 0 | Normal-incidence reflectance multiplier (F₀) |

`reflectivity: 0.04` is a useful starting point for ordinary polished dielectric
surfaces. Higher values create stronger, more stylized reflections; the tint can
suggest champagne metal without introducing a separate material type. These are
artistic surface controls, not a claim of a complete physically calibrated PBR
workflow or a metallic/IOR/clearcoat model.

The shader evaluates GGX distribution, Smith masking and Schlick Fresnel for the
sun and each enabled point light, applying the same light visibility/falloff used
by diffuse lighting. Sharpness maps to perceptual roughness `max(0.08,1-sharpness)`;
alpha is roughness squared. The minimum bounds singular highlights. The Fresnel
grazing response is scaled by reflectivity as an artistic control, and the diffuse
term is reduced by tinted F₀. Zero reflectivity bypasses specular and preserves the
previous diffuse image. Ambient AO affects ambient only; emission remains independent.
Both direct and HDR paths use the same linear surface response before tone mapping;
bright highlights can seed the existing bloom.

Perspective uses fragment-to-eye view vectors; orthographic uses parallel camera
rays. Neither lens fakes an eye at the orbit pivot. No extra render pass, light slot,
texture, frame subscription or shadow target is allocated for these properties.
Mirror/scene reflections, screen-space reflections, environment maps/probes,
transparency/refraction, texture maps and GI remain separate future capabilities.
Reflectivity here reflects direct lights, not neighbouring buildings or objects.

Basement owns validation/material copying, GPU packing and shader response.
Directory keeps shared scene-owned material arrays stable during edits. Optional
fields are backward-compatible: validators reject invalid present fields but do
not fill or mutate older JSON; runtime construction and inspector metadata supply
the declared defaults. Export keeps edits, undo restores exact prior data, and
private copies/Play use independent numerical storage.

Lit records are **24 floats / 96 bytes**, including emission RGB/sharpness and
specular RGB/reflectivity. Shadow records remain **16 floats / 64 bytes**. At capacity
2048, a lit batch requests 196,608 bytes on CPU and GPU each; diagnostics account
for actual record storage. Material-only edits do not invalidate depth maps.

## Shared colour control

Every colour descriptor in the common property inspector uses Penthouse's
`ColorControl`: base, emission and specular colours, plus point-light irradiance.
Studio composes it through metadata rather than creating a material-only picker.
Non-colour vectors such as position stay numeric.

A labelled pill shows a normalized sRGB swatch/hex and an explicit HDR multiplier
when needed. It opens a native modal dialog with a continuous hue/saturation wheel,
keyboard-accessible hue/saturation/brightness sliders, intensity, hex and exact
linear RGB fields. All action buttons have native 44px minimum targets. The wheel
is painted with CSS gradients, not Canvas 2D or raster textures.

Authored colour stays linear. Wheel/hex use the standard sRGB transfer function;
HDR editing separates normalized sRGB from a linear gain of at least one. The gain
is capped by the descriptor (16 for base/emission/light colours, 1 for specular).
An unchanged open/Apply does not quantize colour or create history. Returning to the
opening colour also restores the exact original representation, including omitted
optional fields; repeated identical samples skip document previews. Grey/black
retains the current hue during the modal session. The swatch is a display colour,
not a promise that a monitor displays HDR energy directly.

A dialog session is one document transaction: edits preview live, **Apply colour**
commits once, **Cancel/Escape** restores the opening value. Invalid fields block
Apply. Wheel pointer cancellation restores the start of that pointer gesture while
retaining earlier dialog edits. Arrow keys offer hue/saturation control without
pointer precision; native ranges and linear fields provide alternate access.
Modal keyboard events stay out of scene shortcuts. Selection/import/Play/disposal
cancels unaccepted previews and releases the dialog/listeners. No document,
renderer, game ID, global picker singleton or extra scheduler lives in the widget.

## Editing points and verification

- `engine/basement/material.js`, `properties.js`: material validation/defaults and common metadata.
- `engine/basement/shaders.js`, `renderer.js`: direct-light response and retained packing.
- `engine/basement/color.js`: pure colour-space conversion helpers.
- `engine/penthouse/color-control.js`, `.css`: reusable modal colour UI and lifetime.
- `engine/penthouse/property-inspector.js`: shared transaction composition.
- `editor/workspace/materials.js`: contextual explanation; no surface algorithm.

[Previews and recorded checks](../milestones/surface-response/README.md). Run
`npm test`, `npm run build`, `npm run test:surface`, `npm run test:materials` and the
applicable rendering, bloom, Studio, authoring, camera and Freelancer regressions.
Software WebGL and emulated touch establish behavior, not physical-phone speed.
