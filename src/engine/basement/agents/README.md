# Basement agents: street life

Cars and people on foot are one thing here: an **agent** on one street network (`streetNetwork`, in
[`maps/`](../maps/README.md)), whose lanes say which profiles may use them. Each profile is data; every agent runs the same
loop each step: sense (its lane ahead, the light it meets, the crosswalk), decide (go, wait, start a new trip) and move.

- A **car** hands its trip to the world's traffic controller (`physics.traffic`) as a route along the lanes. The route's
  stops are the lights it meets (only the light for the way it turns) and the crosswalks it crosses. The controller makes it
  follow the car ahead on its own lanes. At a light it reserves its turn through the junction, and it goes in only when the
  road past has room and the crosswalk just past is clear, so nobody blocks the box.
- **Someone on foot** walks the pavements and crossings of a foot route. Each keeps to the right of the way it walks by
  its own amount, so two ways pass and a crowd spreads. At a junction's crosswalk they wait on the kerb for the walk, each
  on a spot of their own set back from the road, then hold the crosswalk while they cross; a car stops before a crosswalk
  that is in use. Every third step (staggered) each looks ahead through the world's grid for people, the player and props
  (lamps, benches, planters; buildings and walls are left to collision), and steers round what is in its path: it keeps
  to one side till past, the side it is already on (the right when square behind), within `room` of the way, and tries
  the other side when that one has no room. Someone ahead going its way is followed rather than overtaken; with no way
  round it waits, and the longer it is held up the further aside it may step.
- **The lights** cycle each junction through its ways in, one at a time (straight on, right and left together, so no two
  green ways cross). An all-red clear comes between them, and once round there is a walk, when every way in is red and
  people cross. Junctions start at their own point in the cycle.
- **Round the focus.** Agents appear out of sight between `near` and `far` from the focus, and go once they are further
  than `gone`. A trip ends somewhere between `trip[0]` and `trip[1]` away and still round the focus, then the next one starts.

It knows nothing of the game: the game makes each agent (`spawn`) and takes it away (`remove`).

## API

```js
import { agentSystem, readAgents, AGENTS, AGENT_PROFILE } from './index.mjs';
const agents = new agentSystem(physics, {
    network: streetNetwork(map),                       // lanes into physics.navigation.roads
    profiles: { cars: { network: 'car', count: 12, speed: 170 }, people: { network: 'foot', count: 24, speed: 60 } },
    spawn: (name, profile, { position, rotation }) => entity,   // or {entity, updateState?, remove?}
    remove: handle => {},                              // optional; else handle.remove() or entity.destroy()
    signals: { green: 5, clear: 1.5, walk: 8 }, near: 750, far: 1500, gone: 1900, seed: 1
});
agents.populate({ focus, view });                      // fill up at once (a level arriving)
agents.updateState(seconds, { focus: [x, y], view: [left, top, right, bottom] });
agents.getSignal('X/0');                               // 'go' | 'stop'
agents.agents;                                         // [{name, entity, state: 'driving' | 'walking' | 'waiting'}]
agents.getStatistics();                                // {made, gone, trips, no_route, ms, agents, by_profile}
agents.dispose();                                      // every agent away, the lanes and lights cleared
readAgents(record);                                    // a map's agents record checked (the Directory does, on load)
```

| Profile field (`AGENT_PROFILE`) | Default | Meaning |
|---|---|---|
| `network` | `'car'` | The lane profile it uses: `car` drives (traffic), anything else walks |
| `count` | 10 | How many round the focus |
| `speed` | 150 | Units a second |
| `gap` | 12 | Kept to whatever is ahead in its lane |
| `spacing` | 90 | No two are made closer than this |
| `spread` | 18 | On foot, how far to the right of the way each keeps (up to) |
| `avoid` | true | On foot, steers round people and props ahead (false: walks straight through, as collision allows) |
| `look_ahead` | 48 | How far ahead it looks, in units |
| `room` | 24 | How far either side of the way it may step to get round (a pavement's half width less a body) |
| `template`, `looks` | null | What the game makes it from, for `spawn` |

| Setting (`AGENTS`) | Default | Meaning |
|---|---|---|
| `near`, `far`, `gone` | 750, 1500, 1900 | Where agents appear round the focus, and where they go |
| `trip` | [700, 2400] | How far a trip is, as the crow flies |
| `per_step` | 2 | At most this many appear each step |
| `signals` | `{green: 7, clear: 2, walk: 8}` | Seconds each way in is green, the all-red between, and the walk once round |
| `seed` | 1 | The random choices (where, which trip) |

The Lobby's `mapLevel` makes one from a map's `agents` record when its `traffic` or `walkers` switch is on (see the
Lobby runtime's README).

## Cost

Measured in the engine preview on the city (Chromium, software canvas, 1280×800), 14 cars and 26 people, the people steering round each other:

| Per 60 Hz step | ms |
|---|---|
| The agents' own loop (sense through the grid, steer, lights, trips) | about 0.3 |
| Physics with them, the people's rigs animated (without them: 0.1) | about 2.8 |
| The light grid after physics at night | about 0.4 |

Drawing them is the renderer's cost, like any other entity. Passing cars' lamps are drawn as live lights and are not
baked into the light grid; a car that stops is baked once.
