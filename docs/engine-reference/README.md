# Engine design references

ETERNAL's g7 engine base scripts for UPBGE 0.3. They are design references for the Basement engine's API and code style, not code the game runs.

| File | Dated | What it shows |
|---|---|---|
| `base-game-script.py` | 3.3.2023 | The fuller g7 engine: elements (camera, pivot, character, vehicle, spawn point), systems (asset, audio with dialogue/music/sfx threads, animation, cinematic, controls, story, mission, parkour, player, settings, time, world), tools (debugger, timers), UI and key maps. |
| `base-game-script-2.0.py` | 3.11.2024 | The 2.0 restructure: `g7Engine` with elements, systems and tools; a states library of named constants; templates; world partitions and streamed versus constant spawn points; audio threads and volume dials; controls instances with just-activated/just-released input; `gRecorder`, `gTimer`, `virtualChild`, `awarenessMatrix`. |

Conventions they establish, which the Basement follows: an engine made of **elements** (things, created through `create…` factories), **systems** (each kept current by `updateState()`) and **tools**; named state constants instead of magic values; data passed as packets; lowercase class names, `snake_case` fields and `camelCase` methods.
