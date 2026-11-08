        /* =====================================================================
           CREW NIGHTS — time with the crew that isn't a job.

             The invite: a "plan" card in Messages (a place, a window of world
             time, who's coming; I'm in / Can't tonight / Set waypoint). The
             group chat asks her out for drinks at Moon City (after a job, or
             when she asks "Drinks tonight?"); one of the crew asks her out on
             their own, to their place (their old feed pins: 747 for coffee at
             Cozy Cafe, Victoria at Torque, Sabrina at the Moon City bar, Yenna
             at Biggs Park, Josh at Neural Systems, Max at Enni Cole), or when
             she asks "Want to hang out?".

             The night: turning up inside the window (the venue's map, or the
             park on foot) plays the scene `crew_night`: whoever came is there,
             seated. A group night: the host's hello, a toast she picks (each of
             them likes one), talk about the last job, then who she sits with,
             and a moment with them. A night with one of them: their hello, a
             thing to do together with a choice they care about, the moment, a
             goodbye. The moments are written per person and per how close they
             are (CREW_MOMENTS: acquaintance, trusted, inner circle), each with
             a reply that lands better than the other.

             What it's worth: relationship (BondingSystem's tiers) — the one she
             sat with most, everyone who came a little. Standing her friends up
             costs the host a point. Closer, they look out for her: a Companion
             texts what a bounty's mark is carrying; a Trusted friend leaves her
             a stim after a rough job.

           State: phoneSystem.feed.crew (saved and reset with the feed).
           ===================================================================== */
        const CREW_IDS = GAME_DB.story.crew.ids;   // directory/game-db/story.json, with the venues

        /** Where a night can be: the map it plays on, where everyone is, and who asks her there on their own */
        const CREW_VENUES = GAME_DB.story.crew.venues;   // directory/game-db/story.json
        // The data gives which way everyone faces in degrees (deg); the scene reads radians (a)
        for (const v of Object.values(CREW_VENUES)) for (const night of [v.group, v.solo]) if (night)
            for (const spot of [night.me, night.them, ...(night.seats || [])]) angleKit.degToRad(spot);
        /** Each of the crew's own place (the pins they used to send) */
        const CREW_HOME_VENUE = GAME_DB.story.crew.home_venue;   // directory/game-db/story.json

        /* ── A group night ── */
        const CREW_OPENERS = GAME_DB.dialogue.crew.openers;   // directory/game-db/dialogue.json
        const CREW_BOOTH = GAME_DB.dialogue.crew.booth;   // directory/game-db/dialogue.json
        const CREW_TOASTS = GAME_DB.dialogue.crew.toasts;   // directory/game-db/dialogue.json
        /** Which toast each of them likes (and a word for it) */
        const CREW_TOAST_TASTE = GAME_DB.dialogue.crew.toast_taste;   // directory/game-db/dialogue.json
        const CREW_TOAST_LINES = GAME_DB.dialogue.crew.toast_lines;   // directory/game-db/dialogue.json
        const CREW_JOB_TALK = GAME_DB.dialogue.crew.job_talk;   // directory/game-db/dialogue.json
        const CREW_CLOSERS = GAME_DB.dialogue.crew.closers;   // directory/game-db/dialogue.json

        /* ── A night with one of them ── */
        const CREW_SOLO = GAME_DB.dialogue.crew.solo;   // directory/game-db/dialogue.json

        /**
         * The moments: a few lines, a question for her, and what each reply gets. `good` is the reply that lands.
         * Bands by how close they are: 0 acquaintance/companion, 1 trusted, 2 inner circle.
         */
        const CREW_MOMENTS = GAME_DB.dialogue.crew.moments;   // directory/game-db/dialogue.json

        /* ── Invites and RSVPs ── */
        const CREW_GROUP_INVITE = GAME_DB.dialogue.crew.group_invite;   // directory/game-db/dialogue.json
        const CREW_YES = GAME_DB.dialogue.crew.yes;   // directory/game-db/dialogue.json
        const CREW_NO = GAME_DB.dialogue.crew.no;   // directory/game-db/dialogue.json
        const CREW_STOOD_UP = GAME_DB.dialogue.crew.stood_up;   // directory/game-db/dialogue.json
        const CREW_ASK_BACK = GAME_DB.dialogue.crew.ask_back;   // directory/game-db/dialogue.json
        /** The perks of being close */
        const CREW_INTEL = GAME_DB.dialogue.crew.intel;   // directory/game-db/dialogue.json
        const CREW_STIM = GAME_DB.dialogue.crew.stim;   // directory/game-db/dialogue.json

        /** Asking her out again, after the first time (the feed's pins are the first) */
        const CREW_SOLO_ASK = GAME_DB.dialogue.crew.solo_ask;   // directory/game-db/dialogue.json

        const CrewNights = {
            _run: null,          // the night playing right now

            state() {
                const f = phoneSystem.feed;
                return f.crew || (f.crew = { plan: null, seen: {}, nights: 0, lastAsk: {} });
            },
            _mate(g, name) { return (g.teammates || []).find(t => t.name === name) || null; },
            _crewHere(g) { return (g.teammates || []).filter(t => CREW_IDS[t.name] && t.recruited && !t.downed).map(t => t.name); },
            _tier(g, name) { const t = this._mate(g, name); return t && g.bonding ? g.bonding.getTier(t.relationship || 0) : 0; },
            _pick(a) { return a[Math.floor(Math.random() * a.length)]; },

            /** Bond with one of them; a tier crossed is announced (as a talk in the apartment does) */
            bond(g, name, n) {
                const t = this._mate(g, name);
                if (!t || !n) return 0;
                const before = g.bonding ? g.bonding.getTier(t.relationship || 0) : 0;
                t.relationship = Math.max(0, Math.min(100, (t.relationship || 0) + n));
                const after = g.bonding ? g.bonding.getTier(t.relationship) : 0;
                if (after > before && BONDING_TIERS[after].message) game_timers.after(2.6, () => showMessage(`${name.toUpperCase()}: ${BONDING_TIERS[after].message}`), 'world');
                return n;
            },

            /* ───────────────────────── the invite ───────────────────────── */
            /** The window: from the next half hour, for four hours of world time */
            _window(g) {
                const now = g.worldMinutes || 0, from = Math.ceil((now + 15) / 30) * 30;
                return { from, to: from + 240 };
            },
            /**
             * Ask her out. who: the one asking (in the group: the one who wrote); solo: just them and her.
             * Returns the plan, or null when one's already on.
             */
            invite(who, venue, text, opts = {}) {
                const g = game, S = this.state();
                if (S.plan && (S.plan.state === 'open' || S.plan.state === 'yes')) return null;
                const V = CREW_VENUES[venue];
                if (!V) return null;
                const crew = this._crewHere(g);
                let going;
                if (opts.solo) going = [who];
                else {
                    // Who says yes: three to five of them, the asker always
                    const rest = crew.filter(n => n !== who).sort(() => Math.random() - 0.5);
                    going = [who, ...rest.slice(0, Math.max(2, Math.min(rest.length, 2 + Math.floor(Math.random() * 3))))];
                }
                const w = this._window(g);
                const plan = S.plan = { id: `plan_${Date.now()}`, venue, who: going, host: who, solo: !!opts.solo, from: w.from, to: w.to, state: opts.mine ? 'yes' : 'open', chat: opts.solo ? who : MSG_GROUP };
                phoneSystem.sendText(plan.chat, text, true, opts.delay || 2200, { kind: 'plan', id: plan.id, who: opts.solo ? undefined : who, data: { plan: plan.id, venue, state: plan.state } });
                return plan;
            },
            _planRec(plan) {
                const h = plan && phoneSystem.messageHistory[plan.chat];
                return h ? h.find(r => r.kind === 'plan' && r.data && r.data.plan === plan.id) : null;
            },
            _setState(plan, st) {
                plan.state = st;
                const rec = this._planRec(plan);
                if (rec) rec.data.state = st;
                if (phoneSystem._activeContact && phoneSystem._activeContact.name === plan.chat) phoneSystem.renderThread(phoneSystem._activeContact);
            },
            rsvp(yes) {
                const plan = this.state().plan;
                if (!plan || plan.state !== 'open') return;
                this._setState(plan, yes ? 'yes' : 'no');
                const voice = plan.solo ? plan.host : this._pick(plan.who);
                const text = (yes ? CREW_YES : CREW_NO)[voice] || (yes ? 'See you there.' : 'Another time.');
                phoneSystem.sendText(plan.chat, text, true, 1600, plan.solo ? null : { who: voice });
                if (yes && phoneSystem.setWaypoint) this._waypoint(plan);
                audioSys.sfx('ui');
            },
            _waypoint(plan) {
                const V = CREW_VENUES[plan.venue];
                return phoneSystem.setWaypoint(V.park ? { x: V.park.x, y: V.park.y, label: V.label, kind: V.what } : plan.venue);
            },

            /** The card in the thread: where, when, who, and her answer */
            card(rec) {
                const d = rec.data || {}, S = this.state(), plan = S.plan && S.plan.id === d.plan ? S.plan : null, V = CREW_VENUES[d.venue] || CREW_VENUES.moon_city;
                const st = plan ? plan.state : d.state === 'open' || d.state === 'yes' ? 'lapsed' : d.state;
                const card = uiKit.make(['div', 'mb-card mb-plan ' + st]);
                const k = uiKit.make(['div', 'k', plan && plan.solo ? 'Plans · Just you two' : 'Plans · Crew night']);
                const b = uiKit.make(['b', null, V.what]);
                const p = uiKit.make(['p']);
                if (plan) p.textContent = `${phoneSystem._clock(plan.from)} – ${phoneSystem._clock(plan.to)}`;
                const faces = uiKit.make(['div', 'mb-plan-faces']);
                for (const n of (plan ? plan.who : [])) faces.appendChild(phoneSystem._face(n, 'mav mb-plan-av', 48));
                const url = phoneSystem._pinMap(V.park ? { x: V.park.x, y: V.park.y } : d.venue);
                const map = uiKit.make(['div', 'mb-map mb-brief-map']);
                if (url) map.style.backgroundImage = `url(${url})`; else map.classList.add('sketch');
                map.appendChild(uiKit.make(['i']));
                const row = uiKit.make(['div', 'row']);
                const btn = (label, fn, cls = '') => { const x = uiKit.make(['button', 'mb-btn ' + cls, label]); x.addEventListener('click', e => { e.stopPropagation(); fn(); }); row.appendChild(x); };
                if (st === 'open') { btn('I\'m in', () => this.rsvp(true)); btn('Can\'t tonight', () => this.rsvp(false), 'ghost'); }
                else {
                    const em = uiKit.make(['em']);
                    em.textContent = { yes: '✓ You\'re going', no: 'You passed', done: '♡ A good night', missed: 'You didn\'t make it', lapsed: 'That night\'s gone' }[st] || '';
                    row.appendChild(em);
                    if (st === 'yes') btn('Set waypoint', () => { if (this._waypoint(plan)) audioSys.sfx('ui'); }, 'ghost');
                }
                card.append(k, b, p, faces, map, row);
                return card;
            },

            /* ───────────────────────── turning up ───────────────────────── */
            /** Every second: is she there, in time? Has the night gone without her? */
            tick() {
                const g = typeof game !== 'undefined' && game;
                if (!g || !g.running || !g.player || !g.activeMap || !phoneSystem.feed) return;
                const plan = this.state().plan;
                if (!plan || (plan.state !== 'open' && plan.state !== 'yes')) return;
                const now = g.worldMinutes || 0;
                if (now > plan.to) {
                    this._setState(plan, plan.state === 'yes' ? 'missed' : 'lapsed');
                    if (plan.state === 'missed') {
                        phoneSystem.sendText(plan.chat, CREW_STOOD_UP[plan.host] || 'We waited.', true, 1800, plan.solo ? null : { who: plan.host });
                        this.bond(g, plan.host, -1);
                    }
                    return;
                }
                if ((g.scenes && g.scenes.running) || (g.pauseSystem && g.pauseSystem.tokens && g.pauseSystem.tokens.size)) return;
                const V = CREW_VENUES[plan.venue], who = plan.solo ? plan.host : 'The crew';
                const there = g.activeMap.id === V.map && (!V.park || Math.hypot((g.isDriving && g.car ? g.car.x : g.player.x) - V.park.x, (g.isDriving && g.car ? g.car.y : g.player.y) - V.park.y) <= V.park.r);
                // Turned up and nothing would happen: say why, once each (too early, still in the car, gone inside)
                if (now < plan.from) { if (there) this._hint(plan, 'early', `${who} gets here at ${phoneSystem._clock(plan.from)}.`); this._arrived = 0; return; }
                if (V.inside && g.activeMap.id === V.inside) { this._hint(plan, 'inside', `${who}'s waiting out front.`); this._arrived = 0; return; }
                if (!there) { this._arrived = 0; return; }
                if (V.park && g.isDriving) { this._hint(plan, 'car', `${who}'s here. Park and step out.`); this._arrived = 0; return; }
                if (g.missions && g.missions.activeMission && g.missions.activeMission.type !== 'delivery' && (g.enemies || []).some(e => !e.dead && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 500)) return;
                if (++this._arrived < 2) return;          // a beat inside the door first
                this._arrived = 0;
                this.play(plan);
            },

            _hint(plan, key, text) {
                const k = plan.id + key;
                if (this._hinted === k) return;
                this._hinted = k;
                showMessage(text);
            },

            play(plan) {
                const g = game;
                this._setState(plan, 'done');
                const S = this.state();
                S.nights++;
                this._run = { plan, gains: {}, sat: null };
                if (typeof captionSystem !== 'undefined' && captionSystem.element) { captionSystem.queue.length = 0; captionSystem.element.classList.remove('show'); }
                g.scenes.play('crew_night').then(r => this._wrap(g, r && r.skipped));
            },

            /** After the night (played or skipped): the bonds, and her back in the world by the table */
            _wrap(g, skipped) {
                const R = this._run;
                this._run = null;
                if (!R) return;
                const plan = R.plan, V = CREW_VENUES[plan.venue], at = (plan.solo ? V.solo : V.group || V.solo).after;
                if (skipped && !Object.keys(R.gains).length) for (const n of plan.who) R.gains[n] = plan.solo ? 6 : 3;
                const parts = [];
                for (const n of plan.who) { const v = this.bond(g, n, R.gains[n] || 0); if (v) parts.push(`${n.toUpperCase()} +${v}`); }
                if (at && g.activeMap.id === V.map) { g.player.x = at.x; g.player.y = at.y; }
                g.player.visible = true;
                g.camera.x = g.player.x; g.camera.y = g.player.y;
                if (parts.length) game_timers.after(0.6, () => { showMessage(`♡ ${parts.join(' · ')}`); audioSys.sfx('ui'); }, 'world');
                // The thread remembers it
                game_timers.after(4, () => phoneSystem.sendText(plan.chat, plan.solo ? CREW_SOLO[plan.host].close[0][1] : 'Best night in a while. Same time next week?', true, 2000,
                    plan.solo ? null : { who: this._pick(plan.who) }), 'world');
            },

            /** The moment she gets with one of them, by how close they are (unseen ones first) */
            moment(g, name) {
                const all = CREW_MOMENTS[name];
                if (!all) return null;
                const band = Math.min(2, Math.max(0, this._tier(g, name) - 1));
                const pool = all[band], S = this.state(), key = `${name}:${band}`;
                const seen = S.seen[key] || (S.seen[key] = []);
                let i = pool.findIndex((m, k) => !seen.includes(k));
                if (i < 0) { i = Math.floor(Math.random() * pool.length); S.seen[key] = []; }
                S.seen[key].push(i);
                return pool[i];
            },

            /* ───────────────────────── being close ───────────────────────── */
            /** A Companion or closer tells her what the mark is carrying */
            onBounty(g, m) {
                if (!m || m.type !== 'bounty' || !m.weaponId || !this._freeOk()) return;
                const close = this._crewHere(g).filter(n => this._tier(g, n) >= 1);
                if (!close.length || Math.random() > 0.7) return;
                const who = this._pick(close), item = ITEM_REGISTRY[m.weaponId];
                const gun = item ? item.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'gun';
                phoneSystem.sendText(who, CREW_INTEL[who].replace('{mark}', m.targetName || 'Your mark').replace('{gun}', gun), true, 5200);
            },
            /** A Trusted friend leaves her a stim after a job that went badly */
            onJobDone(g) {
                if (!this._freeOk() || g.playerHealth > g.maxPlayerHealth * 0.35) return;
                if (!g.getEffectiveMaxBoosters || g.boosterCount >= g.getEffectiveMaxBoosters()) return;
                const close = this._crewHere(g).filter(n => this._tier(g, n) >= 2);
                if (!close.length) return;
                const who = this._pick(close);
                g.boosterCount++;
                g.updateUI();
                phoneSystem.sendText(who, CREW_STIM[who], true, 4200);
            },
            _freeOk() { return phoneSystem._freePlay ? phoneSystem._freePlay() : true; },
        };

        /* ── The scene: one night, group or one-on-one ── */
        defineScene('crew_night', { hideCrew: true, showPlayer: false, releaseFrames: 40 }, function* (s) {
            const g = s.game, R = CrewNights._run;
            if (!R) return;
            const plan = R.plan, V = CREW_VENUES[plan.venue], set = plan.solo ? V.solo : V.group;
            const id = n => CREW_IDS[n] || n;
            const me = s.actor('949', stellaSceneLook(g, false), set.me.x, set.me.y, set.me.a);
            if (set.me.pose) me.setPose(set.me.pose);
            const A = {};
            plan.who.forEach((n, i) => {
                const seat = plan.solo ? set.them : set.seats[i % set.seats.length];
                A[n] = s.actor(n, APPEARANCES[n], seat.x, seat.y, seat.a);
                const pose = seat.pose || (plan.solo ? null : 'sit');
                if (pose) A[n].setPose(pose);
            });
            s.cam.cut(set.cam, set.zoom * 0.85);
            yield s.fade('in', 50);
            s.marker(V.label, `${plan.solo ? plan.host : 'Crew night'} · ${phoneSystem._clock(g.worldMinutes)}`);
            s.cam.to(set.cam, { zoom: set.zoom, frames: 160, ease: 'smooth' });
            const gain = (n, v) => { R.gains[n] = (R.gains[n] || 0) + v; };
            const sayAll = function* (lines) { for (const [who, text] of lines) yield s.say(who, text); };

            if (plan.solo) {
                const C = CREW_SOLO[plan.host];
                gain(plan.host, 6);
                yield* sayAll(C.open);
                yield* sayAll(C.ask);
                const pick = yield s.choose(C.opts);
                yield s.say('949', C.opts[pick]);
                if (pick === C.liked) gain(plan.host, 2);
                yield* sayAll(C.replies[pick]);
            } else {
                for (const n of plan.who) gain(n, 3);
                const host = plan.who.includes('Victoria') ? 'Victoria' : plan.host;
                s.cam.to(A[host], { zoom: set.zoom * 1.1, frames: 70 });
                yield s.say(id(host), CrewNights._pick(CREW_OPENERS[host]));
                const second = plan.who.find(n => n !== host);
                if (second) { s.cam.to(A[second], { zoom: set.zoom * 1.1, frames: 60 }); yield s.say(id(second), CREW_BOOTH[second]); }
                // The toast
                s.cam.to(set.cam, { zoom: set.zoom, frames: 60 });
                yield s.narrate('Glasses go up round the table.');
                s.clearLine();
                const t = yield s.choose(CREW_TOASTS);
                yield s.say('949', CREW_TOASTS[t]);
                const likers = plan.who.filter(n => CREW_TOAST_TASTE[n] === t);
                for (const n of likers) gain(n, 1);
                const cheer = likers.find(n => CREW_TOAST_LINES[t][n]);
                if (cheer) yield s.say(id(cheer), CREW_TOAST_LINES[t][cheer]);
                else yield s.narrate('A clink of glasses. Someone laughs.');
                // The last job
                const last = g.missions && g.missions.missionLog[g.missions.missionLog.length - 1];
                const kind = last ? String(last.id).split('_')[0] : 'none';
                const talk = CREW_JOB_TALK[kind] || CREW_JOB_TALK.none;
                const talker = CrewNights._pick(plan.who.filter(n => talk[n]));
                if (talker) {
                    const job = last ? String(last.title || '').replace(/^(BOUNTY|SALVAGE): /, '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : '';
                    s.cam.to(A[talker], { zoom: set.zoom * 1.1, frames: 60 });
                    yield s.say(id(talker), talk[talker].replace('{job}', job || 'the last one'));
                }
                // Who she sits with
                s.cam.to(set.cam, { zoom: set.zoom, frames: 60 });
                yield s.narrate('The music swells. The table breaks into smaller conversations.');
                s.clearLine();
                const pick = yield s.choose(plan.who.map(n => `Sit with ${n}`));
                R.sat = plan.who[pick];
                gain(R.sat, 3);
            }
            // The moment
            const who = plan.solo ? plan.host : R.sat, M = CrewNights.moment(g, who);
            if (M) {
                s.cam.to(A[who], { zoom: set.zoom * 1.25, frames: 80, dx: (me.x - A[who].x) / 2, dy: (me.y - A[who].y) / 2 });
                yield* sayAll(M.lines);
                const r = yield s.choose(M.opts);
                yield s.say('949', M.opts[r]);
                if (r === M.good) gain(who, 2);
                yield* sayAll(M.after[r]);
            }
            // Goodnight
            s.cam.to(set.cam, { zoom: set.zoom * 0.9, frames: 90 });
            if (plan.solo) yield* sayAll(CREW_SOLO[plan.host].close);
            else {
                const closer = plan.who.includes('747') ? '747' : CrewNights._pick(plan.who);
                yield s.say(id(closer), CREW_CLOSERS[closer]);
            }
            yield s.fade('out', 50);
        });

        /* ── Hooks into Messages ── */
        const _crewBaseFeed = phoneSystem.feedNext, _crewBaseReplies = phoneSystem.getReplyOptions, _crewBaseSend = phoneSystem.sendReply, _crewBaseReset = phoneSystem.resetFeed;
        Object.assign(phoneSystem, {
            _planCard(rec) { return CrewNights.card(rec); },
            /** Her own asks: "Drinks tonight?" to the group, "Want to hang out?" to one of them, while no plan's on */
            getReplyOptions(contact, lastIncoming) {
                const base = _crewBaseReplies.call(this, contact, lastIncoming) || [];
                const S = CrewNights.state(), busy = S.plan && (S.plan.state === 'open' || S.plan.state === 'yes');
                if (busy || !CrewNights._freeOk() || typeof game === 'undefined') return base;
                const here = CrewNights._crewHere(game);
                if (contact.group && here.length >= 2) return [...base.slice(0, 2), { text: 'Drinks tonight?', crewAsk: 'group' }];
                if (CREW_IDS[contact.name] && here.includes(contact.name)) return [...base.slice(0, 2), { text: 'Want to hang out?', crewAsk: contact.name }];
                return base;
            },
            sendReply(contact, opt) {
                if (!opt.crewAsk) return _crewBaseSend.call(this, contact, opt);
                if (opt.crewAsk === 'group') {
                    const who = CrewNights._pick(CrewNights._crewHere(game));
                    _crewBaseSend.call(this, contact, { text: opt.text, response: { who, text: 'Moon City. Booth\'s ours.' } });
                    game_timers.after(3.2, () => CrewNights.invite(who, 'moon_city', 'Here\'s the plan.', { mine: true, delay: 1400 }), 'crew');
                } else {
                    const who = opt.crewAsk;
                    _crewBaseSend.call(this, contact, { text: opt.text, response: CREW_ASK_BACK[who] });
                    game_timers.after(3.2, () => CrewNights.invite(who, CREW_HOME_VENUE[who], 'Here.', { solo: true, mine: true, delay: 1400 }), 'crew');
                }
            },
            resetFeed() { _crewBaseReset.call(this); this.feed.crew = { plan: null, seen: {}, nights: 0, lastAsk: {} }; },
            /** Now and then one of them asks her out on their own: the closer, the more often (at most one a night) */
            feedNext() {
                const g = game, S = CrewNights.state(), busy = S.plan && (S.plan.state === 'open' || S.plan.state === 'yes');
                const now = g.worldMinutes || 0;
                if (!busy && now - (S.lastSolo || -1e9) > 720) {
                    const here = CrewNights._crewHere(g).filter(n => CREW_SOLO_ASK[n]);
                    const weights = here.map(n => 1 + CrewNights._tier(g, n)), sum = weights.reduce((a, b) => a + b, 0);
                    if (here.length && Math.random() < 0.15 + 0.06 * sum / here.length) {
                        let r = Math.random() * sum, k = 0;
                        while (r > weights[k] && k < here.length - 1) r -= weights[k++];
                        const who = here[k];
                        if (CrewNights.invite(who, CREW_HOME_VENUE[who], CrewNights._pick(CREW_SOLO_ASK[who]), { solo: true })) { S.lastSolo = now; return { who, kind: 'plan' }; }
                    }
                }
                return _crewBaseFeed.call(this);
            },
            /** A crew pin waits while a plan's on: sent now it would be a bare pin, with no night behind it */
            crewPinWaits(e) {
                const S = CrewNights.state();
                return !!(CREW_IDS[e.who] && S.plan && (S.plan.state === 'open' || S.plan.state === 'yes'));
            },
            /** One of the crew's place pins from the feed becomes an invite to their place */
            crewPlanFromPin(e) {
                const venue = CREW_IDS[e.who] && CREW_HOME_VENUE[e.who];
                if (!venue || !CrewNights._crewHere(game).includes(e.who)) return false;
                return !!CrewNights.invite(e.who, venue, e.text, { solo: true });
            },
            /** The group's "drinks?" after a job */
            crewGroupInvite() {
                const here = CrewNights._crewHere(game);
                const opts = CREW_GROUP_INVITE.filter(i => here.includes(i.who));
                if (here.length < 2 || !opts.length) return false;
                const i = CrewNights._pick(opts);
                return !!CrewNights.invite(i.who, 'moon_city', i.text, { delay: 9000 });
            },
        });

        // The bounty's intel, the stim after a rough job
        {
            const acc = MissionSystem.prototype.acceptMission, done = MissionSystem.prototype.completeMission;
            MissionSystem.prototype.acceptMission = function (m, g) { const ok = acc.call(this, m, g); if (ok) try { CrewNights.onBounty(g, m); } catch (e) { console.error(e); } return ok; };
            MissionSystem.prototype.completeMission = function (g) { const had = !!this.activeMission; done.call(this, g); if (had) try { CrewNights.onJobDone(g); } catch (e) { console.error(e); } };
        }
        game_timers.every(1, () => CrewNights.tick(), 'crew_nights').keep = true;   // in game time: it waits while paused
