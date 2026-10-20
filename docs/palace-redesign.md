# Demoness Palace

The new art uses crystalline forms and flowing energy channels inspired by the supplied stories. The emblem is an original visual proposal, not an assertion about established lore. The pentagram and skull altar are replaced by a mineral crest and crystalline focus. The throne carries matching obsidian ribs and a ruby crest.

The Blood Garden has six densely planted raised beds with blood roses and luminous blood flowers, curved ivory paths, seating and a pearl-lit fountain. A new open arch links the garden and Crystal Chamber. The bed beside that arch is recessed so its central approach stays traversable. The red carpet is wider, embroidered and edged in pale stone; footsteps and reflection exclusions follow its new bounds.

The palette uses saturated crimson velvet, ruby crystal facets, brighter yellow-gold inlays and stronger red blood-flower emission. Warm architectural fill remains separate from those material and glow colours.

Darkness remains a combat feature. Ambient darkness stays at 0.88; warm fill illuminates the main route locally, while gallery centres remain dark enough for Stella's Hidden state. Wine-black lighting tint keeps the crimson materials from becoming violet. Hunter perception, night vision, spawn points, wave balance and eye emission are unchanged. The existing paired eye glow remains visible over the darkness.

Dense plant detail and floors are retained. Blood-flower glow is baked into one bounded sprite per bed, gently pulsed during drawing. Flowers share bed-level light sources, without individual dynamic lights. Floor canvases are released on departure.

Validation includes all-room navigation, every configured wave spawn and the boss spawn, a clear garden arch, retained flower artwork and no warm glow allocations, light/shadow visibility differences, hunter perception of a hidden player without changing player state, paired eye cues, and floor bake lifecycle (`tools/test-palace-redesign.cjs`). The full regression suite, lighting-cache checks and performance-instrumentation checks also pass. Chromium review uses the supplied save, room visibility allowed to settle at each location, and separate garden, throne, shadow-gallery and live-wave views. No private save is included here.

## Depth and colour pass

The throne hall and entrance now sit on polished oxblood obsidian with crimson and gold veining, a soft sheen on each slab and gold inlay borders. Gold rays fan from the throne across the hall floor, and the throne stands on a stepped crimson dais. Every room's floor falls into shadow along its walls, which gives the rooms depth; the galleries keep a deeper fall-off so they stay dark for stealth.

The red carpet is now velvet shaded dark at its edges and bright down its centre, with gold fringe and ruby lozenges. Ember lamps set flush in the carpet margins, ten gold wall sconces (red, orange and beige light), and a red-moon shaft through the oculus add warm pools along the main route. The reflecting pool is a sunken crimson mirror with a gold rim and drifting petals. Pillars and braziers are shaded as solid forms.

Red and black energy arcs crackle from the throne's arms, in the manner of the Demonesses' energy in the supplied stories, and gold motes drift through the hall and garden. The reflection pass replays the glow at half strength and skips these fine particles.

The Blood Garden adds gold blooms among the red, lusher leaves, rain pools on the paths and loam, a wet sheen down each path and four lanterns round the fountain terrace. Gold blooms share each bed's existing glow canvas, so there are no new allocations.

Ambient darkness, gallery visibility, hunter perception and spawn points are unchanged; `tools/test-palace-redesign.cjs` still passes.

## Character fidelity pass

- Hair: every style gets depth close up (the crown darkens toward its edge), strands that follow the style (swept back, pulled into a tie, out from a braid part, or coils for afros and curls), a soft sheen band, and a sheen down loose strands. Baked once per style and colour (`_hairFinish` in `ui/humanoid-render.js`).
- Rim light: indoors, the nearest room lamp now rims characters at any hour in its own colour (red-orange in the palace, violet under the Neural Systems trees), with a soft wrap, a bright edge round the hair and shoulder, and a tint on the lit side.
- Secondary hair: the texture continues past the crown, with strands through long curtains, ponytails and tendrils, twisted bands on dreadlocks, lit crests on each braid plait, and coils over every afro and curl lobe.
