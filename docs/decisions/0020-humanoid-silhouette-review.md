# Procedural humanoid · silhouette review stage

Implemented 2026-10-17 under the owner's go-ahead to begin the humanoid work. This is the review stage that [decision 0007](0007-studio-first-workspace.md#agreed-next-work-street-block-studio-presentation-and-humanoid-review) requires before surface detail: front, side, three-quarter and gameplay-camera previews with solid silhouettes, so proportions, posture, limb spacing and the backpack outline can be judged first, then readability while walking and turning.

**Status:** implemented, then superseded in part by [decision 0021](0021-rounded-bodies-and-garments.md). The review page, cameras, silhouette look, parameter-table pattern and `poseHumanoid` described here remain. The box body segments, the schema-1 document and the field table below are historical: generator v2 builds rounded bodies from the 2D game's canon and generates clothing. The Freelancer street slice still uses the diagnostic box traveler until the owner approves 949's look.

## Delivered boundary

- **Penthouse** (`engine/penthouse/humanoid.js`): the reusable `toy.humanoid` generator. One parameter table (`HUMANOID_PARAMETERS`) drives validation, the review sliders and this record's units. `validateHumanoid` returns a frozen deep copy and refuses unknown fields, out-of-range values and impossible combinations (thighs wider than hips, a waist wider than both shoulders and hips, no room for a torso). `humanoidMeasurements` derives every joint height and segment size as plain data. `createHumanoid` builds invisible joint pivots and box segments through `World` only. `poseHumanoid` applies a procedural gait.
- **Game** (`games/freelancer/`): `content/humanoid-949.json` is the authoritative, owner-editable preset for Stella / Freelancer 949. `humanoid/review.js` composes the review scene; `humanoid/main.js` and `index.html` are the standalone page, built to `dist/ETRNLNINE-Humanoid-Review.html`. Character identity, palette and review UI stay out of `engine/`.
- **No Basement, Lobby or Directory changes.** The review uses the existing renderer, line guides, Directory world/lease ownership and Lobby phases. Silhouette mode swaps live material references and turns shadows/AO off; it adds no renderer path.

## Body representation

Units are metres and radians; the figure faces local −Y, matching the planar motor. The skeleton is pelvis → waist → neck → head, shoulders → elbows → wrists, and hips → knees → ankles, each an invisible `World` entity whose quaternion the pose writes in place. Segments are oriented boxes: limbs use two stacked halves so the far half tapers, the chest and pelvis use two boxes each so the waist-to-hip and shoulder-to-ribcage transitions read in outline, and hair styles (`none`, `short`, `bun`, `ponytail`) are silhouette volumes. A figure is 30–36 boxes.

These are deliberately not meshes. There is no skinning, IK, foot contact on uneven ground, cloth, hair simulation or collision body yet; the renderer still draws only instanced boxes. The review is about the outline, which boxes express adequately; rounded or skinned geometry is the next rendering capability, not part of this stage.

## Document fields

A humanoid document has `schemaVersion: 1`, `kind: "humanoid"`, `id`, `name`, `generatorVersion: 1`, `parameters` and `palette`. Palette slots (`skin`, `hair`, `top`, `bottoms`, `legwear`, `shoes`, `bag`, `strap`) are linear RGB 0–1; `legwear` covers the lower thigh and shin, so thigh-highs read as their own band. Fractions are of standing height. This table is generated from `HUMANOID_PARAMETERS`, which remains the source of truth.

| Group | Field | Meaning | Unit | Limits |
| --- | --- | --- | --- | --- |
| Body | `height` | Height | m | 1.2–2.2 |
| Body | `headHeight` | Head height | × height | 0.1–0.2 |
| Body | `legLength` | Leg length | × height | 0.4–0.6 |
| Body | `armLength` | Arm length | × height | 0.35–0.5 |
| Body | `neckLength` | Neck length | × height | 0.02–0.08 |
| Torso | `shoulderWidth` | Shoulder width | m | 0.25–0.55 |
| Torso | `chestDepth` | Chest depth | m | 0.14–0.34 |
| Torso | `waistWidth` | Waist width | m | 0.18–0.45 |
| Torso | `hipWidth` | Hip width | m | 0.24–0.5 |
| Torso | `headWidth` | Head width | × head height | 0.6–0.95 |
| Limbs | `upperArm` | Upper arm | m | 0.06–0.16 |
| Limbs | `forearm` | Forearm | m | 0.05–0.13 |
| Limbs | `thigh` | Thigh | m | 0.1–0.24 |
| Limbs | `calf` | Calf | m | 0.07–0.17 |
| Limbs | `limbTaper` | Limb taper | far / near | 0.55–1 |
| Limbs | `footLength` | Foot length | × height | 0.12–0.18 |
| Limbs | `stance` | Stance width | m | 0–0.2 |
| Posture | `spineLean` | Spine lean | rad | -0.2–0.3 |
| Posture | `headTilt` | Head tilt | rad | -0.3–0.3 |
| Posture | `armSpread` | Arm spread | rad | 0–0.4 |
| Backpack | `backpackWidth` | Pack width | m | 0.2–0.6 |
| Backpack | `backpackHeight` | Pack height | m | 0.25–0.75 |
| Backpack | `backpackDepth` | Pack depth | m | 0.1–0.4 |
| Backpack | `backpackDrop` | Pack drop | m | -0.1–0.3 |
| Backpack | `backpackMass` | Pack mass | kg | 0–30 |
| Outline | `hair` | Hair volume | choice | none, short, bun, ponytail |
| Outline | `backpack` | Wear backpack | boolean | true, false |

## Motion

`poseHumanoid(rig, { phase, amount, turn, accel, dt })` takes authoritative movement state from its caller and never reads input. It produces thigh swing with swing-phase knee bend, near-level feet, counter-swinging arms, a pelvis bob and twist with chest counter-twist, a forward walking lean and a lean into turns. The backpack hangs from its own pivot on a damped spring: forward acceleration tips it back and turning swings it outward, with response slowing as `backpackMass` rises. Angles and rates are clamped, so extreme input cannot produce runaway motion. This is the first concrete step toward the load-aware movement in README §10.4; the turning *curve* (wider turns under load) still belongs to a future locomotion model, not this pose function.

## Review page

- **Turnaround:** front, three-quarter, side and back figures on a level orthographic camera, with head-height rules behind them. Narrow screens stack them 2×2.
- **Gameplay camera:** the exact Clinic Way camera (azimuth, elevation, half-height and narrow-screen widening) at true game scale, or a 3× close-up that follows the figure. The figure walks a figure-eight so both turn directions show. The existing diagnostic traveler stands nearby for comparison.
- **Looks:** shaded palette, or pure black silhouettes on an emissive card.
- **Proportions panel:** shared Penthouse number controls for every parameter, plus hair and backpack choices. A slider drag or typing session is one undo step (48-step history). Invalid combinations are reported and leave the figures unchanged. Export JSON downloads a file to commit as `content/humanoid-949.json`; nothing writes to the repository automatically.

## Verification

`tests/humanoid.test.js` covers validation, rest-pose ground contact and height across the parameter range, unit quaternions and bounded pack motion under extreme driving input, and repeated rebuild/disposal without leaked entities. `npm run test:humanoid` runs the offline artifact: Canvas2D forbidden, no requests, turnaround/silhouette/walk, height edit → export → undo, refusal of an impossible hip width, gameplay camera, and bounded GPU buffers across repeated view changes. A source fixture reads real silhouette pixels: every view draws, the card dominates, a taller figure covers more pixels, removing the pack shrinks the outline (most in profile), and disposal returns the renderer to its own unit cube. All of this runs on SwiftShader; it does not measure phone performance.

Evidence and screenshots: [humanoid milestone](../milestones/humanoid/README.md).

## Next step

1. The owner reviews the silhouettes and adjusts the preset (or asks for adjustments).
2. Replace the Freelancer traveler with the approved humanoid, driven by the existing `PlanarMotor` velocity and turn rate.
3. Then add rounded or skinned body geometry and surface detail (clothing, thigh-high finishes, face), followed by the turning curve under load, uneven-ground contact and the Studio humanoid workspace through the shared document/inspector/command contracts in decision 0006.
