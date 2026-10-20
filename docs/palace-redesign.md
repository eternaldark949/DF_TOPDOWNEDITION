# Demoness Palace

The new art uses crystalline forms and flowing energy channels inspired by the supplied stories. The emblem is an original visual proposal, not an assertion about established lore. The pentagram and skull altar are replaced by a mineral crest and crystalline focus. The throne carries matching obsidian ribs and a ruby crest.

The Blood Garden has six densely planted raised beds with blood roses and luminous blood flowers, curved ivory paths, seating and a pearl-lit fountain. A new open arch links the garden and Crystal Chamber. The bed beside that arch is recessed so its central approach stays traversable. The red carpet is wider, embroidered and edged in pale stone; footsteps and reflection exclusions follow its new bounds.

The palette uses saturated crimson velvet, ruby crystal facets, brighter yellow-gold inlays and stronger red blood-flower emission. Warm architectural fill remains separate from those material and glow colours.

Darkness remains a combat feature. Ambient darkness stays at 0.88; warm fill illuminates the main route locally, while gallery centres remain dark enough for Stella's Hidden state. Wine-black lighting tint keeps the crimson materials from becoming violet. Hunter perception, night vision, spawn points, wave balance and eye emission are unchanged. The existing paired eye glow remains visible over the darkness.

Dense plant detail and floors are retained. Blood-flower glow is baked into one bounded sprite per bed, gently pulsed during drawing. Flowers share bed-level light sources, without individual dynamic lights. Floor canvases are released on departure.

Validation includes all-room navigation, every configured wave spawn and the boss spawn, a clear garden arch, retained flower artwork and no warm glow allocations, light/shadow visibility differences, hunter perception of a hidden player without changing player state, paired eye cues, and floor bake lifecycle (`tools/test-palace-redesign.cjs`). The full regression suite, lighting-cache checks and performance-instrumentation checks also pass. Chromium review uses the supplied save, room visibility allowed to settle at each location, and separate garden, throne, shadow-gallery and live-wave views. No private save is included here.
