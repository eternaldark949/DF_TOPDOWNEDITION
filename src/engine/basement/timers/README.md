# Timers (LV0 Basement)

The world's clock, `worldClock` in `index.mjs`, after ETERNAL's Python `timeSystem` and sky
(`docs/engine-reference/base-game-script.py`). It does not step itself: the Lobby's game loop calls
`updateState(seconds)` after physics each fixed step, so it pauses and speeds up with the game. The engine
holds one as `engine.time`; see `src/engine/API.md`, *The world's clock*.

## The record (`WORLD_CLOCK`, checked by `readWorldClock`)

| Field | Default | Meaning |
| --- | --- | --- |
| `start` | `{year: 1, month: 1, day: 1, time: '12:00'}` | When the clock starts; `time` is "HH:MM", "HH:MM:SS" or `[h, m, s]` |
| `speed` | 1 | Game seconds for each second of play (the Python's 0.2 multiplier with its 60-second step is 12) |
| `months` | the Gregorian twelve | `[{name, days}]` |
| `leap` | `{month: 2, every: 4, except: 100, unless: 400}` | A day added to `month` in leap years; `null` for none |
| `separator` | `':'` | Between hours, minutes and seconds when written |
| `phases` | none | `[{name, from, dark = 0, colors = {}}]` round the day. Each lasts until the next starts (the last past midnight to the first). `dark` (0 day, 1 the full night) and each named colour (`'#rrggbb'`) blend from the phase's own at its start to the next phase's at its end, as the Python's `progressSky` did between its ranges |

A clock with no phases is always 'day' and never dark. The Directory's `world_clock` resource kind is this record.

## Reading it

`year`, `month`, `month_name`, `day`, `hour`, `minute`, `second`, `time_of_day` (seconds into the day), `text({seconds})`,
`date()`, `phase` (`{name, from, to, progress, dark, colors, next}`), `is(name)`, `darkness`, `color(name)`.

## Changing it

`configure(record)`, `setTime({year, month, day, time})` or `setTime({hour, minute, second})` (carrying past 59 and 23),
`setSpeed(k)`, `restore(state())` for saves. `on('hour' | 'day' | 'phase', fn)` is told of each one passed, in order,
however far a step moves the clock (a step never crosses more than one hour or phase boundary at a time); it returns
the call that stops listening.

Tests: `tests/timers.test.mjs`.
