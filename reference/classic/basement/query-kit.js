        // ===== LV0 BASEMENT =====
        // The query kit: asking a list of LOCATION PACKETS what's where. It knows nothing about any game;
        // the game makes the packets (directory/world-query.js) and the kit filters, sorts and finds in them.
        //
        // LOCATION PACKET: { id, kind, name, x, y, ...extras }
        //   id        unique within its kind ('chair.3', 'Barista Ren', 'cozy_cafe')
        //   kind      what it is: 'room', 'seat', 'npc', 'loot', 'landmark', 'door', 'building' ...
        //   name      what a person would call it (defaults to the id)
        //   x, y      where it is, in world pixels (a room's or building's middle)
        //   extras    whatever the kind adds: map, room, a (a heading, radians), bounds { x, y, w, h }, entity ...
        //
        // FILTER: every key given must match
        //   kind      'seat' or ['npc', 'loot']
        //   any other plain key (map, room, pool, role, type ...): the packet's value equals it (or is in its array)
        //   near      [x, y, r]: within r of (x, y)
        //   inside    { x, y, w, h }: inside that box
        //   test      p => boolean, anything else
        //
        //   queryKit.find(packets, { kind: 'seat', room: 'cafe', taken: false })
        //   queryKit.nearest(packets, x, y, { kind: 'npc' })
        //   queryKit.names(queryKit.find(packets, { kind: 'room' }))   // ['Café', 'Kitchen', ...]
        const queryKit = {
            /** A location packet. extras are copied onto it; name defaults to the id. */
            packet (kind, id, x, y, extras) {
                const p = { id, kind, name: id, x, y };
                if (extras) Object.assign(p, extras);
                if (p.name === undefined || p.name === null) p.name = id;
                return p;
            },

            /** Does packet p pass the filter? (no filter: yes) */
            matches (p, filter) {
                if (!filter) return true;
                for (const k in filter) {
                    const want = filter[k];
                    if (want === undefined) continue;
                    if (k === 'near') { const dx = p.x - want[0], dy = p.y - want[1]; if (dx * dx + dy * dy > want[2] * want[2]) return false; continue; }
                    if (k === 'inside') { if (p.x < want.x || p.x > want.x + want.w || p.y < want.y || p.y > want.y + want.h) return false; continue; }
                    if (k === 'test') { if (!want(p)) return false; continue; }
                    if (Array.isArray(want) ? !want.includes(p[k]) : p[k] !== want) return false;
                }
                return true;
            },

            /** The packets that pass the filter, in their order. */
            find (packets, filter) {
                return filter ? packets.filter(p => queryKit.matches(p, filter)) : packets.slice();
            },

            /** The first packet that passes, or null. */
            first (packets, filter) {
                for (const p of packets) if (queryKit.matches(p, filter)) return p;
                return null;
            },

            /** The nearest packet to (x, y) that passes the filter, or null. */
            nearest (packets, x, y, filter) {
                let best = null, bd = Infinity;
                for (const p of packets) {
                    if (!queryKit.matches(p, filter)) continue;
                    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
                    if (d < bd) { bd = d; best = p; }
                }
                return best;
            },

            /** A copy, nearest to (x, y) first. */
            byDistance (packets, x, y) {
                const d = p => (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
                return packets.slice().sort((a, b) => d(a) - d(b));
            },

            /** Their names, in order. */
            names (packets) { return packets.map(p => p.name); },

            /** Their ids, in order. */
            ids (packets) { return packets.map(p => p.id); }
        };
