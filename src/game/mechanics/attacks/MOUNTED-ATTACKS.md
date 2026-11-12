# Mounted attacks

Native passengers and drivers use the same `attackSystem` API as characters on foot. Firearms and projectile abilities launch from an authored attachment emitter. Their source remains the original character/body. No game update copies seat positions, integrates projectile velocity or performs an arc/intersection calculation.

## Ownership

| Concern | Owner |
|---|---|
| Seat/window positions, 85-degree outward arc, enabled seats, velocity-inheritance policy | Directory's vehicle seating data and cached `resolveVehicleSeats` output |
| Attachment identity, pose, emitter/revision and hierarchy | Basement attachment manager |
| Muzzle alignment, carrier transform, clearance, sight/range and inherited velocity | Basement mounted-launch geometry and ordinary projectile pipeline |
| Target/team decisions, attack selection, aim preparation and cooldown policy | Shared game attack/actor systems |
| Gun/grip drawing, lean/fade and vehicle artwork | Separate presentation |

`game-db/vehicles.json`'s `seating.attacks` authors default driver/passenger emitters. Each resolved seat exposes `emitter` with parent-local aperture `local_position`, outward `local_rotation`, `half_angle`, `enabled` and `inherit_velocity`. Explicit model seat layouts may override the full emitter or set it to null. Geometry resolves once per model; the immutable resource is not a live passenger-position ledger.

`TrafficVehicle.assignSeat`, `assignDriver` and `assignPassenger` install this emitter on the real native attachment. Optional `combine_mass` continues to use the same engine hierarchy/mass calculation. `setSeatAttackEnabled(seat_index,enabled)` updates the occupied attachment's emitter and revision; it does not change the immutable seat definition. `releasePassenger` still requests checked native exit placement and optional velocity inheritance.

```js
const car = createGameVehicle(engine.api.physics, {
    purpose:'owned', control_mode:'PLAYER', position:[220,120]
});
car.assignDriver(engine.api.session.player);
car.assignPassenger(companion, {combine_mass:true});

engine.api.attacks.requestAttack(companion, {target:enemy.position});
// The runtime advances preparation and dispatch; no separate timer or collision loop.
car.setSeatAttackEnabled(1, false); // pending old window requests become stale
```

## Preparation and shared attack clock

Directory's `game-attack-rules.json` defines `mounted.aim_seconds` (0.1), `hold_seconds` (0.2) and firearm targeting range (500). Ability ranges remain their authored values. Selection chooses the same owned weapon/learned capability as on foot. NPCs ask `attacks.canTarget(actor,target)` and submit ordinary `requestAttack` intents. Passenger AI does not write its position or rotate the mounted body. Player controls permit aiming/fire on emitter-equipped seats while suppressing ground movement and Flit; native driving policy remains a separate vehicle-control concern.

A character's canonical `data.mounted_attack_state` stores only logical aim, attack ID, attachment ID/revision and `started_at`, `ready_at`, `expires_at`. Those timestamps use the existing attack controller's `weapon_state.elapsed`. No timer advances independently. During preparation, a valid queued request can wait for the aim delay. Cooldown and ownership still use the original attack component. A fire release, control block, selection change, pause or level departure cancels pending input. Pause freezes preparation because the existing clock stops.

Queued bindings include attachment ID/revision and pending/detaching status. Exit/re-entry, an emitter change or a changed local seat pose invalidates older requests. Parent movement does not invalidate the seat; the engine resolves the moving aperture at launch. Defeat, inactivity, interruption and source removal still block execution. Boarding cancels an active blade swing. Mounted melee and quick draw remain unsupported; they do not turn into firearm attacks.

`requestAttack` accepts logical input rather than promising immediate readiness. Arc/configuration failures reject; a valid request may still be stopped by clearance at execution. `canAttack` performs current clearance/readiness checks. The actual native launch always checks clearance again before creating a projectile. Direct `executeAttack` can start preparation and return false until ready; callers wanting deferred dispatch should use `requestAttack`.

## Additional query APIs

| API | Contract |
|---|---|
| `attacks.canTarget(actor,target)` | Current attack's native range, aperture and line-of-sight eligibility. Penetrating weapons retain their game sight policy. Team/engagement decisions remain with actor policy |
| `attacks.getMountedAttackState(actor)` | Detached `{aiming,ready,lean,aim,attack_id?}` from the existing clock/attachment; no physical mutation |
| `attacks.getMountedAttackPose(actor,{blend=1}={})` | Current interpolated native grip/muzzle/heading plus presentation lean, or null |
| `physics.getMountedLaunchState(source,options)` | Generic engine geometry/readiness result; no weapon/catalog knowledge |
| `physics.setAttachmentEmitter(source,emitterOrNull)` | Queued native emitter configuration change |
| `vehicle.setSeatAttackEnabled(index,enabled)` | Game request to enable/disable the current occupied seat's authored emitter |

The engine result includes `allowed`, a failure `reason`, attachment identity/revision, parent ID, muzzle/grip poses, heading, carrier velocity and optional range/sight data. Rendering queries with `check_clearance:false` avoid collision queries; actual launch uses authoritative clearance. Geometry is never stored as another game-owned body pose. Omitted mounted aim uses the current prepared aim while valid, otherwise the aperture's outward heading.

## Physical launch contract

The engine resolves the parent's current or interpolated pose, aligns the weapon's authored local muzzle to the target, checks its outward arc (including spread) and sweeps clearance from the seat to the muzzle. The source and its carrier ancestors are ignored only while crossing the authored aperture. Final muzzle placement still checks the carrier, so an inside-cabin muzzle cannot launch.

Blocked launches return null to execution; weapon/ability services spend no cooldown or emit a firing event for them. Position and linear/angular velocity at the real muzzle are calculated centrally. The projectile receives the parent-point velocity once, retains the passenger's source ID and becomes independent of later carrier motion. Redirection does not add carrier velocity again. No permanent carrier collision exclusion is created; a redirected projectile can strike the vehicle normally.

Physics-callback launches are pending native commands. They revalidate source/emitter/clearance when queued commands commit, cancelling a pending projectile if invalidated. `projectileLaunchBlocked` reports the engine cancellation. Arbitrary game effects already committed by a direct callback are not transactionally rolled back; normal gameplay dispatches through the shared before-physics attack queue.

Normal non-emitter attachments remain unable to attack. Disabled, inactive, reserved or detaching emitters, opposite-window headings, close targets behind the muzzle, blocked apertures and occupied muzzles cannot create a shot. All collision work uses the existing world grid.

## Saves and presentation

Physical snapshots preserve emitter configuration, attachment ID/revision and original body IDs; canonical character data preserves aim timestamps and shared cooldown. Reconnection validates these records without replaying subclass constructors. Old vehicle snapshots without emitter metadata can migrate their occupied seats when `TrafficVehicle.connectGameplay` runs; existing explicit emitter-disable settings are preserved. Registry/capability and street reconnection remain explicit restore boundaries.

`combatPresentation` reads the interpolated grip/heading through `getMountedAttackPose` and uses its lean as presentation opacity. It does not move the character or advance preparation. Full humanoid lean-out animation, clipped cabin/roof art, window visuals and audio remain presentation conversion work. The runtime example's Mounted combat demo uses real player/companion seats and offers a checked Exit seat action.

The generated native apartment composes these same services and can save actual native seated actors. This does not replace production city's legacy vehicle ownership, driving controls, `updateVehicleCombat`, occupant artists or old projectile solver. Those callers must still switch to the native world before their physical code can be deleted. The new implementation adds no mirrored native actor alongside a legacy one.

Verification: Basement `mounted-launch.test.mjs`; `tools/test-mounted-attacks.mjs`; `tools/test-mounted-attack-callers.cjs`; `tools/test-mounted-attacks-browser.py`. Tests cover arcs, muzzle/scene clearance, inherited spin/translation, reflection/carrier collisions, event-time revalidation, shared preparation/cooldown, player input, NPC bursts/abilities, stale mounts, pause/defeat, active-blade boarding, saves, stable rendering and checked exit.
