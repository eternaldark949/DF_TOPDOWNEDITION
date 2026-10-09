# Body v2: a part-by-part sketch for more believable bodies

**Status: sketch only.** Nothing in `src/` or `DFAB V8.html` changes. The sheets are drawn by the game's own renderer, from a scratch copy of the build with the proposed shapes spliced in. With every part switched off, that copy is pixel-identical to today's game (checked on 32 bodies: 8 looks × stand, walk, pistol, rifle).

| Sheet | What it shows |
|---|---|
| [1 · Part by part](DFAB-Body-V2-1-Parts.png) | Each part on its own over the body's silhouette, today vs proposed, female and male |
| [2 · Build-up](DFAB-Body-V2-2-Build-Up.png) | Current → full body, one part switched on per column, standing, walking and armed |
| [3 · Dressed and lit](DFAB-Body-V2-3-Dressed.png) | The cast in their own clothes under daylight shading, plus 1× and 2× game size |

## What makes today's bodies read as unbelievable

Measured from the renderer (px at zoom 1, the head is 16 across):

1. **The head swallows the body.** Shoulders are 24 px for the female, 26 androgynous, 30 male, so head-to-shoulders is 1 : 1.5 / 1.6 / 1.9 (real adults are about 1 : 2.7). The female torso is only 9 px deep and sits entirely under the head. From above she is a head with two nubs.
2. **No shoulders.** The upper arms are free ovals next to a rounded rectangle. The arm roots also stay put while the torso twists ±0.3 rad on every step, so the torso slides over the arms.
3. **String-of-sausage limbs.** Each segment is an ellipse 2 px longer than its bone. Every knee and elbow is two pointed tips meeting, and nothing tapers: the wrist is as wide as the forearm.
4. **Hands are balls, and the resting ones stick out sideways.** An 8×6 oval that always points forward, whatever the arm does. At rest the hands sit at ±16, wider than the female shoulders, and read as flippers.
5. **Feet are slabs.** A 12×6 rounded rectangle, the same for left and right, with no heel, arch, ball or toe line.
6. **The pelvis is a slab, and the legs are spaced by accident.** A 22-wide rounded block, wider than the female shoulders. Leg spacing reuses the hip *depth* variable (`hipWidth`), which puts female legs at ±7 and male legs at ±4.5.
7. **The head is a perfect circle.** Seen from above, a head is longer than it is wide, fuller at the back, and has ears.

## Part by part

All of these change the shape drawn between the joints. Hands, elbows, knees and feet stay exactly where they are today.

| Part | Today | Proposed |
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

### Three attachment fixes the new shapes need

- **Arm roots turn with the torso.** On a step the shoulder swings forward with the opposite leg, and in a punch the shoulder drives into the blow.
- **Leg roots turn with the pelvis.**
- **Leg spacing gets its own value** instead of reusing the hip depth.

None of these move a hand, foot, muzzle or collider.

## Up to the full body: the build order

Each step is its own reviewable change. Parts that a step doesn't touch stay pixel-identical. Sheet 2 is this sequence, column by column.

1. **Limbs and their roots.** `drawLimb` gets a taper per segment, and arm and leg roots turn with the torso and pelvis. No wardrobe work: sleeves and trouser legs keep their colours.
2. **Hands, feet and shoes.** The shoe helpers (`soleFoot`, heels) draw the new foot, slightly inflated.
3. **Torso, shoulder caps and tops.** The biggest visual change and most of the wardrobe work. `body()`, `bust()` and the jacket and vest fills paint the shared torso path, and sleeveless tops paint a band of it. A cap takes the sleeve's colour, so the Bartender's white shirt sleeves show past his vest and a tank top leaves bare shoulders.
4. **Pelvis, leg roots and skirts.** The skirt, pencil-skirt and long-skirt waists fill the shared pelvis path. `g.hip` keeps its meaning, so skirt and coat-tail cloth anchors are unchanged.
5. **Head.**
6. **Follow-through.** These details still assume the old rectangle:
   - track-jacket shoulder stripes (fixed at ±8.6)
   - the vest panels
   - the crop top's midriff, now drawn at the back
   - android chest seams and the Double Nights emblem
   - the night rim light's shoulder radius
   - the driving pose's torso

   Portraits are unaffected.

## What stays fixed

Joint positions, poses, stride and gait, punch and weapon timing, muzzle points, collision radii, palettes and the colour hierarchy (upper arm 0.15, forearm 0.3, hand 0.4, feet 0.55 darker), and hair, hats and cloth sims.

## Costs and watch-outs

- **Draw cost:** +86 canvas calls per body (148 → 234) and about +0.05 ms per body in headless Chromium. Most of the extra calls are the hands, which the sketch rebuilds as a spline every frame. Caching hand outlines as `Path2D` by reach step, and skipping ears below the closest zoom, should bring it under +30. Torso, pelvis, head and feet are already cached paths.
- **Wider bodies:** the male half-breadth goes 15.2 → 16.3 and the female 12 → 14.3. Colliders stay 12 / 15, and today's males already overhang them.
- **Caches:** crowd impostor bakes are rebuilt each session (only map ground is persisted), so no cache version bump is needed. Reflections use their own generic silhouette.
- **Poses:** the wider female shoulders lengthen her upper arms a little in poses with hands near the chest (`arms_crossed`, phone, typing). They need a look in-game.
- **An existing bug this turned up:** Dr. Yin's lab coat has no `color`. The coat paints itself `#f1f3f5`, but `sleeveCol` reads `clothes.top.color`, so her sleeves render black today, and in the sketch her shoulder caps do too. Either give her look a colour or apply the lab coat's default in `sleeveCol`.

## Decisions for you

1. **Shoulder width.** The sketch lands at 1 : 1.74 (female) to 1 : 1.99 (male). Wider is more realistic, narrower keeps more of today's chunky-head style. `sh` and `del` in `BODY_CANON` are the dials.
2. **Head size.** The head stays 16 px here because hair, hats, masks and portraits are tuned to it. Scaling the head and hair down about 6% is the other big lever toward realistic proportions.
3. **Order.** Limbs first is the safest start, since it needs no wardrobe work.

## Files

- `body-v2-sketch.js`: the proposed shapes: `BODY_CANON`, tapered limbs, hands, feet, torso and deltoid caps, pelvis, head.
- `sketch-hooks.cjs`: the hooks spliced into a scratch copy of the build. Each anchor must match exactly once, so the preview fails loudly if the renderer drifts.
- `render-sheets.cjs`: draws the three sheets. Run `node docs/session-2026-10-09/body-sketch/render-sheets.cjs` (needs Playwright and Chromium). Add `Parts`, `Build` or `Dressed` to redraw one sheet.

This supersedes the [7 October body review](../../session-2026-10-07/body-review/README.md). That pass kept today's widths and endpoints and only reshaped outlines, and its limb teardrops tapered to points. This sketch goes after proportion and attachment, which is where most of the unbelievability comes from.
