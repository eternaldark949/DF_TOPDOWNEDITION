# Read first

Before any planning, coding, moving files or reviewing in this repository, read
[READ-FIRST/ENGINE-ARCHITECTURE.md](READ-FIRST/ENGINE-ARCHITECTURE.md) in full.

It defines the engine levels (LV0 Basement, LV1 Lobby, LV2 Directory, LV3 Penthouse), the game on
top of them, the dependency rule, who updates what, the g7 code style, where a new file goes, and
the known mismatches in the code today. It wins over every other document. Only ETERNAL changes it.

Then read [READ-FIRST/ENGINE-API.md](READ-FIRST/ENGINE-API.md) in full. It is the API every system is built
to: general systems, everything else data and true/false switches. Follow it whatever the classic code in
`reference/classic/` does; that code is read only for how things looked and felt.

# How to work here

- **Say what you decided on your own.** When you report a change, list each choice you made yourself and why,
  most of all anything made up rather than converted from classic code (a number, a rule, a position).
- **Fix classic where it looks wrong.** Keep classic's look and feel, but when it gets something wrong (its
  glow drew over cars standing on it), do it right and say so.
- **Look before you report.** Show pictures of anything that draws, by day and by night where light is
  involved, and measure what a change costs per step. Good looks and good performance are both the goal.
- **Ask the spatial grid.** What is near, ahead, over or inside something is a grid query; never keep a list
  of your own for one feature.
- **Data and docs in the same commit.** A new call updates `src/engine/API.md` and its folder's README; a new
  data field updates `src/game/data/README.md`.
- **Before you push**, merge the branch's latest and run CI's checks (`.github/workflows/build.yml`). If
  `DFAB Preview.html` conflicts, take theirs and rebuild it with `node tools/build-preview.mjs`.
