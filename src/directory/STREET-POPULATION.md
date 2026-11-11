# Official traffic and pedestrian engine clients

The ESM implementations are `traffic/traffic-vehicle.mjs`, `traffic/traffic-manager.mjs`, `entities/pedestrians.mjs` and `entities/pedestrian-manager.mjs`. `game-street.mjs` exports them and the `StreetPopulation` session client. They are direct `gameVehicle` / `gameCharacter` subclasses, created through `gameElements`; they do not adopt an old object, keep writable pose mirrors, or create private grids.

**The classic-script game's `.js` versions still run in `DFAB V8.html`.** The new classes run in the ESM street client and its tests. Rewriting the core street clients is implemented; production cutover, existing visual/seat/AI integrations and full behavior parity remain unfinished. Do not instantiate a second world in the classic game to synchronize them with the old objects.

```js
import { physicsSystem } from '../basement/physics/index.mjs';
import { createGameAssetLibrary } from './game-assets.mjs';
import { StreetPopulation } from './game-street.mjs';

const physics = new physicsSystem({ asset_library: createGameAssetLibrary() });
const street = new StreetPopulation(physics);
street.traffic.registerRoute('east', {
    points: [[0, 200], [1000, 200]], speed_limit: 150
});
const car = street.traffic.spawn({ route_id: 'east', brand: 'LADY' });
street.pedestrians.setNetwork({ nodes: [
    { id: 0, position: [0, 100], connections: [1] },
    { id: 1, position: [500, 100], connections: [0] }
] });
const pedestrian = street.pedestrians.spawnAtNode(0);
street.updateState();       // game policy
physics.updateState();      // one owner-controlled simulation step
```

Use the existing session world in the full game. `StreetPopulation.updateState(seconds=physics.config.fixed_step)` runs population decisions only. It never advances the world. Lobby owns the one `physics.updateState` call after game intentions are collected. `clearStreet()` destroys ambient vehicles and pedestrians, preserving owned and mission vehicles. `registerStreetEntityTypes(world)` registers the classes without creating managers or bodies.

## Directory definitions

`game-assets/street-population.json` owns rules and templates `df_street:pedestrian` / `df_street:vehicle`, whose concrete types are `df_pedestrian` / `df_traffic_vehicle`. `createGameAssetLibrary` installs this library alongside `df`; register the street classes before instantiating these templates or loading their saves.

`resolveStreetVehicle(library,{brand?,model?,control_mode='AI',color?})` resolves the existing vehicle catalog. Brand/model defaults select the first catalog entry. Conversion from catalog pixels/tick and ticks to the engine's seconds occurs once per cached model/profile in the Directory. Geometry, mass, appearance metadata and motor tuning are then passed as definitions. This conversion does not claim identical driving feel to the old tyre model.

## Traffic

`TrafficManager(world,{hooks={},despawn_on_completion=true})` exposes:

- `registerRoute(route_id,packet)`, `setSignal(signal_id,state)`: engine route/signal requests.
- `spawn({brand?,model?,color?,control_mode='AI',route_id?,position?,rotation?,data?})`: admit an ambient vehicle through the shared factory; AI requires a route. The engine supplies route-start pose and spawn clearance. Returns null if occupied/at the population cap; invalid catalog/route input throws before leaving a body behind.
- `getVehicles(results=[])`, `getVisibleVehicles(bounds,results=[])`: registry and shared-grid views of every official traffic-vehicle instance; `getAmbientVehicles(results=[])` selects ambient population membership.
- `updateState()`: completed AI vehicles despawn or park if persistent/retained.
- `reconnectGameplay()`, `clearStreet()`, `reset()`.

`TrafficVehicle.followRoute(route_id,options={})` delegates to the engine traffic controller. `setControlMode('AI'|'PLAYER'|'PARKED')` transfers driver policy without replacing its body. `setControls({accelerator=0,brake=0,steering=0,handbrake=0,reverse=false})` issues motor requests and requires PLAYER mode. Other inherited motor requests remain available. `connectGameplay(hooks={})` binds `onContact(vehicle,event)` and `onRouteCompleted(vehicle,event)`; hooks select sound, damage and effects, with no physical correction.

## Pedestrians

`PedestrianManager(world,{random=Math.random,hooks={}})` exposes:

- `setNetwork({nodes})`: immutable topology data; nodes have unique `id`, `position`, `connections`, optional `crosswalk_id` and `signal_id`. Existing `{x,y,isCrosswalk,crosswalkData}` node records can be converted at this data boundary; no legacy entity is adopted. IDs/connections are validated before replacing the graph.
- `setSignal(signal_id,'go'|'stop')`: the same engine signal store used by traffic; no signal mirror. Separate authored car/walk signal IDs support separate phases.
- `spawnAtNode(node_id,packet={})`: official entity creation using Directory shape and engine clearance; returns null when occupied/at cap.
- `getPedestrians(results=[])`, `getVisiblePedestrians(bounds,results=[])`, `updateState(seconds)`, `reconnectGameplay()`, `clearStreet()`, `reset()`.

Waypoint choices are gameplay policy. Authored sidewalk/crosswalk edges use direct motor requests with native personal-space steering; they do not launch repeated A* searches for already-authored road segments. The common collision pipeline still blocks solid geometry. A crosswalk edge joins nodes sharing a non-null `crosswalk_id`. The engine predicts moving-vehicle contacts before admitting the walker; an uninitialized walk signal stops it. Once crossing, walkers finish rather than freezing when the signal changes.

`Pedestrian.updateState(seconds,{target?,crossing=false,signal='go'})` selects walking/waiting/crossing/dodging/sprawled/recovering/fleeing/idle states. Native `predictMovementContacts`, `evadeBody`, character motors and physical events own sensing, dodge directions, clearance, movement and impacts. `takeDamage(amount)` selects health/grace/death policy; it does not calculate knockback. `hearNoise(source)` requests engine fleeing; `say(text,seconds=2)` manages a quip. `connectGameplay({onVehicleHit(pedestrian,vehicle,event)})` reconnects scoped events. Vehicle hit thresholds consume engine `relative_speed`; shared physics has already resolved the impact.

## Saves and rendering

After constructing the destination world with its asset library and registering street types, call `physics.loadPhysicsState(saved)`, reinstall the authored sidewalk network, and call `street.reconnectGameplay()`. The engine restores class identity, body/motor state, route cursors, signal state, suspension timers and declared gameplay `data` without replaying constructors. Managers derive their populations from the registry, so they retain no stale arrays of old instances.

Rendering reads `getRenderState(blend)` and presentation metadata. Culling queries the one engine index. The [browser preview](examples/street-population.html) exercises these exact game classes, signal changes, contacts and reset. It intentionally uses a small diagnostic renderer; the full game's car art, humanoid looks/gait, speech rendering and camera hooks still need integration.

## Remaining production cutover

Replace the classic-script loading path with an ESM bundling boundary, make map/static/player/owned-car factories share the same official world, and switch current street spawn/update/draw/save callers. Port legacy road itineraries, signal demand/phase policy, driver personalities, seat/garage/Zib callers, appearance/animation and ambient quips. Retire the `.js` implementations and all traffic/pedestrian sensing grids after these consumers run through the official entities. Current tests establish the new implementation's behavior; they do not establish full legacy feature parity.

Run `node --test tools/test-street-population.mjs` for the official game-client tests; run the Basement tests plus both Directory suites for the full native contract.

Optional browser verification: `python tools/test-street-browser.py` with Python Playwright and Chromium installed. It serves the checkout locally, opens the real ESM game clients, changes walk signals, checks single-world membership, resets the scene and rejects JavaScript errors.

## Factory/caller consolidation — 2026-11-09

`createGameVehicle(world,packet,{hooks={}})` in `game-vehicle-factory.mjs` is the shared official factory. `purpose` is `ambient`, `owned`, `mission` or `taxi`; this factory imposes no population cap. The ambient manager alone enforces capacity, including reservations for event-created pending entities. Its cleanup preserves other purposes. Owned and taxi defaults reference the existing database chapters. `mission_id:'amber_delivery'` selects the authored delivery preset and optional `anchor` uses Basement `pathGeometry.transformPose` to resolve its local spawn offset. Explicit `glow_color:null` removes the glow. `replaces:oldVehicle` checks placement while excluding only that vehicle, creates a fresh official body/identity and retires the old one after successful construction. Failed requests leave the original intact.

The **live classic client** now routes default owned-car creation, garage replacement, delivery creation, ambient traffic and taxi spawning through `gameVehicles.create` in `game-vehicles.js`. That file contains the single remaining direct `new TrafficVehicle` construction site. It still constructs the old class; it is an explicit retirement boundary, not a completed body-ownership migration or a body-adoption wrapper.

`ZibSystem.spawnOnLane` is the shared live taxi creation path. `summonNearest` asks the same Basement path-geometry implementation for pickup placement; the phone calls this service and contains no lane projection or vehicle registration. Pickup range and end clearance live in `GAME_DB.vehicles.zib`. The build emits the import-free `pathGeometry` module as a classic declaration from its original ESM source; it neither copies the implementation nor loads the independent world simulation.

Completed live changes: the six old direct vehicle construction sites are consolidated; duplicate taxi construction/UI registration is removed; mission appearance/spawn offsets are authored in Directory; owned/mission/ambient initialization uses the shared boundary. Pending: switch that boundary and the old entity classes, population managers, roads, seats, rendering, saves and physical stepping to the official world, then remove the legacy constructor and solvers.

`node tools/test-vehicle-creation.cjs` tests the generated live game, including common construction, taxi ownership, short-path pickup placement and the remaining constructor inventory.

Pedestrian appearance presets now live in `GAME_DB.cast.pedestrian_appearances`. The classic `Pedestrian.APPEARANCES` view and official `df:pedestrian_appearances` resource read that same catalog. The official manager selects a stable `data.appearance_id` when spawning, and saves retain it. The preview reads presentation colors from that resource; body positions still come from the engine.


## Native seats and body ownership

`resolveVehicleSeats(library,{brand,model})` resolves immutable, cached seat layout data from Directory. `GAME_DB.vehicles.seating` supplies normalized cabin rules; a model's explicit `seat_layout` overrides them. Each seat has `seat_index`, `role`, `local_position`, `local_rotation`, `combine_mass`, and parent-local `exit_points`. Mass combination defaults to false; a seat setting overrides the common seating setting.

`TrafficVehicle.getSeatLayout()` reads that configuration. `getSeatWorldPose(seat_index,{blend=1})` asks the engine for its world pose. `assignSeat(entity,seat_index,{combine_mass})`, `assignDriver(entity,options)` and `assignPassenger(entity,options)` create native body attachments; they return the assigned index or -1 for occupied/attached entities. The optional request flag overrides the Directory seat setting. `getPassengers(results=[])` resolves identity IDs through the world registry. `releasePassenger(entity,{inherit_velocity})` requests a checked exit and returns the body request or null. Inheritance defaults to true for combined mass and false for other mounts. Callback-time exit requests can still be blocked at commit. Scoped attachment events clear seat occupancy and invoke `onPassengerEntered` / `onPassengerExited` hooks; no game update copies passenger coordinates.

Mounted pedestrians continue gameplay cooldown/quip timers but suspend waypoint decisions and ground movement. Detachment resumes their normal idle/waypoint policy. Native attachments persist through saves, and reconnecting gameplay hooks restores seat event handling. Parent removal releases riders. Replacing an occupied vehicle is rejected until its mounted bodies are released.

The diagnostic browser client includes a mount/exit button, an optional rider-mass checkbox and aggregate mass/center/inertia readouts. Its browser test checks rider motion, increased/restored mass and unchanged body count/spatial membership. This is an ESM client feature. In the classic game, seat and muzzle transforms now use the shared Basement helper, but its old per-frame passenger position writes remain pending the main ownership cutover. See [live body ownership](LIVE-BODY-OWNERSHIP.md).

## Native seat attacks

Resolved seats now include optional immutable emitter descriptors from `GAME_DB.vehicles.seating.attacks` or full model overrides. Native assignment installs the descriptor on the engine attachment. `TrafficVehicle.setSeatAttackEnabled(index,enabled)` changes only the occupied attachment and invalidates stale requests via its revision. `connectGameplay` migrates occupied pre-emitter snapshots once; explicit disabled emitters are preserved. Native Player and NPC fire through `api.attacks`; no passenger coordinates or attack geometry are calculated in these game classes. See [mounted attack API, saves and remaining city boundaries](../gameplay/attacks/MOUNTED-ATTACKS.md).
