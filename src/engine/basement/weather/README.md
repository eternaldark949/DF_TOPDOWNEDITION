# Weather (LV0 Basement)

The world's weather, `worldWeather` in `index.mjs`, after ETERNAL's Python 2.0 `worldSystem` and `weatherSystem`
(states CLEAR, RAINING, SNOWING; intensities LIGHT, NORMAL, HEAVY, HELLISH) and the first script's rain pool, which
grew and shrank towards its count. It moves no particles: physics does, and a map level with the `weather` switch sets
its systems' rates from `amount(state)`. It does not step itself: the Lobby's game loop calls `updateState(seconds)`
after physics each fixed step. The engine holds one as `engine.weather`; see `src/engine/API.md`, *The world's weather*.

## The record (`WORLD_WEATHER`, checked by `readWorldWeather`)

| Field | Default | Meaning |
| --- | --- | --- |
| `states` | `{clear: {}}` | `{name: {particles: [{system, area, at, margin}]}}`: the particle systems each state brings, as a map's `particles` (a record or a `particle_system` id; `area: 'view'` falls over the camera's view) |
| `intensities` | `{light: .35, normal: 1, heavy: 1.8, hellish: 3}` | `{name: scale}`: births as a share of the systems' own rates |
| `start` | `{state: 'clear', intensity: 'normal'}` | The weather at the start |
| `fade` | 6 | Seconds of play a change takes (0: at once) |

States and intensities are open: any names, as many as the game wants. The Directory's `world_weather` resource kind is
this record.

## Using it

`state`, `intensity`, `changing`, `set(state, intensity, {fade})`, `amount(state)` (its share of the weather, fading in
or out, times the intensity's scale), `amounts()`, `on('change', fn)`, `save()` / `restore(saved)`, `configure(record)`.

Tests: `tests/weather.test.mjs`.
