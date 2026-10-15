# DF_TOPDOWNEDITION — Features & Mechanics

**Dimensions: Freelancer, top-down edition**  
Source inventory prepared 13 October 2026. Repository: `eternaldark949/DF_TOPDOWNEDITION`, branch `main`, commit `a376397a995e4513571aed3ba10068b76b4cd077`.

This document catalogs the features, mechanics, named content, interface tools, and technical systems found in this source snapshot. Related visual details are grouped into systems. It is a source review, not a claim that every behavior has been playtested. Content that is only referenced, modeled, advertised, or reserved for later is identified separately in section 19. Prices and balance values can change in later versions.

## Contents

1. Game format and core loop
2. Movement, flitting, and controls
3. Weapons and combat
4. Stealth, visibility, and enemy awareness
5. Health, recovery, and death
6. Resonance progression and skills
7. Cybernetic augments
8. Story, dialogue, and onboarding
9. Jobs, rewards, crafting, and collection
10. Crew, hired companions, and relationships
11. Vehicles, traffic, garage, and taxis
12. Challenges and leisure activities
13. Locations and exploration
14. Home and furniture
15. Appearance and customization
16. Phone, maps, menus, and HUD
17. Weather, world simulation, visuals, and sound
18. Saves, settings, performance, and development tools
19. Implementation distinctions and future content
20. Complete named catalogs
21. Source reference index

## 1. Game format and core loop

**Type: Platform / game structure**

- **Offline browser game:** the generated `DFAB V8.html` contains the playable game and baked assets; download and open it locally.
- **Top-down action and city exploration:** play Stella / Freelancer 949, move through Southern Dimensions City, enter authored interiors, interact with people, fight, and drive.
- **Story campaign plus repeatable activities:** the prologue and Chapter 1 coexist with jobs, restricted-zone fighting, gauntlets, boss replays, and bumper cars.
- **Multiple progression resources:** Personics / PP buy services and equipment; scrap funds crafting; unsettled Resonance becomes levels and tuning points at Dr. Yin; Dark Element shards are tracked collectibles.
- **World time:** a simulated clock controls daylight, weather-related information, buff duration, hire expiration, daily loot refresh, and sleeping.
- **Keyboard/mouse and touch play:** responsive desktop, portrait, and landscape interfaces; touch movement and aiming sticks.

## 2. Movement, flitting, and controls

**Type: Movement / input / traversal**

- **Directional movement:** WASD/arrows or a touch stick; movement and facing feed the animated gait and physical collisions.
- **Independent aiming:** mouse or the fire stick directs the weapon separately from walking.
- **Holster/draw:** put the weapon away or draw it; drawing starts the Quick-Draw upgrade window. Holstering also changes the camera framing.
- **Sneak toggle:** C or the Sneak button enables a crouch, 55% movement speed, quieter steps, and reduced visibility.
- **Flit teleport:** blink in the movement direction, or the facing direction when stationary. Base distance is 120 world units before bonuses.
- **Attunement resource:** flits spend attunement, which recharges; upgrades, augments, and drinks modify cost, range, or capacity.
- **Brief flit protection:** the player damage path checks active flit invulnerability.
- **Obstacle-crossing with safe landings:** a flit can pass through obstacles, but its final collision circle must be clear. A blocked endpoint searches backward for the farthest safe point on the intended ray.
- **Blocked-flit feedback:** no valid forward landing means no resource spend; a crimson ring response and sound indicate failure, and the ring can be tried again.
- **Touch flit choices:** dedicated button, deliberate fast outward movement-stick ring flick, standalone flick, and two-finger options.
- **Aim/fire threshold:** aim inside the fire-stick threshold and fire beyond it; sniper fire-on-release is configurable. Aim memory and precise-stick behavior support small adjustments.
- **Context actions:** nearby interaction pills offer talking, searching, executing, entering/exiting, transitions, pickup, and furniture handling.
- **Driving input:** acceleration, braking/reverse, steering, and a held handbrake replace walking input while seated. Space fires on foot and operates the handbrake while driving.
- **Other shortcuts:** E interacts, F uses transitions, H self-heals, J heals an ally, Q toggles autodrive, M opens the map, P opens the phone, B/Esc closes relevant menus; G handles furniture and R/Shift+R turns it.
- **Input safeguards:** pause, scenes, UI focus, furniture handling, and HUD locks prevent incompatible actions.

## 3. Weapons and combat

**Type: Combat / equipment / damage**

| Weapon | Mechanic | Base direct damage |
|---|---|---:|
| FP-X | Experimental pistol; cyan energy projectile | 35 |
| YourGirlSara | Powerful penetrating sniper shot | 100 |
| RB-98 | Rapid rifle-blaster fire | 12 |
| Anavia | Very fast periwinkle energy fire | 8 |
| SR-86 | Slower penetrating crimson sniper fire | 65 |
| Maiden's Kukri | Short forward-arc melee attack with bleeding | 28 |
| Golden Child | Sticky golden projectile with damage over time | 18 plus attached damage |

- **Starting weapon set:** FP-X, YourGirlSara, RB-98, Anavia, SR-86, and Maiden's Kukri are in `DEFAULT_LOADOUT`. Golden Child is a crafting recipe.
- **Unarmed punches:** alternating punches apply direct damage and knockback; Heavy Hands strengthens them.
- **Melee arcs:** blade attacks hit enemies in front and within reach, respect blocked sight lines, and can make a small collision-checked step toward a target.
- **Bleeding:** Kukri cuts apply 6 damage/second for 3 seconds per stack; up to three stacks, refreshed by fresh cuts, tick every 0.5 game seconds. Visible blood-drop markers show the stacks.
- **Sticky damage:** Golden Child attaches orbs to targets and applies repeated damage ticks.
- **Projectile mechanics:** weapon-specific speed, spread, cooldown, recoil, color, lifespan, and penetration; hit handling checks walls, doors, and actors.
- **Damage attribution:** kills distinguish player, teammate, melee, and other sources for rewards and style scoring.
- **Bullet hit rules:** player bullets bypass ordinary actor hit invulnerability frames, so successive landed bullets count; melee/bump protection remains separate.
- **Damage types:** actors receive typed damage such as melee, blunt, ballistic/energy, and bleed; damage presentation can distinguish bleeding from direct impacts.
- **Laser Sight attachment:** a visible red targeting beam shows the muzzle's line of aim; crafted separately and equipped as an attachment.
- **Neural Lock targeting:** equipped augment steers friendly projectiles toward suitable nearby hostiles in the firing direction.
- **Firing from vehicles:** driving retains weapon aiming/firing, including sniper release behavior, through vehicle-specific firing positions.
- **Sniper scope view:** darkened surround, a lit aiming lane clipped by geometry, breathing sway that settles, and camera lean along the shot.
- **Scope focus slow motion:** optional slowdown to a 0.35 time scale; approximately 3 real seconds of focus, refilling at 0.6 seconds of focus per real second with the scope down.
- **Style damage bonuses:** Flit-Strike strengthens attacks soon after teleporting; Quick-Draw strengthens the first shot after drawing; gun, spread, cadence, and punch upgrades apply elsewhere.
- **Feedback:** enemy HP bars, floating damage numbers, hit flinches, blood by character blood kind, hit shake, muzzle stars, sparks, dust, casings, smoke, and weapon-specific trails.
- **Fallen bodies:** enemies recoil, fall, settle, remain briefly, and fade; dropped-gun art appears beside humanoid bodies. Actual weapon pickups use the inventory loot path.
- **Cinematic finishers:** qualifying stylish kills, wave-ending kills, and heavy/boss defeats can trigger slow motion, camera movement to the fallen target and Stella, a gun twirl, and a photo prompt. Input can shorten the beat; Full, Subtle, and Off modes exist.
- **Shared combat abilities:** Fireball, Shadow Bolt, and Ember Burst are defined for actors; their registry is not a player spell-learning interface.

## 4. Stealth, visibility, and enemy awareness

**Type: Stealth / enemy AI / tactical feedback**

- **Lighting-based detection:** daylight, darkness, lamps, and player visibility affect how easily enemies perceive 949.
- **Sight cones and line of sight:** gangers and sight-gated bosses require appropriate facing and unobstructed sight; walls, buildings, and doors matter.
- **Awareness states:** idle, suspicious, alert, searching, and suppressing behavior; suspicion builds, enemies investigate, and lost-contact positions guide searches.
- **Hearing:** gunshots, flits, punches, executions, footsteps, puddle steps, door hits, and shattered glass emit noises with different ranges.
- **Muffling:** walls and closed doors reduce sound propagation; heard positions are approximate leads rather than perfect knowledge.
- **Sneaking modifiers:** step-noise range ×0.35, puddle-noise range ×0.6, visibility ×0.75, movement ×0.55.
- **Back approach:** unaware gangers can fail to sense a quiet approach behind them at close range.
- **Execution conditions:** quietly approach an unaware non-boss ganger from behind, in reach, with a clear line. Sneaking qualifies; slow movement in sufficiently low visibility also qualifies.
- **Execution actions:** a gold cue and Execute pill identify a target; fists/blade fire can perform it. Bare hands strike the neck; the Kukri performs a draw-cut.
- **Execution rewards:** a successful kill restores up to 15% of maximum player HP and adds 15 execution Resonance, alongside applicable kill scoring.
- **Execution noise:** takedowns remain audible to nearby enemies; bosses cannot be executed.
- **Flit Afterimage:** an upgrade makes the departure ghost draw ganger attention briefly.
- **Crew stealth:** followers crouch, close formation, quiet their steps, match pace, and hold fire on unaware enemies. Alert foes remain valid targets; player gunfire grants 10 seconds of weapons-free behavior.
- **Enemy tactics:** predictive aim, telegraphed attacks, bursts, reload pauses, pursuit, wandering, last-known-position suppression, room searches, navigation around obstacles, and stuck recovery.
- **Hunters:** night vision limits the benefit of darkness; they dash without passing through solid walls/closed doors, sidestep hits, use sidearms, and claw at close range. Alphas are tougher with extra dashes.
- **Player night vision:** a toggle makes dark spaces readable and highlights eligible hostiles with white-hot silhouettes; civilians and crew do not get enemy heat silhouettes.
- **Stealth display:** a visibility/hidden readout and optional stealth greyscale communicate exposure. Player Glow can add a lavender rim for readability.
- **Sound visualization:** Mirage rings distort the lit scene, Simple draws lighter rings, Off disables them; enemy rings have their own toggle.

## 5. Health, recovery, and death

**Type: Survival / support**

- **Player HP and damage reduction:** health tracks direct hits, shield absorption, knockback, augment armor, and Frame upgrades.
- **Self stims:** spend a carried stim to heal 50 HP before Stim Potency bonuses; full health does not consume one.
- **Ally stims:** hold Heal for at least 300 ms or press J to spend a player stim on the nearest eligible damaged recruited teammate.
- **Stim capacity:** limited carrying capacity; Vital Link adds two. Loose stim pickups remain when capacity is full.
- **Passive player regeneration:** normally 5 HP/second after 10 seconds without damage; Idle Mend shortens the delay and increases healing; Nanite Weave doubles the resulting heal amount.
- **Medical stations:** full player healing and stim refills, plus recruited-teammate healing/refills.
- **Teammate sustain:** own stim reserves/cooldowns, out-of-combat recovery, and a small proximity-healing aura near the player; Vital Link accelerates the aura.
- **Last Stand:** an installed upgrade can leave the player at 1 HP after a lethal hit; its cooldown depends on rank.
- **Death return:** respawn beside the recovery bed at Dr. Yin's Clinic with restored health/stims; clear temporary buffs and lose half of unsettled Resonance.
- **Story recovery:** death during the hotel ambush rewinds the relevant story approach so the ambush can be attempted again; active optional Sanctum state is cleared for retry.
- **Downed permanent crew:** teammates become downed instead of being permanently removed and recover to full HP/stims when the apartment is loaded.
- **Traffic danger:** fast cars can hit the player and crew; collision damage has a grace interval rather than repeating every touching frame.

## 6. Resonance progression and skills

**Type: Character progression**

- **Unsettled earnings:** field Resonance sits in a vulnerable pool until Dr. Yin tunes it.
- **Sources:** kills, jobs, restricted-zone clears, gauntlet waves, and executions.
- **Kill style multipliers:** Flit-Kill ×1.5 within 1 second of flitting; melee ×1.4; rapid chains gain 25% steps up to ×2 within 2.5 seconds; 20 seconds without damage gives Untouched ×1.3. Applicable bonuses stack.
- **Crew kill share:** teammate kills award 30% of the base reward; tougher enemies can increase the base.
- **Leveling:** maximum level 50; next level costs `120 + 70 × current level` Resonance. Each gained level grants one tuning point.
- **Skill structure:** three trees, six nodes each, three ranks per node. A node requires a rank in the preceding node; sixth nodes also require level 30.
- **Retuning/respec:** return installed ranks as tuning points; the configured service price is 200 PP.
- **At-cap conversion:** after tuning at level 50, every complete 100 settled surplus Resonance converts to 1 PP; leftover Resonance persists.

| Tree | Skill | Effect per rank / special rule |
|---|---|---|
| Flit | Reach | +10% flit distance |
| Flit | Quick Return | −10% flit cost |
| Flit | Flit-Strike | +20% shot/blade damage during the post-flit window |
| Flit | Afterimage | Departure ghost distraction lasts +0.5 seconds/rank |
| Flit | Double Step | +20 max attunement/rank; rank 3 halves the cost of a second flit within 0.6 seconds |
| Flit | Long Echo | Level 30; +0.25 seconds/rank to the Flit-Strike window |
| Frame | Reinforced | +10 maximum HP |
| Frame | Plating | −6% incoming damage |
| Frame | Stim Potency | +15 HP healed by self stims |
| Frame | Idle Mend | Regen starts 2 seconds sooner/rank, +1 HP/second/rank |
| Frame | Last Stand | Survive lethal damage at 1 HP; cooldown 120/90/60 seconds |
| Frame | Grounded | Level 30; −15% incoming knockback/rank |
| Arms | Steady | −12% spread |
| Arms | Quick Hands | −8% shot cooldown |
| Arms | Hollow Points | +8% gun damage |
| Arms | Heavy Hands | +25% punch damage/knockback |
| Arms | Quick-Draw | First shot within 0.8 seconds of drawing gets +25% damage/rank |
| Arms | Low Signature | Level 30; −10% gunshot hearing range/rank |

## 7. Cybernetic augments

**Type: Purchasable loadout upgrades**

Buy at Dr. Yin's Clinic; manage owned/equipped augments from the Augments screen. Up to three augments can be equipped. Catalog body-slot labels do not impose one-per-body-slot restrictions in the current equip method.

| Augment | Price (PP) | Current implementation / catalog distinction |
|---|---:|---|
| Neural Lock | 350 | Friendly projectile steering toward hostiles |
| Adrenal Surge | 300 | Advertises +20% vehicle speed / +15% acceleration; no gameplay reference to its ID found outside the catalog |
| Subdermal Mesh | 400 | Player incoming-damage reduction of 20% |
| Echo Pulse | 250 | Sweep-style tactical radar with a 600-unit range |
| Reflex Sync | 275 | Firing path multiplies cooldown by 0.8: 20% shorter; description says 25% |
| Phase Wire | 500 | Flit cost ×0.7 and distance ×1.3 |
| Nanite Weave | 600 | Doubles passive player regeneration; description instead says 1 HP every 5 seconds |
| Salvage Net | 200 | Eligible small pickups drift inward from up to 105 units versus normal pickup at 35; advertised +10% scrap not found in the pickup payout path |
| Vital Link | 450 | +2 stim capacity; nearby ally aura interval falls from 60 to 34 ticks |

## 8. Story, dialogue, and onboarding

**Type: Narrative / tutorial**

- **Prologue:** epigraph, the Keeper's hill between realms, a fireside parlor scene, and the vision of Vanoga, including flames, darkness, the golden egg, and the Empereal Lord's orb.
- **Chapter 1 — The Awakening:** van ride → enter Double Nights → elevator → penthouse search → drone ambush → recover the Dark Maker's letter → return to the BlackMark → report to Mirabel at Moon City → completion.
- **Mirabel flashback call:** player answers the phone; a dialogue choice sets favor and affects contractor payment/dialogue. Deposit and final balance are tracked.
- **Crew choice:** the van scene includes relationship-affecting interaction.
- **Scripted breach:** the penthouse back wall breaks with effects and drones enter; surviving advances the story.
- **Communications:** character-colored comms, portrait/caption dialogue, phone messages, and delayed lines accompany objectives.
- **Readables:** styled notes include A Letter from the Dark Maker and Mission Briefing — Darklands; discovery is tracked and notes can be revisited.
- **Optional Sanctum quest:** enter the church encounter, defeat the Triumvirate, and receive 1,000 PP and 50 scrap on its authored completion.
- **Reward claims:** Double Nights staff provide a one-time ambush reward; Mirabel pays the remaining contract balance, with a favor bonus when applicable.
- **Cinematic presentation:** typed subtitles, animated portraits/cameos, speaker colors, expression/mood selection, narration, title cards, place/time markers, black fades, memory/flashback treatment, camera choreography, and choices.
- **Skipping:** hold-to-skip scenes and skippable boss introductions; aftermath handlers apply required progress after a skip.
- **Progressive HUD reveal:** controls appear as Chapter 1 teaches them; taught/revealed state is saved.
- **Coach:** spotlight, ring, caption card, and ghost-thumb drag demonstrations teach movement, actions, firing, healing, flitting, autodrive, and handbrake use.
- **Dialogue sequences:** multi-line conversations support advance and backward/forward review; transcripts can be viewed on the phone.
- **Scene safeguards:** running scenes lock incompatible input, pause correctly, and block saving; scene state is aborted when loading another save.
- **Story screen:** main/optional progress and objective information; step-name-based migration supports older saves.

## 9. Jobs, rewards, crafting, and collection

**Type: Contracts / economy / inventory**

| Job | Provider / unlock | Completion | Reward range |
|---|---|---|---|
| Amber Delivery | Barista Ren, Cozy Cafe | Pick up the parcel beside Amber's van or load it by entering the van; approach the target building/drop zone | 120–199 PP; 2–6 scrap |
| Bounty | Moon City bartender | Find and defeat a randomly named armed target | 200–399 PP; 15–25 scrap |
| Salvage | Anavia after five completed bounties | Clear 3–5 guards at a building, then collect the spawned scrap crate | 50–100 PP; 30–50 scrap |

- **One active job:** complete or abandon the current job before accepting another.
- **Generated targets:** delivery apartments, named bounty marks, and salvage sites vary; armed bounty/salvage enemies have enhanced HP and weapon pools.
- **Mission guidance:** objective title/step, distance, map pins, parcel/drop-zone ground effects, and offscreen compass badges.
- **Delivery recipient:** a resident NPC appears near the destination as the player approaches.
- **Job reward progression:** completing a mission adds 100 Resonance, counters, and an entry to the mission log; five bounties unlock Anavia's salvage offers and Stellar Lemonade.
- **Abandonment:** clears the active contract and shows failed feedback. Active jobs do not resume when loading a save.
- **Personics:** mission/kill pickups, waves, restricted zones, luggage searches, and story rewards feed currency used by shops and hires.
- **Scrap:** ordinary drops, contracts, and combat challenges feed the workbench.
- **Craft Laser Sight:** 150 scrap.
- **Craft Golden Child:** 500 scrap.
- **Pickup types:** PP, scrap, stims, Dark Element, salvage crate, and dropped inventory weapons.
- **Physical inventory:** ten-item capacity, add/remove, equip/unequip, item actions, attachments, consumable use, and category filters.
- **Dropping equipment:** creates a world weapon pickup; a short delay prevents immediate automatic re-pickup.
- **Ownership views:** cosmetics and apartment furniture also appear as inventory records; these are distinct from physical carried items and their capacity.
- **Collection screen:** notes, schematics, owned appearance content, and tracked collectibles/resources.
- **Daily lost-property searches:** luggage/lost items award PP once per game day, change their searched appearance, and refresh on a new day.
- **Buff purchases:** MiniSpree vending sells Bubble Tea, Ms. Jean Soda, and unlockable Stellar Lemonade; durations use world minutes and expiration reverses temporary effects.

| Consumable | Price | Duration | Gameplay effect |
|---|---:|---|---|
| Bubble Tea | 30 PP | 120 game minutes | Movement speed ×1.2, flit distance ×2 |
| Ms. Jean Soda | 20 PP | 90 game minutes | Enemy detection range ×0.6 |
| Stellar Lemonade | 75 PP | 480 game minutes | Speed ×1.75, flit cost modifier ×⅓, 100 shield; temporarily halves max HP; unlock after five bounties |

## 10. Crew, hired companions, and relationships

**Type: Party / social / allied AI**

- **Permanent recruitable crew:** Victoria, Yenna, Sabrina, Max, and Josh; 747 also appears as a story/comms character.
- **Team management:** recruit or stand down permanent members; inspect bio, weapon, health, relationship, active/standby/downed status. Dismissal uses a second tap to confirm.
- **Combat followers:** navigation around obstacles, formation spacing, target acquisition, firing positions, weapon/ability attacks, and crowd avoidance.
- **Shared stealth:** the crew follows the player's sneak state and rules for holding fire.
- **Vehicle passengers:** companions occupy available seats, move with the vehicle, and disembark; capacity depends on model.
- **Temporary dancer companions:** hire eligible dancers / Red Demon dancers for 400 PP for eight game hours; up to five active contracts.
- **Hire expiration and dismissal:** duration is tracked against world time; Team displays remaining time and can dismiss a hire.
- **Companion magic:** eligible actor loadouts use projectile abilities such as Fireball; the ability definitions are shared with other actors.
- **Recovery support:** ally stims, self-sustain, player proximity aura, and apartment recovery for downed permanent teammates.
- **Apartment downtime:** crew have idle positions/poses and tiered relationship conversations.
- **Bonding:** one completed bonding conversation per recruited character per rest cycle adds 8 relationship, capped at 100. Sleeping resets the cooldown.
- **Relationship dialogue tiers:** Acquaintance 0–24, Companion 25–49, Trusted 50–74, Inner Circle 75–100; unseen dialogue is preferred before repeats.
- **Emotes and reactions:** Smile, Zany, Cry, and Frown on a four-way drag interface; player portrait expression follows the emote, and the nearest eligible pedestrian/NPC/recruited teammate can respond within 180 units using character/relationship-dependent lines.
- **Leisure bonding:** participating permanent teammates gain +2 relationship after a bumper-car round.
- **Saved social state:** relationship, bonding cooldowns, seen conversations, and crew state persist where included in the save.

## 11. Vehicles, traffic, garage, and taxis

**Type: Driving / ownership / transport simulation**

- **Three vehicle brands:** LADY ultra-luxury, Zenxera mid-luxury, and Gelfash economy; each has distinct size, speed, acceleration, handling, braking, mass, grip, and steering behavior.
- **Manual physics:** momentum, steering response, tire grip, weight transfer/slide behavior, brake/reverse, handbrake, collision response, engine hum, tire squeal, and hit feedback.
- **Road AI:** directional lanes, junction transitions, curved/angled roads, route following, signals, queues, obstacles, parked-car avoidance, and collision management.
- **Demand-based junction lights:** waiting/approaching cars and pedestrians influence green duration; amber, all-red clearance, turn arrows, anti-starvation, path-conflict checks, and downstream queue space govern entry. Walk/wait strips and demand gauges visualize state.
- **Traffic personalities:** calm, normal, and pushy drivers differ in following gaps, horns, passing, left-turn gap acceptance, and amber braking; hired/autonomous player drivers remain calm.
- **Pedestrian obstruction response:** civilian drivers can wait, horn, route around a person, squeeze past, or back up when safe; collision/queue constraints still apply.
- **Pedestrian road behavior:** look before entering crossings; obey walk lights, wait for obstructing cars, and keep pedestrian crossing phases active while crossing.
- **Owned car:** start with a permanent BlackMark V1. It is not sellable; the owned active car's parked hub position is saved.
- **Garage purchases:** buy additional models, choose an active car, and retain garage ownership/customization.
- **Torque customization:** paint 75 PP, underglow 150 PP, headlights 100 PP; swatches, car preview, and reset-to-default behavior.
- **Vehicle categories:** owned, sanctioned delivery van, and hijacked; HUD identifies the currently occupied/linked car.
- **Enter/exit choreography:** walk to a usable car door, route around its body, enter, leave, and let a moving exited car roll to a stop.
- **Hijacking:** take a traffic vehicle outside junction/lane-critical positions; a ganger driver may get out hostile. Empty vehicles have no driver to eject.
- **Linked stolen car:** remains linked until another car is taken; then it returns to traffic, still lit.
- **Parked vehicles:** traffic and pedestrians recognize parked cars as obstacles; lights/headlight beams can remain on.
- **Amber's delivery van:** sanctioned job vehicle at Cozy Cafe; entering during delivery loads the parcel, and a new delivery/load can return it home.
- **Hub-only owned vehicles:** cars are hidden and removed from collision when switching away from the hub.
- **Autodrive:** follow a map destination through legal lanes, avoid obstacles, brake on arrival, and yield to manual driving; unreachable routes return control.
- **Driving camera:** speed-dependent zoom, look-ahead, and shake-aware framing.
- **Car.ME:** view garage, set active car, summon an owned car near the player on the hub.
- **Zib.ME:** summon a nearby autonomous taxi; select one of nine destinations and travel as a passenger.
- **Taxi fare:** base 25 PP plus a distance component of 0.025 PP/world unit; cancellation can charge a traveled-distance fraction.
- **Taxi safety/arrival:** route feasibility checks, stuck handling, drop-off placement, cancellation, and cleanup.
- **Taxi skip/fallback:** skip travel to the destination; unroutable rides can fall back to free destination relocation, and a map change abandons the ride without charge.
- **Vehicle navigation HUD:** car/van pins, offscreen compass, ownership chips, distance/direction back to the owned car, and current ride name.

## 12. Challenges and leisure activities

**Type: Replayable combat / minigames / pets**

- **Scrapyard restricted zone:** entering starts hostile waves; clearing grants currency/Resonance, starts a respawn countdown, and raises subsequent difficulty. Later clears introduce rapid blasters and snipers.
- **Horde Gauntlet selection:** Grum North offers House of Death and Demoness Palace. Two additional choices are sealed placeholders.
- **House of Death escalation:** increasing ganger count, HP, and speed; RB-98 enemies from wave 4, heavy gunners from wave 5, SR-86 enemies from wave 8.
- **Palace escalation:** hunters, alphas from wave 3, and Lilitu every fifth wave with an intro while her hunters wait.
- **Gauntlet pacing:** brief opening delay and 3.5 seconds between clears; enemies spawn around walkable rooms, preferably away from the player.
- **Anti-stall search:** enemies get an approximate area lead if nobody has seen/heard the player for a sustained period.
- **Wave rewards:** `40 + 20 × wave` PP, `floor(2 × wave)` scrap, and `40 × wave` Resonance; a Dark Element pickup every third wave.
- **Gauntlet records:** highest wave per arena, total kills, countdown, remaining-hostile bar, boss/gunner chips, and end summary; leaving ends the run.
- **Triumvirate:** Vesper the Censer, Matins the Choir, and Compline the Penitent; distinct warden art, dormant awakening sequence, telegraphed sight-gated gunfire, and defeat effects.
- **Boss replay:** Grum can send the player back to the Sanctum for a short-intro replay.
- **Lilitu, the Demoness:** winged boss with chained dashes, long-reach whip/claw, hearing-driven pursuit, and no execution eligibility; first defeat awards the Maiden's Kukri even though the current default loadout already includes it.
- **Crash Royale bumper cars:** Biggs charges 75 PP; seven cars compete for 60 seconds using collisions/hit scoring, a live scoreboard, timer, and results panel.
- **Crew bumper drivers:** recruited teammates fill seats first with character-specific aggression and leader focus; generic AI fills remaining places.
- **Bumper prizes:** 200 PP for first, 100 PP for second/third, 25 PP otherwise; participating permanent crew gain relationship.
- **Ferris wheel:** animated amusement-park set piece with rotating gondolas; a playable ride interaction was not confirmed.
- **Velvet cat:** discoverable pet companion, join interaction, following, vehicle riding, and animated cat behavior. The pet category is not a general pet acquisition system.
- **Ethereal exploration:** Ms. Jean unlocks crossing into the Ethereal Plane; it contains spirit NPCs and a return-to-body transition.

## 13. Locations and exploration

**Type: World / playable spaces**

| Location / map | Feature content |
|---|---|
| Southern Dimensions City (`hub_949`) | 13,200 × 13,200 outdoor hub, roads, blocks, landmarks, traffic, pedestrians, parks, jobs, scrapyard, graveyard |
| Silver Queen Apartments (`apt_949`) | Home suite, veranda city view, crew downtime, sleep, furniture, armory, crafting, vending, healing, note |
| Double Nights lobby (`hotel_lobby`) | Reception, guests/staff, lounge/queue activity, elevators, lost property, 747, reward contact |
| Penthouse suite (`hotel_suite`) | Search, breach/drone ambush, readable letter, portal/mirror-rift route |
| Dr. Yin's Clinic (`medbay_sw`) | Recovery bed, refills, augments, Resonance tuning |
| Moon City Nightclub (`moon_city_nightclub`) | Dance floor, bar, booths, restrooms, crowd routines, Mirabel, bounties, hireable dancers |
| Abandoned Church / Sanctum (`church_boss`) | Optional Triumvirate fight, replay, sigils, rose window, boss lighting |
| Cozy Cafe (`cozy_cafe_interior`) | Barista Ren, Chef Koda, guest/staff routines, delivery jobs, kitchen, fireplace |
| Torque Auto (`auto_shop`) | Service-bay environment, vehicle buying/garage/customization |
| Neural Systems (`neural_sys_interior`) | Prisma, sequencing-lab environment, appearance shop |
| Enni Cole (`enni_cole_interior`) | Department-store floor with authored departments, staff/dialogue, stairs |
| Enni Cole upper (`enni_cole_upper`) | Showroom, Cuisine, kitchen, salon/fitting spaces; no complete department shopping systems confirmed |
| Biggs arena (`biggs_arena`) | Crash Royale bumper-car activity |
| House of Death (`house_of_death`) | Gothic rooms, hinged doors, courtyard, gauntlet |
| Demoness Palace (`demoness_palace`) | Throne hall, galleries, garden, shrine/bath/kennels, hunter gauntlet |
| Ethereal Plane (`ethereal_plane`) | Spirit encounters, violet pillars/auras, mirrored floor, return transition |
| OllO Plaza (`ollo_test`) | Accessible outdoor plaza / landmark showcase despite the internal test name |
| OllO Lounge (`ollo_interior`) | Interior reached from the plaza |
| Keeper's hill (`keepers_hill`) | Prologue staging: cloud island, house, path, flowers, portals/planets |
| Keeper's parlor (`keepers_parlor`) | Prologue fireside meeting and vision |
| Van interior (`van_interior`) | Chapter-opening crew scene and passing-road/neon presentation |

- **Six named city parks:** Lotus Park, Violet Commons, Moonwell Gardens, Nightshade Green, Starfall Commons, Eclipse Gardens.
- **City architecture:** landmark buildings plus bakery, florist, boutique, lounge, brownstone, deco, terrace, and loft variants; authored block placement and generated street-front fill.
- **Special road geometry:** Lantern Cut diagonal and Halfmoon Bend curved street; crossings, walk networks, lane transitions, and building frontage follow the road layout.
- **Transition points:** context-driven entries/exits, elevators, stairs, and portals connect maps.
- **Room-aware interiors:** individual indoor/outdoor rooms, soft visibility veils, light spill, windows, and weather on verandas/courtyards.
- **Doors:** hinged/sliding/arch types; moving leaves interact with actors and projectiles, sight, sound, and navigation.
- **Light switches:** interactively toggle room illumination with eased lighting changes.
- **Breakable glass / physical doors:** impacts can break glass or push doors, with sound/particle feedback.
- **Props:** movable physical objects, friction, angular motion, and collision against walls/actors/cars; decorative fixtures remain fixed.
- **Map-edge veil:** outdoor borders show a nebula/star void, aurora-like seam, near-player brightening, and movement ripples.
- **Art billboards:** custom imagery appears on tilted city panels.

## 14. Home and furniture

**Type: Housing / downtime / layout editing**

- **Sleep-until-hour:** select 00:00–23:00; time advances to the next occurrence, heals fully, refills stims, saves, and resets bonding availability.
- **Home services:** armory/inventory, crafting table, medical refill, vending, lore note, and crew bonding.
- **Furniture ownership view:** after visiting home, inventory lists the apartment's furniture types and counts.
- **Grab system:** near a movable piece, choose one of four side handles; the player walks to that side and takes hold.
- **Push/pull/slide:** move the player and object together at 40% movement speed; block both when the new placement would collide.
- **Rotation:** turn held furniture by 15° steps, clockwise/counterclockwise.
- **Release:** action, Esc, or leaving the map releases the furniture; handling blocks shooting and ends sneaking.
- **Persistent layout:** stored furniture transforms return on visits and loads.
- **Reset layout:** long-press the hand control to restore original placement.
- **Movable types:** sofa, coffee table, armchair, console, plant, planter, stool, bed, side table, lounger, bistro set, telescope.
- **Interior ambience:** fireplace, turntable/stereo presentation, kitchen/bathroom fixtures, lamps, and veranda city outlook. Listed fixtures are not all functional cooking, bathing, or shopping mechanics.

## 15. Appearance and customization

**Type: Cosmetics / character presentation**

- **Neural Systems shopping:** browse categories, preview looks, buy with PP, and track ownership.
- **Neu.Me equipment:** independently manage outfit, wig, skin, voice profile, hat, jewelry, legwear, and accessory.
- **Optional slots:** remove accessory/hat/jewelry/legwear; multiple worn components can combine subject to their coverage rules.
- **Field mask:** Auto, On, Off; Auto normally masks Stella away from home, while scene-specific mask rules can override it.
- **Crystal Glass:** select a drink; glass shape, liquid, bubbles, ice, garnish, glow, and slosh depend on the pour. These presentation drinks are separate from gameplay buff purchases.
- **Moonlit Umbrella:** weather-responsive held accessory that opens in rain.
- **Rain clothing response:** a hoodie can raise its hood outdoors in rain when no equipped hat overrides it; a drawn gun takes the hand and hides the held umbrella.
- **Voice profiles:** currently change caption color; they do not establish recorded voice synthesis.
- **Outfit detail:** shirts/crops/coats, skirts/pants/joggers, shoes/boots/heels, sleeves, trains, trim, and glossy/matte finishes.
- **Legwear:** thigh bands and multiple thigh-high styles/material finishes, including newer velvet and patent variants.
- **Character anatomy:** gender/build/height support, procedural body/limb geometry, joined animated limbs, hands/feet, and clothing overlays.
- **Hair/cloth physics:** hair, hems, skirts, trains, curtains, and related cloth respond to movement/wind and settle.
- **Poses:** breathing/weight shifts, crossed arms, leaning, fidgeting, typing, phone use, dancing, seated variations, sneak, and death poses.
- **Portrait expressions:** blinking and dialogue-driven mood expressions; appearances are shared between world bodies and portraits.
- **Special looks:** android finishes/visors/plating, dancer/demon/hunter appearances, boss wings/horns, crew/cast identity, and character-colored accents/blood.
- **Full purchasable/default catalog:** section 20 lists all 69 cosmetics in this snapshot.

## 16. Phone, maps, menus, and HUD

**Type: Interface / navigation / information**

| Phone app | Function |
|---|---|
| Contacts | Met/default contacts, profiles, message threads, unread badges, read state, typing indicators, scripted reply choices |
| UMaps | City map, player/objective locations, pan/zoom/recenter and navigation markers |
| Help.ME | In-game control/navigation/stealth/vehicle tips; some tips lag current behavior |
| Log.ME | Dialogue transcript with speaker/time and clear-log action |
| Sticky.ME | Local stuck rescue: nearest safe nearby point, fallback to spawn; moves/stops the driven car when necessary |
| Car.ME | Garage, active owned car, summon on hub |
| Zib.ME | Nearby taxi request and destination selection |
| Sky.ME | Current weather, forecast, wind information and arrow, time-related weather presentation |
| Neu.Me | Appearance equipment, pour selection, mask preference |

- **Incoming calls:** a call card/ringing state, answer/end actions, and story waits; ringing does not automatically pause the world.
- **Responsive phone:** portrait or wide landscape layout, scaled to available screen size; close pill, X, or backdrop closure.
- **Golden map:** shared path-drawn icons/legend for buildings, transitions, clients, objectives, danger, searches, owned car, van, and destination.
- **Map input:** pan/zoom, double-click or touch long-press to set destination; fixed-screen-size readable icons and collision-managed labels.
- **Freelancer screens:** Inventory, Equipped, Story, Contacts, Team, Character, Augments, Skills, Collection, and map navigation.
- **Inventory categories:** Items, Collectibles, Weapons, Pets, Mounts; filters show ownership and equipped states. Mounts includes owned garage vehicle records; category presence does not imply rideable creatures.
- **Character screen:** identity, derived stats, active buffs/time left, and equipped augments.
- **Unified menus:** switching screens closes incompatible panels; sidebars collapse into handles on smaller screens.
- **HUD:** health, stims, attunement/Resonance, time/location, currency/resource feedback, utility actions, weapon state, visibility, mission objectives, wave progress, ride tag, and compass guidance.
- **Context action dock:** nearby verbs above the touch action cluster, kept clear of the aiming ring.
- **Banners/prompts:** new/completed/failed objectives, loot/shop feedback, boss titles, cinematic markers, and capture offers.
- **Pause quick access:** equip, inventory/drop, objectives, and Cinematic View.
- **Photo mode / Cinematic View:** paused world with continuing rendering, drag pan, pinch/wheel/± zoom, recenter, grade drawer, and As seen / Full colour options.
- **Photo export:** PNG capture with grade/temperature/tint/vignette baked in; mobile share sheet or desktop download.
- **Color grading:** named presets plus seven fine-tuning sliders; custom settings can be restored on load.
- **Music widget:** draggable/stashable player, play/pause, upload a local music file, and seven station-themed identities. The station selector changes presentation rather than supplying seven streaming stations.

## 17. Weather, world simulation, visuals, and sound

**Type: Atmosphere / ambient AI / presentation**

- **Dynamic weather:** Clear, Drizzle, Rain, Storm; climate-weighted scheduling, wet-night bias, eased intensity transitions, and forecast data.
- **Wind:** changing direction/strength drives rain slant, hair/cloth, leaves, clouds, and curtains.
- **Rain:** layered drops, lamp-lit rain, puddles, splash rings/spray, wet reflections, and room-based shelter handling.
- **Storms:** lightning/thunder, flashes, character flinches, and umbrella responses.
- **Day/night cycle:** sky/daylight changes, sun direction, long/short cast shadows, cloud shadows, golden-hour color, and darker night exposure.
- **Street-lamp behavior:** dusk wake-up/dawn shutdown, flicker, fade, colored light pools, and geometry shadows.
- **Lighting:** tinted darkness, interior glow, lamps, daylight through windows, muzzle flashes, vehicle headlights/taillights/underglow, bloom, and optional soft shadows.
- **Reflections:** quality levels for wet ground/puddles, architecture/light, polished indoor floors, fountains/water, mirrored Ethereal surfaces, and eligible moving actors.
- **Building depth:** camera-relative lean, layered facades/roofs/signs, windows/balconies, sky-tinted daytime glass, nighttime lights, pools, domes, fountains, beams, and animated landmark details.
- **Sky layer:** advertising airships and floating shards above the city.
- **Ambient city residents:** wandering pedestrians, clothing/look variation, traffic awareness, danger responses, quips, and making way for player/crew.
- **Double Nights lobby life:** guests queue, lounge, use portals/doors/elevators, and pull luggage; bellhops, concierges, and valet activity.
- **Moon City life:** entrance/bouncer/coat check, beat-synced dancing, bar drinks/stools, booths/high-tops, restroom stalls/urinals/mirrors/sinks, then departure; claimed seats prevent overlap.
- **Cafe life:** customers, seating/drinks, staff routines, queues and exits; authored hearth/kitchen/table presentation.
- **Standing NPC posts:** pushed NPCs return to their assigned positions/facing when free to do so.
- **Crowd interactions:** player/crew nudge crowds aside, with navigation/collision retained.
- **Particles/decals:** blood, sparks, explosions, leaves, motes, ghosts, trails, and other environmental/combat effects.
- **Screen presentation:** optional atmosphere, bokeh, film grain, grade washes, map fades, and cinematic flashback treatment.
- **Procedural sound:** UI/combat/impact sounds, door/glass events, flit/blocked-flit response, and melee sounds.
- **Surface-aware footsteps:** shoes/materials change sound; carpet/grass hush, wood/metal/marble differ, heels click, wet ground/puddles slap/splash. Sound is spatially panned and distance-scaled.
- **Ambience:** city, rain, wind, room tone, fires, dripping, traffic passes/horns, and interior beds.
- **Vehicle audio:** brand-sensitive motor hum and tire squeal connected to driving state.
- **Map soundtracks:** local tracks blend through the music bus; club animation reads the beat.
- **Audio controls:** master enable, ambience/music volume, footsteps toggle, buffering options, idle/suspend/wake handling.

## 18. Saves, settings, performance, and development tools

**Type: Persistence / quality options / engineering**

- **Three manual save slots:** save/load picker with slot summaries, active-slot status, overwrite/delete handling, and legacy migration.
- **Separate autosave:** background/page-hide state saves silently; loading it preserves the selected manual-slot identity.
- **JSON export/import:** export individual slots or save bundles and import compatible save data.
- **Persistent data:** story/quest flags, equipment, cosmetics, augments, Resonance, resources, crew/social state, garage, owned-car position, furniture layout, discovered notes, and relevant counters/settings.
- **Load normalization:** rebuild items from IDs, cancel running scenes, clear map effects, normalize vehicle/passenger state, migrate old progression and removed-map saves.
- **Job limitation:** active mission references are intentionally discarded on load; completed counters/log remain.
- **Pause tokens:** dialogues, shops, menus, sleep, and cinematic view acquire independent pause reasons so closing one does not unpause another.
- **Controls settings:** flit ring, standalone flick, two-finger flit, button visibility, aim-before-fire, sniper release, precise stick.
- **Camera/combat settings:** scope view/slow motion, base zoom 100/90/75/60%, camera-edge lock, finisher Full/Subtle/Off.
- **Visibility settings:** player glow, stealth grey, sound-ring style, enemy sound rings.
- **Graphics settings:** lighting quality, adaptive lighting, soft shadows, bloom, reflection quality, lamp shadows.
- **Mood settings:** grade preset/custom controls, atmosphere, film grain.
- **Density settings:** traffic, pedestrians, foliage, rain, crowd quality; values are device preferences rather than overwritten by game saves.
- **Display/performance settings:** fullscreen when supported, orientation selection, frame limit, and main-menu optional device preset.
- **Automatic device tiers:** optional low/medium presets based on device capabilities; disabling restores the settings it replaced.
- **Developer profiler:** FPS/frame time, sparkline, exclusive stage timings, entity counts, drawn/culled bodies, canvas calls when enabled, cache memory, audio statistics.
- **Debug overlays:** navigation, lighting, traffic, shots, rooms, vision, hearing, colliders, labels, and related world-layout diagnostics.
- **Baseline layers panel:** 29 switchable render layers grouped by world/things/people/effects/light/screen, per-layer call counts, All/Base/None presets.
- **Developer switches:** count canvas calls, prop sprites, pinned weather, weapon-mode override, resolution benchmark with cancellation/results.
- **Simulation/runtime:** fixed-step loop, slow-motion time scaling, pause-safe story timers, single-loop lifecycle, map fade/warmup, cleanup/reset.
- **Physics:** circle/box/rotated-box collision, mass-weighted pushing, friction, angular response, hinged-door interactions, dynamic/static broadphase grids.
- **Navigation:** A* actor paths, obstacle revision tracking, door-aware replanning, walking goals, steering, timeout/failure recovery.
- **Rendering optimizations:** world/entity/building culling, detail levels, baked ground tiles, furniture/plane/weapon/tree/lamp sprites, pooled effects/buffers, cached geometry/portraits, and crowd impostors.
- **Lighting caches:** static lamp polygons, persistent IndexedDB cache, reused scratch layers, resolution scaling/adaptation, downscale-chain bloom/shadows.
- **Crowd quality:** High live rendering; Medium simplified live shade/hair/cloth; Low baked walk/idle sprites for eligible ambient people while key actors remain live.
- **Cross-browser support:** canvas roundRect/Path2D fallbacks, supported fullscreen/orientation handling, scaled high-density maps, responsive resize.
- **Build/assets workflow:** `src/` is assembled into the HTML by `tools/build.mjs`; custom image/audio files are baked into the playable output; repository workflow rebuilds after changes.
- **Regression tooling:** dependency-free mocked-browser runner checks progression/saves, flit landing/control behavior, driving, profiling, rendering limits, and load/update/draw across maps. It does not establish visual quality or real device frame rate.

## 19. Implementation distinctions and future content

**Type: Defined / advertised / placeholder / limited implementation**

| Item | Status in this snapshot |
|---|---|
| Further campaign / Darklands | Darklands briefing and later-story references exist; the implemented story database contains the prologue, Chapter 1, and optional Sanctum sequence, not a completed Darklands campaign |
| Two sealed gauntlet entries | Disabled “Coming soon” menu entries |
| EMPG | Weapon model exists; not an item in the usable player weapon registry |
| Player spell progression | Actor ability registry exists; no player spell-learning system confirmed |
| Bounty capture | Description says “eliminate or capture”; completion checks target death/HP, with no separate capture mechanic confirmed |
| Delivery time limit | A `timeLimit` field is generated; no delivery timeout failure check in MissionSystem |
| Adrenal Surge | Owned/equipped catalog entry; advertised driving bonuses have no matching runtime ID reference found |
| Augment descriptions | Reflex Sync, Nanite Weave, and Salvage Net differ from current firing/regen/pickup code; section 7 records the distinction |
| Body-slot labels | Augments carry named body slots, but equip enforces total capacity rather than exclusivity by body part |
| Kukri unlock | First Demoness defeat grants it, but it is also in the current starting loadout |
| Enni Cole departments | Authored floors, decor, staff/dialogue and transitions; a full distinct store system for each department was not confirmed |
| Cosmetic promises | Flavor text such as Blackout “invisible in the dark” is not evidence of an outfit-specific stealth stat; voice profiles modify caption color |
| Ferris wheel | Animated set piece; a playable wheel ride was not confirmed |
| Inventory Pets/Mounts | Categories exist; avoid inferring a larger pet collection or rideable-creature system from the labels |
| Dark Element | Acquired/tracked shards and lore value; no spending/crafting recipe using them confirmed |
| Mirabel armory favor | A saved favor/unlock flag and dialogue promise exist; no complete FP-X upgrade shop confirmed |
| Radio station identities | Seven visual station themes for the local music widget, not verified broadcast catalogs |
| Pause Now Playing | Markup/system exists but this pause capsule is hidden by CSS |
| Help.ME tips | Some descriptions are stale, including car marker color and Space while driving; actual input/marker code takes precedence |
| Active jobs after load | Completed history persists; active contracts reset |

## 20. Complete named catalogs

The following catalogs list every current registry entry in the reviewed snapshot. Catalog entries establish defined content; their gameplay availability still follows the distinctions above.

### Vehicle catalog

| Brand | Model | Purchase price (PP) |
|---|---|---:|
| LADY | BlackMark V1 | 15,000; default owned copy is provided |
| LADY | BlackMark V3 | 18,000 |
| Zenxera | Stratos | 3,000 |
| Zenxera | Apex | 4,500 |
| Zenxera | Bolt | 6,000 |
| Zenxera | Freighter | 3,500 |
| Gelfash | Commuter | 1,200 |
| Gelfash | Ranger | 1,800 |
| Gelfash | Sprint | 2,500 |
| Gelfash | Workhorse | 1,500 |

### Zib destinations

Silver Queen Apartments; Moon City Nightclub; Double Nights Hotel; Cozy Cafe; Dr. Yin's Clinic; Torque Auto; Neural Systems; Enni Cole; Biggs Amusement Park.

### Bounty target name pool

Shadow Fang; Neon Viper; Ghost Wire; Crimson Edge; Ash Phantom; Null Spike; Dread Loop; Hex Blade.

### Salvage operation name pool

DARK CACHE; BURIED YIELD; SCRAP VEIN; GHOST FREIGHT; DEAD DROP; IRON NEST; COLD SALVAGE; EMBER HAUL.

### Ability registry

| Ability | Base damage | Use distinction |
|---|---:|---|
| Fireball | 50 | Actor-cast palm projectile |
| Shadow Bolt | 20 | Actor-cast dark-energy projectile |
| Ember Burst | 12 | Actor-cast fast-cadence fire projectile |

### Music widget themes

Wave Radio; MUNE; Sweet Fruit; LUXE; LADY; GENT; Love Chem.

### Cosmetics catalog

All 69 registry entries, grouped by the equipment category. Zero-cost default entries begin owned; other entries follow the shop/acquisition rules. Prices are in PP.

#### Wigs (18)

| Name | Price | Description |
|---|---:|---|
| Midnight Afro | 0 (default) | Classic volume. Jet black. |
| Dark Curls | 0 (default) | Tight curls, darkest brown. |
| Violet Cloud | 200 | Statement volume in electric violet. |
| Cotton Candy | 200 | Soft pink afro. Sweet and loud. |
| Crimson Coils | 250 | Deep red curls. Danger on sight. |
| Golden Hour | 300 | Warm gold curls catching light. |
| Silver Stream | 350 | Long silver flow. Angelic. |
| Moonlight | 350 | Luminous white. Ethereal. |
| Deep Current | 300 | Dark teal cascade. Noir meets ocean. |
| Phantom Tendrils | 500 | Wild flowing tendrils. Otherworldly. |
| Neon Wraith | 500 | Violet tendrils trailing light. |
| Cyan Halo | 250 | Teal afro. City neon in hair form. |
| Close Crop | 150 | Clean and tight. No nonsense. |
| Platinum Buzz | 250 | Cropped silver. Futuristic edge. |
| Midnight Braids | 200 | Twin braids, jet black. Classic power. |
| Violet Braids | 300 | Braided violet strands. Nightlife royalty. |
| Golden Braids | 300 | Twin golden ropes. Crown energy. |
| Sorcerer's Tail | 250 | Sabrina's sleek ponytail. Near-black with a violet cast. |

#### Skins (8)

| Name | Price | Description |
|---|---:|---|
| Radiant Caramel | 0 (default) | Warm caramel. 949's natural tone. |
| Deep Mahogany | 0 (default) | Rich deep brown. Regal presence. |
| Warm Sienna | 150 | Earthy warmth with golden undertones. |
| Bronze Glow | 200 | Sun-kissed metallic warmth. |
| Onyx | 250 | Deep black with blue undertones. |
| Porcelain | 200 | Pale luminous complexion. |
| Synth Chrome | 500 | Metallic silver. Synthetic shell. |
| Synth Violet | 500 | Faint violet undertone. Otherworldly. |

#### Voice profiles (6)

| Name | Price | Description |
|---|---:|---|
| Natural | 0 (default) | Stella's unmodified voice signature. |
| Silk | 150 | Smooth and honeyed. Diplomatic. |
| Ghost | 200 | Whispered and cold. Unnerving. |
| Ember | 200 | Warm rasp. Cigarettes and confidence. |
| Chrome | 350 | Synthetic edge. Machine precision. |
| Void | 400 | Deep resonance from somewhere else. |

#### Outfits (17)

| Name | Price | Description |
|---|---:|---|
| Street Casual | 0 (default) | Black sports bra, white slacks, white sneakers. |
| Periwinkle Silk | 0 (default) | Silk periwinkle top and skirt. Gold heels. Pairs with a Crystal Glass. |
| Periwinkle Silk (Long Sleeve) | 150 | Silk periwinkle top with long sleeves, fitted pencil skirt. Gold heels. Pairs with a Crystal Glass. |
| Blackout | 300 | All-black tactical. Invisible in the dark. |
| Crimson Flame | 350 | Deep red dress. Danger on arrival. |
| Gold Standard | 400 | Full gold tracksuit. Unmissable. |
| Midnight Noir | 350 | Dark violet coat over black. Detective energy. |
| Neon Circuit | 300 | Teal and magenta. Walking billboard. |
| Angelic White | 500 | Pure white everything. Heavenly. |
| Amber Warmth | 250 | Warm amber tones. Like a sunset. |
| Art Builds Freedom | 450 | Long black coat over a black hoodie. Cargo pants, white sneakers. |
| Anavia | 400 | Periwinkle crop top and long skirt. Gold heels. Pairs with bangles and a headband. |
| Night Runner | 300 | Violet track jacket, leggings, sneakers. Built for the late shift. |
| Street Sorcerer | 400 | Sabrina's look. Midnight violet top, black skirt, plum heels. |
| Street Sorcerer (Long Sleeve) | 400 | Sabrina's look, sleeved. Midnight violet long-sleeve top, fitted black pencil skirt, plum heels. |
| Moonlit Academy | 350 | A crisp white blouse and a pleated midnight-violet circle skirt with a frilled hem. Black loafers. |
| Moonlit Academy (Black & White) | 350 | The Academy look in monochrome. A crisp white blouse and a pleated circle skirt striped jet-black and white, a white frilled hem. Black loafers. |

#### Hats (7)

| Name | Price | Description |
|---|---:|---|
| Wine Wide Brim | 350 | A wide wine-red brim. Arrives before you do. |
| Painter's Beret | 150 | Soft black beret. Art school energy. |
| Violet Cap | 150 | Low brim, eyes forward. |
| Lavender Beanie | 150 | Ribbed knit for cold rooftops. |
| Hood Up | 200 | Pull the hood up. Long hair still spills out. |
| Periwinkle Headband | 150 | A thin band of periwinkle silk. |
| Silver Queen Tiara | 500 | Gold filigree, one violet stone. Royalty of the 949. |

#### Jewelry (4)

| Name | Price | Description |
|---|---:|---|
| Gold Bangles | 200 | Stacked gold rings on both wrists. |
| Gold Hoops | 200 | Classic gold hoop earrings. |
| Silver Pendant | 250 | A fine silver chain with a diamond drop. |
| Night Shades | 250 | Dark lenses. Wear them after sundown anyway. |

#### Legwear (7)

| Name | Price | Description |
|---|---:|---|
| Thigh Bands | 200 | A pair of black satin bands high on the thighs, a fine gold edge. |
| Thigh High Heels | 400 | Glossy black stiletto boots that climb past the knee. Go with any outfit. |
| Stardust Thigh Highs | 550 | Silver stiletto boots dusted with slowly twinkling crystals. |
| Crimson Velvet Thigh Highs | 500 | Deep red velvet stilettos. Soft nap, rich color, no patent shine. |
| Violet Patent Thigh Highs | 450 | Electric violet stiletto boots with a glossy patent finish. |
| Pearl Patent Thigh Highs | 450 | Ivory pearl stilettos with a polished glossy finish. |
| Emerald Velvet Thigh Highs | 500 | Jewel-green velvet stiletto boots with a soft fabric finish. |

#### Accessories (2)

| Name | Price | Description |
|---|---:|---|
| Moonlit Umbrella | 250 | Lavender canopy, gold tips. Opens itself when it rains. |
| Crystal Glass | 0 (default) | Something to sip on. Choose your pour. |

### Drink presentation catalog

The first nine are Crystal Glass pours; cafe mugs are used by ambient cafe guests. These are visual drink definitions, separate from the three purchasable gameplay buffs.

| Drink | Glass | Presentation |
|---|---|---|
| Champagne | flute | bubbles |
| Rosé | wine | Still liquid |
| Bellafore | wine | Still liquid |
| White Wine | wine | Still liquid |
| Martini | martini | olive garnish |
| Whiskey | tumbler | ice |
| Neon Cocktail | coupe | glow, citrus garnish |
| Ms. Jean Cream Soda | soda | bubbles, foam, straw |
| Stellar Lemonade | tumbler | ice, citrus garnish |
| Honey Latte | mug | art, cafe guest mug |
| Chai | mug | cafe guest mug |
| Cocoa | mug | foam, cafe guest mug |
| Espresso | mug | crema, cafe guest mug |

### Apartment furniture catalog

All 29 ownership-view furniture types. Counts come from the built apartment after it is visited; fixtures are not all movable or interactive.

| Furniture type | Default quantity | Description |
|---|---:|---|
| Sofa | 1 | Wine-red two-seat sofa with cushions and a knit throw. |
| Coffee Table | 1 | Rounded walnut coffee table with books and flowers. |
| Armchair | 2 | Blush upholstered lounge and bedroom armchairs. |
| Side Table | 3 | Walnut side tables with integrated lamps; two indoors and one on the veranda. |
| Bookshelf | 1 | Walnut shelf stocked with books and ornaments. |
| Console | 1 | Walnut media console with a turntable and stereo speakers. |
| Fireplace | 1 | Linear glass fireplace set into a stone surround. |
| Floor Lamp | 3 | Cream floor lamps with brass trim. |
| Plant | 6 | Potted foliage throughout the living room, bedroom and bathroom. |
| Crafting Table | 1 | Walnut and steel workbench with tools, a vise and a schematic tablet. |
| Refrigerator | 1 | Metal-finished refrigerator with brass trim. |
| Kitchen Sink | 1 | Kitchen sink set into cream quartz with a brass tap. |
| Kitchen Counter | 3 | Cream quartz countertop sections with walnut front edges. |
| Gas Range | 1 | Five-burner black steel gas range with brass knobs. |
| Induction Cooktop | 1 | Four-zone black glass induction cooktop. |
| Kitchen Island | 1 | Quartz bar island with waterfall ends and integrated pendant shades. |
| Stool | 4 | Wine-red stools with brass frames along the kitchen island. |
| Bed | 1 | Queen bed with a blush headboard, wine-red duvet and knit throw. |
| Nightstand | 2 | Walnut bedside cabinets with brass pulls and integrated lamps. |
| Wardrobe | 1 | Tall walnut wardrobe with brass handles. |
| Dressing Vanity | 1 | Walnut dressing table with a brass-framed round mirror and a stool. |
| Bathtub | 1 | Freestanding oval bathtub with brass fittings. |
| Bathroom Vanity | 1 | Double marble vanity with brass taps and a mirror. |
| Shower | 1 | Walk-in tiled shower with glass screening and a brass rain head. |
| Towel Rack | 1 | Walnut towel stand with blush and cream towels. |
| Lounger | 2 | Walnut-framed veranda loungers with cream cushions. |
| Bistro Set | 1 | Veranda bistro table and its two chairs, treated as one set. |
| Telescope | 1 | Brass telescope on a tripod overlooking the city. |
| Planter | 3 | Rectangular planted troughs along the veranda railing. |

## 21. Source reference index

Sources are linked to the exact reviewed commit so this inventory remains traceable when `main` changes. The repository's [source map](../src/MAP.md) describes the individual modules and build order.

### Platform and build

- [README.md](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/README.md)
- [tools/build.mjs](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/tools/build.mjs)
- [src/index.html](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/index.html)

### Movement and input

- [src/engine/player-draw-input.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/player-draw-input.js)
- [src/engine/daytime-flit.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/daytime-flit.js)
- [src/engine/events.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/events.js)

### Weapons and damage

- [src/ui/inventory-augments.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/inventory-augments.js)
- [src/entities/actors.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/entities/actors.js)
- [src/engine/combat-effects.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/combat-effects.js)
- [src/engine/status-effects.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/status-effects.js)
- [src/engine/finisher.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/finisher.js)
- [src/engine/scope.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/scope.js)

### Stealth and enemy AI

- [src/engine/sneak.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/sneak.js)
- [src/engine/executions.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/executions.js)
- [src/engine/noise.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/noise.js)
- [src/entities/enemies.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/entities/enemies.js)
- [src/entities/hunters.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/entities/hunters.js)
- [src/engine/world-state.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/world-state.js)

### Health and support

- [src/engine/update.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/update.js)
- [src/entities/npc.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/entities/npc.js)
- [src/engine/map-loading.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/map-loading.js)

### Progression

- [src/core/resonance.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/core/resonance.js)
- [src/engine/tuning-ui.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/tuning-ui.js)

### Story and dialogue

- [src/story/story-db.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/story/story-db.js)
- [src/story/scenes/prologue.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/story/scenes/prologue.js)
- [src/story/scenes/van.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/story/scenes/van.js)
- [src/story/npc-dialogue.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/story/npc-dialogue.js)
- [src/story/scene-runner.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/story/scene-runner.js)
- [src/story/narrative-cutscenes.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/story/narrative-cutscenes.js)
- [src/ui/coach.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/coach.js)
- [src/ui/hud-reveal.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/hud-reveal.js)

### Jobs and crafting

- [src/story/missions.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/story/missions.js)
- [src/engine/markers.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/markers.js)
- [src/engine/screens-ui.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/screens-ui.js)

### Relationships

- [src/story/dialogue-bonding.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/story/dialogue-bonding.js)
- [src/entities/npc.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/entities/npc.js)

### Cars and taxi

- [src/traffic/garage-zib.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/traffic/garage-zib.js)
- [src/engine/cars.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/cars.js)
- [src/traffic/traffic-vehicle.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/traffic/traffic-vehicle.js)
- [src/traffic/traffic-manager.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/traffic/traffic-manager.js)
- [src/traffic/traffic-signals.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/traffic/traffic-signals.js)
- [src/traffic/traffic-people.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/traffic/traffic-people.js)
- [src/traffic/roads.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/traffic/roads.js)

### Activities

- [src/entities/enemies.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/entities/enemies.js)
- [src/entities/vehicles-minigames.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/entities/vehicles-minigames.js)
- [src/engine/boss-intro.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/boss-intro.js)
- [src/engine/shops-menus.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/shops-menus.js)

### World and home

- [src/world/maps.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/maps.js)
- [src/world/map-entities.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/map-entities.js)
- [src/world/rooms.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/rooms.js)
- [src/world/parks.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/parks.js)
- [src/world/city-layout.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/city-layout.js)
- [src/engine/furniture.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/furniture.js)

### Cosmetics and character art

- [src/core/registries.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/core/registries.js)
- [src/core/appearances.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/core/appearances.js)
- [src/ui/wardrobe.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/wardrobe.js)
- [src/ui/humanoid-render.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/humanoid-render.js)
- [src/ui/bodies.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/bodies.js)
- [src/ui/cloth.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/cloth.js)
- [src/ui/expressions.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/expressions.js)
- [src/ui/poses.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/poses.js)
- [src/ui/weapon-models.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/weapon-models.js)

### Phone, maps and menus

- [src/ui/phone.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/phone.js)
- [src/ui/ui-system.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/ui-system.js)
- [src/ui/map-icons.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/map-icons.js)
- [src/ui/screens.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/screens.js)
- [src/ui/sidebars.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/sidebars.js)
- [src/ui/action-dock.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/action-dock.js)
- [src/ui/save-slots-pause-menu.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/save-slots-pause-menu.js)
- [src/ui/music-widget.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/music-widget.js)

### Weather and ambience

- [src/world/weather.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/weather.js)
- [src/world/weather-response.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/weather-response.js)
- [src/world/lobby-life.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/lobby-life.js)
- [src/world/club-life.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/club-life.js)
- [src/world/cafe-life.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/cafe-life.js)
- [src/entities/pedestrians.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/entities/pedestrians.js)
- [src/engine/daylight.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/daylight.js)
- [src/engine/footsteps.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/footsteps.js)
- [src/audio/audio.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/audio/audio.js)

### Visual world systems

- [src/engine/lighting.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/lighting.js)
- [src/engine/reflections.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/reflections.js)
- [src/engine/interiors.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/interiors.js)
- [src/world/map-edge.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/map-edge.js)
- [src/world/particles-decals.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/particles-decals.js)
- [src/world/bokeh.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/bokeh.js)
- [src/buildings/sky-layer.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/buildings/sky-layer.js)
- [src/buildings/building-v2.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/buildings/building-v2.js)
- [src/buildings/city-view.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/buildings/city-view.js)

### Settings, save and runtime

- [src/core/settings.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/core/settings.js)
- [src/engine/save-load.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/save-load.js)
- [src/engine/pause-system.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/pause-system.js)
- [src/engine/loop.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/loop.js)
- [src/app/boot.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/app/boot.js)

### Physics and navigation

- [src/physics/collision.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/physics/collision.js)
- [src/physics/spatial.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/physics/spatial.js)
- [src/physics/game-entity.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/physics/game-entity.js)
- [src/world/navigation.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/navigation.js)
- [src/world/walker.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/walker.js)

### Performance and verification

- [src/engine/draw.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/engine/draw.js)
- [src/entities/prop-sprites.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/entities/prop-sprites.js)
- [src/ui/crowd-impostors.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/crowd-impostors.js)
- [src/ui/render-layers.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/render-layers.js)
- [src/ui/dev-overlay.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/ui/dev-overlay.js)
- [src/entities/static-builders-profiler.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/entities/static-builders-profiler.js)
- [src/world/ground-baker.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/world/ground-baker.js)
- [src/core/cache-db.js](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/src/core/cache-db.js)
- [tools/test-game-regressions.cjs](https://github.com/eternaldark949/DF_TOPDOWNEDITION/blob/a376397a995e4513571aed3ba10068b76b4cd077/tools/test-game-regressions.cjs)

