# DFAB plan catalogue

Updated: 7 October 2026

This records what we have completed, the directions we have agreed on, and the details still being considered. The first combat and HUD refinement pass is now implemented. Balance remains subject to playtesting. The combat/HUD pass passed 42 combat browser checks and 18 HUD/map/preservation checks. The latest lamp revision restores the previous materials and adds bulb-only emission after darkness; it passed 31 visual/state/cache browser checks with no browser errors.

## Design direction

- Keep combat fast and readable, alongside the planned storytelling.
- Improve interactions between existing systems before adding new systems.
- Keep controls and upkeep reasonable; avoid feature creep.
- Preserve the danger of approaching several gunners in the open.
- Give melee a useful role in stealth, close combat, interruptions, and finishing wounded enemies.
- Use the existing links between light, noise, enemy awareness, Flit, positioning, and bleeding.

## Completed and included in the latest game file

Latest build: **DFAB-V8-scrapyard-bounded-animation.html** (`DFAB-V8-scrapyard-bounded-animation.html`; in the session ZIP)

The scrapyard Safari diagnosis first isolated the animated native dashed border: replacing it with a solid pulsing border in both the live hub and golden map resolved the user's visibility-triggered crashes on iPad Safari. The user reported that diagnostic result as “Smooth like butter.” The **solid-border build** (`DFAB-V8-safari-scrapyard-fix.html`; in the session ZIP) is retained as a fallback.

The current build restores travelling native dashes and the existing pulse using bounded phases from `performance.now()`. The world dash offset stays within one 20-unit cycle (800 ms), and the golden-map offset within one scaled 17-unit cycle (850 ms); pulse arguments stay within one full turn. Existing speeds, zoom scaling, alpha ranges and pause behavior are retained. Only the two scrapyard border blocks change. The user confirmed this build is also “Smooth like butter and is actually scrolling and pulsing,” adding that the earlier border had always appeared static. This supports the old animation-phase handling as the trigger on that iPad, without establishing Safari's internal failure mechanism.

The bounded-animation build passed four actual hub frames and four golden-map frames in Linux WebKit: native dash offsets stayed bounded and moved, Canvas state restored exactly, and no browser errors occurred. The test retained the real epoch frame clock and did not rewrite dash offsets. The same executable game file is now promoted after the successful user iPad Safari test.

Body-shape review is now in progress, starting with proportions and contours before outfits or new gradients. The **female base sheet** (`DFAB-Body-Proportions-Female.png`; in the session ZIP) and **male base sheet** (`DFAB-Body-Proportions-Male.png`; in the session ZIP) compare current and proposed head, torso, hips, upper arm, forearm, hand, thigh, calf and foot shapes, beside assembled standing, walking and aiming poses. These use the actual game renderer, identical flat colors and pose fixtures, and native 1x/2x scale samples. The proposed shapes are preview-only in scratch: smaller head/hands/feet, tapered limbs and softer torso/hip contours. Nine capture checks passed, including unchanged joints, animation, palette, original rendering when the candidate is disabled, and a byte-identical delivered game. The user has not yet directed or approved this first shape pass.

The inventory registry pass passed 63 focused Chromium checks and 13 ownership-adapter checks. These cover category exclusivity, cosmetic equipping/removal, adopted-pet and purchased-car ownership, apartment quantities, physical carrying limits, keyboard actions, weapon drops, and actual save/load without duplicating registry entries in saved inventory. Six capture/layout checks passed, including phone-sized portrait/landscape button hit tests and no horizontal list overflow. No browser errors were reported. The **inventory preview** (`DFAB-Inventory-registries-preview.png`; in the session ZIP) uses actual menu captures with temporary owned-item fixtures; the game's ownership defaults are preserved.

Velvet's artwork passed 40 focused Chromium checks plus five capture checks with no browser errors. Checks cover deterministic, bounded drawing; distinct poses and animation; correct facing; restored Canvas state; unchanged gameplay/ownership; and visibility/car gates. Every source byte outside the draw-method replacement remains identical to the inventory build. The **Velvet preview** (`DFAB-Velvet-Cat-preview.png`; in the session ZIP) shows equal-scale before/after artwork, existing animation poses, and an apartment scene through the full game renderer.

Filled circular short skirts with fluted edges are **approved and applied**. Periwinkle Silk, sleeveless Street Sorcerer, Neon Circuit and Angelic White now use the approved filled fabric, shallow flutes and radial folds. The **comparison** (`DFAB-Fluted-Skirt-preview.png`; in the session ZIP) and **motion preview** (`DFAB-Fluted-Skirt-motion.gif`; in the session ZIP) show the approved design through standing, walking, turning and settling. Eleven preview capture checks passed, including exact matching cloth solver positions through all 145 animation frames. The final game is exactly the latest Crimson train build plus the approved skirt drawing, with no other source changes. A final Chromium render check covered all four short skirts and Crimson Flame with finite cloth and no browser errors.

The retained Velvet palettes and earring-layer revision passed 104 focused Chromium checks with no browser errors. The six default Velvet pose images match the previous renderer exactly; alternative palettes, frozen data and invalid-selector fallbacks work. Earring layer checks cover long, short, bald, hood and afro styles while walking, driving and in portraits; each earring draws once under overlapping hair, while the other accessory traces match the previous build. The main short-skirt/spec/solver/save code is unchanged, and all four affected short-skirt outfits produce identical 90-frame cloth simulation states in the isolated preview.

Crimson Flame's waist-layer change passed 17 narrow browser checks and seven capture checks without errors. The train draws once after the hips, while its cloth trajectories and attachment transforms match the previous build exactly. Ordinary outfits and legacy trains match their previous artwork. The **before/after preview** (`DFAB-Crimson-Train-over-waist-preview.png`; in the session ZIP) shows standing, walking and turning through the actual game renderer.

| Change | Result |
| --- | --- |
| Scrapyard Safari compatibility and animation | Travelling crimson dashes and pulse use bounded monotonic-clock phases in the live hub and golden map. User's iPad Safari test confirms smooth scrolling/pulsing after previous static animation and visibility-triggered crashes. |
| Performance refinement | Ordered local pedestrian/car searches, reusable traffic query buffers, lean navigation membership/geometry checks, exact illuminated-rain lookup for busy views, and measured adaptive outdoor soft-light resolution. Existing movement, collision cadence, rain colors, character artwork and main-canvas dimensions are preserved. |
| YourGirlSara finishes | Silver barrel accents and champagne muzzle accents. |
| Maiden’s Kukri finishes | Diamond-colored grip and a thin silver sliver through the blade. |
| Lamp posts | Approximately 1.5× visual size, including the Silver Queen globe posts; previous materials restored at the user’s request. Bright luminous panes/globe faces, tight bloom and soft halos now render above the darkness layer. Light radii and gameplay illumination retain previous values. |
| Puddles | 25% larger lobe dimensions with soft damp edges, a faint meniscus and feathered reflected-light masks. Seeded positions/counts/depths are preserved; splash detection/culling bounds cover enlarged shapes. Four shared cached sprites, with no live blur. |
| Ultra reflections | Optional full-resolution reflections of detailed character, foliage and car artwork, masked to wet ground/puddles and polished floors. Character/car reflection facing matches the source, with an additional sideways artwork flip requested for visual review. Colours use a separate source-over layer; reflected emitted light retains its darkness-lifting pass. High remains the default. |
| Hub billboards | Disabled, including their collision, lighting and reflections. Authored data retained for later. |
| Equipment HUD | One rounded item slot using actual weapon artwork; ∞ for unlimited guns, -- and no ammo gauge for melee/unarmed. |
| Inventory categories and ownership registries | Items lists owned cosmetics and the apartment's 29 furniture types (48 placed pieces); Weapons lists physical guns, melee weapons and attachments, including the crafted laser sight. Collectibles includes owned Moonlit Academy and Moonlit Umbrella cosmetics with their existing equip behavior. Pets lists adopted Velvet Cat; Mounts lists owned garage cars. Read-only ownership cards do not consume carried capacity or alter existing save fields. Filter-off overview keeps separate category headings. |
| Velvet Cat artwork | Smooth feline shoulders, waist and haunches; rounded paws stepping along the facing axis, pointed ears, tapered muzzle with whiskers, violet almond eyes and a gently hooked tail. Near-black plum gradients and faint scattered short nap suggest a soft velvet coat. Existing animation phases drive walking, sitting, grooming and looking artwork; a sleeping state renders curled. Only the draw method changed; companion AI, collisions, adoption, car travel, inventory ownership and saves are preserved. |
| Velvet coat palette library | Retains Default plum, Velvet tinge and Full velvet color as reusable named coat palettes for future customization. The renderer supports the existing default plus both burgundy options through its coatPalette selector; face features share their original colors. This is retained artwork data and rendering support, with no new acquisition or customization screen. |
| Earrings below hair | Gold Hoops draw beneath hair in both world artwork and portraits. They draw once in their new layer; sunglasses, masks and hats keep their existing layers. |
| Melee refinement | Collision-safe short blade step, ordinary-gunner hit interruption with repeat resistance, and blade Flit-Strike synergy. |
| Execution healing | Successful stealth execution strikes recover 15% of maximum HP, capped, with a brief health-bar pulse. |
| Fireball appearance | Circular, white-hot core with animated flames; 2× the previous visible size. |
| Dancer fireball damage | Red demon dancers now deal 80 base damage per fireball, increased from 30, on foot and when casting from a vehicle. |
| Wave gunner aiming artwork | Plain Gatling gunners' heads sit on their forward firing axis. Barrel spin uses lateral cylinder offsets, keeping barrel length aligned with the shot; the muzzle flash meets the 35-unit projectile origin. |
| Wave gunner barrel momentum and heat | Barrels gradually wind up before each burst and coast to a stop afterward. Incandescent metal progresses from red through orange to pale yellow near the burst's end, then cools. Simulation controls phase/speed/heat, and a culled emission pass keeps the hot metal visible in darkness. Original shot timing, movement and Warden art are preserved. |
| Screenshot filenames | Cinematic PNG downloads and phone shares include seconds and three-digit milliseconds. Exact same-millisecond captures receive numbered suffixes. |
| Vehicle tail-light trails | Paired trails follow actual rear-lamp motion after collision resolution. Speed increases length and brightness; turns leave curved trails, and stopping fades them. Histories are bounded, culled, and cleared on map changes/teleports. Rendering adds no blur or new lights and does not alter driving physics. |
| Humanoid routing | Continuous body clearance around walls, buildings and live rotated solid props. NPCs, companions, scripted actors and directed walks share safe routes. Failed searches stop and retry instead of heading into the obstacle; moved geometry refreshes occupied cells, and valid detours count as walking progress. Hinged doors retain their existing push-open behavior. |
| Cinematic and HUD input | Hidden HUD controls relinquish mouse/touch input and keyboard focus in photo view, nonplayable cutscenes and inventory screens. Photo view isolates camera/grade/capture controls and now exits through its exit button or Escape; taps on the frame leave it open. Paused healing shortcuts and scene-key overlaps are blocked; held controls/timers clear on pause. Playable scene HUD beats and native settings-slider keys remain available. |
| Cutscene touch pause | A dedicated 44×44 px pause button beside Hold to Skip, available even when skipping is disabled. Pausing preserves scene/dialogue and boss-intro progress. Playable beats retain the regular HUD pause button; dedicated controls disappear after scene completion, abort or quitting. |
| Cutscene pause-menu filtering | Story scenes and boss introductions retain Resume, Settings, Cinematic View and Quit. Gameplay actions, Now Playing and Objectives are hidden and inert; keyboard navigation uses visible rows. The full menu returns after scene completion, abort or quitting. |
| Filled circular skirts with fluted edges | Periwinkle Silk, sleeveless Street Sorcerer, Neon Circuit and Angelic White use a filled circular skirt with soft fluted edges, fabric shading and radial folds. Sixteen radial chains use the Academy skirt's stiffness/damping and a closed seam. Shared short-skirt NPC artwork receives the approved design. Existing cloth physics, other skirt styles and Crimson Flame's over-waist train remain compatible. |
| Crimson Flame train | The rear strip is replaced with a deep red, ground-length fan train. Five six-segment chains lag through movement and turns, then settle behind the hips. At the user's request, the train now draws once after the hips/skirt, over the waist and before the arms/torso/head. Its attachment, shape, cloth solver and existing-save outfit IDs are preserved. |
| Enni Cole hub exterior | Reference-led rose stone, graphite-framed amber glazing, champagne script, brass cornices, a curved black entry canopy and paired topiary planters. Dedicated cached artwork and six restrained building lights replace the pink roof wash. |
| Enni Cole interior | An open luxury department hall with cream marble, burgundy accents, brass inlays, a crystal chandelier and EC medallion. Groceries/wine/bakery west, furniture room sets north, electronics east, and service counters near the entrance. Thirty-four custom display props, polished-floor reflections and clear walk-around aisles. Legacy landmarks, NPC roles, city transitions and vending remain compatible. |
| Direction and speed feedback | Immediate flame wake follows actual velocity, including auto-aim turns, and stretches with speed. |
| Lingering fire stream | World-space flame particles follow the flown path from the caster toward the ball, persist after it disappears, and fade over approximately 1.5–1.8 seconds. |
| Firelight | Broad orange illumination: 280 world-unit radius at the ball, smaller 65-unit pools along the stream. Light lifts ambient darkness and daytime cast shadows, with opaque wall/building clipping. |

The fireball artwork changes retain the previous speed and collision radius. Dancer fireball base damage is now 80 as requested. Browser checks passed for the completed fire-stream build, including fading, pause behavior, map cleanup, and outdoor/indoor lighting.

The tail-light and navigation build passed 64 focused Chromium checks, plus combined simulation/render checks in the populated hub, hotel lobby, House of Death and Moon City nightclub. Tests cover trail fading/culling, unchanged driving physics, continuous body clearance, failed-route retry caching, moved/rotated furniture, long detours, companion formation and scripted arrival behavior. These are browser correctness checks; mobile frame rate has not been measured for this build.

The subsequent cinematic UI refinement passed 69 focused Chromium checks and simulation/render checks in the same four maps, with no browser errors. Verification includes touch/mouse/keyboard isolation, camera gestures, grade and native PNG capture, pause-token ownership, scene subtitle/choice/skip input, held-input cancellation, and Enter-on-Resume dialogue protection.

The cutscene pause/explicit photo exit build passed 101 focused Chromium checks across desktop and phone-sized portrait/landscape layouts, plus 70 prior UI checks. Pausing freezes story scenes and boss introductions without advancing or skipping them; quitting clears the intro controls and listeners. Photo taps, holds and cancellations keep the view open; camera gestures, grading, capture, the exit button and Escape remain functional. No browser errors were reported.

The cutscene menu filtering build passed 88 focused Chromium checks across desktop and phone-sized portrait/landscape layouts, with no browser errors. Verification covers visible-row navigation, hidden-action guards, settings and photo-view returns, story and boss introductions, and full-menu restoration.

The earlier outfit-reference pass used the actual humanoid renderer and live cloth simulation, with the existing Close Crop wig to expose the garment. Crimson Danger is currently named Crimson Flame in the item registry. Before the circular-hem/train revision, it and the sleeveless Street Sorcerer used the same small simulated rear hem. Ten checks passed for those original reference captures without browser errors.

The circular-hem/Crimson train revision passed 46 focused Chromium checks without browser errors. Checks cover all four circular-hem outfits, train lag and settling, finite bounded motion, pause behavior, outfit swaps, teleport resets, existing-save appearance, alternate cloth styles and Ultra-reflection owner isolation. Previews show Periwinkle Silk, sleeveless Street Sorcerer and Crimson Flame through standing, walking, turning and settling using the actual game renderer and the existing Close Crop wig for visibility. Fourteen capture checks passed, including complete cloth framing throughout the 7.2-second animation.

The Enni Cole redesign passed 53 focused Chromium checks without browser errors, including actual city/store transitions, all nine landmark routes with continuous body clearance, NPC placement/roles, vending interaction, cached-floor cleanup, reflection rendering and art-state isolation. The final chandelier pass gives brass hardware an opaque finish above restrained glow so its frame and forty bulbs remain legible with reflections enabled. Eleven additional final lighting/High/Ultra reflection checks passed, for 64 behavior checks total. Five capture checks confirm actual-renderer screenshots, exact game fonts and a source hash matching the delivered build.

Reference captures:

- **Enni Cole exterior and interior preview — actual game renderer** (`DFAB-Enni-Cole-preview.png`; in the session ZIP)
- **Enni Cole in the hub** (`DFAB-Enni-Cole-exterior.png`; in the session ZIP)
- **Enni Cole department hall** (`DFAB-Enni-Cole-interior.png`; in the session ZIP)
- **Enni Cole chandelier and atrium detail** (`DFAB-Enni-Cole-detail.png`; in the session ZIP)
- **Circular hems and Crimson Flame train sheet** (`DFAB-Cloth-Hem-Train-preview.png`; in the session ZIP)
- **Circular hems and dragging train motion preview — actual game renderer** (`DFAB-Cloth-Hem-Train-motion.gif`; in the session ZIP)
- **Earlier Crimson Danger and sleeveless Street Sorcerer cloth sheet** (`DFAB-Cloth-Outfits-preview.png`; in the session ZIP)
- **Earlier skirt-physics motion preview — actual game renderer, 6 seconds** (`DFAB-Cloth-Outfits-motion.gif`; in the session ZIP)
- **Molten gunner barrel video — actual game renderer, 9 seconds, 1080p at 60 fps, silent** (`DFAB-Gunner-Molten-Spin-1080p60.mp4`; in the session ZIP)
- **Molten gunner startup, firing and cooling preview** (`DFAB-Gunner-Molten-Spin-preview.gif`; in the session ZIP)
- **House of Death gunner promo video — actual game renderer, 12 seconds, 1080p at 60 fps, silent** (`DFAB-House-of-Death-Gunner-1080p60.mp4`; in the session ZIP)
- **Looping gunner animation preview** (`DFAB-House-of-Death-Gunner-preview.gif`; in the session ZIP)
- **Side-to-side reflection comparison using the game renderer** (`dfab-reflection-mirror-preview.png`; in the session ZIP)
- **Ultra reflection comparison using the game renderer** (`dfab-ultra-reflections-preview.png`; in the session ZIP)
- **Current puddle comparison** (`dfab-soft-puddles-preview.png`; in the session ZIP)
- **Current equipment HUD preview** (`dfab-equipment-hud-preview.png`; in the session ZIP)
- **Current nighttime hub renderer capture** (`dfab-luminous-lamps-in-game.png`; in the session ZIP)
- **Bulb emission comparison** (`dfab-luminous-bulbs-preview.png`; in the session ZIP)
- **Weapon sheet** (`dfab-weapons-sheet.png`; in the session ZIP)
- **Bullets and effects sheet** (`dfab-bullets-fx-sheet.png`; in the session ZIP)
- **Animated fire-stream preview from the game renderer** (`dfab-fire-stream-animated.gif`; in the session ZIP)
- **Fire stream in the game** (`dfab-fire-stream-in-game.png`; in the session ZIP)

## Equipment-slot HUD

**Status: implemented; magazine/reload mechanics deferred by request.**

The supplied blockout shows two configurations of the same slot component. It does not establish a primary/secondary or left/right-hand loadout.

| Element | Intended meaning |
| --- | --- |
| Rounded rectangle | Artwork for the equipped item. |
| Number beneath the item | Ammunition currently loaded, rather than reserve ammunition. |
| `--` | Ammunition is not applicable to this item. |
| Thin bottom bar | Loaded ammunition as a fraction of magazine capacity. |
| Vertical side bar in the blockout | Proposed wear/condition indicator; its gameplay role is now deferred. |

Presentation and deferred details:

- Gauges now have a faint empty track.
- The ammo gauge is hidden for items that display `--`.
- Keep any condition indicator in a consistent position; right-side placement was suggested.
- Use restrained warning colors when a resource is low.

The user chose to keep unlimited firing while building the HUD. Guns therefore show ∞ with a full muted gauge. No ammo is consumed and no reload control is introduced. The readout can show loaded counts and magazine fullness when future ammo data exists; capacities and reload rules remain undecided. The wear/condition bar is omitted because mechanical wear is deferred.

## Initial melee improvement pass

**Status: implemented as an initial balance experiment.**

The Kukri already has arc hits, bleeding, and stealth executions. Flit already provides movement and brief protection. Gunners still retreat at close range; successful blade and punch hits now briefly interrupt ordinary gunners.

The implemented first experiment is:

1. **Brief interruption on a successful melee hit.** Ordinary gunners lose their current aim and hold firing for 0.20 seconds, then restart their aim windup. Further hits cannot interrupt again until 0.65 seconds after the first hit. Hunters, bosses and heavy enemies resist. Movement and awareness continue. Invincibility-blocked hits grant no interruption or blade bleed.
2. **A modest step into the slash.** Up to 8 world pixels along the current facing angle, checked in 1-pixel samples against map bounds, walls, buildings, door leaves and registered solid bodies. No target snap or automatic turn.
3. **Blade–Flit synergy.** Blades receive the same Flit-Strike window and +20% damage per rank as shots.

Desired loop: use cover, stealth, or Flit to approach; land a useful hit; disengage while bleeding continues.

Playtest goal: reaching one gunner should feel rewarding, while other shooters still make movement and cover necessary.

## Health recovery from executions

**Status: implemented; initial value awaits balance playtesting.**

- Starting amount: **15% of maximum health** per successful stealth execution.
- Grant recovery when the killing strike lands.
- Cap recovery at maximum health.
- Apply it to both unarmed and blade executions.
- Show a brief pulse on the existing health bar.
- Tie it to actual executions. Cinematic finishers can follow ordinary kills and are a separate presentation system.

Purpose: reward stealth as a way to regain control and recover after combat, while retaining a useful role for stims.

## Wear and maintenance

**Status: mechanical wear deferred.**

We agreed that frequent repair chores would work poorly with the game’s fast combat and would add another cost to melee.

Cosmetic wear remains an optional idea: scratches, scorching, chipped finishes, or a bloodied blade could show use, with servicing restoring appearance. It is not yet an implementation commitment.

If mechanical wear is reconsidered later, its proposed constraints are slow deterioration, clear warning, repairs during downtime, and fair treatment of guns and melee weapons. It should earn its place by creating meaningful choices during longer missions.

## Ideas to evaluate after the initial melee playtest

**Status: candidates, not committed scope.**

- Quick melee while carrying a gun.
- Readable claw/whip windups, committed attack directions, and recovery openings for melee enemies.
- Charged attacks and stronger control when a melee weapon is equipped.
- Timed guard/parry and counterattacks.
- Disarming or guard-breaking attacks.
- A small attunement refund on a melee kill.
- Additional melee identities, such as a stun/disarm baton or a heavier guard-breaking weapon.

## Music and nightclub lighting

**Status: on the back burner at the user’s request.**

- Revisit Moon City nightclub dance-floor stutter and the slight perceived beat delay.
- Inspection found that the music clock persists when the track begins outside and the player enters; rendering latency/stutter remains the issue to investigate further.
- A catalogue of tracks and tempos is a possible later task.

## Next refinement order

1. Playtest the combat and HUD pass together, focusing on one gunner versus groups, approach safety and execution recovery.
2. Adjust timing/distance/healing values from pacing observations before selecting further melee features.
3. Decide magazine capacities and reload behavior when ready.
4. Return to deferred music/lighting timing work when requested.


## Performance refinement

**Status: applied at the user’s request on 7 October 2026; phone FPS gains await playtesting.**

- Pedestrian and car searches use local spatial candidates in the original array order. Each pedestrian’s cell follows its movement during the existing reverse-order update; unusual duplicate entries retain full-scan semantics. Crowd and collision comparisons preserve exact state and random-number sequences.
- Traffic collision/player/crew queries reuse separate caller-owned arrays. Other callers keep the existing fresh-array API.
- Navigation reuses membership and geometry records, avoiding per-query temporary source arrays and repeated membership Sets. Moved/rotated geometry and collision flags retain live checks; no property wrappers are installed. A property-hook experiment was discarded after it slowed ordinary prop updates.
- Illuminated rain uses an ordered screen-space lamp grid only for busy views (at least 32,768 potential drop/lamp pairs). Smaller views retain the original direct loop. All paired rain captures and illuminated-drop data matched exactly. Additional colored-stroke batching was discarded because its bookkeeping cost outweighed savings.
- **Adaptive Lighting** defaults ON under Settings → Visual. Sustained slow outdoor soft-shadow scenes can try 80% light-layer resolution per axis; the trial stays only when sampled frame cadence and light submission time improve. The controller restores full selected quality on recovery and protects cinematic views, interiors, profiler/benchmark modes, sharp shadows and night vision. Failed trials use a cooldown. Main-canvas resolution, character artwork, HUD, light radii, wall clipping and fixed simulation cadence stay unchanged.
- The adaptive preference is saved, while runtime measurements/trials are not. Existing saves with settings but no adaptive flag default ON; saves lacking the entire settings object preserve existing visual preferences.

Validation uses focused browser comparisons, actual renderer captures, synthetic controller samples and combined game-state checks. Structural search reductions and desktop timings are evidence of less work, not an A53 or iPad FPS measurement.

## Device performance reference

Samsung Galaxy A53 5G, Chrome. User-reported maximum FPS: Double Nights lobby 41 (previously 27), city 25 (previously 6). These are peaks, not measured sustained rates. Save slot3 confirms medium traffic/pedestrians/foliage, high lighting/rain density, soft shadows on, reflections off, bloom/filmgrain off and a 60 FPS limit; user confirms high crowd quality (device-local, omitted from the export). The user subsequently authorized the focused performance refinement above. No direct A53 benchmark has been run for it.

The puddle pass passed 32 focused Chromium visual/geometry/state/cache checks. No A53 performance benchmark was run. Puddles retain the existing Reflections Off gate.

Ultra reflections are an opt-in visual experiment, selected under Settings → Graphics → Reflections. They use detailed humanoid art through isolated render owners, cached foliage canopies with matching density/wind, and deduplicated car bodies/lights. Reflection painting emits no duplicate footsteps and does not advance live gait, weapon animation or gameplay. Existing High/Medium/Off reflection pixels matched the previous build in the isolated regression scene. Ultra is expected to cost more rendering time and memory; no A53 benchmark has been run.

The user also reports 55–60 FPS indoors and 29–35 FPS outdoors on an iPad; its model and graphics settings were not supplied, so these are a separate playtest reference.
