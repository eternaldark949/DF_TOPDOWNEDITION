# Source map

Every piece of *Dimensions: Freelancer (top-down)* and what lives in it. `tools/build.mjs` joins them, **in the order below**, into the playable `DFAB V8.html`.
Order matters: a file can only use, when it loads, what the files above it declared.

## Page and styles
| File | What's in it |
|---|---|
| `index.html` | The page shell: `<head>`, fonts, every menu/HUD/phone panel's markup. The styles and scripts are inserted at `<!-- @styles -->` and `<!-- @scripts -->`. |
| `styles/base.css` | Core colour variables (incl. the `--df-*` menu scheme sampled from ETERNAL's inventory mock-up), film grain, map-transition fade |
| `styles/hud-menus.css` | HUD, main menu, overlays, notes, dialogue, shop screens; the freelancer menu and sidebars in ETERNAL's mock-up scheme (wine-haze backdrop, dotted pills: violet open, lavender equipped, crimson consumables; lit-pill nav; champagne filter; lavender BACK) |
| `styles/panels-phone.css` | Pause/settings panel, touch controls, colour-grade panel, phone and message apps |
| `styles/landscape.css` | **Landscape** (a phone on its side): every rule is under `body.landscape`, which `resize()` (`engine/combat-effects.js`) sets when the window is wider than tall and ≤540px tall. It covers the HUD (the cat's paw dropped 90px, the action dock beside it, the ⚙ dock opening sideways), the move-stick zone, dialogue, letterbox and boss title, the phone scaled by `--phone-scale`, the collapsed sidebars, two-column pause, and short-screen menus. Portrait never sees it. |
| `styles/cinematic.css` | The cinematic dialogue: subtitles over a scrim, portrait cameos, choices, title cards, the place/time marker, hold to skip, narration, the flashback vignette |
| `styles/coach.css` | The coach (spotlight, ring, caption card, ghost thumb), `.hud-veiled` and the reveal bloom, the call card |

## core/ (loaded first)
| File | What's in it |
|---|---|
| `core/config.js` | Frame-time globals and `CONFIG`: every tunable constant (buildings, weather, loop, lighting…). `HEARTHS`: where each fireplace is (art and ambience share it). `console.log` is silent unless `localStorage.dfab_debug = '1'`; `leanCamHeight()` (the building lean's camera height, normalised to zoom) |
| *(generated)* | `ASSETS`: your images and audio from `assets/`, built automatically |
| `core/assets.js` | `getImage`, `drawAsset`, `playSound` / `loadSound` for your assets |
| `core/registries.js` | Notes, consumables, drinks, cosmetics (wigs, skins, outfits, hats, jewelry…); `CosmeticsSystem`, `BuffSystem` |
| `core/resonance.js` | `ResonanceSystem`: 949's progression — earning (style-weighted), Dr. Yin's tuning, the Flit / Frame / Arms trees |
| `core/utils.js` | Maths helpers, humanoid gait/animation helpers, weapon muzzle helpers (`weaponMuzzleLocal` reads the model's `muzzle`), `RenderInterp` |
| `core/draw-helpers.js` | Colour helpers (`darkenHex`, `lightenHex`, `hexToRgba`…), line-of-sight/raycast, `computeVisibilityPoly` (lamp shadows, vision cones, headlights), HP bars, enemy telegraphs, glow sprites (`glowSprite`, `drawGlow`), `lampFlicker`, `lampWake` (street lamps wake one by one at dusk, stuttering on, and go out one by one after dawn), `glowA` (a glow at an alpha: the interiors' light passes)  Polyfills `roundRect` on the 2D context and Path2D for Safari before 16.4 (without it, the building art threw every frame there). |
| `core/cache-db.js` | **CacheDB**: slow, deterministic results kept across sessions in IndexedDB (localStorage stays for saves and settings). Read into memory at boot, so lookups during a map load are synchronous; writes go out in the background; every entry carries a signature of its inputs (and `VERSION`), so changed maps never get stale data. Used for the lamp shadow polygons (`bakeStaticLighting`, key `lampPolys:<map>`) |
| `core/appearances.js` | **Every character's look in one place**: `APPEARANCES` (949, the crew, staff, the city's cast), `ROLE_LOOKS` (medics, dancers, androids, pedestrians, gangers, spirits, ghosts), `PALETTE`, `ANDROID_FINISHES`; `lookFor(entity)`, `portraitOf(look)`; 747's look; the field mask rule (`withFieldMask`: 949 masked away from home)  `stellaMasked`: a scene's `game.fieldMask` wins, then the player's Neu.Me choice (`cosmetics.maskMode` 'on'/'off'), else 'auto' (masked in the field, bare at home). |
| `core/settings.js` | `FullscreenManager` (on by default: the first tap or key press anywhere goes fullscreen, `armFirstGesture`; only the settings toggle changes the saved choice, `dfab_fullscreen_pref`; the tap-to-begin screen — `#tap-to-begin` in index.html, wired in `app/menu-wiring.js` — is that first tap), `OrientationManager` (Settings → Screen Orientation: Landscape by default / Auto / Portrait; locks in fullscreen where supported, saved as `dfab_orientation`), `GameSettings`, object pools, perf utilities, `showMessage` |

## world/
| File | What's in it |
|---|---|
| `world/navigation.js` | `NavGrid` pathfinding, companion tactics and steering |
| `world/weather.js` | Weather conditions, climates, `WeatherSystem` (rain, wind, lightning, forecast) |
| `world/weather-response.js` | How weather reaches a character: `weatherAt` (wind on hair and cloth, rain, storm), lightning flinches, umbrellas |
| `world/particles-decals.js` | Leaf particles, decals |
| `world/lobby-life.js` | The Double Nights lobby's crowd: guests (portals, the doors, the desk queue, lounges, elevators, rolling luggage) and AI staff (gold bellhops with carts, Blood Moon concierges, a silver valet) — ambient walkers, not NPCs |
| `world/rooms.js` | Room System, the standard for indoor maps: per-room visibility (soft violet veil, gentle reveal, light spilling through open doors, dim-through-glass from outside), fading room lights, `outdoorness`, sky light on outdoor rooms; windows, doors (hinged doors with swing physics, sliding glass, open arches; bullets strike and push them — `hitDoors`; shut doors block sight — `doorBlocks`), rooms of several rects, silk linens, `RoomSystem`, `ROOM_DEFS` — every indoor map has rooms (arenas and the ethereal plane aside); the checklist for giving a map rooms is in its header |
| `world/maps.js` | `MAP_DATA`: every map's size, floor zones, walls, transitions, landmarks (optional `wallStyle`, and `navProps` to route paths round big furniture) |
| `world/ground-baker.js` | **The city's ground, baked**: lots, lawns, parks, roads (painted from their geometry via `paintRoad`, so any angle, curves later), intersections, paver pavements, worn crossings, into 512 px tiles on first sight (LRU sized by memory; half-res tiles when zoomed out, switched with a band; a missing tile borrows the other resolution; painted within a frame-time budget and ahead of a moving car — `CONFIG.GROUND_BAKE`). `draw.js` blits them in the hub instead of redrawing roads every frame |
| `world/parks.js` | **Parks** (`HUB_PARKS`: Lotus Park, Violet Commons, Moonwell Gardens): `parkLayout(block)` (seeded: hedge, gates, gravel walk, moon pool, flower beds, benches, lanterns, trees) and `paintParkGround` |
| `world/map-entities.js` | `createMapEntities`: props, NPCs and lamps per map (the apartment suite's furniture is here). Shorthands shared by every map: `decorPropsIn(color)`, `softLight`, `areaLight`, `hiddenLamp` (each case aliases them F/S/A/L) |
| `world/billboards.js` | `BILLBOARDS`: your artwork on tilted panels around the city. Add one by copying a line |
| `world/city-layout.js` | `CityLayout`: blocks, roads and building placement for the city |
| `world/bokeh.js` | Screen-space bokeh effect |

## audio/
| File | What's in it |
|---|---|
| `audio/audio.js` | `AudioSystem` (sound effects, master bus, music bus for the Music slider), `AmbienceSystem` (rain, wind, city, room tone, fireplace, doors) and `MAP_MUSIC` — each map's soundtrack; `engine(state)`, the driven car's electric hum (`ENGINE_HUM` per brand); `sfx('crunch')` for car hits and `tyres(level)`, the driven car's squeal (the apartment plays the Silver Queen track, fullest in the living room; the intro's van plays 'van 2'; a track can belong to one `area` of a map — the city's southern graveyard plays 'grave stories (1)', rising as you come up to its walls) |

## physics/
| File | What's in it |
|---|---|
| `physics/spatial.js` | `PhysicsSystem` (`carContact`: car hits push apart by mass and take the closing speed out of `vx`/`vy`, a little bounce, no spin — both collision passes use it; the driven car gets `onImpact` with a twist by where it was hit), spatial hash, render/transition grids |
| `physics/game-entity.js` | `GameEntity`, the base class for everything that moves or collides |
| `physics/collision.js` | `CollisionSystem`: circles, boxes, rotated boxes, pushing, hinged-door hook  **Contact solver** (`_solveContact`): position correction past 0.5px slop (80%) shared by inverse mass (0 for static, `immovable` or mass ≥ 1e4), then a normal impulse and Coulomb friction, each with its angular term at the real contact point (`_contactPoint`: the deepest corner(s), ties averaged); props spin from where they're hit (I = m(w²+h²)/12). 3 relaxation passes for props; sleepers (`_still` > 30) skip each other; moving props collide off screen too; cars shove props; car-vs-car is TrafficManager's alone; a car that probed walls this tick (`_wallProbeTick`) skips the wall pass; actors push with `CONFIG.PHYSICS.PUSH_MASS` × their mass and take no velocity back. |

## entities/
| File | What's in it |
|---|---|
| `entities/props-decor.js` | `StaticEntity`, apartment (incl. the crafting workbench, `apt_craft`), clinic, House of Death (`hod_*`), Double Nights lobby (`dn_*`), penthouse suite (`ps_*`), Sanctum (`sc_*`) and Moon City Nightclub (`mc_*`) furniture art, the graveyard's carved stones (`gy_stone`, 8 variants, cached sprites), the MiniSpree vending machine and the health station (one design on every map), `PropEntity`  `PropEntity`: art drawn in the box's rotated frame; `fixedRotation` for fixtures; speed cap, spin cap, NaN restore, sleep counter. |
| `entities/vehicles-minigames.js` | `VehicleEntity`, bumper cars, Ferris wheel, bumper-car minigame |
| `entities/lamps.js` | `LampEntity` (all lamp types) |
| `entities/actors.js` | `ActorEntity`, `PlayerEntity`, projectiles, triggers |
| `entities/static-builders-profiler.js` | Turning walls/buildings into colliders, perf bench, profiler |
| `entities/street-objects.js` | Neon signs, loot, pavement, foliage; `FLORA_KINDS` / `floraSprite` (each tree, blossom, bush and palm painted once into a sprite) |
| `entities/npc.js` | `NPC` companions and characters, quips and emotes (their looks: `core/appearances.js`) |
| `entities/pedestrians.js` | Pedestrians and their manager |
| `entities/enemies.js` | Velvet cat, drones, gunners (and the Sanctum's three wardens, `WARDENS`: personas with their own art, twice her size, sight-gated fire), gangers, restricted zone, horde gauntlet (`GAUNTLET_MAPS`: its maps — the House of Death, and sealed placeholders — picked from Grum's menu, `openGauntletMenu` in engine/shops-menus.js) |

## buildings/
| File | What's in it |
|---|---|
| `buildings/building-v1.js` | Original `Building` class, lane width constants |
| `buildings/building-v2.js` | `BuildingV2` (leaning perspective walls, roofs, windows, signs) and generic apartment styling; by day the window glass holds the sky, with a sun sheen sliding along the faces turned to it; `_drawFaceWindows` batches each face's windows into one path per colour (glass, sky, lit, lavender, TV) and draws sills when `this.sills` is set; neon signs bake their blurred layers once (`_signSprites`) and stamp them with the flicker; with the lean on, each sign draws inside its own building's top pass before the roof (`_paintSign`), so roofs and taller walls hide it; ordinary buildings' signs stand on a cantilevered entrance awning two floors up (`_signAwning`); rounded outer corners (`this.roundR`, `_roundCorners`: short 'C' facets with their own normals; `_roofPath`, `_footprint` for roofs and shadows) |
| `buildings/landmark-kit.js` | **`LandmarkKit`**: cheap depth and layers for lean-projected buildings — the template for the landmarks. `k(z)`, `plane`/`flat` (draw in a height's plane from cached `path`/`grad`), `sprite`/`drawSprite` (bake busy flat layers), `rings` (one path stroked per floor), and the depth vocabulary, each batched into a fill or two: `fins`, `ledge` (also plinths), `veranda`, `columns`, `sills`; `rim` — at night details catch the building's lamp colour (`colors.accent`, what its block's street lamps burn); `using(kf, fn)` draws with a building's own lean |
| `buildings/silver-queen.js` | **The Silver Queen**: palette, portico, facade, verandas, roof garden, pool, eclipse pad, crown, entrance, roof lights; on the landmark kit (lean via `LandmarkKit.using(_sqK)`): pilasters stand proud as fins, base/belt/cornice as ledges, batched capitals, dentils, verandas and columns, glows as sprites (`sqGlow`), cached roof and pool gradients; sills under every window; ledge lips, sills and veranda rails catch its violet lamp colour at night |
| `buildings/double-nights.js` | **Double Nights Hotel** (style `double_nights`): twin crescent towers (its emblem) extruded with the lean projection round a lens-shaped glass atrium; helipad and penthouse pool crowns with crimson halos; porte-cochère (fades when someone is under it), circular drive, double-crescent fountain, carpet (`_dnDrawGround`, baked); night: lit rooms, gold uplights, searchlights; the canopy script sign. Sections are collision bands (`doubleNightsSections`); drawn on the landmark kit: roofs, atrium glass and canopy from cached paths in their planes, spandrels as rings, a stone plinth, gilt-edged fins, crimson ledges every third floor, penthouse verandas and gilt columns, lit edges catching the gold lamp colour at night |
| `buildings/sky-layer.js` | Ad airships and floating shards in the sky |
| `buildings/factories.js` | `create…` functions for each named building (Silver Queen, Enni Cole, cafe, hotel, club, clinic…) |
| `buildings/registry-v3.js` | `BuildingV3` (editor-exported buildings), the building registry, Biggs amusement park |

## traffic/
| File | What's in it |
|---|---|
| `traffic/roads.js` | Lanes, segments, intersections (one car at a time, except movements that can't cross: a platoon from one lane, opposite straight-throughs), `RoadNetwork` |
| `traffic/garage-zib.js` | Vehicle brands (incl. `brake`, px/tick², and `drive`: each brand's handling character — wheel speed, turn-in, front/rear grip, cornering limit, weight) and prices, your garage, Zib rides, AI driving solver (`calculateThrottle` brakes to its target, no dead zone) |
| `traffic/car-art.js` | **How cars look**: `carSprite` (each body painted once per brand, model, paint: contact shadow, rear tyres and rims, paint shaded round its curve, glass greenhouse, mirrors, lamp housings; LADY BlackMark lacquer, gold pinstripe and rims, pearl hearse cap or panoramic black roof; Zenxera facets and cyan flank line; Gelfash bumpers, roof rails, pickup bed); `drawCarFrontTyres` (the front wheels, turned by `steer`); `drawCarBody` (the body rides its springs: out of a turn by `bodyRoll`, forward under braking by `load`); `drawCarSheen` (the sun on the paint by day, street light sliding along the roof by night); `drawCarLamps`; `drawCarGlow` (tail, brake, head and signal lamps in the dark, after lighting); `drawCarUnderglow` |
| `traffic/traffic-vehicle.js` | `TrafficVehicle`: every car on the road. AI: senses cars along its route (`_routeProbe` down the lane, through the planned turn, onto the exit lane; `_probeGap` bumper to bumper) and follows by stopping distance; stops on the line by stopping distance; claims a box only when first in its lane with room on the way out; releases it when the tail clears; gap-checked lane changes and overtakes. Physics: `applyDrivePhysics` — the driven car's weighted model: the wheel (`steer`) lags the stick and self-centres when let go, pedals travel in (`pedal`), rotation builds and settles (`yawRate`), braking shifts the load forward (`load`) so the rear lets go, two axles that hold to their limit then slide, the handbrake (`handbrake`) swings the tail; traffic keeps direct steering and the single-grip model (its wheels only look lagged). `driverInput` (stick/keys → gas and turn; hauling back is the brake), `onImpact` (a knock: twist, crunch, shake) |
| `traffic/traffic-manager.js` | Spawning (clear of cars that couldn't stop for it) and managing traffic; cars frozen 15 s out of sight are despawned (gridlock relief); car-to-car sparks, debris and `'crunch'` scale with the hit |

## story/
| File | What's in it |
|---|---|
| `story/story-db.js` | `STORY_DB`: story text and beats |
| `story/captions.js` | Caption/subtitle system |
| `story/narrative-cutscenes.js` | Cutscene manager, narrative state machine, `StoryManager`. Chapter 1: `VAN_RIDE` → `ENTER_HOTEL` → `TAKE_ELEVATOR` → `SEARCH_SUITE` → `SURVIVE_AMBUSH` → `FIND_NOTE` → `LEAVE_HOTEL` → `REPORT_TO_MIRABEL` → `CHAPTER_COMPLETE`; `story.watch(fn)` for one-off hints; saves keep the step's name (older saves migrate by name). Steps are addressed **by name**: `story.goTo('LEAVE_CLUB')`, `isAt`, `isBefore` (numbers shift when a chapter changes). Conditions: named strings, `TIMER_<ticks>`, `LOC_<map id>`, or a function `(game, ticks) => bool` |
| `story/missions.js` | Mission types, `MissionSystem`, crafting schematics |
| `story/dialogue-bonding.js` | Bonding dialogues, companion idle spots, `SPEAKER_COLORS` (every speaker's colour, used everywhere incl. the cinematic cast), dialogue transcript/sequence, `BondingSystem` |
| `story/npc-dialogue.js` | **`NPC_DIALOGUE`**: what everyone in the world says and what their buttons do — by name, then by role (`@dancer`, `@robot`, `@teammate`…), then `@passing`. `npcDialogueFor(npc)`; the box is `startDialogue` (engine/screens-ui.js) |
| `story/scene-vision.js` | `SceneVision`: full-screen painted sequences a scene steps through with `beat()` (`vanoga`: the flames, the dark, the golden egg, the burst, the pink orb of the Empereal Lord) |
| `ui/cinematic-dialogue.js` | `CinematicDialogue`: how scenes look — `say` (typed subtitle, speaker colour, living cameo, dimmed listener), `choose` (keys/taps, timed, weighty ◆), `card`, `marker`, the black layer, `memory` (vignette and grain; the colour grade is in draw.js), hold to skip. Paced by sim ticks  `black(to, frames, ease)` ('out' eases cubic); `card()` returns `leaving()` (true once the tap starts its fade-out). |
| `ui/hud-reveal.js` | **`HudReveal`** (`game.hud`): the HUD appears part by part as the story introduces it (`HUD_PARTS`; `.hud-veiled`). `reveal(key, {title, text})`, `startFresh`, `revealAll`; saved as `hudRevealed` (saves with auto-drive get the handbrake too) |
| `ui/coach.js` | **`Coach`** (`game.coach`): points at a piece of UI — spotlight (dim, only the target tappable) the first time, a ring after; a caption card; a ghost thumb for drags. Scenes yield on it. Styles: `styles/coach.css` |
| `story/scene-runner.js` | **The story's director.** `defineScene(name, meta, function* (s) {...})` and `ScenePlayer` (`game.scenes.play(name) → Promise`): scripts are generators that `yield` on ticks, lines, camera moves, choices. Verbs: `wait`, `fade`, `card`, `marker`, `map`/`cut`, `cam.to/cut/shake`, `actor` (walk, face, `setPose`), `prop` (anything drawn, e.g. the van), `tween`, `sway`, `bump`, `knock`, `say`/`narrate`/`choose`, `vision`, `memory` (a flashback's grade), `hud`/`coach`/`showHud` (the playable beats), `mask`, `flag`. Locks input, blocks saves and toasts, freezes with pause |
| `story/scenes/cast.js` | `SCENE_CAST`: each speaker's subtitle name, look and side (949 left); colours from `SPEAKER_COLORS` |
| `story/scenes/prologue.js` | **The prologue**: the epigraph, the climb up the Keeper's hill ("Somewhere between the realms… 6125"), the parlor by the fire, the vision of Vanoga. New Game plays it, then chapter 1 (`questState.prologueSeen`) |
| `story/scenes/van.js` | **Chapter 1's opening**: the crew in the van (the novel's lines), the push-in to the night before — Mirabel's call, answered by the player (the phone's first reveal), a choice that sets `mirabelFavor`, the deposit — the jolt back, the crew's choice (bonding), five knocks, and the crew pouring out at the Double Nights door. `vanAftermath` hands over (also after a skip) |

## ui/
| File | What's in it |
|---|---|
| `ui/ui-system.js` | `UISystem`: HUD, banners, prompts  Golden map: canvases in device px (crisp on retina; input converted from CSS px); the static city cached per zoom BAND (0.5/1/2/4, ≤2560 px a side) and stretched between bands, so pinching doesn't repaint; labels collision-culled at fixed sizes; legend and zoom readout from MapIcons inside the free area between the sidebars (`_freeArea`); markers drawn in screen space at fixed sizes (`animateIcons`). |
| `ui/map-icons.js` | **MapIcons**: one icon set for the golden map and the phone map, painted with paths only (no emoji) into cached sprites per kind/size/dpr and stamped at FIXED CSS sizes (`SIZE` table; `zoomK` grows them a touch with zoom, never with the screen): crimson teardrop `pin:<glyph>` (home, cross, cup, wrench, coin, star, flag, sparkle, person, dot), violet `player`, `car`, gold `objective`, `danger` (the scrapyard's hazard chevron), `transition`, `client`, `search`, `dest`. **MapArt.paintCity**: the city of light, gold on deep violet (roads as molten gold with an amber halo, pavements and crosswalks in faint gold, lamps as warm specks capped in map units, violet blocks/buildings rimmed in gold, parks with a cobbled grain); `MapArt.bloom` pools the light (downscale and add) |
| `ui/music-widget.js` | The radio/music widget (through the music bus) |
| `ui/poses.js` | `POSES`: idle life (breathing, weight shift, looking around) and poses: arms crossed, lean, fidget, typing, phone, dance, seated (`sit`, `sit_wrap`, `sit_lean`, `sit_work`, `sit_phone`)… |
| `ui/expressions.js` | `EXPRESSIONS`: faces for portraits (smile, sultry, worried…), mood from dialogue text, blinking |
| `ui/bodies.js` | `BUILDS` (slim, athletic, curvy, broad, heavy) and height; drawing Double Nights androids (finishes in `core/appearances.js`): plating, visor, emblem, hover |
| `ui/cloth.js` | Cloth physics: coat hems, skirts and trains swing, trail and settle (same method as the hair) |
| `ui/wardrobe.js` | `WARDROBE`: every top, bottom, shoe, hat and piece of jewelry, in the world and in portraits. The character look format is documented at the top |
| `ui/weapon-models.js` | **Gun models**: `WEAPON_MODELS` in the shapes of ETERNAL's catalog sketches, seen from straight above (rear knob, a ring band bulging both sides, rounded slide or long barrel, slotted collars, side knob and emblem, muzzle nub): `_r`/`_cap` slabs, `_c` faceted gem knobs, `_e`/`_ce` lights, `_g` glass sleeves, `_hole`, `_slots`; each part in a jewel-tone `GUN_MATERIALS` material, plus `muzzle`, `rail`, `brass` (the casings' glitter colour), live `glow` and a gliding spark `run`. Includes the EMPG (`empg`, model only). `weaponModel(id)` falls back by name; `bakeWeapon` paints each model once at 4× as angular metallic glass (hard bevel facets, slanted glints, gem knobs, glass panes, light halos; `_paintGunPart`, `_gunGlints`) |
| `ui/humanoid-render.js` | Drawing characters: hair, portraits, bodies, held drinks, weapons (`drawWeapon`: the baked model sprite + its lights breathing slowly in a wave down the gun and a spark gliding along its light line). **Shading**: `humanShade` (the light in the body's frame: level by `_zoomLOD`, shine/shade fills cached per frame, the crowd skips the torso; at night the nearest burning street lamp within `HUMAN_SHADE.RIM_R` rims them in its colour, a few pedestrians a frame). Matte, no highlights: a smooth wide shade (`_softSpot`, a stretched radial sprite) on the side away from the sun on every limb (`drawLimb`), the torso and head; hair gradients within its own colour (`_hairTone`: dark hair lifts toward the light, light hair deepens away); only glossy fabric (`finish: 'gloss'` on the item or its `WARDROBE` piece, e.g. leggings: `_glossy`) keeps a crisp sheen; `drawHumanContactShadow` (cast along `_sunShadow` by day, a round pool at night and indoors; replaces the pedestrians' own)  Portraits: the front hair layer is clipped (even-odd) out of a window over the eyes and lower face, so every fringe stops at the brow. |
| `ui/inventory-augments.js` | Items, abilities, inventory, augments. `toggleMenu` opens/closes through `Screens`; the list shows only equipped items on the EQUIPPED screen |
| `ui/action-dock.js` | The action dock: context pills (talk, search, enter, exit…) above the right-hand cluster, clear of the fire ring — `setActionPill`, `transitionAction`, the glyphs; `game.setInteract(verb, name)` sets the interact pill |
| `ui/phone.js` | The phone (contacts, messages, map, apps). `fit()`: on its side (600×300, `body.phone-wide`) whenever the screen is wider than tall, upright otherwise, scaled (`--phone-scale`) to fit with a margin on every resize and browser-bar change; closes from the CLOSE pill, the corner ✕ or a tap on the dimmed backdrop. incoming calls (`ringCall`/`answerCall`/`endCall`: a call card, no pause), NEUME UI, global keys  Neu.Me has a M.A.S.K row (Auto · On · Off → `cosmetics.maskMode`, saved with the cosmetics). |
| `ui/screens.js` | **`Screens`**: the one way the sidebar-nav screens open and close. `open(name)` closes the other panel (map ↔ freelancer menu, pause tokens and all), hides every sub-screen, shows the one asked for, sets the title and both nav highlights, and hides the item Filter on screens it doesn't filter (`FILTERED`: inventory, equipped → otherwise `.no-filter`). `close()`, `toggle()`, `current`. The nav, dock, pause menu, armory, `toggleMap`/`toggleMenu`, and Esc / B / M all come through here |
| `ui/sidebars.js` | Inventory and map sidebars (collapse, filters; nav clicks call `Screens.open`) |
| `ui/save-slots-pause-menu.js` | Save slots and the pause/settings menu. The pause menu follows ETERNAL's mock-up: right column "Paused" + lit-pill items; left column a Now Playing capsule (mirrors `game.musicWidget`: disc = station, gold chevron = play/pause), QUICK ACCESS (Equip Items → `Screens.open('equipped')`, Drop Items → inventory, Cinematic View → `enterCinematic`: HUD faded, world held under a `cinematic_view` pause, tap/Esc back to the menu) and the objectives. ←/→ switch between the two lists |

## engine/
| File | What's in it |
|---|---|
| `engine/pause-system.js` | `PauseSystem` |
| `engine/game-engine.js` | `class GameEngine`: constructor, companions, and `engineMixin` (how the files below attach) |
| `engine/events.js` | Input and UI event wiring; `interact()` — the one action for the pill and the E key; the handbrake button (held: `handbrakeHeld`); Space is the handbrake while driving |
| `engine/combat-effects.js` | Screen shake, time slow, death, firing, boosters, player damage; spent casings as glitter (`spawnCasing`/`updateCasings`/`drawCasings`, max 24: flecks in the gun's `brass` colour, each twinkling on its own rhythm with a four-point glint) and the muzzle flash's star (`drawMuzzleStars`, flashes now carry `angle`) |
| `engine/scope.js` | Scope view: with a sniper up to her eye, the world darkens to a lit lane along her line of fire (clipped at walls), the camera leans down it, the lane steadies; ambience quiets. Setting: Scope View |
| `engine/noise.js` | Noise: `emitNoise` — gunshots, flits, punches, struck doors, shattered glass carry (`CONFIG.NOISE`), muffled by walls and shut doors; gangers in earshot hear roughly where and go to look; the ripple she sees |
| `engine/combat-fx.js` | What a hit looks like: damage numbers, enemy health bars, blood in each character's own colour (`BLOOD_KINDS`), the hit flinch |
| `engine/boss-intro.js` | Boss intros: `bossIntro` spawns the Sanctum's Triumvirate dormant (kneeling), films their awakening (the camera visits each as its eye ignites, frames all three under the title, pans back; skippable; a short version for replays), grace, then wakes them; `drawBossGlow`; `spawnTriumvirate(opts)` (the one place their spawn points live) |
| `engine/tuning-ui.js` | Resonance on screen: HUD meter, Dr. Yin's tuning overlay, the SKILLS screen |
| `engine/shops-menus.js` | Vending, garage, auto shop, Zib, sleep |
| `engine/daytime-flit.js` | Daytime exposure, flit teleport, graveyard ghosts |
| `engine/screens-ui.js` | HUD update, dialogue and portraits, character/team/story/collection screens, notes, crafting  `updateUI` writes the DOM only when a value changed (cached elements, last values); the visualizer runs at ~10 Hz. |
| `engine/save-load.js` | Saving, loading, migrations |
| `engine/map-loading.js` | `loadMap`: building each map when you enter it; baked lighting; `removeWall(w)` (collision, render grid and shadows follow) |
| `engine/world-state.js` | Emissive pass, debug views, transitions, vehicles, visibility, time of day (`dayCycle`: darkness, the colour of the dark, daylight, sun, lamps on), darkness |
| `engine/update.js` | `update()`: the per-tick simulation |
| `engine/draw.js` | `draw()`: the frame renderer. **The view** (`this.view`, resolved once a frame: cutscene camera, or her position + scope lean + drive look-ahead `driveLeanX/Y`); `viewTransform(ctx)` and `viewToWorld(sx, sy)` — lighting and mouse aim go through these, never re-deriving the camera. Zoom detail steps with a band (`CONFIG.LOD_ZOOM`); culling never tighter than the screen |
| `engine/interiors.js` | **`INTERIOR_ART`**: each painted place's `floor` and `glow` (one line per place; draw.js and drawEmissivePass look it up). Apartment, clinic, House of Death, Double Nights lobby and penthouse (the mirror rift), the Sanctum (rose window, sigil runes), and Moon City Nightclub interiors (floors, glows; the club's light show in time with its track), the graveyard's candle flames, the city seen from the veranda |
| `engine/van-art.js` | Chapter 1's van: `van_interior` (roof off, nose up: the cab, the partition, benches of violet webbing, the road going by beneath, passing neon), `VAN.SEATS`, and `drawVanExterior` for the street (rear doors open) |
| `engine/keeper-art.js` | The prologue's places: `keepers_hill` (the island above the clouds, the path, flowers, the house with its floating gable, portals and planets) and `keepers_parlor` (checkerboard tiles, the red wingback and burgundy chesterfield, the fire and its embers, the window above it); `keeperEmberPop`  `preloadKeeper()` paints the hill, house and parlor and decodes 'the visitor' under the New Game menu fade. |
| `engine/lighting.js` | Lighting (tinted darkness layer; cached lamp shapes and gradients, baked interior lights, headlight beam sprites, coloured shot light), bloom, wet reflections, atmosphere; both passes sit on the frame's view (`viewTransform`)  Bloom and soft shadows blur by a downscale chain (no `ctx.filter`: slow on phones, missing in Safari); bloom folds its two widths at small size and stretches once.  Soft shadows: a separable box blur (three whole-pixel shifts across, three down) on the half-resolution light layer, the same in every browser. |
| `engine/daylight.js` | **Daylight**: `sunState()` (the sun's direction, shadow length, colour, golden hour, from `dayCycle`); `drawCastShadows` (buildings swept along the sun and tree canopies, one soft lavender multiply layer; drifting cloud shadows; `_sunShadow` tells foliage to skip its night pool; cars cast short shadows too); `sunNow()` (the light this frame, for paint and glass); `drawDaylight` (warm sun wash, golden-hour haze, violet vignette). Outdoors and the veranda only |
| `engine/player-draw-input.js` | Drawing the player, emotes, `addPausableTimeout` (game-time timers: they pause with the game and clear on new game/load — use these, not `setTimeout`, for anything in the story or world), joysticks — the touch sticks: the move stick's flit ring (and flick / two-finger flit settings), the fire stick's threshold ring (aim inside, fire past it; sniper fire-on-release) and aim memory |
| `engine/loop.js` | `enterWorld` (menu → world), `stop`, `resetGameState`, the main loop |

## app/ (loaded last)
| File | What's in it |
|---|---|
| `app/menu-wiring.js` | Creates `game`, main-menu buttons |
| `app/boot.js` | Colour-grade presets, settings menu wiring (incl. ambience slider), final start-up |
