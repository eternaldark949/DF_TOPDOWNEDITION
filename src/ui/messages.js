        /* =====================================================================
           MESSAGES — the phone's Messages app ("Velvet Thread")
           ---------------------------------------------------------------------
           Extends phoneSystem (ui/phone.js), which keeps the ledger: message
           history, unread counts, typing, delivery and the reply table. This
           file is everything she sees and the people who write to her.

           Layout (index.html #screen-contacts): on its side the inbox rail sits
           beside the open thread; upright the list slides into the thread
           (.has-thread). currentApp stays 'contacts' (list) / 'details' (thread)
           because the story's PHONE_OPENED_CONTACTS reads those names.

           A history record is { text, timestamp, from: 'them' | 'me', ... } plus,
           for the rich kinds:
             kind 'pin'    data.place           a map card; Set waypoint pins it on UMaps
             kind 'brief'  data.mission, state  a job card; Accept puts it on the tracker
             kind 'voice'  data.lines, secs     a waveform; playing it runs the earpiece subtitle
             kind 'snap'   data.place, mood     a photo painted from their portrait and the place
                           data.img             (hers) a JPEG of the game view, the newest few kept
           who     the speaker in The Freelancers group chat
           react   her reaction to their line; theirReact, theirs to hers
           seen    world minute they read her line ("Seen 11:40")

           The feed (feed.nextAt / done / pendingPin, saved with the phone) has the
           crew and contacts write on their own once chapter 1 is over: places,
           photos, voice notes and jobs. crewBanter() is called by
           MissionSystem.completeMission and writes the group chat's take on the
           job: who came along, who went down, how fast and how clean.
           ===================================================================== */
        const MSG_GROUP = 'The Freelancers';
        const MSG_CREW = ['747', 'Victoria', 'Yenna', 'Sabrina', 'Max', 'Josh'];
        const MSG_REACTIONS = ['❤️', '🔥', '😂', '👀', '🖤'];
        /** The reactions each of the crew likes to get (and gives): one of these nudges the bond a little */
        const MSG_TASTE = { Victoria: ['❤️', '🔥'], Yenna: ['👀', '🔥'], Sabrina: ['🖤', '😂'], Max: ['😂', '🔥'], Josh: ['👀', '😂'], '747': ['🖤', '❤️'] };

        /** Who's in the inbox and what was said before the game began (shown under "Earlier") */
        const MSG_CONTACTS = [
            { name: MSG_GROUP, role: 'Group', group: true, pinned: true },
            { name: 'Mirabel', role: 'W. Mindustrial', pinned: true, messages: ['949. I hope you\'re awake. I\'ve found him.', 'The Dark Maker was spotted leaving the sector.'] },
            { name: 'Dr. Yin', role: 'Clinic', messages: ['Visit my clinic for supplies!', 'Stim refills available.'] },
            { name: '747', role: 'Freelancer', crew: true, messages: ['Stay sharp, Nine.', 'I\'ve got your six. Always.'] },
            { name: 'Victoria', role: 'Freelancer', crew: true, messages: ['Save me from these sad motherfuckers.', 'Ready to roll out whenever you are.'] },
            { name: 'Yenna', role: 'Freelancer', crew: true, messages: ['Eyes on the perimeter. All clear.', 'Say the word and the SR-86 speaks.'] },
            { name: 'Sabrina', role: 'Freelancer', crew: true, messages: ['You know where to find me.', 'Sarcasm is free. Bullets cost extra.'] },
            { name: 'Max', role: 'Freelancer', crew: true, messages: ['This is bullshit.', 'I swear if one more thing goes sideways...'] },
            { name: 'Josh', role: 'Freelancer', crew: true, messages: ['Intel updated. Standing by.', 'Of course. You\'re welcome.'] },
            { name: 'Larissa', role: 'Handler', messages: ['Your assignment particulars are with Mirabel. Please coordinate with her directly.', 'The Empereal Lord remains pleased with your work.'] },
        ];

        /** What the people met in the city are, in the inbox (anyone else is a 'Contact') */
        const MSG_ROLES = { 'Barista Ren': 'Cozy Cafe', 'Bartender': 'Moon City', 'Anavia': 'Enni Cole', 'Torque': 'Torque Auto', 'Prisma': 'Neural Systems' };

        /** Places a pin or a photo can be from: the hub building (by id) and how a photo there looks.
         *  A pin can also carry a spot of its own, { x, y, label, kind } (a job's drop-off or a mark's corner). */
        const MSG_PLACES = {
            moon_city:     { label: 'Moon City Nightclub', kind: 'Nightclub', x: 5075, y: 5155, w: 600, h: 500, look: 'club',   tint: ['#2a0638', '#0a0214'], glow: ['#ff2a8a', '#8a3cff', '#28d8ff'] },
            cozy_cafe:     { label: 'Cozy Cafe',           kind: 'Café',      x: 4715, y: 1835, w: 350, h: 350, look: 'cafe',   tint: ['#3a1a0c', '#140804'], glow: ['#ffb45a', '#ff8a3c', '#ffe0a0'] },
            torque_auto:   { label: 'Torque Auto',         kind: 'Garage',    x: 6785, y: 1835, w: 700, h: 350, look: 'garage', tint: ['#1a1a24', '#08080c'], glow: ['#ff9a2a', '#ffd06a', '#5a8cff'] },
            dr_yins:       { label: 'Dr. Yin\'s Clinic',   kind: 'Clinic',    x: 11455, y: 3145, w: 500, h: 400, look: 'clinic', tint: ['#06222a', '#020a0e'], glow: ['#00f3ff', '#7affd8', '#ffffff'] },
            neural_sys:    { label: 'Neural Systems',      kind: 'Boutique',  x: 12740, y: 3145, w: 400, h: 400, look: 'club',   tint: ['#1c0636', '#08020f'], glow: ['#b06aff', '#ff6ad8', '#6ad8ff'] },
            biggs_park:    { label: 'Biggs Park',          kind: 'Park',      x: 8455, y: 7880, w: 450, h: 400, look: 'park',   tint: ['#3a1a3a', '#0c0612'], glow: ['#ff9a6a', '#ffd08a', '#c06aff'] },
            double_nights: { label: 'Double Nights Hotel', kind: 'Hotel',     x: 1600, y: 200,  w: 700, h: 408, look: 'street', tint: ['#1a0a24', '#06020a'], glow: ['#e8c27a', '#ff6a8a', '#8a6aff'] },
            enni_cole:     { label: 'Enni Cole',           kind: 'Boutique',  x: 6175, y: 5150, w: 900, h: 700, look: 'street', tint: ['#2a0a1a', '#0a0208'], glow: ['#ff6aa8', '#e8c27a', '#ffffff'] },
            silver_queen:  { label: 'Silver Queen Apts',   kind: 'Home',      x: 172,  y: 17,   w: 700, h: 880, look: 'street', tint: ['#14102a', '#05040c'], glow: ['#cab0fa', '#e8c27a', '#6a8aff'] },
        };

        /* ── What they write on their own (feed) ── */
        const MSG_FEED = [
            // Location drops
            { id: 'pin_747_cafe', who: '747', kind: 'pin', place: 'cozy_cafe', text: 'Coffee. Now. Your treat.' },
            { id: 'pin_yin', who: 'Dr. Yin', kind: 'pin', place: 'dr_yins', text: 'Stims restocked. My door is open.' },
            { id: 'pin_vic_torque', who: 'Victoria', kind: 'pin', place: 'torque_auto', text: 'Torque got a new wrap in. Come look before Max claims it.' },
            { id: 'pin_sab_club', who: 'Sabrina', kind: 'pin', place: 'moon_city', text: 'Booth at the back. I\'m saving you a seat.' },
            { id: 'pin_yen_park', who: 'Yenna', kind: 'pin', place: 'biggs_park', text: 'Quiet spot. Good sightlines. Come shoot cans.' },
            { id: 'pin_josh_neural', who: 'Josh', kind: 'pin', place: 'neural_sys', text: 'Prisma has a sale on V.O.C.A.L.s. Don\'t tell Max.' },
            { id: 'pin_max_enni', who: 'Max', kind: 'pin', place: 'enni_cole', text: 'Need a second opinion on a jacket. Don\'t laugh.' },
            // Snapshots
            { id: 'snap_vic', who: 'Victoria', kind: 'snap', place: 'torque_auto', mood: 'grin', text: 'New wrap. Thoughts? Wrong answers only.' },
            { id: 'snap_sab', who: 'Sabrina', kind: 'snap', place: 'moon_city', mood: 'smirk', text: 'Guess where I am.' },
            { id: 'snap_yen', who: 'Yenna', kind: 'snap', place: 'biggs_park', mood: 'smile', text: 'Sunset from my spot.' },
            { id: 'snap_747', who: '747', kind: 'snap', place: 'cozy_cafe', mood: 'smile', text: 'Saved you a seat. Coffee\'s getting cold.' },
            { id: 'snap_max', who: 'Max', kind: 'snap', place: 'double_nights', mood: 'annoyed', text: 'This hotel\'s minibar is a crime.' },
            { id: 'snap_josh', who: 'Josh', kind: 'snap', place: 'neural_sys', mood: 'neutral', text: 'Prisma made me try one. Don\'t.' },
            { id: 'snap_anavia', who: 'Anavia', kind: 'snap', place: 'enni_cole', mood: 'sultry', text: 'Thinking of you. Come see me.', needs: g => phoneSystem._knows('Anavia') },
            // Voice notes
            { id: 'voice_mirabel', who: 'Mirabel', kind: 'voice', lines: ['949. A voice note, because some things shouldn\'t be typed.', 'The Dark Maker left a trail. I\'m pulling the thread.', 'When I call, answer.'] },
            { id: 'voice_747', who: '747', kind: 'voice', lines: ['Nine. Just checking you made it home.', 'Get some sleep. That\'s an order, technically.'] },
            { id: 'voice_vic', who: 'Victoria', kind: 'voice', lines: ['Okay so don\'t be mad.', 'I may have borrowed your jacket. The good one.', 'It looks better on me. Bye!'] },
            { id: 'voice_larissa', who: 'Larissa', kind: 'voice', lines: ['This is Larissa. The Empereal Lord sends his regards.', 'That is all.'] },
            { id: 'voice_yen', who: 'Yenna', kind: 'voice', lines: ['Found a rooftop with perfect sightlines.', 'Bring snacks. Not the crunchy kind.'] },
            { id: 'voice_sab', who: 'Sabrina', kind: 'voice', lines: ['Nine. It\'s late and I\'m bored.', 'Entertain me.'] },
        ];
        /** Who sends a job, and what kind */
        const MSG_BRIEFS = [
            { who: 'Mirabel', type: 'bounty', text: 'Someone\'s been selling my name. Make them stop.' },
            { who: '747', type: 'bounty', text: 'Contract came through. Thought of you.' },
            { who: 'Yenna', type: 'bounty', text: 'Got eyes on a mark. Want it?' },
            { who: 'Victoria', type: 'delivery', text: 'Amber\'s short a driver. Easy money, Nine.' },
            { who: 'Anavia', type: 'salvage', text: 'I found something buried. Dig it up for me.', needs: g => g.missions.completedBounties >= 5 && phoneSystem._knows('Anavia') },
        ];
        /** What they say back to her photo */
        const MSG_SNAP_REPLIES = {
            Victoria: 'Okay, iconic.', Yenna: 'Nice framing.', Sabrina: 'Cute. Don\'t let it go to your head.', Max: 'Why are you sending me this.',
            Josh: 'Saved to the archive.', '747': 'Looking good, Nine.', Mirabel: 'Don\'t send me pictures, 949. Send me results.',
            'Dr. Yin': 'You look tired. Come see me.', Larissa: 'Received.', Anavia: 'Mm. Come closer next time.',
        };

        /* ── The group chat ── */
        const MSG_GROUP_SEED = [
            { who: 'Josh', text: 'Made us a group chat. Try to keep it professional.' },
            { who: 'Victoria', text: 'No.' },
            { who: 'Max', text: 'This is bullshit.' },
            { who: 'Sabrina', text: 'Muting this.' },
        ];
        const MSG_BANTER = {
            clean: { Victoria: 'Clean. Didn\'t even chip my nails.', Yenna: 'Not one wasted round. That\'s how it\'s done.', Sabrina: 'That was almost elegant, Nine.',
                     Max: 'Okay. Fine. That went well. Don\'t get used to it.', Josh: 'Logged it. Zero complications. Of course.', '747': 'Clean work, Nine.' },
            quick: { Victoria: 'In and out. I barely finished my song.', Yenna: 'Under half an hour. Mark it.', Sabrina: 'Fast. I like fast.',
                     Max: 'Done already? I was just getting angry.', Josh: 'Fastest turnaround this month. I timed it. You\'re welcome.', '747': 'Quick. Good. Nobody saw us coming.' },
            rough: { Victoria: 'My heart can\'t do that again. Who\'s buying drinks?', Yenna: 'Too close. I\'m recalibrating my scope.', Sabrina: 'Well. That was ugly.',
                     Max: 'This is bullshit. That job was NOT as advertised.', Josh: 'Medical bills attached. Again.', '747': 'We got out. That\'s what counts. Patch up, Nine.' },
            fine:  { Victoria: 'Paid is paid. I\'m getting my nails done.', Yenna: 'Job\'s done. Cleaning the rifle.', Sabrina: 'Not bad. Not bad at all.',
                     Max: 'Could\'ve gone worse. Could\'ve gone better.', Josh: 'Payment cleared. {reward} PP.', '747': 'Good work out there.' },
        };
        const MSG_BANTER_TYPE = {
            bounty:   { Victoria: 'Who names themselves {mark}, honestly.', Yenna: '{mark} had a decent rifle. Had.', Max: '{mark} won\'t be a problem anymore.',
                        Josh: 'Updated the board. {mark}: closed.', Sabrina: 'Goodnight, {mark}.', '747': '{mark} picked the wrong city.' },
            delivery: { Victoria: 'Did anyone else smell the package? No? Just me?', Josh: 'Amber says thanks. In writing. I framed it.', Sabrina: 'Couriers. We\'re glorified couriers.',
                        Max: 'We drove a box across town. Thrilling.', Yenna: 'Route was clear. Boring is good.', '747': 'Delivered and paid. Easy night.' },
            salvage:  { Max: 'That\'s a lot of scrap. I want first pick.', Josh: 'Crate\'s inventoried. Anavia will be pleased.', Victoria: 'My arms hurt from carrying a box.',
                        Yenna: 'Guards were sloppy. Lucky for them we weren\'t.', Sabrina: 'Treasure hunting. How quaint.', '747': 'Good haul, Nine.' },
        };
        const MSG_BANTER_DOWN = { Victoria: 'Note to self: don\'t stand in front of the bullets.', Yenna: 'I\'m fine. Mostly fine.', Sabrina: 'Tell nobody about this.',
                                  Max: 'I am NOT fine. For the record.', Josh: 'Ow. Logged.', '747': 'Just a scratch, Nine.' };
        const MSG_BANTER_LEFT = { Victoria: 'You went without me? Rude.', Yenna: 'Next time take the sniper.', Sabrina: 'Heard you had fun without me.',
                                  Max: 'Oh, sure, don\'t call Max.', Josh: 'I watched it on the feed. Like a fan.', '747': 'Call me next time, Nine.' };

        // The group's chips, answered by one of the crew
        phoneSystem._replyTable.byContact[MSG_GROUP] = [
            { text: 'Drinks are on me.', response: { who: 'Victoria', text: 'I\'m holding you to that.' } },
            { text: 'Good work, everyone.', response: { who: '747', text: 'Same to you, Nine.' } },
            { text: 'Next one\'s harder.', response: { who: 'Max', text: 'Of course it is.' } },
        ];

        const _msgBaseTyping = phoneSystem.updateTypingIndicator;
        const _msgBaseSeed = phoneSystem.seedDefaultContacts;

        Object.assign(phoneSystem, {
            msgTab: 'all',
            feed: { nextAt: null, done: {}, pendingPin: null },
            _typingWho: {},
            _snapCache: new Map(),
            _mapCache: new Map(),

            /* ───────────────────────── world time ───────────────────────── */
            _now() { return (typeof game !== 'undefined' && game && game.worldMinutes) || 0; },
            /** "11:38 PM" */
            _clock(ts) {
                const d = ((ts % 1440) + 1440) % 1440, h = Math.floor(d / 60), m = d % 60;
                return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
            },
            /** Which night a minute belongs to: a night runs from 5 AM to 5 AM, so 1 AM is still "Tonight" */
            _nightOf(ts) { return Math.floor((ts - 300) / 1440); },
            _dayLabel(ts) {
                const gap = this._nightOf(this._now()) - this._nightOf(ts), h = Math.floor((((ts % 1440) + 1440) % 1440) / 60);
                const night = h >= 18 || h < 5;
                if (gap <= 0) return night ? 'Tonight' : h < 12 ? 'This morning' : 'This afternoon';
                if (gap === 1) return night ? 'Last night' : 'Yesterday';
                return `${gap} days ago`;
            },
            /** The inbox's time column: the clock tonight, else how long ago */
            _railTime(ts) {
                if (!ts) return '';
                const gap = this._nightOf(this._now()) - this._nightOf(ts);
                return gap <= 0 ? this._clock(ts) : gap === 1 ? 'Yesterday' : `${gap}d`;
            },

            /* ───────────────────────── faces ───────────────────────── */
            _faceURL(name, size) {
                try {
                    if (typeof game === 'undefined' || !game || !game.getPortraitCanvas) return null;
                    const e = game.getPortraitCanvas(name, size, null);
                    return e && e.config && !e.config.isFallback ? game.getPortraitDataURL(name, size, null) : null;
                } catch (err) { return null; }
            },
            _ring(name) {
                const tm = typeof game !== 'undefined' && game && (game.teammates || []).find(t => t.name === name);
                if (!tm || !game.bonding || typeof tm.relationship !== 'number') return null;
                const tier = BONDING_TIERS[game.bonding.getTier(tm.relationship)];
                return tier && tier.ring;
            },
            /** A round painted face (or the name's initial), with the bond's ring for the crew */
            _face(name, cls = 'mav', size = 96) {
                const el = document.createElement('div');
                el.className = cls;
                const url = this._faceURL(name, size);
                if (url) { const img = new Image(); img.alt = ''; img.src = url; el.appendChild(img); }
                else el.textContent = String(name).replace(/[^A-Za-z0-9]/g, '').charAt(0) || '?';
                const ring = this._ring(name);
                if (ring) el.style.setProperty('--ring', ring);
                const tm = typeof game !== 'undefined' && game && (game.teammates || []).find(t => t.name === name);
                if (tm && tm.downed) el.classList.add('downed');
                return el;
            },
            /** The group's avatar: three of the crew, stacked */
            _groupFace(cls = 'mav') {
                const el = document.createElement('div');
                el.className = cls + ' stack';
                for (const n of ['Victoria', '747', 'Max']) el.appendChild(this._face(n, 'mav-mini', 64));
                return el;
            },
            _color(name) { return (typeof SPEAKER_COLORS !== 'undefined' && SPEAKER_COLORS[name]) || '#e8c27a'; },
            _knows(name) { return this.metNPCs.has(name) || !!(this.messageHistory[name] && this.messageHistory[name].length); },
            _isCrew(name) { return MSG_CREW.includes(name); },

            /* ───────────────────────── the inbox ───────────────────────── */
            seedDefaultContacts() {
                _msgBaseSeed.call(this);
                const g = this.messageHistory[MSG_GROUP] || (this.messageHistory[MSG_GROUP] = []);
                if (g.length === 0) for (const l of MSG_GROUP_SEED) g.push({ text: l.text, timestamp: 0, isNew: false, from: 'them', who: l.who });
            },

            _buildContactDefs() {
                const defs = MSG_CONTACTS.map(c => ({ ...c }));
                const add = (name) => {
                    if (!name || name === '949' || defs.some(c => c.name === name)) return;
                    defs.push({ name, role: MSG_ROLES[name] || 'Contact' });
                };
                this.metNPCs.forEach(add);
                Object.keys(this.messageHistory).forEach(n => { if (this.messageHistory[n].length) add(n); });
                this._contactDefs = defs;
                return defs;
            },

            showContacts() {
                this.currentApp = 'contacts';
                this.currentContact = null;
                this._activeContact = null;
                this._stopVoice();
                this.broadcast('APP_OPENED', { app: 'contacts' });
                this.homeScreen.style.display = 'none';
                document.querySelectorAll('.phone-app-screen').forEach(s => s.style.display = 'none');
                const scr = document.getElementById('screen-contacts');
                scr.style.display = 'flex';
                scr.classList.remove('has-thread');
                this._buildContactDefs();
                this.renderContacts();
                this._paintEmpty();
            },

            _lastRec(name) { const h = this.messageHistory[name]; return h && h.length ? h[h.length - 1] : null; },
            _recency(name) {
                if (this.lastMessageAt[name] != null) return this.lastMessageAt[name];
                const r = this._lastRec(name);
                return r ? (r.timestamp || 0) : null;
            },
            _preview(rec) {
                if (!rec) return 'No messages yet';
                const who = rec.from === 'me' ? 'You: ' : rec.who ? `${rec.who}: ` : '';
                const d = rec.data || {};
                const body = rec.kind === 'pin' ? `📍 ${(this._place(d.place) || {}).label || 'A location'}`
                    : rec.kind === 'brief' ? `✦ Job · ${this._jobTitle(d.mission)}`
                    : rec.kind === 'plan' ? '🥂 Plans'
                    : rec.kind === 'voice' ? '🎙 Voice note'
                    : rec.kind === 'snap' ? '📷 Photo'
                    : rec.text;
                return who + body;
            },

            /**
             * The inbox. ORDER (stable): unread first, most recent first; then by
             * recency; never-messaged contacts keep their authored order. Pinned
             * conversations (the group, Mirabel) sit on top under the All tab.
             */
            renderContacts() {
                const list = this.contactsList;
                if (!list || !this._contactDefs) return;
                list.innerHTML = '';
                document.querySelectorAll('#msg-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === this.msgTab));

                const rank = n => this.unread[n] ? 0 : this._recency(n) != null ? 1 : 2;
                let rows = this._contactDefs.slice().sort((a, b) => {
                    const ra = rank(a.name), rb = rank(b.name);
                    if (ra !== rb) return ra - rb;
                    return ra === 2 ? 0 : (this._recency(b.name) || 0) - (this._recency(a.name) || 0);
                });
                if (this.msgTab === 'crew') rows = rows.filter(c => c.crew || c.group);
                if (this.msgTab === 'unread') rows = rows.filter(c => this.unread[c.name]);

                const label = (t) => { const el = document.createElement('div'); el.className = 'msg-sec'; el.textContent = t; list.appendChild(el); };
                const pinned = this.msgTab === 'all' ? rows.filter(c => c.pinned) : [];
                const rest = rows.filter(c => !pinned.includes(c));
                if (pinned.length) { label('Pinned'); pinned.forEach(c => list.appendChild(this._row(c))); label('Recent'); }
                rest.forEach(c => list.appendChild(this._row(c)));
                if (!rows.length) {
                    const e = document.createElement('div');
                    e.className = 'msg-none';
                    e.textContent = this.msgTab === 'unread' ? 'All caught up.' : 'No one yet.';
                    list.appendChild(e);
                }
            },

            _row(c) {
                const n = this.unread[c.name] || 0;
                const item = document.createElement('div');
                item.className = 'msg-item' + (n ? ' unread' : '') + (this._activeContact && this._activeContact.name === c.name ? ' on' : '');
                item.appendChild(c.group ? this._groupFace() : this._face(c.name));
                const who = document.createElement('div');
                who.className = 'msg-who';
                const b = document.createElement('b'); b.textContent = c.name;
                const i = document.createElement('i');
                const last = this._lastRec(c.name) || (c.messages ? { text: c.messages[c.messages.length - 1], from: 'them' } : null);
                i.textContent = this.typingState[c.name] ? 'typing…' : this._preview(last);
                if (this.typingState[c.name]) i.classList.add('typing');
                who.append(b, i);
                const meta = document.createElement('div');
                meta.className = 'msg-meta';
                const t = document.createElement('small'); t.textContent = this._railTime(this._recency(c.name));
                meta.appendChild(t);
                if (n) { const k = document.createElement('span'); k.className = 'msg-count'; k.textContent = n > 99 ? '99+' : n; meta.appendChild(k); }
                item.append(who, meta);
                item.addEventListener('click', () => this.showContactDetail(c));
                return item;
            },

            /** The pane with no conversation open (on its side): a word on what's waiting */
            _paintEmpty() {
                const line = document.getElementById('msg-empty-line');
                if (!line) return;
                const n = this.unreadTotal();
                line.textContent = n ? `${n} unread · choose a conversation` : 'Choose a conversation';
            },

            /* ───────────────────────── the thread ───────────────────────── */
            showContactDetail(contact) {
                if (typeof contact === 'string') contact = this._buildContactDefs().find(c => c.name === contact) || { name: contact, role: 'Contact' };
                this._stopVoice();
                this.currentApp = 'details';
                this.currentContact = contact.name;
                this._activeContact = contact;
                this.broadcast('CONTACT_VIEWED', { name: contact.name });

                this.homeScreen.style.display = 'none';
                document.querySelectorAll('.phone-app-screen').forEach(s => s.style.display = 'none');
                const scr = document.getElementById('screen-contacts');
                scr.style.display = 'flex';
                scr.classList.add('has-thread');
                if (!this._contactDefs) this._buildContactDefs();

                this._adoptDefaults(contact);
                // A line that only lives in the preview (a restored old save) joins the thread
                const pending = this.contactOverrides[contact.name];
                if (pending && !(this.messageHistory[contact.name] || []).some(m => m.text === pending)) this.addMessage(contact.name, pending, false, 'them');

                this.markRead(contact.name);   // repaints the inbox through messagesLive
                this.renderThread(contact, true);
                this.renderContacts();
            },

            /**
             * Fold a contact's authored lines into their history (under "Earlier") the
             * first time the thread opens, so every line on screen is a record that can
             * carry a reaction. A longer authored line replaces the seeded short one
             * it begins with ("949. I hope you're awake." → "...I've found him.").
             */
            _adoptDefaults(contact) {
                if (!contact.messages || !contact.messages.length) return;
                const h = this.messageHistory[contact.name] || (this.messageHistory[contact.name] = []);
                if (h.some(m => m.adopted)) return;
                const early = [];
                for (const text of contact.messages) {
                    const dup = h.find(m => m.from === 'them' && !m.kind && !m.timestamp && this._isNearDup(m.text, text));
                    if (dup) { if (text.length > dup.text.length) dup.text = text; dup.adopted = true; if (!early.includes(dup)) early.push(dup); }
                    else early.push({ text, timestamp: 0, isNew: false, from: 'them', adopted: true });
                }
                // Authored order first, then everything else as it happened
                const rest = h.filter(m => !early.includes(m));
                h.length = 0;
                h.push(...early, ...rest);
            },

            _sub(contact) {
                if (this.typingState[contact.name]) {
                    const w = this._typingWho[contact.name];
                    return w ? `${w} is typing…` : 'typing…';
                }
                if (contact.group) {
                    const crew = (typeof game !== 'undefined' && game && game.teammates || []).filter(t => t.recruited).map(t => t.name);
                    return crew.length ? crew.join(', ') : 'The crew';
                }
                const tm = typeof game !== 'undefined' && game && (game.teammates || []).find(t => t.name === contact.name);
                if (tm && game.bonding && typeof tm.relationship === 'number') {
                    return `${contact.role || 'Freelancer'} · ${BONDING_TIERS[game.bonding.getTier(tm.relationship)].name}${tm.downed ? ' · down' : ''}`;
                }
                return contact.role || 'Contact';
            },

            renderThread(contact, toBottom = false) {
                const feed = document.getElementById('contact-detail-content');
                if (!feed) return;
                const stick = toBottom || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
                const keep = feed.scrollTop;
                this._closePicker();

                // Header
                const slot = document.getElementById('contact-detail-avatar');
                if (slot) { slot.innerHTML = ''; slot.appendChild(contact.group ? this._groupFace('mav big') : this._face(contact.name, 'mav big')); }
                document.getElementById('contact-detail-name').textContent = contact.name;
                document.getElementById('contact-detail-sub').textContent = this._sub(contact);

                feed.innerHTML = '';
                const hist = this.messageHistory[contact.name] || [];
                let lastMine = -1;
                hist.forEach((r, i) => { if (r.from === 'me') lastMine = i; });
                let prevTs = null, prevKey = null, earlier = false;

                hist.forEach((rec, i) => {
                    const ts = rec.timestamp || 0;
                    // Day dividers: "Earlier" for lines from before the game; then a stamp
                    // whenever the night changes or the talk paused for a while
                    if (!ts) {
                        if (!earlier) { feed.appendChild(this._divider('Earlier')); earlier = true; prevKey = null; }
                    } else if (prevTs == null || this._nightOf(ts) !== this._nightOf(prevTs) || ts - prevTs >= 45) {
                        feed.appendChild(this._divider(`${this._dayLabel(ts)} · ${this._clock(ts)}`));
                        prevKey = null;
                    }
                    if (ts) prevTs = ts;

                    if (rec.from !== 'me' && rec.from !== 'them') {          // a call: one line across the thread
                        feed.appendChild(this._divider(`${rec.text}${ts ? ' · ' + this._clock(ts) : ''}`, 'call'));
                        prevKey = null;
                        return;
                    }
                    const key = rec.from === 'me' ? 'me' : 'them:' + (rec.who || '');
                    feed.appendChild(this._message(contact, rec, key === prevKey));
                    prevKey = key;

                    if (i === lastMine && i === hist.length - 1 && rec.seen) {
                        const s = document.createElement('div');
                        s.className = 'mb-seen';
                        s.textContent = `Seen ${this._clock(rec.seen)}`;
                        feed.appendChild(s);
                    }
                });

                if (this.typingState[contact.name]) {
                    const t = document.createElement('div');
                    t.className = 'mb-typing';
                    t.innerHTML = '<i></i><i></i><i></i>';
                    feed.appendChild(t);
                }
                if (!hist.length) feed.appendChild(this._divider('No messages yet'));

                const last = hist[hist.length - 1];
                this._lastIncoming = [...hist].reverse().find(r => r.from === 'them') || null;
                this._awaitingThem = !!(last && last.from === 'me' && last.awaiting);
                this.renderReplyOptions(contact);
                this._resumeVoice();
                if (stick) requestAnimationFrame(() => { feed.scrollTop = feed.scrollHeight; });
                else feed.scrollTop = keep;
            },

            _divider(text, cls = '') {
                const d = document.createElement('div');
                d.className = 'mb-day' + (cls ? ' ' + cls : '');
                d.textContent = text;
                return d;
            },

            /** One line in the thread: its bubble or card, the face and name in the group, the reaction */
            _message(contact, rec, cont) {
                const mine = rec.from === 'me';
                const row = document.createElement('div');
                row.className = 'mb-row ' + (mine ? 'me' : 'them') + (cont ? ' cont' : '');
                if (contact.group && !mine) {
                    const av = cont ? document.createElement('div') : this._face(rec.who || '?', 'mav mb-av', 48);
                    if (cont) av.className = 'mb-av blank';
                    row.appendChild(av);
                }
                const col = document.createElement('div');
                col.className = 'mb-col';
                if (contact.group && !mine && !cont && rec.who) {
                    const w = document.createElement('div');
                    w.className = 'mb-who';
                    w.style.color = this._color(rec.who);
                    w.textContent = rec.who;
                    col.appendChild(w);
                }
                const wrap = document.createElement('div');
                wrap.className = 'mb-wrap';
                const kind = rec.kind;
                if (rec.text && kind !== 'voice') {
                    const b = document.createElement('div');
                    b.className = 'mb';
                    b.textContent = rec.text;
                    wrap.appendChild(b);
                }
                if (kind === 'pin') wrap.appendChild(this._pinCard(rec));
                else if (kind === 'brief') wrap.appendChild(this._briefCard(rec));
                else if (kind === 'plan' && this._planCard) wrap.appendChild(this._planCard(rec));   // story/crew-nights.js
                else if (kind === 'voice') wrap.appendChild(this._voiceBubble(contact, rec));
                else if (kind === 'snap') wrap.appendChild(this._snapCard(contact, rec));

                const pip = mine ? rec.theirReact : rec.react;
                if (pip) {
                    const p = document.createElement('span');
                    p.className = 'mb-pip';
                    p.textContent = pip;
                    wrap.appendChild(p);
                    wrap.classList.add('has-pip');
                }
                if (this._glint === rec) wrap.classList.add('glint');
                if (!mine) this._bindHold(wrap, rec, contact);
                col.appendChild(wrap);
                row.appendChild(col);
                return row;
            },

            /* ───────────────────────── replies ───────────────────────── */
            getReplyOptions(contact, lastIncoming) {
                if (lastIncoming) {
                    const hit = this._replyIndex()[this._normalizeMsg(lastIncoming)];
                    if (hit) return hit;
                }
                return this._replyTable.byContact[contact.name] || this._replyTable.generic;
            },

            /** Gold chips answering whatever they said last; the camera sends her snapshot */
            renderReplyOptions(contact) {
                const box = document.getElementById('contact-reply-options');
                const bar = document.getElementById('contact-reply-input');
                const hint = document.getElementById('contact-reply-hint');
                const cam = document.getElementById('contact-reply-snap');
                if (!box) return;
                box.innerHTML = '';
                if (cam) cam.disabled = this._awaitingThem;
                const li = this._lastIncoming;
                // Only words get worded answers: a card or a photo leaves the chips to the contact's usual lines
                const opts = this._awaitingThem || !li ? null : this.getReplyOptions(contact, li.kind ? null : li.text);
                const answered = li && this.messageHistory[contact.name] && this.messageHistory[contact.name].slice(-1)[0].from === 'me';
                if (!opts || !opts.length || answered) {
                    bar && bar.classList.remove('armed');
                    if (hint) hint.textContent = this._awaitingThem ? 'Delivered' : answered ? 'Sent' : 'No reply needed';
                    return;
                }
                bar && bar.classList.add('armed');
                if (hint) hint.textContent = contact.group ? 'Message the crew…' : `Reply to ${contact.name}…`;
                opts.forEach(opt => {
                    const chip = document.createElement('button');
                    chip.className = 'reply-chip';
                    chip.textContent = opt.text;
                    chip.addEventListener('click', () => this.sendReply(contact, opt));
                    box.appendChild(chip);
                });
            },

            /**
             * Post her reply, then: they read it (Seen), maybe react to it, and if
             * the option carries a response they type and write back. A response
             * landing after she's left the thread arrives like any message.
             */
            sendReply(contact, opt) {
                const mine = this.addMessage(contact.name, opt.text, false, 'me', opt.response ? { awaiting: true } : null);
                this.lastMessageAt[contact.name] = this._now();
                audioSys.sfx('ui');
                this.renderThread(contact, true);
                this._answer(contact, mine, opt.response || null);
            },

            _answer(contact, mine, response) {
                const name = contact.name;
                const resp = typeof response === 'string' ? { text: response } : response;
                const reactor = contact.group ? (resp && resp.who) || this._someCrew() : name;
                const seenAt = 450 + Math.random() * 500;
                const viewing = () => this.isOpen && this.currentApp === 'details' && this.currentContact === name;
                setTimeout(() => {
                    mine.seen = this._now();
                    // The crew react to her lines (and to her photos) the way they like to
                    if (MSG_TASTE[reactor] && Math.random() < (mine.kind === 'snap' ? 0.9 : 0.55)) mine.theirReact = MSG_TASTE[reactor][mine.kind === 'snap' ? 0 : Math.floor(Math.random() * 2)];
                    if (resp) { this._typingWho[name] = contact.group ? resp.who : null; this.setTyping(name, true); }
                    else if (viewing()) this.renderThread(contact);
                }, seenAt);
                if (!resp) return;
                setTimeout(() => {
                    this.setTyping(name, false);
                    delete mine.awaiting;
                    const extra = { ...(resp.who ? { who: resp.who } : {}), ...(resp.extra || {}) };
                    this.addMessage(name, resp.text, false, 'them', Object.keys(extra).length ? extra : null);
                    this.lastMessageAt[name] = this._now();
                    if (viewing()) { this.renderThread(contact); this.renderContacts(); }
                    else {
                        this.contactOverrides[name] = resp.text;
                        this.unread[name] = (this.unread[name] || 0) + 1;
                        this.refreshNotifications();
                    }
                }, seenAt + 1300 + Math.random() * 900);
            },

            _someCrew() {
                const crew = (typeof game !== 'undefined' && game && game.teammates || []).filter(t => t.recruited && MSG_CREW.includes(t.name)).map(t => t.name);
                const pool = crew.length ? crew : MSG_CREW;
                return pool[Math.floor(Math.random() * pool.length)];
            },

            /** Called by refreshNotifications while Messages is open: repaint, and read what lands in the open thread */
            messagesLive() {
                const c = this._activeContact;
                if (this.currentApp === 'details' && c && this.unread[c.name]) { this.markRead(c.name); return; }
                this._buildContactDefs();
                this.renderContacts();
                this._paintEmpty();
                if (this.currentApp === 'details' && c) this.renderThread(c);
            },

            /** Typing shows in the thread (dots, "is typing…") and the inbox instead of the old banner */
            updateTypingIndicator() {
                const inMessages = this.isOpen && (this.currentApp === 'contacts' || this.currentApp === 'details');
                if (!inMessages) return _msgBaseTyping.call(this);
                if (this.typingIndicator) this.typingIndicator.classList.remove('active');
                this.renderContacts();
                if (this.currentApp === 'details' && this._activeContact) this.renderThread(this._activeContact);
            },

            /* ───────────────────────── reactions ───────────────────────── */
            /** Hold a line (or right-click / double-click it) to react */
            _bindHold(wrap, rec, contact) {
                let t = null, sx = 0, sy = 0;
                const open = () => { t = null; this._openPicker(wrap, rec, contact); };
                const cancel = () => { clearTimeout(t); t = null; };
                wrap.addEventListener('pointerdown', e => {
                    if (e.target.closest('button')) return;
                    sx = e.clientX; sy = e.clientY; cancel(); t = setTimeout(open, 420);
                });
                wrap.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) cancel(); });
                ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => wrap.addEventListener(ev, cancel));
                wrap.addEventListener('contextmenu', e => { e.preventDefault(); cancel(); open(); });
                wrap.addEventListener('dblclick', e => { if (!e.target.closest('button')) open(); });
            },
            _openPicker(wrap, rec, contact) {
                this._closePicker();
                const p = document.createElement('div');
                p.className = 'mb-picker';
                for (const e of MSG_REACTIONS) {
                    const b = document.createElement('button');
                    b.textContent = e;
                    if (rec.react === e) b.classList.add('on');
                    b.addEventListener('click', ev => { ev.stopPropagation(); this.react(contact, rec, e); });
                    p.appendChild(b);
                }
                wrap.parentElement.insertBefore(p, wrap);
                this._picker = p;
                try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* no haptics */ }
                setTimeout(() => {
                    this._pickerOff = ev => { if (!p.contains(ev.target)) this._closePicker(); };
                    document.addEventListener('pointerdown', this._pickerOff, true);
                }, 0);
            },
            _closePicker() {
                if (this._pickerOff) { document.removeEventListener('pointerdown', this._pickerOff, true); this._pickerOff = null; }
                if (this._picker) { this._picker.remove(); this._picker = null; }
            },
            /**
             * Her reaction to one of their lines. One the crew member likes (MSG_TASTE)
             * nudges the bond (+2, once per line), and can tip it into the next tier.
             */
            react(contact, rec, emoji) {
                rec.react = rec.react === emoji ? null : emoji;
                this._closePicker();
                audioSys.sfx('ui');
                const who = contact.group ? rec.who : contact.name;
                const tm = typeof game !== 'undefined' && game && (game.teammates || []).find(t => t.name === who);
                if (rec.react && tm && !rec.bonded && (MSG_TASTE[who] || []).includes(emoji) && typeof tm.relationship === 'number' && game.bonding) {
                    rec.bonded = true;
                    const before = game.bonding.getTier(tm.relationship);
                    tm.relationship = Math.min(100, tm.relationship + 2);
                    const after = game.bonding.getTier(tm.relationship);
                    showMessage(`♡ ${who.toUpperCase()} LIKED THAT`);
                    if (after > before && BONDING_TIERS[after].message) setTimeout(() => showMessage(`${who.toUpperCase()}: ${BONDING_TIERS[after].message}`), 1200);
                    this._glint = rec;
                }
                this.renderThread(contact);
                this._glint = null;
            },

            /* ───────────────────────── location drops ───────────────────────── */
            /** A pin's key (a place's id, or its spot) */
            _pinKey(id) { return id && typeof id === 'object' ? `${Math.round(id.x)},${Math.round(id.y)}` : id; },
            _place(id) {
                if (id && typeof id === 'object') {                                  // a spot of its own: the point is the pin
                    if (typeof id.x !== 'number' || typeof id.y !== 'number') return null;
                    return { label: id.label || 'A location', kind: id.kind || 'Pinned spot', look: 'street', tint: ['#14102a', '#05040c'], glow: ['#e8c27a', '#ff9a4a', '#8a6aff'],
                             id, x: id.x - 150, y: id.y - 330, w: 300, h: 300, tx: id.x, ty: id.y };
                }
                const P = MSG_PLACES[id];
                if (!P) return null;
                // The live building wins over the table (a map edit moves the pin with it)
                const bs = (typeof game !== 'undefined' && game) && (game._hubBuildingsCache || (game.activeMap && game.activeMap.id === 'sdc' && game.activeMap.buildings));
                const b = bs && bs.find(x => x.id === id);
                const x = b ? b.x : P.x, y = b ? b.y : P.y, w = b ? (b.w || 100) : P.w, h = b ? (b.h || 100) : P.h;
                return { ...P, id, tx: x + w / 2, ty: y + h + 30 };
            },
            _pinCard(rec) {
                const d = rec.data || {}, P = this._place(d.place) || { label: 'Somewhere', kind: '' };
                const card = document.createElement('div');
                card.className = 'mb-card mb-pin';
                const map = document.createElement('div');
                map.className = 'mb-map';
                const url = this._pinMap(d.place);
                if (url) map.style.backgroundImage = `url(${url})`;
                else map.classList.add('sketch');
                const pin = document.createElement('i');
                map.appendChild(pin);
                const cap = document.createElement('div');
                cap.className = 'mb-cap';
                const t = document.createElement('div');
                const b = document.createElement('b'); b.textContent = P.label;
                const s = document.createElement('small');
                const set = game && game.navDestination && P.tx != null && Math.hypot(game.navDestination.x - P.tx, game.navDestination.y - P.ty) < 4;
                s.textContent = set ? 'Waypoint set' : this._pinKey(this.feed.pendingPin) === this._pinKey(d.place) ? 'Waypoint saved for the city' : P.kind;
                t.append(b, s);
                const btn = document.createElement('button');
                btn.className = 'mb-btn';
                btn.textContent = set ? '✓ Set' : 'Set waypoint';
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    if (this.setWaypoint(d.place)) { audioSys.sfx('ui'); this._activeContact && this.renderThread(this._activeContact); }
                });
                cap.append(t, btn);
                card.append(map, cap);
                return card;
            },
            /** A crop of the city of light around the place (UMaps' painter), when she's in the city */
            _pinMap(id) {
                const g = typeof game !== 'undefined' && game, M = g && g.activeMap;
                if (!M || M.id !== 'sdc' || typeof MapArt === 'undefined') return null;
                const key = this._pinKey(id) + '|' + M.id;
                if (this._mapCache.has(key)) return this._mapCache.get(key);
                const P = this._place(id);
                if (!P) return null;
                let url = null;
                try {
                    const W = 400, H = 160, span = 4200, fs = W / span;
                    const c = document.createElement('canvas'); c.width = W; c.height = H;
                    const ctx = c.getContext('2d');
                    ctx.fillStyle = MAP_PAL.base; ctx.fillRect(0, 0, W, H);
                    const ox = W / 2 - (P.x + P.w / 2) * fs, oy = H / 2 - (P.y + P.h / 2) * fs;
                    ctx.setTransform(fs, 0, 0, fs, ox, oy);
                    MapArt.paintCity(ctx, M, { px: fs, dpr: 1, bounds: { x: -ox / fs, y: -oy / fs, w: W / fs, h: H / fs },
                        network: g.traffic ? g.traffic.network : null, lamps: g.lamps });
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    MapArt.bloom(c);
                    url = c.toDataURL('image/jpeg', 0.8);
                } catch (e) { url = null; }
                this._mapCache.set(key, url);
                return url;
            },
            /** Pin the place on UMaps (the same marker a double-tap there sets); outside the city it waits for her return */
            setWaypoint(id) {
                const P = this._place(id), g = game, ui = g && g.ui;
                if (!P) return false;
                if (!g.activeMap || g.activeMap.id !== 'sdc' || !ui) {
                    this.feed.pendingPin = id;
                    showMessage(`WAYPOINT SAVED · ${P.label.toUpperCase()}`);
                    return true;
                }
                this.feed.pendingPin = null;
                ui.navMarker = { x: P.tx, y: P.ty };
                ui.navPathDirty = true;
                g.navDestination = ui.navMarker;
                if (g.isDriving && g.car && g.car.controlMode === 'AI') {
                    g.car.navDestination = null;
                    if (!g.car.currentTurnPath && !g._refreshAutoDriveRoute()) {
                        g.car.disableAutoDrive(); g.car.clearNavWaypoints(); g.autodriveBtn.classList.remove('engaged');
                    }
                }
                if (ui.calculateNavPath) ui.calculateNavPath();
                showMessage(`WAYPOINT SET · ${P.label.toUpperCase()}`);
                if (ui.renderGoldenMap) ui.renderGoldenMap();
                return true;
            },
            /** A contact drops a pin (the story uses this for Mirabel's lounge) */
            dropPin(name, place, text, delay = 1600) {
                this.sendText(name, text, true, delay, { kind: 'pin', id: `pin_${this._pinKey(place)}_${this._now()}`, data: { place } });
            },

            /* ───────────────────────── mission briefs ───────────────────────── */
            _jobTitle(m) {
                if (!m) return 'A job';
                if (m.type === 'bounty') return m.targetName || 'Bounty';
                if (m.type === 'delivery') return `To ${m.targetLabel || 'the apartments'}`;
                return String(m.title || 'Salvage').replace(/^SALVAGE: /, '').toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase());
            },
            _briefCard(rec) {
                const d = rec.data || {}, m = d.mission || {};
                const card = document.createElement('div');
                card.className = 'mb-card mb-brief';
                const k = document.createElement('div'); k.className = 'k';
                k.textContent = `Job · ${m.type === 'bounty' ? 'Bounty' : m.type === 'delivery' ? 'Delivery' : 'Salvage'}`;
                const b = document.createElement('b'); b.textContent = this._jobTitle(m);
                const p = document.createElement('p'); p.textContent = m.description || '';
                if (m.type === 'delivery' && m.handed) p.textContent += ' · Courier brings the box to you';
                if (m.type === 'delivery' && m.km) p.textContent += ` · ${(m.km / 1000).toFixed(1)} km`;
                const row = document.createElement('div'); row.className = 'row';
                const pay = document.createElement('span'); pay.textContent = `${m.reward || 0} PP · ${m.scrapReward || 0} scrap`;
                row.appendChild(pay);
                if (d.state === 'open') {
                    const btn = document.createElement('button');
                    btn.className = 'mb-btn';
                    btn.textContent = 'Accept';
                    btn.addEventListener('click', e => { e.stopPropagation(); this.acceptBrief(rec); });
                    row.appendChild(btn);
                } else {
                    const st = document.createElement('em');
                    st.textContent = d.state === 'accepted' ? '✓ On the tracker' : 'Taken by someone else';
                    row.appendChild(st);
                    card.classList.add(d.state);
                }
                card.append(k, b, p, row);
                // Where it is: the same map crop a pin gets, with its own pin
                const spot = this._jobSpot(m), url = spot && this._pinMap(spot);
                if (url) {
                    const map = document.createElement('div');
                    map.className = 'mb-map mb-brief-map';
                    map.style.backgroundImage = `url(${url})`;
                    map.appendChild(document.createElement('i'));
                    card.insertBefore(map, row);
                }
                return card;
            },
            /** A job's spot for a pin: { x, y, label, kind } (the drop-off, the mark's corner, the salvage site) */
            _jobSpot(m) {
                if (!m || typeof m.targetX !== 'number') return null;
                if (m.type === 'delivery') return { x: m.targetX, y: m.targetY, label: m.targetLabel || 'Drop-off', kind: `Drop-off · ${m.targetKind || 'Apartments'}` };
                if (m.type === 'bounty') return { x: m.targetX, y: m.targetY, label: m.near ? `Outside the ${m.near.toLowerCase()}` : 'Last seen', kind: `${m.targetName || 'The mark'} · last seen` };
                return { x: m.targetX, y: m.targetY, label: this._jobTitle(m), kind: 'Salvage site' };
            },
            /** Take the job: it goes on the tracker exactly as if the bartender or barista had handed it over */
            acceptBrief(rec) {
                const g = game, d = rec.data;
                if (!g.missions || !d || d.state !== 'open') return;
                const m = JSON.parse(JSON.stringify(d.mission));
                m.id = `${m.type}_${Date.now()}`;
                if (!g.missions.acceptMission(m, g)) return;     // a job's already running: it says so
                d.state = 'accepted';
                if (m.type === 'delivery' && m.handed) showMessage('AMBER\'S COURIER HANDS YOU THE PACKAGE. WALK IT TO THE DOOR.');
                else if (m.type === 'delivery') { if (g.returnVanHome) g.returnVanHome(); showMessage('PICK UP THE PACKAGE FROM THE AMBER DELIVERY VEHICLE AT COZY CAFE.'); }
                if (!(m.type === 'delivery' && !m.handed)) { const spot = this._jobSpot(m); if (spot) this.setWaypoint(spot); }
                if (this._activeContact) this.renderThread(this._activeContact);
            },
            sendBrief(who, type, text, opts) {
                const g = game, M = g && g.missions;
                if (!M) return false;
                const m = type === 'delivery' ? M.generateDelivery(g, opts) : type === 'salvage' ? M.generateSalvage(g) : M.generateBounty(g);
                if (!m) return false;
                // One open job on the phone at a time: an older one goes to someone else
                for (const n in this.messageHistory) for (const r of this.messageHistory[n]) if (r.kind === 'brief' && r.data && r.data.state === 'open') r.data.state = 'lapsed';
                this.sendText(who, text, true, 2000, { kind: 'brief', id: `brief_${m.id}`, data: { mission: m, state: 'open' } });
                return true;
            },

            /* ───────────────────────── voice notes ───────────────────────── */
            _voiceSecs(lines) { return Math.max(3, Math.round(lines.reduce((s, l) => s + 0.9 + l.length * 0.065, 0))); },
            _voiceBubble(contact, rec) {
                const d = rec.data || {}, secs = d.secs || this._voiceSecs(d.lines || [rec.text]);
                const v = document.createElement('div');
                v.className = 'mb-voice' + (d.heard ? '' : ' fresh');
                v.dataset.vid = rec.id;
                const play = document.createElement('button');
                play.className = 'mb-play';
                play.textContent = '▶';
                play.addEventListener('click', e => { e.stopPropagation(); this.playVoice(contact, rec); });
                const wave = document.createElement('div');
                wave.className = 'mb-wave';
                let h = 7;
                for (const ch of String(rec.id || rec.text)) h = (h * 31 + ch.charCodeAt(0)) % 9973;
                for (let i = 0; i < 26; i++) {
                    h = (h * 1103 + 12345) % 9973;
                    const bar = document.createElement('i');
                    bar.style.height = `${22 + (h % 70) * (0.6 + 0.4 * Math.sin(i / 3))}%`;
                    wave.appendChild(bar);
                }
                const t = document.createElement('small');
                t.textContent = `0:${String(secs).padStart(2, '0')}`;
                v.append(play, wave, t);
                return v;
            },
            /**
             * Play a voice note: the waveform fills, and the earpiece subtitle (a comms
             * chip in the speaker's caption colour) runs line by line under it.
             */
            playVoice(contact, rec) {
                if (this._voice && this._voice.rec === rec) { this._stopVoice(); this.renderThread(contact); return; }
                this._stopVoice();
                const d = rec.data || (rec.data = {});
                const lines = d.lines || [rec.text], secs = d.secs || this._voiceSecs(lines);
                const total = lines.reduce((s, l) => s + 1 + l.length, 0);
                let acc = 0;
                const marks = lines.map(l => { const at = acc / total; acc += 1 + l.length; return at; });
                d.heard = true;
                this._voice = { rec, contact, lines, marks, secs, t0: performance.now(), line: -1 };
                audioSys.sfx('ui');
                this._resumeVoice();
            },
            _resumeVoice() {
                const V = this._voice;
                if (!V || !V.rec.id) return;
                const step = () => {
                    if (this._voice !== V) return;
                    const el = document.querySelector(`.mb-voice[data-vid="${V.rec.id}"]`);
                    const p = Math.min(1, (performance.now() - V.t0) / (V.secs * 1000));
                    if (el) {
                        el.classList.add('playing'); el.classList.remove('fresh');
                        el.querySelector('.mb-play').textContent = '❚❚';
                        const bars = el.querySelectorAll('.mb-wave i');
                        bars.forEach((b, i) => b.classList.toggle('lit', i / bars.length < p));
                        let li = 0;
                        V.marks.forEach((m, i) => { if (p >= m) li = i; });
                        let sub = el.parentElement.querySelector('.mb-sub');
                        if (!sub) {
                            sub = this._subChip(V.contact.group ? (V.rec.who || '') : V.contact.name);
                            el.parentElement.appendChild(sub);
                        }
                        if (li !== V.line || !sub.dataset.line) {
                            V.line = li;
                            sub.dataset.line = li;
                            const txt = sub.querySelector('.comm-text');
                            txt.textContent = V.lines[li];
                            txt.style.animation = 'none'; void txt.offsetWidth; txt.style.animation = '';
                        }
                    }
                    if (p >= 1) { setTimeout(() => { if (this._voice === V) { this._voice = null; if (this._activeContact) this.renderThread(this._activeContact); } }, 1600); return; }
                    V.raf = requestAnimationFrame(step);
                };
                cancelAnimationFrame(V.raf);
                V.raf = requestAnimationFrame(step);
            },
            _stopVoice() {
                if (this._voice) cancelAnimationFrame(this._voice.raf);
                this._voice = null;
            },
            /** The earpiece chip (ui/comms.js's look), held in the thread under the note */
            _subChip(speaker) {
                const chip = document.createElement('div');
                chip.className = 'comm-chip mb-sub';
                chip.style.setProperty('--who', this._color(speaker));
                const face = this._face(speaker, 'comm-face', 64);
                const body = document.createElement('div'); body.className = 'comm-body';
                const name = document.createElement('div'); name.className = 'comm-name'; name.textContent = speaker;
                const sig = document.createElement('span'); sig.className = 'comm-sig'; sig.innerHTML = '<i></i><i></i><i></i>';
                name.appendChild(sig);
                const line = document.createElement('div'); line.className = 'comm-text';
                body.append(name, line);
                chip.append(face, body);
                return chip;
            },
            sendVoice(who, lines, id) {
                this.sendText(who, lines.join(' '), true, 2400, { kind: 'voice', id: id || `voice_${who}_${this._now()}`, data: { lines, secs: this._voiceSecs(lines), heard: false } });
            },

            /* ───────────────────────── snapshots ───────────────────────── */
            _snapCard(contact, rec) {
                const d = rec.data || {};
                const card = document.createElement('div');
                card.className = 'mb-card mb-snap';
                const img = new Image();
                img.alt = '';
                if (rec.from === 'me') {
                    if (d.img) img.src = d.img; else card.classList.add('gone');
                } else {
                    const url = this._paintSnap(rec, contact.group ? rec.who : contact.name);
                    if (url) img.src = url;
                }
                card.appendChild(img);
                const P = d.place && MSG_PLACES[d.place];
                if (P) { const tag = document.createElement('span'); tag.textContent = `📍 ${P.label}`; card.appendChild(tag); }
                if (rec.from === 'me' && !d.img) { const tag = document.createElement('span'); tag.textContent = 'Photo no longer kept'; card.appendChild(tag); }
                return card;
            },
            /**
             * Their photo, painted: the place (a night-lit backdrop for its kind of spot)
             * and them in it, their own portrait wearing the photo's mood. Kept for the
             * session; nothing is stored in the save.
             */
            _paintSnap(rec, who) {
                const key = (rec.id || rec.text) + '|' + who;
                if (this._snapCache.has(key)) return this._snapCache.get(key);
                const d = rec.data || {}, P = MSG_PLACES[d.place] || MSG_PLACES.double_nights;
                let url = null;
                try {
                    const W = 480, H = 300, c = document.createElement('canvas');
                    c.width = W; c.height = H;
                    const ctx = c.getContext('2d');
                    let seed = 0; for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) % 99991;
                    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
                    const g = ctx.createLinearGradient(0, 0, 0, H);
                    g.addColorStop(0, P.tint[0]); g.addColorStop(1, P.tint[1]);
                    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                    this._snapScene(ctx, W, H, P, rnd);
                    // Bokeh: out-of-focus lights of the place
                    for (let i = 0; i < 22; i++) {
                        const x = rnd() * W, y = rnd() * H * 0.75, r = 6 + rnd() * 22, col = P.glow[i % P.glow.length];
                        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
                        rg.addColorStop(0, col + 'aa'); rg.addColorStop(0.7, col + '33'); rg.addColorStop(1, col + '00');
                        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
                    }
                    // Them, a little off-centre, as a phone held at arm's length frames a face
                    const cfg = typeof game !== 'undefined' && game && game.resolvePortraitConfig ? game.resolvePortraitConfig(who) : null;
                    if (cfg && !cfg.isFallback) {
                        const S = 300, f = document.createElement('canvas');
                        f.width = f.height = S;
                        drawCharacterPortrait(f.getContext('2d'), S, S, { ...cfg, backdrop: false, expression: d.mood || 'smile' });
                        ctx.save();
                        ctx.translate(W * 0.62, H * 0.56); ctx.rotate(-0.04);
                        ctx.drawImage(f, -S / 2, -S / 2 + 20, S, S);
                        ctx.restore();
                    }
                    // The phone's look: warm lift, vignette
                    ctx.globalCompositeOperation = 'soft-light';
                    ctx.fillStyle = P.glow[0] + '55'; ctx.fillRect(0, 0, W, H);
                    ctx.globalCompositeOperation = 'source-over';
                    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
                    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
                    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
                    url = c.toDataURL('image/jpeg', 0.82);
                } catch (e) { url = null; }
                this._snapCache.set(key, url);
                if (this._snapCache.size > 24) this._snapCache.delete(this._snapCache.keys().next().value);
                return url;
            },
            /** The place behind them, by kind: neon for a club, warm panes for a cafe, a shutter for a garage… */
            _snapScene(ctx, W, H, P, rnd) {
                const glow = (x, y, w, h, col, a = 0.85) => {
                    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 18; ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(x, y, w, h); ctx.restore();
                };
                if (P.look === 'club') {
                    for (let i = 0; i < 5; i++) glow(20 + i * 70 + rnd() * 20, 30 + rnd() * 40, 40 + rnd() * 40, 4, P.glow[i % 3]);
                    ctx.save(); ctx.strokeStyle = P.glow[1]; ctx.shadowColor = P.glow[1]; ctx.shadowBlur = 16; ctx.lineWidth = 4;
                    ctx.beginPath(); ctx.arc(120, 150, 70, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.restore();
                    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, H * 0.78, W, H * 0.22);
                } else if (P.look === 'cafe') {
                    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
                        ctx.fillStyle = `rgba(255, 190, 110, ${0.18 + rnd() * 0.25})`; ctx.fillRect(16 + i * 64, 40 + r * 74, 54, 64);
                    }
                    for (let i = 0; i < 3; i++) { const x = 50 + i * 90; ctx.strokeStyle = 'rgba(255,220,160,0.35)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 26); ctx.stroke(); glow(x - 9, 26, 18, 8, '#ffcf8a'); }
                    ctx.fillStyle = 'rgba(40, 18, 8, 0.75)'; ctx.fillRect(0, H * 0.8, W, H * 0.2);
                } else if (P.look === 'garage') {
                    ctx.fillStyle = 'rgba(160, 160, 190, 0.12)';
                    for (let y = 30; y < H * 0.7; y += 10) ctx.fillRect(10, y, 230, 4);
                    glow(10, 20, 230, 5, P.glow[0]);
                    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.ellipse(130, H * 0.82, 120, 34, 0, 0, Math.PI * 2); ctx.fill();
                    glow(30, H * 0.78, 30, 6, '#ff3a3a'); glow(200, H * 0.78, 30, 6, '#ff3a3a');
                } else if (P.look === 'clinic') {
                    glow(60, 50, 60, 18, P.glow[0]); glow(81, 29, 18, 60, P.glow[0]);
                    ctx.fillStyle = 'rgba(200, 255, 255, 0.07)'; ctx.fillRect(0, 140, W, 8); ctx.fillRect(0, 200, W, 4);
                } else if (P.look === 'park') {
                    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7);
                    sky.addColorStop(0, '#3a1a5a'); sky.addColorStop(0.6, '#c0507a'); sky.addColorStop(1, '#ffb070');
                    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * 0.7);
                    glow(70, H * 0.55, 60, 3, '#ffe0a0', 0.6);
                    ctx.fillStyle = '#120818';
                    for (let i = 0; i < 6; i++) { const x = rnd() * W, r = 24 + rnd() * 30; ctx.beginPath(); ctx.arc(x, H * 0.66, r, 0, Math.PI * 2); ctx.fill(); }
                    ctx.fillRect(0, H * 0.66, W, H * 0.34);
                } else {
                    for (let i = 0; i < 40; i++) {
                        ctx.fillStyle = rnd() < 0.5 ? `rgba(232, 194, 122, ${0.15 + rnd() * 0.3})` : 'rgba(255,255,255,0.04)';
                        ctx.fillRect(10 + (i % 8) * 30, 20 + Math.floor(i / 8) * 34, 18, 22);
                    }
                    glow(0, H * 0.8, W, 3, P.glow[0], 0.5);
                }
            },
            sendSnap(who, place, mood, text, id) {
                this.sendText(who, text, true, 2200, { kind: 'snap', id: id || `snap_${who}_${this._now()}`, data: { place, mood } });
            },
            /** Her snapshot: a frame of the game view (as an imprint keeps one), sent to whoever's open */
            sendSnapshot(contact) {
                if (!contact || this._awaitingThem) return;
                let img = null;
                try {
                    const src = document.getElementById('game-canvas');
                    if (src && src.width) {
                        const w = 320, h = Math.round(w * src.height / src.width), c = document.createElement('canvas');
                        c.width = w; c.height = h;
                        c.getContext('2d').drawImage(src, 0, 0, w, h);
                        img = c.toDataURL('image/jpeg', 0.7);
                    }
                } catch (e) { img = null; }
                if (!img) { showMessage('NO PICTURE TO SEND'); return; }
                const place = this._whereAmI();
                const mine = this.addMessage(contact.name, '', false, 'me', { kind: 'snap', id: `snap_me_${Date.now()}`, awaiting: true, data: { img, place } });
                this._trimSnaps();
                this.lastMessageAt[contact.name] = this._now();
                audioSys.sfx('ui');
                this.renderThread(contact, true);
                const who = contact.group ? this._someCrew() : contact.name;
                this._answer(contact, mine, { text: MSG_SNAP_REPLIES[who] || 'Nice.', who: contact.group ? who : undefined });
            },
            /** Which pinned place she's nearest (for the photo's tag), if she's in the city and close to one */
            _whereAmI() {
                const g = game, p = g && g.player;
                if (!p || !g.activeMap || g.activeMap.id !== 'sdc') return null;
                let best = null, bd = 900;
                for (const id in MSG_PLACES) {
                    const P = this._place(id), dd = Math.hypot(P.tx - p.x, P.ty - p.y);
                    if (dd < bd) { bd = dd; best = id; }
                }
                return best;
            },
            /** Only her newest six photos keep their picture, so the save stays small */
            _trimSnaps() {
                const all = [];
                for (const n in this.messageHistory) for (const r of this.messageHistory[n]) if (r.kind === 'snap' && r.from === 'me' && r.data && r.data.img) all.push(r);
                all.sort((a, b) => String(b.id).localeCompare(String(a.id)));
                all.slice(6).forEach(r => { r.data.img = null; });
            },

            /* ───────────────────────── the group chat ───────────────────────── */
            /**
             * After a job: the crew's take, in the group chat. Who opens is someone
             * who came along; it reads the job (bounty / delivery / salvage) and how it
             * went (rough if she came out hurt or someone went down, quick under half
             * an hour, clean if she's barely scratched); anyone down says so, anyone
             * left home complains, and sometimes it ends with a pin to Moon City.
             */
            crewBanter(m, g) {
                if (!m || !g) return;
                const p = g.player, hp = p && p.maxHp ? p.hp / p.maxHp : 1;
                const crew = (g.teammates || []).filter(t => MSG_CREW.includes(t.name));
                const came = crew.filter(t => t.recruited && !t.downed).map(t => t.name);
                const down = crew.filter(t => t.recruited && t.downed).map(t => t.name);
                const home = crew.filter(t => !t.recruited).map(t => t.name);
                const mins = g.worldMinutes - (m.startTime != null ? m.startTime : g.worldMinutes);
                const how = down.length || hp < 0.35 ? 'rough' : mins < 30 ? 'quick' : hp > 0.75 ? 'clean' : 'fine';
                const pick = a => a[Math.floor(Math.random() * a.length)];
                const fill = s => s.replace(/\{mark\}/g, m.targetName || 'the mark').replace(/\{reward\}/g, m.reward || 0);
                const lines = [];
                const voices = came.length ? came.slice() : ['Josh'];
                const first = pick(voices);
                lines.push({ who: first, text: fill(MSG_BANTER[how][first]) });
                const typeLines = MSG_BANTER_TYPE[m.type] || {};
                const others = voices.filter(n => n !== first && typeLines[n]);
                const second = others.length ? pick(others) : first !== 'Josh' ? 'Josh' : null;
                if (second && typeLines[second]) lines.push({ who: second, text: fill(typeLines[second]) });
                if (down.length) { const d = pick(down); lines.push({ who: d, text: MSG_BANTER_DOWN[d] }); }
                if (home.length && Math.random() < 0.8) { const h = pick(home); lines.push({ who: h, text: MSG_BANTER_LEFT[h] }); }
                // Sometimes it ends with drinks: a crew night at Moon City (story/crew-nights.js)
                if (Math.random() < 0.35 && this.crewGroupInvite) this.crewGroupInvite();

                const stamp = Date.now();
                let at = 2600;
                lines.forEach((l, i) => {
                    setTimeout(() => this._typingAs(l.who, true), at);
                    at += 1300 + l.text.length * 25;
                    setTimeout(() => {
                        this._typingAs(l.who, false);
                        this._deliverMessage(MSG_GROUP, l.text, { who: l.who, id: `banter_${stamp}_${i}`, ...(l.pin ? { kind: 'pin', data: { place: l.pin } } : {}) });
                    }, at);
                    at += 500 + Math.random() * 700;
                });
            },
            _typingAs(who, on) {
                this._typingWho[MSG_GROUP] = on ? who : null;
                this.setTyping(MSG_GROUP, on);
            },

            /* ───────────────────────── the feed ───────────────────────── */
            /** After chapter 1 the city texts back */
            _freePlay() {
                const S = typeof game !== 'undefined' && game && game.story;
                if (!S || !S.state) return false;
                if (S.state.part > 1) return true;
                return S.isBefore ? !S.isBefore('CHAPTER_COMPLETE') : false;
            },
            _feedTick() {
                const g = typeof game !== 'undefined' && game;
                if (!g || !g.activeMap || !g.player) return;
                if (this.feed.pendingPin && g.activeMap.id === 'sdc' && !g.navDestination) this.setWaypoint(this.feed.pendingPin);
                if (!this._freePlay() || (g.scenes && g.scenes.running) || (g.pauseSystem && g.pauseSystem.tokens && g.pauseSystem.tokens.size)) return;
                const now = g.worldMinutes;
                if (this.feed.nextAt == null || this.feed.nextAt - now > 600) { this.feed.nextAt = now + 20; return; }
                if (now < this.feed.nextAt) return;
                this.feed.nextAt = now + 150 + Math.floor(Math.random() * 120);
                this.feedNext();
            },
            /** Send the next thing someone writes on their own: a job when she's free (a third of the time), else a place, a photo or a voice note */
            feedNext() {
                const g = game;
                const briefOpen = Object.values(this.messageHistory).some(h => h.some(r => r.kind === 'brief' && r.data && r.data.state === 'open'));
                if (g.missions && !g.missions.activeMission && !briefOpen && Math.random() < 0.35) {
                    const opts = MSG_BRIEFS.filter(b => !b.needs || b.needs(g));
                    const b = opts[Math.floor(Math.random() * opts.length)];
                    if (b && this.sendBrief(b.who, b.type, b.text)) return b;
                }
                const left = MSG_FEED.filter(e => !this.feed.done[e.id] && (!e.needs || e.needs(g)));
                if (!left.length) return null;
                const e = left[Math.floor(Math.random() * left.length)];
                this.feed.done[e.id] = 1;
                if (e.kind === 'pin') { if (!(this.crewPlanFromPin && this.crewPlanFromPin(e))) this.dropPin(e.who, e.place, e.text); }
                else if (e.kind === 'snap') this.sendSnap(e.who, e.place, e.mood, e.text, e.id);
                else if (e.kind === 'voice') this.sendVoice(e.who, e.lines, e.id);
                return e;
            },
            resetFeed() { this.feed = { nextAt: null, done: {}, pendingPin: null }; this._snapCache.clear(); this._mapCache.clear(); },
        });

        // Tabs, the camera, and the feed's clock
        document.querySelectorAll('#msg-tabs button').forEach(b => b.addEventListener('click', () => { phoneSystem.msgTab = b.dataset.tab; phoneSystem.renderContacts(); }));
        document.getElementById('contact-reply-snap').addEventListener('click', () => phoneSystem.sendSnapshot(phoneSystem._activeContact));
        setInterval(() => { try { phoneSystem._feedTick(); } catch (e) { console.error(e); } }, 1000);
