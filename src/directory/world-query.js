        // ===== LV2 DIRECTORY =====
        // WORLD QUERY: what's where in this game, as location packets (basement/query-kit.js). Each getter
        // takes the game and an optional filter, and returns packets: { id, kind, name, x, y, map, room, ... }.
        // Entity-backed packets (npc, loot) carry the live `entity`; the rest are plain data.
        //
        //   worldQuery.getRooms(game)                      the map's rooms (any map: getRooms(game, { map: 'apt_949' }))
        //   worldQuery.roomAt(game, x, y)                  the id of the room at (x, y) on this map, or null
        //   worldQuery.getSeats(game, { taken: false })    the venue's seats: pool, a (facing), from (where you step up)
        //   worldQuery.getNPCs(game, { room: 'kitchen' })  the characters on this map
        //   worldQuery.getLoot(game)                       pickups on the ground
        //   worldQuery.getDoors(game)                      this map's exits: target map, label
        //   worldQuery.getLandmarks(game)                  named points: building, drop (the curb a Zib stops at)
        //   worldQuery.getBuildings(game)                  the city's buildings you can go to, from any map
        //   worldQuery.hubBuildings(game)                  every city building (raw), from any map
        //   worldQuery.nearest(list, x, y, filter)         queryKit.nearest, for convenience
        // The filter is queryKit's: { kind, near: [x, y, r], inside: {x, y, w, h}, test: p => …, or any field }.
        const worldQuery = {
            _mapId (game) { return game && game.activeMap ? game.activeMap.id : null; },
            _filter (filter) { if (!filter) return null; const f = { ...filter }; delete f.map; return f; },

            /** The room id at (x, y) on the current map, or null (no rooms here, or between them). */
            roomAt (game, x, y) {
                const rs = game && game.roomSystem;
                const r = rs && rs.active ? rs.getRoomAt(x, y) : null;
                return r ? r.id : null;
            },

            /** Rooms: the current map's (live: lightsOff, vis), or another map's from GAME_DB.places.rooms (filter.map). */
            getRooms (game, filter) {
                const here = worldQuery._mapId(game), map = (filter && filter.map) || here, out = [];
                const rs = game && game.roomSystem;
                if (map === here && rs && rs.active) {
                    for (const r of Object.values(rs.rooms))
                        out.push(queryKit.packet('room', r.id, r.x + r.w / 2, r.y + r.h / 2,
                            { name: r.label, map, room: r.id, type: r.type, bounds: { x: r.x, y: r.y, w: r.w, h: r.h }, rects: r.rects, lightsOff: r.lightsOff }));
                } else {
                    const def = ROOM_DEFS[map];
                    for (const [id, d] of Object.entries((def && def.rooms) || {})) {
                        const rects = d.rects || [{ x: d.x, y: d.y, w: d.w, h: d.h }];
                        const x0 = Math.min(...rects.map(q => q.x)), y0 = Math.min(...rects.map(q => q.y));
                        const x1 = Math.max(...rects.map(q => q.x + q.w)), y1 = Math.max(...rects.map(q => q.y + q.h));
                        out.push(queryKit.packet('room', id, (x0 + x1) / 2, (y0 + y1) / 2,
                            { name: d.label || id, map, room: id, type: d.type || 'indoor', bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, rects }));
                    }
                }
                return queryKit.find(out, worldQuery._filter(filter));
            },

            /** Seats in the current venue (the venue crowds' SEATS: cafe, club): pool, index, a (which way
             *  you face), from (where you step up to it), taken (someone in the crowd has it). */
            getSeats (game, filter) {
                const map = worldQuery._mapId(game), out = [];
                for (const crowd of [game && game.cafeLife, game && game.clubLife, game && game.lobbyLife]) {
                    if (!crowd || crowd.mapId !== map || !crowd.SEATS) continue;
                    for (const [pool, list] of Object.entries(crowd.SEATS)) list.forEach((s, i) => {
                        const set = crowd.taken && crowd.taken.get(pool);
                        out.push(queryKit.packet('seat', pool + '.' + i, s.at[0], s.at[1],
                            { map, room: worldQuery.roomAt(game, s.at[0], s.at[1]), pool, index: i, a: s.face,
                              from: { x: s.from[0], y: s.from[1] }, taken: !!(set && set.has(i)) }));
                    });
                }
                return queryKit.find(out, worldQuery._filter(filter));
            },

            /** The characters on the current map: name, role, a (facing), room, and the live entity. */
            getNPCs (game, filter) {
                const map = worldQuery._mapId(game);
                const out = ((game && game.npcs) || []).filter(n => n && !n.dead && n.active !== false).map(n =>
                    queryKit.packet('npc', n.name || n.role || String(n.id), n.x, n.y,
                        { name: n.name || n.role || 'someone', role: n.role || null, a: n.angle, map, room: worldQuery.roomAt(game, n.x, n.y), entity: n }));
                return queryKit.find(out, worldQuery._filter(filter));
            },

            /** Pickups on the ground: type (pp, scrap, stim, dark_element …), room, and the live entity. */
            getLoot (game, filter) {
                const map = worldQuery._mapId(game);
                const out = ((game && game.loot) || []).map((l, i) =>
                    queryKit.packet('loot', l.type + '.' + i, l.x, l.y, { name: l.type, type: l.type, map, room: worldQuery.roomAt(game, l.x, l.y), entity: l }));
                return queryKit.find(out, worldQuery._filter(filter));
            },

            /** The current map's exits (its transitions): target map, label, bounds. */
            getDoors (game, filter) {
                const map = worldQuery._mapId(game);
                const out = ((game && game.activeMap && game.activeMap.transitions) || []).map(t =>
                    queryKit.packet('door', `${map}_to_${t.target}`, t.x + t.w / 2, t.y + t.h / 2,
                        { name: t.label || t.target, map, target: t.target, room: worldQuery.roomAt(game, t.x + t.w / 2, t.y + t.h / 2), bounds: { x: t.x, y: t.y, w: t.w, h: t.h } }));
                return queryKit.find(out, worldQuery._filter(filter));
            },

            /** The current map's named points (the landmark registry): building (its template id), drop (the curb a Zib stops at). */
            getLandmarks (game, filter) {
                const map = worldQuery._mapId(game), drops = (game && game.dropOffRegistry) || {};
                const out = Object.entries((game && game.landmarkRegistry) || {}).map(([id, l]) =>
                    queryKit.packet('landmark', id, l.x, l.y, { name: l.buildingLabel || id, map, building: l.templateId || null, drop: drops[id] || null }));
                return queryKit.find(out, worldQuery._filter(filter));
            },

            /** Every city building, raw (the hub's, cached once it has loaded), from any map. */
            hubBuildings (game) {
                if (!game) return [];
                if (game._hubBuildingsCache) return game._hubBuildingsCache;
                return (game.activeMap && game.activeMap.id === 'sdc' && game.activeMap.buildings) || [];
            },

            /** The city's buildings you can go to (those with a landmark at their door), from any map:
             *  type, bounds, door (the landmark's point), landmark (its id), drop (the Zib's curb), enter (the map inside, if any). */
            getBuildings (game, filter) {
                // The city's landmarks: live on the hub, else as cached when it was built
                const onHub = worldQuery._mapId(game) === 'sdc', cache = (game && game._hubCache) || {};
                const all = (onHub ? game.landmarkRegistry : cache.landmarks) || {}, drops = (onHub ? game.dropOffRegistry : cache.dropOffs) || {};
                const lms = {};
                for (const [id, l] of Object.entries(all)) if (l.templateId) lms[l.templateId] = { id, ...l };
                const out = [];
                for (const b of worldQuery.hubBuildings(game)) {
                    const lm = lms[b.id];
                    if (!lm && !b.attachedTransition) continue;
                    out.push(queryKit.packet('building', b.id, b.x + b.w / 2, b.y + b.h / 2,
                        { name: b.label || b.id, map: 'sdc', type: b.type || null, bounds: { x: b.x, y: b.y, w: b.w, h: b.h },
                          door: lm ? { x: lm.x, y: lm.y } : null, landmark: lm ? lm.id : null, drop: lm ? drops[lm.id] || null : null,
                          enter: b.attachedTransition ? b.attachedTransition.target || null : null }));
                }
                return queryKit.find(out, worldQuery._filter(filter));
            },

            nearest (list, x, y, filter) { return queryKit.nearest(list, x, y, filter); }
        };
