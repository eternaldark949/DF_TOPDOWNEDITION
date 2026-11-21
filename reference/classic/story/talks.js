        /* =====================================================================
           TALKS — sitting down with someone and actually talking.

           The dialogue box of anyone in TALKS gets a TALK button. It plays the
           `talk` scene where they stand: a hello by how close they are, then the
           things she can bring up (new topics marked ◆ when they matter), a bit
           of small talk, goodbye. Each topic is a short branching exchange; what
           she answers is remembered (T.mem) and later lines read it back.

           Rapport (0–100, the bonding tiers: 25 / 50 / 75) opens deeper topics
           and each person's perk (TALK_PERKS). Two new topics a day each, so the
           story comes out over nights, not in one sitting.

             topic = { id, label, tier, needs(g, T), key, gain, text, beats }
             beat  = ['@' | '949', text | (T, g) => text, mood?]      a line ('@' is whoever she's talking to)
                   | { choose: [...], gain: [..], mem: 'key', vals: [..], then: [beats, beats, …] }
                   | { act(g, T) }                                    something happens (a gift)
                   | (T, g) => beat | beats                           branch on what she said before
           The lines live in directory/game-db/dialogue.json; a function there is { hook: name }, from TALK_HOOKS below.
           Saved in questState.talks[name]: { r, seen, mem, day, today, small, met }.
           ===================================================================== */
        const TALK_IDS = GAME_DB.dialogue.talk_ids;   // directory/game-db/dialogue.json

        /* The talks are data: GAME_DB.dialogue.talks (directory/game-db/dialogue.json). What can't be data (a line
           that depends on what she said before, a topic's needs, a gift) is { hook: '<name>' } there, and the function
           here takes its place when the game loads. */
const TALK_HOOKS = {
            'Anavia.hello': (T, g, t) => !T.met ? [['@', 'Oh? A visit with no job attached. Now I\'m intrigued.', 'sultry']]
             : t >= 3 ? [['@', T.mem.name === 'lena' ? 'Hi, Stella.' : 'My favourite noise.', 'smile']]
             : t === 2 ? [['@', 'I was hoping it would be you.', 'smile']]
             : t === 1 ? [['@', 'There she is.', 'sultry']]
             : [['@', 'Back again. Careful, 949. I\'ll start expecting you.', 'sultry']],
            'Anavia.gun.needs': g => g.inventory && g.items.listItems().some(i => i.id === 'pistol_anavia'),
            'Anavia.scrap.needs': g => g.missions.completedBounties >= 5,
            'Anavia.mother.needs': (g, T) => T.seen.includes('gun'),
            'Anavia.mother.beat1': (T) => ['@', T.mem.gun === 'offered' ? 'You offered me the pistol back, that first time. Nobody has ever done that.' : 'You never asked about my mother. I noticed. It was kind.'],
            'Anavia.caches.needs': (g, T) => T.seen.includes('scrap'),
            'Anavia.caches.text': T => T.mem.caches === 'promised' ? 'I opened the last crate you brought. Her handwriting was on the lid.' : null,
            'Anavia.dance.needs': g => { const h = Math.floor(((g.worldMinutes % 1440) + 1440) % 1440 / 60); return h >= 20 || h < 5; },
            'Anavia.afraid.beat1': (T) => ['@', T.mem.style === 'tease' ? 'You flirted with me the first night. I pretended not to like it.'
                           : T.mem.style === 'quiet' ? 'The first night you said you\'d stop asking. You never did. I\'m glad.'
                           : 'The first night you asked what I wanted from you. I think I know now.', 'smile'],
            'Anavia.last.needs': (g, T) => T.seen.includes('caches') && T.seen.includes('mother'),
            'Anavia.last.act': function (g) {
                  const c = g.cosmetics;
                  if (c && !c.isOwned('outfit_anavia')) { c.owned.push('outfit_anavia'); return 'ANAVIA\'S OUTFIT ADDED TO YOUR WARDROBE'; }
                  g.currency += 400; g.updateUI(); return 'ANAVIA PRESSES 400 PERSONICS INTO YOUR HAND';
              },
            'Anavia.name.needs': (g, T) => T.seen.includes('afraid'),
            'Anavia.name.text': T => T.mem.name === 'lena' ? 'Goodnight, Stella. — L.' : 'Goodnight, 949.',
            'Mirabel.needs': g => !!g.questState.ambushCleared,
            'Mirabel.hello': (T, g, t) => !T.met ? [['@', 'Sit, 949. Not that chair. That one.']]
             : t >= 3 ? [['@', 'Starry heavens. It\'s good to see you.', 'smile']]
             : t === 2 ? [['@', 'Ah. The one person in this city who hasn\'t disappointed me.', 'smile']]
             : t === 1 ? [['@', '949. Pour yourself something.']]
             : [['@', 'You came without being called. How novel.']],
            'Mirabel.anavia.needs': g => !!Talks.state(g, 'Anavia').mem.mirabel,
            'Mirabel.why.act': function (g) { g.currency += 400; g.updateUI(); return 'MIRABEL\'S RETAINER: 400 PERSONICS'; },
            'Barista Ren.hello': (T, g, t) => !T.met ? [['@', 'Oh! You want to just… talk? Hang on, let me wipe this. Okay. Hi.', 'smile']]
             : t >= 3 ? [['@', 'Sit. Coffee\'s on me. Always.', 'smile']]
             : t === 2 ? [['@', 'I saved you the burnt one. Kidding. Mostly.', 'grin']]
             : t === 1 ? [['@', 'There\'s my favourite courier.', 'smile']]
             : [['@', 'Stella! Your table\'s free.']],
            'Bartender.hello': (T, g, t) => !T.met ? [['@', 'You want to talk? Bar\'s slow. Pull up a stool.']]
             : t >= 2 ? [['@', 'Good to see you breathing, Freelancer.', 'smile']]
             : t === 1 ? [['@', 'Your usual\'s already poured.']]
             : [['@', 'Freelancer. What\'ll it be?']],
            'Bartender.beat1': (T) => T.mem.name === 'guess' ? ['949', ['Is it Marcus?', 'Is it Dmitri?', 'Is it Theo?', 'Is it Ola?'][Math.floor(Math.random() * 4)]] : ['949', 'Busy night?'],
            'Bartender.beat2': (T) => T.mem.name === 'guess' ? ['@', 'No.', 'smile'] : ['@', 'Every night is busy if you count the people who don\'t order.'],
            'Bartender.booth.needs': g => typeof CrewNights !== 'undefined' && CrewNights.state().nights > 0,
            'Bartender.upstairs.needs': g => !!g.questState.ambushCleared,
            'Dr. Yin.hello': (T, g, t) => !T.met ? [['@', 'A conversation? Not a wound? Sit down before I change my mind.']]
             : t >= 2 ? [['@', 'My favourite patient. Don\'t tell the others.', 'smile']]
             : t === 1 ? [['@', 'Let me look at you. …Fine. Talk.']]
             : [['@', '949. You\'re not bleeding. Progress.']]
        };

        const TALKS = resolveDataHooks(GAME_DB.dialogue.talks, TALK_HOOKS);   // directory/game-db/dialogue.json

        /** What closeness gets you, crossed in a talk (or anywhere rapport moves) */
        const TALK_PERKS = GAME_DB.progression.talk_perks;   // directory/game-db/progression.json

        const Talks = {
            _run: null,
            state(g, name) {
                const q = g.questState || (g.questState = {}), all = q.talks || (q.talks = {});
                return all[name] || (all[name] = { r: 0, seen: [], mem: {}, day: -1, today: 0, small: -1, met: false });
            },
            tier(g, name) { const r = this.state(g, name).r; return r >= 75 ? 3 : r >= 50 ? 2 : r >= 25 ? 1 : 0; },
            _day(g) { return Math.floor((g.worldMinutes || 0) / 1440); },
            /** Can she talk with them here and now */
            can(g, name) { const P = TALKS[name]; return !!P && (!P.needs || P.needs(g)); },
            /** The topics she can bring up today (tier, needs, not yet talked about) */
            topics(g, name) {
                const P = TALKS[name], T = this.state(g, name), t = this.tier(g, name);
                return P.topics.filter(x => !T.seen.includes(x.id) && x.tier <= t && (!x.needs || x.needs(g, T)));
            },
            fresh(g, name) { const T = this.state(g, name); return this.can(g, name) && (T.day !== this._day(g) || T.today < 2) && this.topics(g, name).length > 0; },
            /** Rapport; a tier crossed is announced with what it brings */
            bond(g, name, n) {
                const T = this.state(g, name), before = this.tier(g, name);
                T.r = Math.max(0, Math.min(100, T.r + n));
                const after = this.tier(g, name);
                if (after > before && BONDING_TIERS[after].message) {
                    const perk = TALK_PERKS[name] && TALK_PERKS[name][after];
                    game_timers.after(2.6, () => showMessage(`${name.toUpperCase()}: ${BONDING_TIERS[after].message}${perk ? ' · ' + perk : ''}`), 'world');
                }
                return n;
            },

            /** The TALK button on the dialogue box */
            button(g, npc) {
                let b = g._talkDialogueBtn;
                if (!this.can(g, npc.name)) { if (b) uiKit.hide(b); return; }
                if (!b) {
                    b = g._talkDialogueBtn = uiKit.make(['button']);
                    b.className = 'dialogue-btn talk-btn';
                    g.btnDecline.parentElement.insertBefore(b, g.btnDecline);
                    b.addEventListener('click', () => { const n = g.activeInteraction; uiKit.hide(b); g.endDialogue(); if (n) this.open(g, n); });
                }
                b.textContent = 'Talk';
                b.classList.toggle('fresh', this.fresh(g, npc.name));                   // something new to talk about
                uiKit.show(b, '');
            },

            open(g, npc) {
                if (!TALKS[npc.name] || (g.scenes && g.scenes.running)) return;
                const T = this.state(g, npc.name), day = this._day(g);
                if (T.day !== day) { T.day = day; T.today = 0; }
                this._run = { name: npc.name, npc, gain: 0, facing: npc.facePlayer, notes: [] };
                npc.facePlayer = true;
                if (typeof captionSystem !== 'undefined' && captionSystem.element) { captionSystem.queue.length = 0; captionSystem.element.classList.remove('show'); }
                g.scenes.play('talk').then(() => this._wrap(g));
            },
            _wrap(g) {
                const R = this._run;
                this._run = null;
                if (!R) return;
                R.npc.facePlayer = R.facing;
                const T = this.state(g, R.name);
                T.met = true;
                const notes = [];
                if (R.gain > 0) notes.push(`♡ ${R.name.toUpperCase()} +${R.gain}`);
                notes.push(...R.notes);
                notes.forEach((n, i) => game_timers.after((500 + i * 2200) / 1000, () => { showMessage(n); audioSys.sfx('ui'); }, 'world'));
                for (const [text, delay] of R.texts || []) game_timers.after(delay / 1000, () => phoneSystem.sendText(R.name, text, true, 1800), 'world');
            },
            _gain(g, n) { const R = this._run; if (!R || !n) return; this.bond(g, R.name, n); R.gain += n; },

            /** Yin's stim: once a day, from Companion on */
            _yinStim(g) {
                const T = this.state(g, 'Dr. Yin'), day = this._day(g);
                if (this.tier(g, 'Dr. Yin') < 1 || T.stimDay === day || !g.getEffectiveMaxBoosters || g.boosterCount >= g.getEffectiveMaxBoosters()) return false;
                T.stimDay = day; g.boosterCount++; g.updateUI();
                return true;
            }
        };

        /** Play a list of beats (lines, choices, branches on memory, gifts) */
        function* talkBeats(s, beats, ctx) {
            for (const b0 of beats) {
                const x = typeof b0 === 'function' ? b0(ctx.T, ctx.g) : b0;
                if (!x) continue;
                if (Array.isArray(x) && Array.isArray(x[0])) { yield* talkBeats(s, x, ctx); continue; }
                if (Array.isArray(x)) {
                    const [who, t, mood] = x, text = typeof t === 'function' ? t(ctx.T, ctx.g) : t;
                    yield s.say(who === '@' ? ctx.id : who, text, mood ? { mood } : {});
                    continue;
                }
                if (x.choose) {
                    s.clearLine();
                    const i = yield s.choose(x.choose);
                    yield s.say('949', x.choose[i]);
                    if (x.gain) Talks._gain(ctx.g, x.gain[i] || 0);
                    if (x.mem) ctx.T.mem[x.mem] = x.vals ? x.vals[i] : i;
                    yield* talkBeats(s, (x.then && x.then[i]) || [], ctx);
                    continue;
                }
                if (x.act) { const note = x.act(ctx.g, ctx.T); if (note) Talks._run.notes.push(note); }
            }
        }

        /* ── The scene: where they stand, the two of them ── */
        defineScene('talk', { hideCrew: true, releaseFrames: 30 }, function* (s) {
            const g = s.game, R = Talks._run;
            if (!R) return;
            const P = TALKS[R.name], T = Talks.state(g, R.name), npc = R.npc, p = g.player;
            const ctx = { g, T, id: TALK_IDS[R.name] || R.name };
            p.angle = Math.atan2(npc.y - p.y, npc.x - p.x);
            const zoom = Math.max(2.2, g.camera.zoom || 1), mid = { x: (p.x + npc.x) / 2 + 150 / zoom, y: (p.y + npc.y) / 2 };   // the two of them left of the choices
            s.cam.cut(mid, zoom * 0.9);
            yield s.fade('in', 24);
            s.cam.to(mid, { zoom, frames: 90, ease: 'smooth' });
            yield* talkBeats(s, P.hello(T, g, Talks.tier(g, R.name)), ctx);
            if (R.name === 'Dr. Yin' && Talks._yinStim(g)) { yield s.say(ctx.id, 'Here. A stim. Don\'t argue, and don\'t tell the others.', { mood: 'smile' }); R.notes.push('+1 STIM'); }
            R.texts = [];
            for (let round = 0; round < 8; round++) {
                const day = Talks._day(g), open = T.today < 2 ? Talks.topics(g, R.name) : [];
                const smallOk = T.small !== day && P.small;
                const opts = open.map(t => t.label);
                if (smallOk) opts.push('Just talk');
                opts.push('Goodbye');
                s.clearLine();
                const i = yield s.choose(opts, { weighty: open.map((t, k) => t.key ? k : -1).filter(k => k >= 0) });
                if (i < open.length) {
                    const t = open[i];
                    s.clearLine();
                    yield* talkBeats(s, t.beats, ctx);
                    T.seen.push(t.id); T.today++;
                    Talks._gain(g, t.gain ?? 4);
                    const tx = typeof t.text === 'function' ? t.text(T, g) : t.text;
                    if (tx) R.texts.push([tx, 9000 + R.texts.length * 6000]);
                    if (T.today >= 2 && Talks.topics(g, R.name).length) yield* talkBeats(s, P.enough, ctx);
                } else if (smallOk && i === open.length) {
                    T.small = day;
                    const band = P.small[Math.min(P.small.length - 1, Talks.tier(g, R.name))];
                    yield* talkBeats(s, band[Math.floor(Math.random() * band.length)], ctx);
                    Talks._gain(g, 1);
                } else break;
            }
            s.clearLine();
            yield s.say(ctx.id, P.bye[Math.min(P.bye.length - 1, Talks.tier(g, R.name))]);
            yield s.fade('out', 24);
        });

        /* ── What closeness pays: the jobs they give her ── */
        (function () {
            const MP = MissionSystem.prototype;
            const bump = (fn, who, k) => function (...a) {
                const m = fn.apply(this, a);
                if (m && typeof m.reward === 'number' && Talks.tier(a[0] || game, who) >= 1) m.reward = Math.round(m.reward * k);
                return m;
            };
            if (MP.generateSalvage) MP.generateSalvage = bump(MP.generateSalvage, 'Anavia', 1.2);
            if (MP.generateBounty) MP.generateBounty = bump(MP.generateBounty, 'Bartender', 1.1);
            if (MP.generateDelivery) MP.generateDelivery = bump(MP.generateDelivery, 'Barista Ren', 1.1);
        })();
