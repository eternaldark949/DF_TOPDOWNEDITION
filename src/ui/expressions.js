        /* =====================================================================
           EXPRESSIONS — faces for portraits (and a little life in the world)
           ---------------------------------------------------------------------
           An expression is a handful of numbers, all 0 for the neutral face:
             brow:  { lift, tilt, arch, raise }   lift: up/down; tilt: inner ends up (+, worry)
                                                  or down (−, anger); raise: the right brow only
             lids:  { top, bottom }               top 0 open … 1 closed; bottom lifts for smiles
             gaze:  { x, y }                      where the irises look (−1 … 1)
             mouth: { curve, open, width, smirk } curve −1 frown … +1 smile; smirk lifts one corner
             blush                                0 … 1
           Use a name from EXPRESSIONS or your own object in a portrait config:
             drawCharacterPortrait(ctx, w, h, { ...look, expression: 'sultry', blink: 0, talk: 0 })
           A dialogue line can name its mood: { speaker, text, mood: 'smirk' }.
           Without one, inferMood() reads the line and the speaker's temperament.
           ===================================================================== */
        const EXPRESSIONS = {
            neutral:   {},
            smile:     { brow: { lift: 0.15 }, lids: { bottom: 0.25 }, mouth: { curve: 0.8, width: 0.08 }, blush: 0.15 },
            grin:      { brow: { lift: 0.25 }, lids: { bottom: 0.35 }, mouth: { curve: 1, open: 0.35, width: 0.18 }, blush: 0.2 },
            laugh:     { brow: { lift: 0.35, tilt: 0.3 }, lids: { top: 0.55, bottom: 0.45 }, mouth: { curve: 1, open: 0.8, width: 0.2 }, blush: 0.3 },
            smirk:     { brow: { lift: -0.1, tilt: -0.2, raise: 0.5 }, lids: { top: 0.2 }, gaze: { x: 0.25 }, mouth: { curve: 0.2, smirk: 0.9 } },
            sultry:    { brow: { lift: -0.15, arch: 0.3 }, lids: { top: 0.42, bottom: 0.1 }, gaze: { x: 0.3 }, mouth: { curve: 0.35, smirk: 0.25, open: 0.08 }, blush: 0.45 },
            surprised: { brow: { lift: 1, arch: 0.5 }, mouth: { open: 0.6, width: -0.3 } },
            curious:   { brow: { lift: 0.1, raise: 0.9 }, gaze: { y: -0.2 }, mouth: { curve: 0.1, smirk: 0.3 } },
            worried:   { brow: { lift: 0.2, tilt: 1 }, lids: { top: 0.1 }, gaze: { y: 0.3 }, mouth: { curve: -0.35, width: -0.1 } },
            sad:       { brow: { lift: -0.1, tilt: 0.8 }, lids: { top: 0.35 }, gaze: { y: 0.6 }, mouth: { curve: -0.7 } },
            angry:     { brow: { lift: -0.35, tilt: -1 }, lids: { top: 0.25, bottom: 0.2 }, mouth: { curve: -0.5, width: -0.1 } },
            annoyed:   { brow: { lift: -0.2, tilt: -0.4 }, lids: { top: 0.4 }, gaze: { x: 0.5 }, mouth: { curve: -0.25, smirk: -0.3 } },
            sleepy:    { brow: { lift: -0.1 }, lids: { top: 0.7 }, mouth: { curve: 0.05, open: 0.1 } },
            crying:    { brow: { lift: 0.1, tilt: 1 }, lids: { top: 0.85, bottom: 0.2 }, mouth: { curve: -0.9, open: 0.25 }, blush: 0.35 },
        };

        /** A full parameter set (every field present) for a name, an object, or nothing. */
        function resolveExpression(e) {
            const src = typeof e === 'string' ? (EXPRESSIONS[e] || EXPRESSIONS.neutral) : (e || EXPRESSIONS.neutral);
            const b = src.brow || {}, l = src.lids || {}, g = src.gaze || {}, m = src.mouth || {};
            return {
                brow:  { lift: b.lift || 0, tilt: b.tilt || 0, arch: b.arch || 0, raise: b.raise || 0 },
                lids:  { top: l.top || 0, bottom: l.bottom || 0 },
                gaze:  { x: g.x || 0, y: g.y || 0 },
                mouth: { curve: m.curve || 0, open: m.open || 0, width: m.width || 0, smirk: m.smirk || 0 },
                blush: src.blush || 0
            };
        }

        /** Mix two expressions (names or objects), t = 0 → a, 1 → b. */
        function blendExpression(a, b, t) {
            const A = resolveExpression(a), B = resolveExpression(b), out = {};
            for (const k of Object.keys(A)) {
                if (typeof A[k] === 'number') { out[k] = A[k] + (B[k] - A[k]) * t; continue; }
                out[k] = {};
                for (const f of Object.keys(A[k])) out[k][f] = A[k][f] + (B[k][f] - A[k][f]) * t;
            }
            return out;
        }

        /** Each speaker's resting face when a line gives no other clue. */
        const CHARACTER_TEMPERAMENT = {
            '949': 'neutral', 'Victoria': 'smirk', 'Sabrina': 'sultry', 'Yenna': 'neutral', 'Max': 'smile',
            'Josh': 'neutral', 'Anavia': 'sultry', 'Mirabel': 'smile', 'Biggs': 'grin', 'Bartender': 'smile',
            'LUVSH4D3': 'sultry', 'Barista Ren': 'smile', 'Ms. Jean': 'smile', 'Contractor': 'annoyed',
        };

        /** Pick a mood for a line of dialogue from its wording, then the speaker's temperament. */
        function inferMood(text, speaker) {
            const t = String(text || '').trim();
            if (/\b(ha(ha)+|heh|hah|lol)\b/i.test(t)) return 'grin';
            const bang = t.endsWith('!'), ask = t.endsWith('?');
            if (bang && t.includes('?')) return 'surprised';
            if (bang) return 'smile';
            if (ask) return 'curious';
            if (t.startsWith('...') || t.endsWith('...') || t.endsWith('…')) return 'worried';
            if (t && t.split(/\s+/).length <= 2 && t.endsWith('.')) return 'smirk';   // "Cute." "Noted."
            return CHARACTER_TEMPERAMENT[speaker] || 'neutral';
        }

        /** 0 → eyes open, 1 → shut: a short blink every few seconds, out of step per `seed`. */
        function blinkAmount(timeSec, seed) {
            const period = 3.4 + (seed % 7) * 0.35;                          // 3.4 … 5.5 s
            const t = (timeSec + seed * 1.37) % period;
            const d = 0.14;                                                   // a blink lasts ~0.14 s
            return t < d ? Math.sin(t / d * Math.PI) : 0;
        }
