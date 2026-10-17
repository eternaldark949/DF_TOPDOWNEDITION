# Rounded bodies and generated clothing

Implemented 2026-10-17 under the owner's go-ahead to bring the 2D game's procedural humanoid look into 3D, with clothes that are easy to generate. This follows the silhouette stage in [decision 0020](0020-humanoid-silhouette-review.md), whose box figures it replaces.

**Status:** the rounded primitive, the ported body canon, the garment format, the Freelancer wardrobe and the review page's outfit tools are implemented. 949's proportions and outfit are still proposals awaiting the owner's review; the street slice keeps the diagnostic traveler until they are approved.

## Where the look comes from

The 2D humanoid on main (`src/ui/bodies.js`, `src/ui/wardrobe.js`) gets its look from four things, and each now has a 3D counterpart:

| 2D game | 3D engine |
| --- | --- |
| Tapered limbs `[near, belly, belly position, far]`, each ending in a circle the size of the next segment's start, so joints never break | One rounded instance per segment whose end domes have the end radii, so neighbouring segments meet in one continuous joint |
| Spline outlines for torso, pelvis and an egg head, deltoid caps over the shoulders, a big stylised head (16 across) | Rounded chest, pelvis and head with independent width/depth tapers and a width-only hip bulge, sphere deltoids and bust, the same head scale |
| Per-gender `BODY_CANON` and `BUILDS` (slim, athletic, curvy, broad, heavy) | `BODY_CANON` and `BODY_BUILDS` ported with the same numbers and the same shoulder/hip emphasis rules |
| Clothes drawn by inflating the body's own outlines over covered spans (`sleeve`, `legs`, stocking spans) | Garments grow the body's own regions over the spans they name, in wear order |

## Basement: rounded shapes

`engine/basement/rounded-shapes.js` adds a second renderer primitive beside the unit box: a smooth tapered capsule with elliptical cross-sections. Its shape is evaluated per vertex in the shader (`SHAPE_GLSL`, shared by the lit, depth and SSAO normal passes) from a profile:

- `taper` and `depthTaper`: far-end width and depth relative to the near end (0.05–3.99).
- `bulge` and `peak`: a smooth swell between the ends, largest at `peak`, with zero slope at both ends and at the peak. `widthOnly` applies it to the width alone.
- `flatNear` and `flatFar`: replace an end dome with a flat disc (garment hems).

Each end dome's height is that end's smaller radius, so segments with matching touching radii join without gaps. Dome normals blend into the body's sloped normal near the seam, so tapered shapes shade without a crease.

**Records:** lit records stay 24 floats and shadow records 16. The two lanes that were always zero carry the profile: `pose.w` holds the tapers (0 still means box, so every existing record is unchanged) and `size.w` holds peak, flags and bulge. Packing precision is tested against a JavaScript mirror of the shader's decode.

**Batches:** each batch keeps one stream per primitive, with its own retained CPU floats, GPU buffer, VAO and dirty range. A walking figure re-uploads only its rounded range, and static boxes stay untouched. The rounded stream, and the renderer's single shared rounded mesh (18 segments around × 20 rings: 380 vertices, 2052 indices), are allocated only when a world first contains a rounded shape, so box-only worlds cost exactly what they did before. Capacity still bounds both primitives together. Context restoration rebuilds both streams and the mesh from retained data. Each non-empty stream is one instanced submission in every pass, and draw counts report that honestly.

**CPU queries:** picking, asset bounds and analytic AO still treat a rounded shape as its box. The box encloses the shape whenever tapers are at most 1 and the bulge is at most 0. Otherwise the surface can extend slightly past it, which the culling radius accounts for.

## Penthouse: humanoid generator v2

`engine/penthouse/humanoid.js` builds the same joint hierarchy as before (pelvis, waist, neck, head, shoulders, elbows, wrists, hips, knees, ankles), so `poseHumanoid` and its bounded pack spring are unchanged. The body is now built from regions:

- **Regions:** each region is a near-dome centre in a joint's frame, an axis, near radii, a length and a profile: neck, chest, pelvis, upper arm, forearm, hand, thigh, calf and foot. A 2D limb taper becomes a region directly.
- **Skin:** each region is drawn once as an exact rounded instance.
- **Extra forms:** deltoid caps ride on the shoulder joints. The bust (female canon) sits on the chest, the egg head has ears, and hair styles (`none`, `short`, `bun`, `ponytail`, `curls`) are rounded volumes. Curls, 949's look in the 2D game, are a deterministic cluster of spheres that leaves the face clear.
- **Packs:** backpacks and straps stay boxes.

A figure in 949's outfit has 108 parts, and every part is one instance.

**Document schema 2** (`generatorVersion: 2`): the width parameters of v1 became multipliers on the canon for the chosen gender and build. Old schema-1 documents are refused rather than guessed at, because their widths have no meaning in the canon. The palette now holds body slots only (`skin`, `hair`, `bag`, `strap`), and `outfit` lists garments.

| Group | Field | Meaning | Unit | Limits |
| --- | --- | --- | --- | --- |
| Body | `height` | Height | m | 1.2–2.2 |
| Body | `headSize` | Head size | × canon | 0.7–1.3 |
| Body | `legLength` | Leg length | × height | 0.4–0.6 |
| Body | `armLength` | Arm length | × height | 0.35–0.5 |
| Body | `neckLength` | Neck length | × height | 0.02–0.08 |
| Body | `footLength` | Foot length | × height | 0.12–0.18 |
| Shape | `shoulders` | Shoulders | × canon | 0.8–1.25 |
| Shape | `waist` | Waist | × canon | 0.8–1.3 |
| Shape | `hips` | Hips | × canon | 0.8–1.35 |
| Shape | `bust` | Bust | × canon | 0–1.6 |
| Shape | `limbs` | Limb thickness | × canon | 0.75–1.35 |
| Shape | `stance` | Stance width | m | 0–0.2 |
| Posture | `spineLean` | Spine lean | rad | -0.2–0.3 |
| Posture | `headTilt` | Head tilt | rad | -0.3–0.3 |
| Posture | `armSpread` | Arm spread | rad | 0–0.4 |
| Backpack | `backpackWidth` | Pack width | m | 0.2–0.6 |
| Backpack | `backpackHeight` | Pack height | m | 0.25–0.75 |
| Backpack | `backpackDepth` | Pack depth | m | 0.1–0.4 |
| Backpack | `backpackDrop` | Pack drop | m | -0.1–0.3 |
| Backpack | `backpackMass` | Pack mass | kg | 0–30 |
| Choice | `gender` | Body canon | choice | female, androgynous, male |
| Choice | `build` | Build | choice | classic, slim, athletic, curvy, broad, heavy |
| Choice | `hair` | Hair volume | choice | none, short, bun, ponytail, curls |
| Choice | `backpack` | Wear backpack | boolean | true, false |

The canon unit is height ÷ 131, which puts the classic female's deltoids 0.37 m apart at 1.68 m. The stylised head (canon 16 × 17.2 × 19.5 units) is about 6.9 heads tall. A cross-check still refuses a head, neck and legs that leave no room for a torso.

## Penthouse: garments

`engine/penthouse/garments.js` defines clothing as data. A garment names a slot, a colour, a finish and the body spans it covers, given as `[from, to]` fractions along a region, where 0 is the end nearest the head and 0 is the heel for feet. The 2D wardrobe's shorthands are kept:

- `sleeve`: `none`, `cap`, `short`, `elbow` or `long`.
- `legs`: `none`, `brief`, `shorts`, `knee` or `full`.
- `skirt`: `{ length × thigh, flare }`.

A complete garment is one line:

```json
{ "id": "thigh-highs", "name": "Thigh-highs", "slot": "legwear", "color": [0.02, 0.018, 0.03], "finish": "gloss", "thigh": [0.42, 1], "calf": [0, 1], "foot": [0, 1] }
```

**Generation:** for each covered span, the generator grows that region outward by the garment's thickness on top of what is already worn there. Wear order comes from the slot: legwear, then top, bottom (tops tuck in), shoes, outer. The rules for spans:

- A span is split at the region's bulge peak and into pieces no longer than a third of the region. Each piece is refitted to the grown profile at its ends and middle, so a 2–3 mm stocking never lets skin show through.
- Ends that stop inside a region are flat hems. Ends at a region's own ends keep its domes, so a stocking wraps the knee as the skin does.
- Tops over the bust cover it, and sleeves carry the deltoid caps.
- Footwear lifts the body by its sole thickness.

Because garments are grown from the body, every garment fits every gender, build and height with no per-body authoring.

**Finishes:** `matte`, `satin` and `gloss` map to existing surface response (decision 0018). The 2D game's velvet and sparkle need new shader terms and are not implemented.

**Outfits:** an outfit entry is `{ garment, color?, finish? }`, so one catalogue entry yields many looks. `generateOutfit(wardrobe, { random, colors })` always picks a top, a bottom and shoes, sometimes legwear and outerwear, and can recolour each piece from a palette. A seeded `random` makes crowds repeatable.

**Game content:** `games/freelancer/content/wardrobe.json` holds 22 garments ported from the 2D wardrobe: bras and tops through hoodies and jackets, pants, leggings, shorts, three skirts, thigh-highs, stockings, socks, boots, sneakers, thigh-high heels and gloves. 949's preset (`content/humanoid-949.json`) follows her 2D base look: female canon, curls, no backpack. It wears a proposed sleeved crop top, flared skirt, thigh-highs and boots.

## Review page

The proportions panel now lists:

- the body canon, build, hair and backpack choices;
- every parameter;
- one wardrobe picker per slot;
- **Generate outfit**, which draws a random outfit with Freelancer's night colours.

Every change is one undo step. Export JSON includes the outfit.

## Verification

- **Node tests:**
  - Validation of documents, outfits and wardrobes, including errors that name the bad garment.
  - Rest-pose ground contact and height for all 18 gender × build combinations.
  - Grown legwear with flat hems.
  - 40 seeded random outfits on varied bodies.
  - Exact decode of packed profiles.
  - Bounded gait and pack spring, plus repeated rebuild and disposal.
- **`npm run test:humanoid`:**
  - Runs the offline artifact: no Canvas2D and no requests.
  - Covers turnaround, silhouette and walk, height edit/export/undo, refusal of an impossible neck and leg combination, an outfit-slot change, Generate outfit, a body-canon change and the gameplay camera.
  - GPU buffers stay bounded across view changes.
  - A source fixture reads real silhouette pixels: the outline is deterministic, a taller figure covers more pixels, and a pack reads most in profile. After the review is disposed only the renderer's cube and rounded mesh remain; after the engine is disposed nothing does.
- **Regression suites:** the existing browser suites pass with the new renderer streams (see the milestone record).

All of this runs on SwiftShader. It does not measure phone performance.

## Not yet implemented

- Cloth and hair simulation: the 2D game's Verlet chains (`cloth.js`) for skirts, coat tails and hair. Skirts are static cones, so legs can pass through them while walking.
- Skinning.
- Two-bone IK for the 2D pose table's hand and foot targets.
- Velvet and sparkle finishes.
- Faces and portraits.
- Hats and jewellery slots.
- Heels that raise the heel.
- Rounded shapes in authored Studio assets.
- Phone performance measurements for crowds.

## Next step

1. The owner reviews 949's look and outfit, or asks for adjustments.
2. Replace the Freelancer traveler with the approved humanoid, driven by the existing `PlanarMotor`.
3. Then port the 2D cloth and hair chains for skirts, coats and curls, and add two-bone IK for the 2D poses.
