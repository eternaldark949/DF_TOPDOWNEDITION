# controlSystem

A standalone Basement input service for keyboard, mouse, standard gamepad and touch buttons/sticks. The game declares bindings and asks for input state. The service does not decide movement speed, physics, weapon behavior, UI permissions or world coordinates.

This is the canonical implementation for both runtimes. The classic `controlsSystem` name references the exact same class; `controls-system.js` contains aliases, not a second backend. The earlier web implementation's useful tap/hold/action-table/recorder behavior is retained and extended. Device adaptation, touch geometry and generic queries now have separate modules. The terms `input_active`, `input_just_activated`, `input_just_released`, `ghost_image`, `getActiveInputs`, tap thresholds and device instances come from the supplied Python scripts.

## Requesting input

The new `gameEngine` constructs one service and exposes it through `engine.api.controls`:

```js
const input = engine.api.controls;
input.active('fire');            // held now, boolean
input.justActivated('interact'); // edge available to every consumer this simulation step
input.justReleased('interact');
input.held('interact');          // elapsed seconds
input.value('fire');             // 0..1, including analog triggers
input.direction('move');         // [x,y], keyboard / gamepad / touch
input.direction('aim');
input.getState('interact');      // detached frozen state packet
input.getActiveInputs();         // raw digital input names, optionally ('keyboard' etc.)
input.getActiveActions();        // active named actions, including direction groups
input.pointer();                // client-CSS-pixel position/delta/wheel snapshot
input.readQueue('interact', TAP);// consume a buffered recognized action
```

A state packet contains `{active,just_activated,just_released,value,held}`. Direction groups additionally include a frozen `direction` array. Repeated state queries do not consume edges. `readQueue` is deliberately consuming and checks expiry when read. Unknown action names read as inactive.

The source is sampled centrally; querying does not poll hardware or create another clock. Held state is available between steps. A press/release entirely between ticks retains both edges for the next step. Action edges represent the combined action: releasing one binding while another remains held does not release the action.

## Directory definitions

Bindings belong to the game's Directory. The new runtime uses `src/directory/game-control-profile.json`; the existing classic action policy remains in `game-controls.js` pending shared class conversions.

```js
const input = new controlSystem({
    keymap: {
        move_left:['a','ArrowLeft'], move_right:['d','ArrowRight'],
        move_up:['w','ArrowUp'], move_down:['s','ArrowDown'],
        fire:['mouseLeft','gamepadRTrigger','touchFire'],
        interact:['e','gamepadA','touchInteract'],
        alternate:[['touchInteract',HELD,0.3]]
    },
    vectors: {
        move:{gamepad:'left',touch:'move',dead_zone:0.15},
        aim:{gamepad:'right',touch:'aim',dead_zone:0.15}
    }
});
```

Keyboard names follow `KeyboardEvent.key`, with letters lowercased and a space named `space`. Mouse buttons are `mouseLeft`, `mouseMiddle`, `mouseRight`. Gamepad names include `gamepadA/B/X/Y`, bumpers, triggers, D-pad and stick buttons. Touch digital names start with `touch`; stick names are independent logical names such as `move` and `aim`.

A binding is an input string (PRESS), or `[input,type,hold_seconds]`. Exported constants are `TAP`, `DOUBLETAP`, `HELD`, `PRESS`, `REPEAT`, `RELEASE`. `REPEAT` reacts to supplied/browser repeat events; continuous movement/fire should query `active`/`value` rather than rely on OS repeat. `setKeymap(packet)` validates before replacing bindings and suppresses previously held gestures. `bind(action,...bindings)` changes one action through that same boundary.

For compatibility, a direction name without a `vectors` definition reads only its four digital suffix actions. A configured direction combines its digital prefix (default: its name), chosen gamepad stick and named touch stick. It applies radial dead zones and preserves analog magnitude. The strongest vector wins; ties choose digital, then touch, then gamepad. Inputs are not added into excess speed. Digital diagonals normalize to unit length. `axis(negative_action,positive_action)` remains the simple digital difference; use `direction(name)` for combined analog directions.

`active(action)` uses the digital button threshold; `value(action)` can report a trigger below that threshold. Raw analog vectors are available through `gamepad.stick('left'|'right',dead_zone)`, `left_stick_value` / `right_stick_value`, and each touch stick's detached query result through the named direction API. Raw device fields support old clients/replay and are not immutable; frontend consumers should prefer the service queries.

## Touch binding

```js
const release = input.touch.button(buttonElementOrId,'touchFire');
input.touch.buttons([['btn-interact','touchInteract']]);
const stick = input.touch.stick('move',{
    zone:zoneElementOrId,
    knob:knobElementOrId, // optional
    anchor:'centre',     // or 'touch': starts where the finger lands
    travel:40,
    mouse:true           // optional desktop drag support for this touch control
});
// A view or system can register these cleanups in its lifecycle context:
context.defer(release);
context.defer(()=>stick.dispose());
```

A stick owns its finger identifier. Two sticks plus a button remain independent. Multiple fingers on one button produce one logical press and keep it down until the final finger releases. Pointer cancellation/lost capture and touch cancellation cancel gestures instead of completing taps or holds. Synthetic compatibility mouse presses from touch are ignored. Bound touch zones suppress browser gestures and restore their prior inline touch-action style on teardown.

Optional stick settings preserve the existing generic frontend hooks: `base`, `base_radius`, `edge`, `scale()`, `ring:[in,out]`, `input` (a ring button), `slots`, `free()`, `onStart`, `onMove`, and `onEnd`. A canceled stick notifies `onEnd` with `{type:"touchcancel",cancelled:true,event}` so frontend state can reset; handlers must not complete gameplay gestures on that notification. Samples include the owned ID, origin, displacement, clamped knob position, distance, angle, ring state and slot. Geometry is calculated in Basement. World-space aiming remains a view/physics API conversion, not an input-device concern.

Touch rebinding retires old listeners. Returned button disposers and stick `dispose()` are idempotent. No HUD IDs or game policy are embedded in Basement.

## Polling and lifecycle

In the new runtime, input is sampled before each simulation tick. Every before/after-physics consumer sees the same edges; the runtime calls `generateGhostImage()` after that tick. Paused/no-level frames still poll gamepads and input timing for menus. Start the runtime without a level to run a menu; physics remains idle. Pause/resume, stop and level commits clear pending gameplay gestures. Inputs held through those boundaries must return to neutral before reactivation.

Standalone/headless usage is explicit:

```js
input.updateState();       // poll the selected pad; recognize timed holds/taps
// every client reads input here
input.generateGhostImage();// consume edges and mouse deltas after all clients read
```

`setMouseTarget(element)` cancels the old mouse state, removes its listeners, clears buffered actions, and binds the new surface. Directory renderer composition uses this after backend replacement.

`clear()` suppresses held inputs until their release/neutral state and clears queues/edges. `cancel()` handles focus loss, visibility changes and loss of contacts without firing release/tap/hold actions. `dispose()` cancels input, removes all owned listeners, disposes touch bindings and cancels any owned polling callback. Cleanup continues after frontend callback failures and reports aggregated errors. The constructor accepts `event_target`, `document`, `mouse_target`, `read_gamepads` and `now` for platform adapters/tests; `now` returns seconds. Set `mouse_target` to the game canvas to keep UI clicks out of gameplay fire bindings; the Directory factory does this for a canvas render target.

By default there is no input-owned animation loop. The old classic client explicitly requests `auto_update:true` while it still owns its separate legacy application flow; the new `gameEngine` disallows that option and drives the same implementation through its Lobby. Do not construct another controlSystem inside a player/system already using the runtime service.

The standard gamepad adapter selects the first connected controller and retains it while connected. It clears input on disconnect/device replacement. This is one-player selection, not simultaneous multiplayer ownership or arbitrary nonstandard controller mapping. Neutral re-arming also applies after disconnects and pauses.

## Optional action tables and replay

The generic callback table is `actions:[[action,when,run],...]` with `context:()=>application`. `when(context,event)` gates callbacks; it is not a hidden permission rule on raw state queries. Events contain device/input/type/time, repeat/typing/modifier metadata, and optional prevent/stop helpers. Delayed tap/hold/release actions must also have been allowed at the press. Input into text fields does not become gameplay movement; explicitly allowed callbacks such as Escape may still run.

Pure query bindings also buffer recognized actions by default. The classic client sets `query_actions:false` to preserve its previous callback/recorder contract. `on_fire`, `before_fire`, `hooks`, `muted`/`unmuted`, per-device `setInputs` and `ghost_image` remain available for recorder integration. `setInput(device,input,pressed)` injects a normal input sample; device `setInputs` changes replay held state without invoking callbacks. Gameplay replay/save conversion remains a separate class conversion.

## Files and verification

- `system.mjs`: bindings, logical state queries, edge/gesture timing and lifetime.
- `devices.mjs`: keyboard, mouse, touch-button and standard-gamepad adapters.
- `touch-stick.mjs`: finger ownership, stick geometry and optional visual hooks.
- `values.mjs`: recognition constants and radial normalization.
- `index.mjs`: standalone public exports, including the same-class `controlsSystem` alias.

Run `node --test src/basement/controls/tests/*.test.mjs` from the game checkout (or `node --test tests/*.test.mjs` after copying this folder). `python tools/test-controls-browser.py` exercises actual keyboard/mouse events and three touch contacts in Chromium, plus supplied standard Gamepad API samples. A physical controller/device matrix remains manual testing. Existing game and quick-draw regressions exercise classic callers of the same implementation.

Verified batch: 17 control-package tests also pass after copying this folder outside the game checkout. The combined engine/controls/Directory/runtime suite passes 217 tests; existing quick-draw, generated-apartment and game regressions remain separate gates.
