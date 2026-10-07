# DF_TOPDOWNEDITION
Repo for the top down edition of my game Dimensions Freelancer

## Play
Download **`DFAB V8.html`** and open it in your browser. That one file is the whole game, and it works offline.

On a phone, the easiest download is the whole repo as a ZIP:
`https://github.com/eternaldark949/DF_TOPDOWNEDITION/archive/refs/heads/main.zip`
Unzip it with your Files app, then open `DFAB V8.html` in Chrome.

## How the project is organised
- `DFAB V8.html` is the **playable game**. It's generated, so don't edit it directly; changes go in `src/`.
- `src/` holds the game's source, split by topic. **[`src/MAP.md`](src/MAP.md)** lists every file and what's in it.
- `assets/images` and `assets/audio` hold **your own images and sounds**. They're baked into the game file automatically (see the README inside each folder).
- `tools/build.mjs` joins `src/` and `assets/` back into `DFAB V8.html`.

## Adding your own images or sounds (works from the phone)
1. On GitHub, open `assets/images` (or `assets/audio`), then choose **Add file → Upload files**.
2. Give the file a simple name, like `portrait_949.png`.
3. Commit. GitHub rebuilds `DFAB V8.html` for you within a minute or two.
4. In code, use it by name: `drawAsset(ctx, 'portrait_949', x, y)` or `playSound('door_bell')`.

## Building by hand (optional, needs Node 18+)
```
node tools/build.mjs          # rebuild DFAB V8.html
node tools/build.mjs --check  # just check that it's up to date
```

After building, run `node tools/test-game-regressions.cjs` to check progression and saves, flit controls and landing, autodrive, profiling, rendering limits, and load/update/draw across all maps. The runner needs no dependencies; it executes the game with mocked browser services, so browser visuals and device frame rate still need playtesting.
