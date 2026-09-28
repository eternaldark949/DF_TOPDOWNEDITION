        /* =====================================================================
           POSES — what a character does while standing still
           ---------------------------------------------------------------------
           A pose sits on top of the stance (idle / pistol / rifle / punch). It
           fades in once a character has stood still for a moment and out the
           moment they walk, through the same smoothing that blends stances.

           Each pose is (t, o) → targets, where t = seconds in the pose and
           o = { still, seed, gender } (still = seconds standing still). In the
           humanoid's frame (+x is facing, y runs shoulder to shoulder):
             l, r        where the left/right hand goes      [x, y]
             le, re      elbows (default: halfway to the hand)
             lf, rf      feet, as offsets from where they stand
             torso, hip  extra twist (radians)
             bounce      body forward/back (px)
             head        head offset [x, y]; turn = head turn (radians)
             hint        a face that suits the pose (portraits use it as a fallback)
           Weapon stances keep their arms; breathing still applies.
           Pick one with config.pose; 'none' turns the idle life off.
           ===================================================================== */
        const POSES = (() => {
            const TAU = Math.PI * 2;
            const breath = t => Math.sin(t * TAU / 3.6);
            const ramp = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
            // Look one way, hold, look the other: a quick swap every half period
            const glance = (t, period, amount, phase = 0) => {
                const f = Math.sin(t * TAU / period + phase);
                return Math.sign(f) * Math.min(1, Math.abs(f) * 2.5) * amount;
            };
            return {
                // The default idle layer: breathe, then shift weight, then look around
                idle(t, o) {
                    const b = breath(t), shiftW = ramp(o.still, 4, 5.5), lookW = ramp(o.still, 6, 7);
                    const s = Math.sin(t * TAU / 9 + o.seed) * shiftW;
                    return {
                        bounce: b * 0.35, torso: b * 0.01 - s * 0.03, hip: s * 0.06,
                        lf: [Math.max(0, s) * 1.4, -Math.max(0, s) * 0.8], rf: [Math.max(0, -s) * 1.4, Math.max(0, -s) * 0.8],
                        turn: glance(t, 7, 0.45, o.seed * 2) * lookW
                    };
                },
                breathe(t) { const b = breath(t); return { bounce: b * 0.35, torso: b * 0.01 }; },
                arms_crossed(t, o) {
                    const b = breath(t);
                    return { l: [5.5, 3], r: [6.5, -3], le: [1, -11], re: [1.5, 11], bounce: b * 0.3,
                             turn: Math.sin(t * TAU / 10 + o.seed) * 0.25, hint: 'neutral' };
                },
                lean(t, o) {
                    const b = breath(t);
                    return { l: [-6.5, -9.5], r: [-6.5, 9.5], lf: [4, 3.5], rf: [0, 0], bounce: -0.8 + b * 0.3,
                             torso: -0.06, hip: 0.08, head: [-1, 0], turn: 0.2 + Math.sin(t * TAU / 12 + o.seed) * 0.15, hint: 'sultry' };
                },
                lean_rail(t, o) {
                    const b = breath(t), s = Math.sin(t * TAU / 11 + o.seed);
                    return { l: [12, -8], r: [12, 8], le: [4, -12], re: [4, 12], bounce: 1 + b * 0.3, head: [1.5, 0],
                             hip: s * 0.05, lf: [Math.max(0, s), 0], rf: [Math.max(0, -s), 0],
                             turn: Math.sin(t * TAU / 14 + o.seed) * 0.3, hint: 'neutral' };
                },
                fidget(t, o) {
                    return { l: [-2 + Math.sin(t * 17) * 1.2, -13], r: [-2 + Math.cos(t * 15) * 1.2, 13],
                             bounce: Math.abs(Math.sin(t * TAU * 2)) * 0.9, torso: Math.sin(t * 5) * 0.03,
                             lf: [Math.sin(t * 9) * 0.6, 0], rf: [-Math.sin(t * 9) * 0.6, 0],
                             turn: glance(t, 2.6, 0.35, o.seed), hint: 'grin' };
                },
                typing(t) {
                    const b = breath(t);
                    return { l: [13, -4 + Math.sin(t * 23) * 0.4], r: [13, 4 + Math.cos(t * 19) * 0.4], le: [4, -11], re: [4, 11],
                             bounce: 0.8 + b * 0.25, head: [1, 0], turn: Math.sin(t * 0.5) * 0.08, hint: 'neutral' };
                },
                // Front-of-house: hands clasped low in front, a polite slow look around
                concierge(t, o) {
                    const b = breath(t);
                    return { l: [5, -1.5], r: [5.5, 1.5], le: [-1, -10.5], re: [-1, 10.5], bounce: b * 0.3,
                             turn: Math.sin(t * TAU / 9 + o.seed) * 0.3, hint: 'smile' };
                },
                // Behind the bar: one hand holds a glass, the other wipes it in small circles
                polish(t, o) {
                    const b = breath(t), a = t * TAU * 0.9;
                    return { r: [11, 3], re: [3, 11], l: [11 + Math.cos(a) * 1.4, 1 + Math.sin(a) * 1.4], le: [3, -10],
                             bounce: 0.6 + b * 0.25, head: [1, 0], turn: glance(t, 11, 0.3, o.seed) * ramp(t, 3, 4), hint: 'smile' };
                },
                hands_on_hips(t) {
                    const b = breath(t);
                    return { l: [-1, -8.5], r: [-1, 8.5], le: [-5, -15], re: [-5, 15], bounce: b * 0.3 };
                },
                phone(t) {
                    const b = breath(t);
                    return { l: [7, -2], r: [9, 2], le: [1, -10], re: [2, 10], bounce: b * 0.25, head: [1.5, 0],
                             turn: Math.sin(t * 0.7) * 0.06 };
                },
                // Three dances; each dancer's seed picks one and offsets the beat
                dance(t, o) {
                    const beat = t * TAU * 1.0 + o.seed, s = Math.sin(beat), up = Math.abs(Math.sin(beat * 2));
                    const v = Math.floor(o.seed) % 3;
                    const base = { hip: s * 0.25, torso: -s * 0.15, bounce: up * 0.8,
                                   lf: [0, s * 1.2], rf: [0, s * 1.2], turn: Math.sin(beat * 0.5) * 0.3, hint: 'sultry' };
                    if (v === 0) return { ...base, l: [4 + s * 4, -12 - s * 2], r: [4 - s * 4, 12 - s * 2] };
                    if (v === 1) return { ...base, l: [10 + up * 2, -5 + s * 3], r: [10 + up * 2, 5 + s * 3], le: [4, -12], re: [4, 12] };
                    return { ...base, l: [9 + s * 3, -6 - up * 2], r: [-1, 8.5], re: [-5, 15] };
                },
            };
        })();
