# Audio

Drop `.mp3`, `.ogg`, `.wav`, `.m4a`, `.aac` or `.flac` files here (subfolders are fine).
The build bakes them into the game file automatically.

```js
playSound('door_bell');                          // one-shot
playSound('door_bell', { volume: 0.6 });         // quieter
playSound('rain_loop', { loop: true })           // looping; keep the result to stop it later
    .then(src => { /* src.stop() when done */ });
```

Sounds go through the game's master audio, so the Master Audio toggle mutes them.

Tip: short effects are tiny, but long music makes the game file large (the build warns
above 8 MB). Prefer `.mp3`/`.ogg` over `.wav` for anything longer than a few seconds.

To give a map its own soundtrack, add it to `MAP_MUSIC` in `src/audio/audio.js`
(the name is the file name without its extension). Music follows the Music slider.
