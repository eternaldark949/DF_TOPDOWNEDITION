# Source map

Every piece of *Dimensions: Freelancer (top-down)* and what lives in it. `tools/build.mjs` joins them, **in the order below**, into the playable `DFAB V8.html`.
Order matters: a file can only use, when it loads, what the files above it declared.

## Page and styles
| File | What's in it |
|---|---|
| `index.html` | The page shell: `<head>`, fonts, every menu/HUD/phone panel's markup. The styles and scripts are inserted at `<!-- @styles -->` and `<!-- @scripts -->`. |
| `styles/base.css` | Core colour variables, film grain, map-transition fade |
| `styles/hud-menus.css` | HUD, main menu, overlays, notes, dialogue, shop screens |
| `styles/panels-phone.css` | Pause/settings panel, touch controls, colour-grade panel, phone and message apps |

## core/ (loaded first)
| File | What's in it |
|---|---|
| `core/config.js` | Frame-time globals and `CONFIG`: every tunable constant (buildings, weather, loop, lighting…) |
| *(generated)* | `ASSETS`: your images and audio from `assets/`, built automatically |
| `core/assets.js` | `getImage`, `drawAsset`, `playSound` / `loadSound` for your assets |
| `core/registries.js` | Notes, consumables, drinks, cosmetics (wigs, skins, outfits, hats, jewelry…); `CosmeticsSystem`, `BuffSystem` |
| `core/resonance.js` | `ResonanceSystem`: 949's progression — earning (style-weighted), Dr. Yin's tuning, the Flit / Frame / Arms trees |
| `core/utils.js` | Maths helpers, humanoid gait/animation helpers, weapon muzzle helpers, `RenderInterp` |
| `core/draw-helpers.js` | Colour helpers (`darkenHex`, `lightenHex`, `hexToRgba`…), line-of-sight/raycast, `computeVisibilityPoly` (lamp shadows, vision cones, headlights), HP bars, enemy telegraphs, glow sprites (`glowSprite`, `drawGlow`), `lampFlicker` |
| `core/appearances.js` | **Every character's look in one place**: `APPEARANCES` (949, the crew, staff, the city's cast), `ROLE_LOOKS` (medics, dancers, androids, pedestrians, gangers, spirits, ghosts), `PALETTE`, `ANDROID_FINISHES`; `lookFor(entity)`, `portraitOf(look)` |
| `core/settings.js` | `FullscreenManager`, `GameSettings`, object pools, perf utilities, `showMessage` |

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
| `world/map-entities.js` | `createMapEntities`: props, NPCs and lamps per map (the apartment suite's furniture is here) |
| `world/billboards.js` | `BILLBOARDS`: your artwork on tilted panels around the city. Add one by copying a line |
| `world/city-layout.js` | `CityLayout`: blocks, roads and building placement for the city |
| `world/bokeh.js` | Screen-space bokeh effect |

## audio/
| File | What's in it |
|---|---|
| `audio/audio.js` | `AudioSystem` (sound effects, master bus, music bus for the Music slider), `AmbienceSystem` (rain, wind, city, room tone, fireplace, doors) and `MAP_MUSIC` — each map's soundtrack (the apartment plays the Silver Queen track, fullest in the living room) |

## physics/
| File | What's in it |
|---|---|
| `physics/spatial.js` | `PhysicsSystem`, spatial hash, render/transition grids |
| `physics/game-entity.js` | `GameEntity`, the base class for everything that moves or collides |
| `physics/collision.js` | `CollisionSystem`: circles, boxes, rotated boxes, pushing, hinged-door hook |

## entities/
| File | What's in it |
|---|---|
| `entities/props-decor.js` | `StaticEntity`, apartment (incl. the crafting workbench, `apt_craft`), clinic, House of Death (`hod_*`), Double Nights lobby (`dn_*`) and Moon City Nightclub (`mc_*`) furniture art, the graveyard's carved stones (`gy_stone`, 8 variants, cached sprites), the MiniSpree vending machine and the health station (one design on every map), `PropEntity` |
| `entities/vehicles-minigames.js` | `VehicleEntity`, bumper cars, Ferris wheel, bumper-car minigame |
| `entities/lamps.js` | `LampEntity` (all lamp types) |
| `entities/actors.js` | `ActorEntity`, `PlayerEntity`, projectiles, triggers |
| `entities/static-builders-profiler.js` | Turning walls/buildings into colliders, perf bench, profiler |
| `entities/street-objects.js` | Neon signs, loot, pavement, foliage |
| `entities/npc.js` | `NPC` companions and characters, quips and emotes (their looks: `core/appearances.js`) |
| `entities/pedestrians.js` | Pedestrians and their manager |
| `entities/enemies.js` | Velvet cat, drones, gunners, gangers, restricted zone, horde gauntlet (`GAUNTLET_MAPS`: its maps — the House of Death, and sealed placeholders — picked from Grum's menu, `openGauntletMenu` in engine/shops-menus.js) |

## buildings/
| File | What's in it |
|---|---|
| `buildings/building-v1.js` | Original `Building` class, lane width constants |
| `buildings/building-v2.js` | `BuildingV2` (leaning perspective walls, roofs, windows, signs) and generic apartment styling |
| `buildings/silver-queen.js` | **The Silver Queen**: palette, portico, facade, verandas, roof garden, pool, eclipse pad, crown, entrance, roof lights |
| `buildings/sky-layer.js` | Ad airships and floating shards in the sky |
| `buildings/factories.js` | `create…` functions for each named building (Silver Queen, Enni Cole, cafe, hotel, club, clinic…) |
| `buildings/registry-v3.js` | `BuildingV3` (editor-exported buildings), the building registry, Biggs amusement park |

## traffic/
| File | What's in it |
|---|---|
| `traffic/roads.js` | Lanes, segments, intersections, `RoadNetwork` |
| `traffic/garage-zib.js` | Vehicle brands and prices, your garage, Zib rides, AI driving solver |
| `traffic/traffic-vehicle.js` | `TrafficVehicle`: every car on the road |
| `traffic/traffic-manager.js` | Spawning and managing traffic |

## story/
| File | What's in it |
|---|---|
| `story/story-db.js` | `STORY_DB`: story text and beats |
| `story/captions.js` | Caption/subtitle system |
| `story/narrative-cutscenes.js` | Cutscene manager, narrative state machine, `StoryManager` |
| `story/missions.js` | Mission types, `MissionSystem`, crafting schematics |
| `story/dialogue-bonding.js` | Bonding dialogues, companion idle spots, speaker colours, dialogue transcript/sequence, `BondingSystem` |

## ui/
| File | What's in it |
|---|---|
| `ui/ui-system.js` | `UISystem`: HUD, banners, prompts |
| `ui/music-widget.js` | The radio/music widget (through the music bus) |
| `ui/poses.js` | `POSES`: idle life (breathing, weight shift, looking around) and poses: arms crossed, lean, fidget, typing, phone, dance… |
| `ui/expressions.js` | `EXPRESSIONS`: faces for portraits (smile, sultry, worried…), mood from dialogue text, blinking |
| `ui/bodies.js` | `BUILDS` (slim, athletic, curvy, broad, heavy) and height; drawing Double Nights androids (finishes in `core/appearances.js`): plating, visor, emblem, hover |
| `ui/cloth.js` | Cloth physics: coat hems, skirts and trains swing, trail and settle (same method as the hair) |
| `ui/wardrobe.js` | `WARDROBE`: every top, bottom, shoe, hat and piece of jewelry, in the world and in portraits. The character look format is documented at the top |
| `ui/humanoid-render.js` | Drawing characters: hair, portraits, bodies, held drinks, weapons |
| `ui/inventory-augments.js` | Items, abilities, inventory, augments |
| `ui/phone.js` | The phone (contacts, messages, map, apps), NEUME UI, global keys |
| `ui/sidebars.js` | Inventory and map sidebars |
| `ui/save-slots-pause-menu.js` | Save slots and the pause/settings menu |

## engine/
| File | What's in it |
|---|---|
| `engine/pause-system.js` | `PauseSystem` |
| `engine/game-engine.js` | `class GameEngine`: constructor, companions, and `engineMixin` (how the files below attach) |
| `engine/events.js` | Input and UI event wiring |
| `engine/combat-effects.js` | Screen shake, time slow, death, firing, boosters, player damage |
| `engine/scope.js` | Scope view: with a sniper up to her eye, the world darkens to a lit lane along her line of fire (clipped at walls), the camera leans down it, the lane steadies; ambience quiets. Setting: Scope View |
| `engine/noise.js` | Noise: `emitNoise` — gunshots, flits, punches, struck doors, shattered glass carry (`CONFIG.NOISE`), muffled by walls and shut doors; gangers in earshot hear roughly where and go to look; the ripple she sees |
| `engine/combat-fx.js` | What a hit looks like: damage numbers, enemy health bars, blood in each character's own colour (`BLOOD_KINDS`), the hit flinch |
| `engine/tuning-ui.js` | Resonance on screen: HUD meter, Dr. Yin's tuning overlay, the SKILLS screen |
| `engine/shops-menus.js` | Vending, garage, auto shop, Zib, sleep |
| `engine/daytime-flit.js` | Daytime exposure, flit teleport, graveyard ghosts |
| `engine/screens-ui.js` | HUD update, dialogue and portraits, character/team/story/collection screens, notes, crafting |
| `engine/save-load.js` | Saving, loading, migrations |
| `engine/map-loading.js` | `loadMap`: building each map when you enter it; baked lighting |
| `engine/world-state.js` | Emissive pass, debug views, transitions, vehicles, visibility, time of day (`dayCycle`: darkness, the colour of the dark, daylight, sun, lamps on), darkness |
| `engine/update.js` | `update()`: the per-tick simulation |
| `engine/draw.js` | `draw()`: the frame renderer |
| `engine/interiors.js` | Apartment, clinic, House of Death, Double Nights lobby and Moon City Nightclub interiors (floors, glows; the club's light show in time with its track), the graveyard's candle flames, the city seen from the veranda |
| `engine/lighting.js` | Lighting (tinted darkness layer; cached lamp shapes and gradients, baked interior lights, headlight beam sprites, coloured shot light), bloom, wet reflections, atmosphere |
| `engine/player-draw-input.js` | Drawing the player, emotes, timers, joysticks — the touch sticks: the move stick's flit ring (and flick / two-finger flit settings), the fire stick's threshold ring (aim inside, fire past it; sniper fire-on-release) and aim memory |
| `engine/loop.js` | `start`, `stop`, `resetGameState`, the main loop |

## app/ (loaded last)
| File | What's in it |
|---|---|
| `app/menu-wiring.js` | Creates `game`, main-menu buttons |
| `app/boot.js` | Colour-grade presets, settings menu wiring (incl. ambience slider), final start-up |
