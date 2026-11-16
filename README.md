# DF_TOPDOWNEDITION
Repo for the top down edition of my game Dimensions Freelancer

> **Working on the code?** Read [READ-FIRST/ENGINE-ARCHITECTURE.md](READ-FIRST/ENGINE-ARCHITECTURE.md) before anything else. It defines how the engine and the game are structured.

## Play
Download **`DFAB V8.html`** and open it in your browser. That one file is the whole game, and it works offline.

On a phone, the easiest download is the whole repo as a ZIP:
`https://github.com/eternaldark949/DF_TOPDOWNEDITION/archive/refs/heads/main.zip`
Unzip it with your Files app, then open `DFAB V8.html` in Chrome.

## Quick draw
Hold **Holster/Draw** for about half a second with a firearm equipped. Drag the fire stick past its ring and release to draw, fire once, and reholster. Drag back inside the ring to cancel. The button shows recovery time; tap it to return to regular drawn fire. Menus and pause preserve the mode but cancel the armed shot, requiring a fresh aim and release. On desktop, aim with the left mouse button held and release to shoot.

## Controller (gamepad)
Plug in or pair any standard controller (Xbox, PlayStation, most Bluetooth pads), then press a button so the browser notices it.
- **Left stick** move / steer · **Right stick** aim · **RT** fire
- **A** interact · **B** flit · **X** holster/draw · **Y** doors and exits
- **LB** sneak · **RB** booster (hold: on an ally) · **LT** handbrake · **L3** auto-drive
- **Back** map · **D-pad ↑** phone · **D-pad ↓** night vision · **Start** pause
- In menus, dialogue and the title screen: **D-pad / left stick** moves the highlight, **A** selects, **B** goes back, **right stick** scrolls.

## How the project is organised
- `DFAB V8.html` is the **last build of the classic game**, kept as the playable reference. It is frozen: nothing rebuilds it.
- `src/engine/` is **the new engine**, by level: Basement, Lobby, Directory, Penthouse. Start with the [engine user guide](src/engine/API.md) and the [Engine API spec](READ-FIRST/ENGINE-API.md). The game is written again on it, to its rules.
- `reference/classic/` is the classic code and its `GAME_DB`, read-only, kept for how things looked and felt.
- `assets/images` and `assets/audio` hold your own images and sounds.

## Checks (Node 20)
```
node tools/check-layout.mjs                       # folder and level rules
node --test src/engine/tests/*.test.mjs src/engine/*/tests/*.test.mjs src/engine/basement/*/tests/*.test.mjs
node --test tools/test-art-pixels.mjs             # drawing on a real canvas (needs Playwright with Chromium)
node tools/migration-inventory.mjs --check        # every classic script has a row
```

## Moving to the new engine
The [migration inventory](docs/migration/README.md) lists every classic script, where it goes on the engine and what is still missing.
