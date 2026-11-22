# Read first

Before any planning, coding, moving files or reviewing in this repository, read
[READ-FIRST/ENGINE-ARCHITECTURE.md](READ-FIRST/ENGINE-ARCHITECTURE.md) in full.

It defines the engine levels (LV0 Basement, LV1 Lobby, LV2 Directory, LV3 Penthouse), the game on
top of them, the dependency rule, who updates what, the g7 code style, where a new file goes, and
the known mismatches in the code today. It wins over every other document. Only ETERNAL changes it.

Then read [READ-FIRST/ENGINE-API.md](READ-FIRST/ENGINE-API.md) in full. It is the API every system is built
to: general systems, everything else data and true/false switches. Follow it whatever the classic code in
`reference/classic/` does; that code is read only for how things looked and felt.
