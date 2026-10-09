# Body v2: more believable bodies, part by part

**Status: shipped.** The bodies and clothes below are in the game (`src/ui/bodies.js`, `src/ui/humanoid-render.js`, `src/ui/wardrobe.js`). The big head stays: it keeps the look charming. Sheets 1–3 were the approved sketch; sheets 4–5 are before and after from the real builds.

| Sheet | What it shows |
|---|---|
| [1 · Part by part](DFAB-Body-V2-1-Parts.png) | Each part on its own over the body's silhouette, old vs new, female and male |
| [2 · Build-up](DFAB-Body-V2-2-Build-Up.png) | Old → full body, one part switched on per column, standing, walking and armed |
| [3 · Dressed and lit](DFAB-Body-V2-3-Dressed.png) | The cast in their own clothes under daylight shading, plus 1× and 2× game size |
| [4 · Shipped: bodies](DFAB-Body-V2-4-Shipped-Bodies.png) | The previous build above, this one below: female, androgynous and male, standing, walking, pistol, rifle, punch, sneak |
| [5 · Shipped: tops](DFAB-Body-V2-5-Shipped-Tops.png) | Every top on a standing female and a walking male, before and after |

## What made the old bodies read as unbelievable

Measured from the old renderer (px at zoom 1, the head is 16 across):

1. **The head swallows the body.** Shoulders are 24 px for the female, 26 androgynous, 30 male, so head-to-shoulders is 1 : 1.5 / 1.6 / 1.9 (real adults are about 1 : 2.7). The female torso is only 9 px deep and sits entirely under the head. From above she is a head with two nubs.
2. **No shoulders.** The upper arms are free ovals next to a rounded rectangle. The arm roots also stay put while the torso twists ±0.3 rad on every step, so the torso slides over the arms.
3. **String-of-sausage limbs.** Each segment is an ellipse 2 px longer than its bone. Every knee and elbow is two pointed tips meeting, and nothing tapers: the wrist is as wide as the forearm.
4. **Hands are balls, and the resting ones stick out sideways.** An 8×6 oval that always points forward, whatever the arm does. At rest the hands sit at ±16, wider than the female shoulders, and read as flippers.
5. **Feet are slabs.** A 12×6 rounded rectangle, the same for left and right, with no heel, arch, ball or toe line.
6. **The pelvis is a slab, and the legs are spaced by accident.** A 22-wide rounded block, wider than the female shoulders. Leg spacing reuses the hip *depth* variable (`hipWidth`), which puts female legs at ±7 and male legs at ±4.5.
7. **The head is a perfect circle.** Seen from above, a head is longer than it is wide, fuller at the back, and has ears.

## Part by part

All of these change the shape drawn between the joints. Hands, elbows, knees and feet stay exactly where they were.

| Part | Before | Now |
|---|---|---|
| **Head** | circle, Ø16 | egg 16.2 long × 14.7 wide, fuller behind, ears just showing (hair covers it on most of the cast) |
| **Torso** | rounded rect, 9 / 10 / 13 deep, ±10 wide | chest across the front, shoulder blades and a shallow spine behind; 13.2 / 14.1 / 14.6 deep, so the upper back shows 2–3 px behind the head |
| **Shoulders** (new) | — | a deltoid cap over each shoulder joint, drawn over the torso's edge in the sleeve's colour. It leans toward the elbow as the arm lifts. From above, the shoulders are the highest thing after the head. |
| **Shoulder joints** | ±7 / ±9 / ±12 | ±10.5 / ±11 / ±12.5 → shoulders 28.6 / 29.4 / 32.6 wide (1 : 1.74 / 1.79 / 1.99) |
| **Bust** (female) | two circles under the chin, hidden by the head | two softer forms on the chest front that just clear the chin |
| **Pelvis** | 22-wide slab | widest at the hip bones, rounding into the seat with a soft cleft; 24 / 22.4 / 21.6 wide. Mostly hidden under the torso, as it is from above. |
| **Upper arm** | ellipse, r 3.5 | tapered, r 3.5→2.55 (F) … 4.2→3.0 (M), small biceps belly |
| **Forearm** | ellipse, r 3 | tapered, belly near the elbow, wrist r 1.8 (F) … 2.1 (M) |
| **Hand, relaxed** | 8×6 oval, points forward | a slim hand turned along the forearm, up to 9 long at full reach. Hanging straight down it shrinks to a stub, so it no longer pokes out past the shoulders. |
| **Hand, gripping** | the same oval | a fist, 6.4 × 5.8, turned along the forearm, thumb inside. The gun hand only: a pistol's off hand stays relaxed. |
| **Thigh** | ellipse, r 4 | tapered, r 4.7 at the hip → 3.3 at the knee (F) |
| **Calf** | ellipse, r 3 | belly in the upper third, r 3.6 → 2.05 at the ankle (F) |
| **Foot** | 12×6 rounded rect | heel 4 wide, arch on the inside, 5.6 across the ball, toes stepping back from the big toe; 12.4 long, left and right mirrored, turned out 5° |
| **Leg roots** | ±7 / ±5 / ±4.5 (from `hipWidth`) | ±5.4 / ±5.0 / ±4.9, a value of their own |

Every limb segment ends in a circle the size of its joint, and the next segment starts with the same circle. Knees and elbows stay joined at any angle.

Builds (`ui/bodies.js`) still scale the whole frame. `shoulder` now widens the joints and caps, and `hip` widens the pelvis and spreads the legs.

### Three attachment fixes the shapes need

- **Arm roots turn with the torso.** On a step the shoulder swings forward with the opposite leg, and in a punch the shoulder drives into the blow.
- **Leg roots turn with the pelvis.**
- **Leg spacing gets its own value** instead of reusing the hip depth.

None of these move a hand, foot, muzzle or collider.

## What shipped

Everything in the table, plus the clothing follow-through, in one pass:

- **Tops** paint the shared torso path (`body()`, `bust()`, the jacket, coat, lab coat and vest). Sleeveless tops paint a band of it; the hoodie pads it out.
- **Shoulder caps** take the sleeve's colour. Jackets, coats and the lab coat pad them, track-jacket stripes run over them, and T-shirts, scrubs and the sleeved crop seam them round the armhole.
- **Details that assumed the old rectangle** now follow the body:
  - jacket lapels
  - the vest (the shirt shows in a V at the front and at the shoulders)
  - the sports bra's racerback
  - the crop top's bare skin at the small of the back
  - the lab coat's pin
  - the Double Nights piping and emblem
  - android chest seams
  - apron strings and the pencil skirt's waist seam
  - bangles round the tapered wrist
  - the night rim light round the shoulders
  - the driving pose: torso, arms, fists on the wheel and caps
- **Skirts** (skirt, pencil, long) fill the pelvis path. **Shoes** are the foot shape, slightly larger, with heels as pointed court shoes.
- **The lab coat bug is fixed.** A top's default colour now applies everywhere through `topColor()`, so Dr. Yin's sleeves are white. That covers sleeves, the driving torso, an unknown top's fallback and puddle reflections.

Portraits are unaffected.

## What stays fixed

Joint positions, poses, stride and gait, punch and weapon timing, muzzle points, collision radii, palettes and the colour hierarchy (upper arm 0.15, forearm 0.3, hand 0.4, feet 0.55 darker), and hair, hats and cloth sims.

## Costs, measured

- **Draw cost per body:** +49 canvas calls (139 → 188) and about +0.06 ms in headless Chromium with software raster.
  - Each limb outline costs about a microsecond more than the old ellipse. The rest is two extra fills: the shoulder caps and the ears.
  - Each limb clears the canvas path after its fill. The browser re-maps any leftover path through every later transform, save and restore, which was costing more than the new shapes themselves.
- **A whole frame shows no measurable change.** The nightclub with about 20 bodies on screen draws in 53–58 ms per frame on both builds (headless, software raster).
- **Wider bodies:** the male half-breadth goes 15.2 → 16.3 and the female 12 → 14.3. Colliders stay 12 / 15, and males already overhung them.
- **Caches:** crowd impostor bakes are rebuilt each session (only map ground is persisted), so no cache version bump is needed. Reflections use their own generic silhouette.

## Checks

- **Regression suite:** `node tools/test-game-regressions.cjs`, 43 / 43 tests (906 assertions).
- **Every map in real Chromium:** all 20 maps load, update and draw with no page or console errors, plus the nightclub at medium and low crowd quality (live-lite and baked crowds).
- **Before/after renders** of every pose (idle, sneak, arms crossed, lean, rail, fidget, typing, concierge, polish, hands on hips, phone, push, dance, five seated, the fall), every top, bottom and shoe, all five builds, androids, the punch, held glass and umbrella, and driving.

## Decisions

- **Shoulder width:** as sketched, 1 : 1.74 (female) to 1 : 1.99 (male). `sh` and `del` in `BODY_CANON` are the dials.
- **Head size:** stays 16 px. The big head keeps the style charming and cute, and hair, hats, masks and portraits are tuned to it.

## Files

The shipped code lives in `src/ui/bodies.js`, where `BODY_CANON` is the place to tune proportions. These are the sketch's tools, kept for the record:

- `body-v2-sketch.js`: the shapes as sketched.
- `sketch-hooks.cjs`: the hooks spliced into a scratch copy of a build. Each anchor must match exactly once, so they only fit the renderer as it was before Body v2 shipped.
- `render-sheets.cjs`: draws sheets 1–3 (needs Playwright and Chromium). Point it at the pre-v2 build first: `git show d315f4a:"DFAB V8.html" > /tmp/pre-v2.html`, then `DFAB_BUILD=/tmp/pre-v2.html node docs/session-2026-10-09/body-sketch/render-sheets.cjs`. Add `Parts`, `Build` or `Dressed` to redraw one sheet.

This supersedes the [7 October body review](../../session-2026-10-07/body-review/README.md). That pass kept the old widths and endpoints and only reshaped outlines, and its limb teardrops tapered to points. This one went after proportion and attachment, which is where most of the unbelievability came from.
