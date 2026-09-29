
        // ╔════════════════════════════════════════════════════════════════════════════╗
        // ║     DIMENSIONS: FREELANCER - PERFORMANCE INFRASTRUCTURE                    ║
        // ║     Version: 4.5.30 - Performance & Architecture Refactor                  ║
        // ╚════════════════════════════════════════════════════════════════════════════╝
        
        // ============================================================================
        // CONFIGURATION SYSTEM - Centralized constants for easy tuning
        // ============================================================================
        // ============================================================================
        // GLOBAL FRAME TIME CACHE — Set once per frame, used everywhere
        // Replaces scattered Date.now() calls to eliminate redundant syscalls + GC
        // ============================================================================
        let _frameTime = performance.now();
        let _frameTimeSec = _frameTime / 1000;
        let _zoomLOD = 0; // 0 = full quality, 1 = reduced, 2 = minimal (updated per frame)
        
        const CONFIG = Object.freeze({
            // --- PERFORMANCE TUNING ---
            SPATIAL_GRID_CELL_SIZE: 200,
            COLLISION_MARGIN: 300,
            MAX_PARTICLES: 500,
            MAX_PROJECTILES: 100,
            MAX_TRAFFIC_VEHICLES: 20,
            MAX_ENEMIES: 15,
            
            // --- PLAYER STATS ---
            PLAYER: {
                MAX_HEALTH: 100,
                REGEN_DELAY_FRAMES: 600,
                REGEN_RATE: 5,
                REGEN_INTERVAL: 60,
                FLIT_DURATION: 15,
                FLIT_MAX_ATTUNEMENT: 120,
                FLIT_DASH_COST: 40,
                FLIT_RECHARGE_RATE: 2,  // per frame, full in 1s
                DEFAULT_SPEED: 3.5,
                SPRINT_MULTIPLIER: 1.5
            },
            
            // --- COMBAT ---
            COMBAT: {
                KNOCKBACK_FRICTION: 0.85,
                INVINCIBILITY_FRAMES: 30,
                PROJECTILE_FRICTION: 0.99,
                MUZZLE_FLASH_DURATION: 3
            },
            
            // --- VEHICLE ---
            VEHICLE: {
                MAX_SPEED: 8,
                ACCELERATION: 0.15,
                BRAKE_FORCE: 0.3,
                FRICTION: 0.98,
                TURN_RATE: 0.04,
                DRIFT_THRESHOLD: 1.0
            },
            
            // --- AI ---
            AI: {
                VISION_RANGE: 400,
                VISION_ANGLE: Math.PI / 3,
                UPDATE_RANGE_FULL: 1000,
                UPDATE_RANGE_SKIP: 1500
            },
            
            // --- WEATHER ---
            WEATHER: {
                RAIN_DROP_RATE: 90,          // Drops spawned per frame (base, at zoom=1)
                RAIN_MAX_DROPS: 1050,        // Max active falling drops (base, at zoom=1)
                RAIN_MAX_SPLASHES: 600,      // Max active splash ripples
                RAIN_FALL_SPEED_MIN: 0.048,  // Height decrease per frame (slowest) — 1.5x
                RAIN_FALL_SPEED_MAX: 0.101,  // Height decrease per frame (fastest) — 1.5x
                RAIN_PARALLAX: 0.15,         // Perspective spread strength (lower = drops travel less from center)
                RAIN_LENGTH_FACTOR: 8,    // Per-height streak length (was 14 — reduced to ~1/3 max length)
                RAIN_WIND_DRIFT: 60,         // Pixels wind shifts drop positions
                RAIN_WIND_DIR_STR: 1.8,      // How much wind bends line angles
                SPLASH_RADIUS_MIN: 0.1,      // Min ripple radius (px at zoom 1)
                SPLASH_RADIUS_MAX: 1.0,      // Max ripple radius (px at zoom 1)
                SPLASH_RINGS_CHANCE: 0.45,   // Chance of double ring (0-1)
                WIND_DEFAULT: 0.2,
                LEAF_POOL_SIZE: 50,

                // --- WEATHER SCHEDULER ---
                // Durations are in WORLD minutes (1 world min = 2 real seconds,
                // see Game.updateTime), so a 45-minute shower runs ~90 real seconds.
                SCHED_ENABLED: true,         // Master switch for automated weather
                SCHED_FADE_RATE: 0.0045,     // Intensity lerp per frame (~3.7s for a full 0→1 swing)
                SCHED_WIND_LERP: 0.012,      // How fast windVec eases toward its target
                SCHED_GUST_PERIOD: 420,      // Frames per gust cycle (~7s at 60fps)
                SCHED_RAIN_THRESHOLD: 0.04,  // Intensity below which isRaining flips false
                SCHED_BUDGET_CAP: 1.25,      // Hard ceiling on the drop-budget multiplier (perf guard)
                SCHED_STARTUP_MINS: 0,       // World-minute delay before the first roll
                // Lookahead depth. Scans deeper than the app displays on purpose:
                // the main city is wet ~97% of the time, so a shallow queue
                // frequently contains no dry spell at all and the app can't
                // answer "when does it stop raining?". 12 spells ≈ 14 in-game
                // hours, which finds one ~64% of the time in the city.
                SCHED_FORECAST_LEN: 12,
                SCHED_FORECAST_SHOW: 5,      // How many of those the app lists

                // --- WIND ---
                // WIND_SCALE converts a condition's abstract `wind` value into a
                // screen-space vector magnitude. 3.0 puts plain rain at 3.45,
                // which matches the 3.54 of v7's hardcoded {-2.5,-2.5} — so the
                // default downpour slants the way it always did.
                WIND_SCALE: 3.0,
                // Divisor normalising that magnitude back into the legacy 0-1
                // `wind` scalar that foliage sway and leaf particles read. Sized
                // just above the storm value so the full range stays usable
                // instead of saturating at 1 for everything above a drizzle.
                WIND_NORM: 2.0,
                // Mean reversion per weather change, 0-1. Higher = snaps back to
                // the regional prevailing wind faster.
                WIND_REVERSION: 0.4
            },
            
            // --- DECALS ---
            DECALS: {
                MAX_DECALS: 500,             // Hard cap on total decals
                FADE_START: 0.7,             // Start fading at this fraction of max age (0-1)
                MAX_AGE_MS: 30000,           // Decals fully fade after 30s
                SKID_RADIUS: 3,              // Base skid mark radius
                DEBRIS_SPREAD: 30,           // Max scatter radius for debris
                BLOOD_SPLATTER_CHANCE: 0.4   // Chance of secondary blood splatter
            },
            
            // --- CAMERA ---
            CAMERA: {
                DEFAULT_ZOOM: 1.0,
                SHAKE_DECAY: 0.9,
                SHAKE_MIN_THRESHOLD: 0.5
            },
            
            // --- CULLING DISTANCES (pixels beyond viewport edge) ---
            // Uses AABB (rectangular) culling for efficiency
            // ZOOM_MIN/MAX clamp the zoom used for viewport culling calculations.
            // Locked to the same value = FIXED cull rect (no dynamic resizing).
            // The cull area is always sized for the max zoom-out, so no pop-in.
            // Tuning: Lower both toward 0.35 for wider cull (safer, more entities drawn).
            //         Raise both toward 1.0 for tighter cull (better perf, risk of edge pop-in at low zoom).
            CULLING: {
                // Zoom clamp for culling viewport (locked = fixed cull rect regardless of camera zoom)
                ZOOM_MIN: 0.35,                 // Locked: matches actual minimum camera zoom (max speed)
                ZOOM_MAX: 0.35,                 // Locked: same value = cull rect never changes size
                
                // Rendering margins (added to cull viewport half-dimensions as pop-in buffer)
                BUILDINGS: 400,                 // Building bodies
                BUILDING_TOPS: 350,             // Building rooftops  
                FOLIAGE: 300,                   // Trees, bushes
                LAMPS: 500,                     // Lamp post geometry
                LAMP_GLOW: 450,                 // Lamp light/color effects
                PROPS: 200,                     // Vending machines, medbays
                NEON_SIGNS: 200,                // Neon sign glow effects
                HEADLIGHTS: 250,                // Vehicle headlight cones
                VEHICLES: 300,                  // Traffic vehicles
                ENTITIES: 200,                  // NPCs, enemies, pedestrians, loot
                WORLD: 200,                     // Pavements, crosswalks, transitions, walls, floor zones
                
                // Entity Spawning (radial - unchanged)
                PEDESTRIAN_SPAWN_MIN: 400,
                PEDESTRIAN_SPAWN_MAX: 900,
                PEDESTRIAN_DESPAWN: 1700,       // Bumped from 1100 — wider crowd radius
                VEHICLE_DESPAWN: 2200           // Hoisted from inline magic number — wider traffic radius
            },
            
            // --- COMPANIONS (Teammates & Hired) ---
            COMPANION: {
                TEAMMATE_SPEED: 3.5,            // Permanent cruise speed (close to slot)
                CONTRACT_SPEED: 4.5,            // Contract cruise speed (close to slot)
                MATCH_SPEED: 5.2,               // Speed when keeping up with player at medium dist
                CATCHUP_SPEED: 7.0,             // Burst speed when falling behind / closing gap
                CATCHUP_DISTANCE: 100,          // Beyond this from slot → use CATCHUP_SPEED
                MATCH_DISTANCE: 30,             // Beyond this from slot → use MATCH_SPEED
                FOLLOW_MIN_DIST: 60,            // Stop following when this close to player (legacy fallback)
                FOLLOW_TELEPORT_DIST: 300,      // Teleport to player if further than this
                MAX_CONTRACTS: 5,               // Max active hired companions
                DEFAULT_HIRE_COST: 400,         // Default PP cost for hiring
                DEFAULT_HIRE_DURATION: 480,     // Default in-game minutes (8 hours)
                // --- Formation (slot-based rest positions around the player) ---
                FORMATION_RADIUS: 65,           // Distance from player to each slot
                FORMATION_ARRIVE_GAIN: 0.18,    // Proportional approach (lower = softer arrival)
                FORMATION_DEADZONE: 1.5,        // Don't move if within this many px of slot (kills micro-jitter)
                FORMATION_FOLLOW_FACING: true,  // Rotate slots so they sit behind player's facing
                // --- Separation (safety net only; formation handles the real spacing) ---
                SEPARATION_RADIUS: 22,          // Push apart when overlapping (≈ 2× actor radius)
                SEPARATION_FORCE: 0.5,          // Gentle bump, not a shove
                PLAYER_SEPARATION_RADIUS: 24,   // Push from player only when truly overlapping
                PLAYER_SEPARATION_FORCE: 1.0    // Light push (rare in normal play)
            },

            /* NAV — walkability grid + pathfinding for companions (see NavGrid), and
               eyeline positioning: teammates whose shots can't go through walls walk
               to a spot with a clear shot instead of firing into cover. */
            NAV: {
                CELL: 20,                   // Grid cell size (px)
                AGENT_RADIUS: 16,           // Obstacles are inflated by this (teammate radius 14 + margin)
                MAX_EXPANSIONS: 6000,       // Search cap per path / flood
                WAYPOINT_REACHED: 10,       // px — advance to the next waypoint inside this
                REPATH_TICKS: 20,           // Re-plan a followed path this often
                // --- Eyeline positioning ---
                EYELINE_ENABLED: true,
                SEARCH_PATH_DIST: 320,      // Farthest a teammate will walk (path distance) to find a shot
                LEASH: 240,                 // Firing spots must be within this of the player...
                LEASH_BREAK: 285,           // ...and are abandoned past this (below the 300px teleport)
                MIN_ENEMY_DIST: 90,         // Don't pick spots closer than this to the target
                SPOT_SPACING: 45,           // Keep teammates' spots apart
                ENGAGE_RANGE_BONUS: 150,    // Maneuver on enemies up to weapon range + this
                REPLAN_TICKS: 15,           // Tactics re-evaluate this often (staggered per teammate)
                GIVE_UP_TICKS: 120,         // Abandon a spot not reached in this long
                MAX_LOS_CHECKS: 90,         // Candidate spots tested for a clear shot per search
                SAMPLE_STRIDE: 2,           // Test every Nth cell (2 → a 40px lattice)
                // --- Gangers ---
                GANGER_NAV: true,           // Path around obstacles when chasing, searching and wandering
                GANGER_FLANK: true,         // While suppressing a last-known position they can't see, move to a spot that can
                GANGER_FLANK_SEARCH: 280,   // Farthest (path distance) a ganger walks to flank
                GANGER_FLANK_RETRY: 20,     // Ticks between flank searches when none was found
                GANGER_FLANK_SPACING: 40    // Keep gangers' flank spots apart
            },
            
            // --- VEHICLE AI ---
            /* =================================================================
               MAIN LOOP — fixed timestep
               -----------------------------------------------------------------
               The simulation advances in discrete STEP_MS chunks so that every
               per-frame constant in the codebase means the same thing on a 60Hz
               laptop and a 240Hz monitor. Rendering still runs as fast as the
               display allows.
               ================================================================= */
            /* =================================================================
               SIMULATION SCHEDULING
               -----------------------------------------------------------------
               Not every subsystem needs to run at the full 60Hz sim rate.
               Physics integration does — it's what keeps motion smooth and
               frame-rate independent. AI *decisions* do not: a driver does not
               re-choose their steering angle 60 times a second.

               So expensive decision logic runs every Nth step while movement
               continues every step. Each agent gets its own phase offset, so the
               cost is spread evenly across steps instead of spiking every Nth
               frame and producing a sawtooth.

               This is deliberately NOT the same as lowering the sim rate. The
               whole codebase is written in per-frame units, so halving STEP_MS
               would halve the speed of the game — reintroducing exactly the
               frame-rate dependence the fixed timestep was added to remove.
               ================================================================= */
            SIM: {
                DECIMATE: true,              // Master switch

                /* Traffic AI thinning is DISTANCE-BASED, not uniform.
                   A first attempt thinned every vehicle equally and it showed up
                   immediately in play: cars rear-ended each other and hits on the
                   player got unreliable. Two reasons, both my error —

                   1. Section 1 of the AI (sensors) is the perception layer for
                      BOTH queuing behind traffic AND swerving around the player
                      on foot. Thinning it delayed braking by up to 33ms / 19px
                      against following distances tuned for a 1-step reaction.
                   2. Collision separation was thinned too (see below).

                   Cars the player can see or touch now always think at full rate.
                   Only the distant fleet is thinned, where nobody can tell. */
                AI_NEAR_RADIUS: 1400,        // Within this of the player: full 60Hz AI
                TRAFFIC_AI_FAR_INTERVAL: 4,  // Beyond it: think every 4th step (15Hz)

                STEALTH_INTERVAL: 4,         // Player visibility solve every 4th step (15Hz)

                /* Collision separation runs EVERY step. It was briefly thinned to
                   every 2nd on the reasoning that "a push-apart resolved one step
                   late is imperceptible". That was wrong twice over:
                     - resolveTrafficCollisions() also contains the player-vs-car
                       test, damage and impact SFX. A car at cruise covers 19px
                       between checks against a 15px contact band, so glancing
                       hits were simply missed.
                     - Overlap accumulates for two steps before any correction, so
                       peak interpenetration was 3x deeper, not 2x.
                   Left as a named constant so the reasoning survives, but 1 is
                   the only correct value for a system that feeds a contact test. */
                TRAFFIC_COLLIDE_INTERVAL: 1
            },

            LOOP: {
                STEP_MS: 1000 / 60,   // One sim tick of GAME time — matches how everything was tuned
                MAX_FRAME_MS: 250,    // Ignore stalls longer than this (alt-tab, GC)
                MAX_STEPS: 5,         // Catch-up cap; beyond this, drop the backlog

                /* GAME_SPEED scales how often ticks happen in REAL time, not what a
                   tick means. 0.5 = 30 ticks/sec, so the whole world (movement, AI,
                   cooldowns, physics, the world clock) runs at half speed with no
                   constants retuned. Rendering still runs at the display/FPS-limit
                   rate; INTERPOLATE blends positions between the last two ticks so
                   motion stays smooth instead of updating only 30 times a second. */
                GAME_SPEED: 0.5,
                INTERPOLATE: true,
                INTERP_SNAP_DIST: 96,          // A per-tick jump bigger than this is a teleport — draw it, don't blend it
                TICKS_PER_WORLD_MINUTE: 120    // World clock: 1 in-game minute per 120 ticks (2 s at normal speed)
            },

            /* GAIT — one walk controller shared by every drawProceduralHumanoid body
               (player, teammates, NPCs, pedestrians, gangers, ghosts).
               Gait advances once per sim tick in syncHumanoidGait(), so render
               rate can't change stride or cadence.

                 Cadence (walk-phase radians per tick):  w(v) = CADENCE * sqrt(v)
                 No-slip stride (foot swing, px):        A(v) = PI * v / (2 * w(v))
                                                              = (PI / (2 * CADENCE)) * sqrt(v)

               Why: a foot sweeps from +A to -A over half a walk cycle (PI radians
               of phase = PI / w ticks). For the planted foot to stay put, that 2A
               sweep must equal the ground the body covers meanwhile (v * PI / w).
               With CADENCE 0.2: A ~ 7.85 * sqrt(v) -> 14.7px @3.5, 17.9px @5.2, 20.8px @7.0. */
            GAIT: {
                CADENCE: 0.2,           // sqrt curve: within ~5% of the old 0.25 + 0.04v at speeds 3.5-7, but slows down at crawl speeds instead of shuffling
                SLIP_FACTOR: 1.0,       // 1 = no slip. <1 = shorter strides (feet glide forward), >1 = longer (feet slip back)
                STRAFE_RATIO: 0.75,     // Sideways stride as a fraction of forward (matches old 1.5 / 2.0). 1.0 is no-slip but the feet cross more
                MAX_STRIDE: 24,         // Hard cap in px; only odd bursts (e.g. smartMove wall-steering) reach it
                SMOOTHING: 0.3,         // Per-tick ease toward target speed, so stride eases in/out instead of snapping
                FULL_SWAY_SPEED: 1.0,   // Hip/torso sway reaches full strength at this speed and fades to 0 when stopped
                ARM_SWING_RATIO: 0.6,   // Unarmed hand swing as a fraction of foot stride (0.6 -> about ±10.7px at walking speed)
                STOP_SPEED: 0.02,       // Below this, gait speed snaps to 0
                SNAP_DIST: 40,          // A per-tick move longer than this is a teleport, not walking
                MAX_CATCHUP_TICKS: 30   // After a longer gap between draws (e.g. off-screen), skip smoothing
            },

            /* BUILDINGS — top-down "lean": roofs are the footprint scaled about the camera by
               an amount set by height (exact perspective from above), and the walls facing
               the camera are drawn between footprint and roof. Lit windows, neon and rooftop
               lights draw in an emissive pass after lighting so they glow at night. */
            BUILDINGS: {
                LEAN: true,
                CAM_HEIGHT: 700,        // virtual camera height (px); lower = stronger lean
                FLOOR_HEIGHT: 9,        // px of height per floor
                MAX_FLOORS: 14          // taller buildings are capped so roofs don't swing too far
            },

            /* PUNCH — unarmed strike, shaped in sim ticks (see humanoidPunchCurve).
               The curve runs 0 -> 1 -> 0 and is applied after pose smoothing, so the
               full strike shows at any frame rate and with any input method.
               Peak values match what the old recoil-driven punch asked for. */
            PUNCH: {
                DURATION_TICKS: 15,     // Punch cooldown; the player stays in the punch stance this long
                EXTEND_TICKS: 3,        // Fist snaps out (ease-out)
                HOLD_TICKS: 2,          // Brief hold at full reach
                RETRACT_TICKS: 8,       // Back to guard (smoothstep); curve is 0 for the remaining ticks
                REACH: 22.5,            // px forward at full extension
                CROSS: 0.2,             // Fist drifts inward by this fraction of reach
                OFFHAND_PULL: 4.5,      // px the other fist pulls back
                TWIST: 0.75,            // Torso twist in radians (~43°)
                BODY_LEAN: 3            // px the body shifts back at full extension
            },

            VEHICLE_AI: {
                TURN_SPEED_SHARP: 0.3,          // maxSpeed multiplier for 90°+ turns
                TURN_SPEED_MEDIUM: 0.5,         // maxSpeed multiplier for 45-90° turns
                TURN_SPEED_GENTLE: 0.7,         // maxSpeed multiplier for 22.5-45° turns
                INTERSECTION_APPROACH_SLOWDOWN: 100, // Start slowing this many px before stop
                WALL_BOUNCE_FACTOR: -0.5,       // Velocity multiplier on wall collision
                SPAWN_CLEAR_MIN: 500,           // Min distance from player to spawn traffic
                SPAWN_CLEAR_MAX: 1200,          // Max distance from player to spawn traffic
                SPAWN_SEPARATION: 150,          // Min distance between spawned vehicles

                /* --- WALL RESPONSE ---
                   Collisions are resolved per-axis. The blocked axis reflects
                   (WALL_BOUNCE_FACTOR); the free axis keeps most of its speed
                   (WALL_SLIDE_FRICTION) so a glancing hit scrapes along a wall
                   instead of stopping the car dead and throwing it backwards. */
                WALL_SLIDE_FRICTION: 0.88,      // Tangential velocity retained when sliding
                WALL_PUSHOUT: 1.5               // Separation nudge, in units of post-hit velocity
            },

            /* =================================================================
               PLAYER DRIVING
               -----------------------------------------------------------------
               Per-vehicle stats (maxSpeed, acceleration, handling) live on the
               vehicle itself and come from VEHICLE_BRANDS. These are the shared
               curve shapes that apply to every car.
               ================================================================= */
            VEHICLE_DRIVE: {
                // Drag is DERIVED from each car's maxSpeed + acceleration rather
                // than hardcoded, so a vehicle actually tops out at its stat
                // value: steady state v = a·d/(1-d)  =>  d = v/(a+v).
                REVERSE_TOP_FRACTION: 0.55,     // Reverse tops out at this × forward maxSpeed

                /* --- STEERING CURVE ---
                   Turn rate used to be constant at any speed, so a nearly
                   stationary car pirouetted at 189°/s with a 22px radius. Now it
                   ramps in from a standstill and eases off at speed. */
                STEER_RAMP_SPEED: 3.0,          // Speed at which full steering authority is reached
                STEER_MIN_SPEED: 0.2,           // Below this the wheel does nothing
                STEER_HIGH_FLOOR: 0.55,         // Steering retained at very high speed
                STEER_FALLOFF: 0.12,            // How quickly authority decays past the ramp speed
                REVERSE_STEER_FACTOR: 0.6,      // Reduced sensitivity in reverse for stability

                // Lateral grip: fraction of sideways velocity kept per step.
                GRIP_BASE: 0.92,
                GRIP_RAIN_PENALTY: 0.06,        // Subtracted at full rain intensity
                GRIP_SLIDE_THRESHOLD: 2.5,      // Lateral speed at which grip starts breaking away
                GRIP_SLIDE_PENALTY: 0.95,       // Grip multiplier once sliding
                HANDLING_RAIN_PENALTY: 0.1      // Steering authority lost at full rain intensity
            }
        });

