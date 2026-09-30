        // ─── BONDING SYSTEM ──────────────────────────────────────────────────
        //  Relationship-building conversations at the apartment.
        //  Per-character, per-tier dialogue pools with multi-line exchanges.
        //  Cooldown resets each time the player sleeps.
        // ────────────────────────────────────────────────────────────────────────

        const BONDING_DIALOGUES = {
            Victoria: {
                0: [ // Acquaintance (0-24)
                    [
                        { speaker: 'Victoria', text: "You just gonna stand there or did you actually want something?" },
                        { speaker: '949', text: "Just checking in." },
                        { speaker: 'Victoria', text: "Checking in. Cute. Well, I'm still here. Still armed. Still better than whoever's out there trying to kill us." },
                        { speaker: '949', text: "Good to know." },
                        { speaker: 'Victoria', text: "...Yeah. It is.", mood: 'smile' }
                    ],
                    [
                        { speaker: 'Victoria', text: "This apartment's alright. Small though. You ever think about getting a place with more room to store ammunition?" },
                        { speaker: '949', text: "Not really a priority." },
                        { speaker: 'Victoria', text: "It should be. I've got crates stacked in the corner over there. Organization is half the battle, Freelancer." }
                    ]
                ],
                1: [ // Companion (25-49)
                    [
                        { speaker: 'Victoria', text: "You know, I had a corner office once. Real glass. Real view. The kind of place people kill for." },
                        { speaker: '949', text: "What happened?" },
                        { speaker: 'Victoria', text: "I found out what they were actually doing with the weapons I was testing. So I took the prototype and walked out." },
                        { speaker: '949', text: "Just like that?" },
                        { speaker: 'Victoria', text: "Just like that. The glass was bulletproof, by the way. I checked on my way out.", mood: 'smirk' }
                    ],
                    [
                        { speaker: 'Victoria', text: "Most people I've worked with are dead or corporate. Same thing, really." },
                        { speaker: '949', text: "Which am I?" },
                        { speaker: 'Victoria', text: "Neither. That's why I'm still here." }
                    ]
                ],
                2: [ // Trusted (50-74)
                    [
                        { speaker: 'Victoria', text: "I don't say this often and I'll deny it if you repeat it. But this crew? This is the closest thing to family I've had in years." },
                        { speaker: '949', text: "You don't have to deny it." },
                        { speaker: 'Victoria', text: "...Fine. But if Max makes one more joke about my hair, I'm putting him through the wall. Lovingly.", mood: 'annoyed' }
                    ]
                ],
                3: [ // Inner Circle (75-100)
                    [
                        { speaker: 'Victoria', text: "Freelancer. Whatever happens out there — whatever comes through those dimensions — I've got you. No hesitation. No questions." },
                        { speaker: '949', text: "I know." },
                        { speaker: 'Victoria', text: "Good. Now let's go break something.", mood: 'grin' }
                    ]
                ]
            },
            Yenna: {
                0: [
                    [
                        { speaker: 'Yenna', text: "The wind pattern shifts three degrees between 2 AM and 4 AM from that balcony. Affects trajectory past 600 meters." },
                        { speaker: '949', text: "You've been measuring wind from the apartment?" },
                        { speaker: 'Yenna', text: "Observing. There's a difference." }
                    ],
                    [
                        { speaker: 'Yenna', text: "You move well. Not military-trained, but there's something else. Instinct, maybe." },
                        { speaker: '949', text: "I don't know where it comes from." },
                        { speaker: 'Yenna', text: "That's what makes it dangerous. And useful." }
                    ]
                ],
                1: [
                    [
                        { speaker: 'Yenna', text: "I served three tours in the Rim Conflicts. Saw things that don't make tactical sense. Things that shouldn't exist." },
                        { speaker: '949', text: "Dimensional anomalies?" },
                        { speaker: 'Yenna', text: "That's the polite term. We called them rips. My unit walked into one. I walked out alone.", mood: 'sad' },
                        { speaker: '949', text: "Yenna..." },
                        { speaker: 'Yenna', text: "I don't need sympathy. I need purpose. This crew gives me that." }
                    ]
                ],
                2: [
                    [
                        { speaker: 'Yenna', text: "I've been watching the team dynamics. Victoria leads with force. Sabrina deflects with humor. Max combusts. Josh calculates." },
                        { speaker: '949', text: "And me?" },
                        { speaker: 'Yenna', text: "You hold it together. That's the hardest job. And you don't even notice you're doing it." }
                    ]
                ],
                3: [
                    [
                        { speaker: 'Yenna', text: "I don't form attachments easily. But I want you to know — my scope covers you first. Always." },
                        { speaker: '949', text: "That means a lot, Yenna." },
                        { speaker: 'Yenna', text: "It's not sentiment. It's strategy. You're the one worth keeping alive." }
                    ]
                ]
            },
            Sabrina: {
                0: [
                    [
                        { speaker: 'Sabrina', text: "Oh look, the Freelancer wants to chat. Should I put on tea? Light some candles? Summon a minor demon for ambiance?" },
                        { speaker: '949', text: "Just tea is fine." },
                        { speaker: 'Sabrina', text: "Boring. But sure.", mood: 'smirk' }
                    ],
                    [
                        { speaker: 'Sabrina', text: "You know what I like about this apartment? The walls don't bleed. Low bar, but I've lived in worse." },
                        { speaker: '949', text: "Where was that?" },
                        { speaker: 'Sabrina', text: "Nice try. We're not there yet." }
                    ]
                ],
                1: [
                    [
                        { speaker: 'Sabrina', text: "The dark energy thing isn't learned. I was born with it. Mom called it a gift. Dad called it a curse. They were both right." },
                        { speaker: '949', text: "How do you control it?" },
                        { speaker: 'Sabrina', text: "Control is a strong word. I aim it. Big difference." },
                        { speaker: '949', text: "That's terrifying.", mood: 'surprised' },
                        { speaker: 'Sabrina', text: "I know, right? Kind of awesome though.", mood: 'grin' }
                    ]
                ],
                2: [
                    [
                        { speaker: 'Sabrina', text: "I use sarcasm like armor. You've probably noticed." },
                        { speaker: '949', text: "Little bit." },
                        { speaker: 'Sabrina', text: "It's easier than admitting that I actually care what happens to these idiots. And to you." },
                        { speaker: '949', text: "The armor's down right now." },
                        { speaker: 'Sabrina', text: "Don't get used to it. But... yeah. It is.", mood: 'sultry' }
                    ]
                ],
                3: [
                    [
                        { speaker: 'Sabrina', text: "You're the first person who didn't flinch when they saw what I can do. Not once." },
                        { speaker: '949', text: "Why would I?" },
                        { speaker: 'Sabrina', text: "Because it scares me sometimes. And I'm the one doing it. So thanks for that. Seriously." }
                    ]
                ]
            },
            Max: {
                0: [
                    [
                        { speaker: 'Max', text: "Yo! Finally some company. I was about to start talking to the walls. Again." },
                        { speaker: '949', text: "Again?" },
                        { speaker: 'Max', text: "They don't talk back. It's actually kind of peaceful. Don't judge me." }
                    ],
                    [
                        { speaker: 'Max', text: "Hey, check this out — *bzzt*" },
                        { speaker: '949', text: "Did you just shock the toaster?", mood: 'surprised' },
                        { speaker: 'Max', text: "It was being slow. I helped. That's what I do. I help." }
                    ]
                ],
                1: [
                    [
                        { speaker: 'Max', text: "The sparks aren't just some cool party trick. My nervous system is overclocked. Always has been. Too much electricity, not enough... ground." },
                        { speaker: '949', text: "Is that why you're always moving?" },
                        { speaker: 'Max', text: "If I stop, I feel like I'll explode. Not metaphorically. I mean actually explode.", mood: 'worried' },
                        { speaker: '949', text: "That sounds exhausting." },
                        { speaker: 'Max', text: "It is. But it also means I'll never let you down in a fight. Can't slow down even if I wanted to." }
                    ]
                ],
                2: [
                    [
                        { speaker: 'Max', text: "People think I'm crazy. And like, fair. But there's a reason I burn hot." },
                        { speaker: '949', text: "What's the reason?" },
                        { speaker: 'Max', text: "Because the people I care about are worth burning for. This team. You. I'd fry every circuit in my body if it meant keeping you safe." },
                        { speaker: '949', text: "Max..." },
                        { speaker: 'Max', text: "Don't make it weird. I'm still gonna shock your toaster." }
                    ]
                ],
                3: [
                    [
                        { speaker: 'Max', text: "You ever notice I don't spark around you anymore? My hands are steady." },
                        { speaker: '949', text: "I hadn't noticed." },
                        { speaker: 'Max', text: "First time that's happened. Ever. You're like a ground wire for me, Freelancer. Don't know what I'd do without this crew." }
                    ]
                ]
            },
            Josh: {
                0: [
                    [
                        { speaker: 'Josh', text: "The apartment's network security is inadequate. I've already patched three vulnerabilities." },
                        { speaker: '949', text: "Thanks, Josh." },
                        { speaker: 'Josh', text: "Acknowledgment noted." }
                    ],
                    [
                        { speaker: 'Josh', text: "You've approached me voluntarily. This is the first time. I'm logging it." },
                        { speaker: '949', text: "You don't have to log everything." },
                        { speaker: 'Josh', text: "Incorrect. Patterns in social interaction predict mission outcomes with 73% accuracy." }
                    ]
                ],
                1: [
                    [
                        { speaker: 'Josh', text: "I started hacking at age eleven. Not because I wanted to break things. Because I wanted to understand how they worked." },
                        { speaker: '949', text: "And now?" },
                        { speaker: 'Josh', text: "Now I understand how most things work. People are the exception. You are a significant exception." },
                        { speaker: '949', text: "Is that good or bad?" },
                        { speaker: 'Josh', text: "Undetermined. But I find the uncertainty... acceptable." }
                    ]
                ],
                2: [
                    [
                        { speaker: 'Josh', text: "I ran probability models on crew survival rates. With you leading, they're 340% higher than baseline." },
                        { speaker: '949', text: "That's just math, Josh." },
                        { speaker: 'Josh', text: "No. I factored out tactical variables. The remaining variable is morale. You make people want to survive. That's not math. That's... something else." }
                    ]
                ],
                3: [
                    [
                        { speaker: 'Josh', text: "Emotional attachment detected. Subject: you. And the team. Severity: significant. Recommended action: none. I don't want it to stop." },
                        { speaker: '949', text: "Josh, that might be the most human thing you've ever said.", mood: 'smile' },
                        { speaker: 'Josh', text: "...Don't tell Max.", mood: 'smile' }
                    ]
                ]
            }
        };

        const BONDING_TIERS = [
            // `ring` drives the contacts-app avatar border. Kept here so tier colour
            // has one definition — anything else showing tier state reads it from
            // the same place rather than hardcoding a parallel palette.
            { name: 'Acquaintance', min: 0,  message: null,                             ring: 'rgba(150,150,160,0.45)' },
            { name: 'Companion',    min: 25, message: 'BOND DEEPENED — COMPANION',      ring: 'rgba(196,86,110,0.75)' },
            { name: 'Trusted',      min: 50, message: 'BOND DEEPENED — TRUSTED ALLY',   ring: 'rgba(255,60,120,0.9)' },
            { name: 'Inner Circle', min: 75, message: 'BOND DEEPENED — INNER CIRCLE',   ring: '#ff0055' },
        ];

        const APT_IDLE_POSITIONS = {
            // pose: what they do while they're here (see ui/poses.js)
            'Victoria': { x: 400, y: 130, pose: 'lean_rail' },     // Balcony — gazing out
            'Yenna':    { x: 200, y: 450, pose: 'arms_crossed' },  // Living room corner — quiet vigil
            'Sabrina':  { x: 1100, y: 700, pose: 'lean' },         // Kitchen/bathroom area — leaning
            'Max':      { x: 500, y: 600, pose: 'fidget' },        // Center living room — restless
            'Josh':     { x: 700, y: 260, pose: 'typing' },        // Near terminal — always online
        };

        const SPEAKER_COLORS = {
            '949': '#daa520', 'Victoria': '#ff69b4', 'Yenna': '#5a8a5a',
            'Sabrina': '#a855f7', 'Max': '#3b82f6', 'Josh': '#94a3b8',
            'Biggs': '#ff8800', 'Dr. Yin': '#00f3ff', 'Prisma': '#b06aff',
            'Barista Ren': '#cd853f', 'Torque': '#e8972a', 'Bartender': '#ff2277',
            'LUVSH4D3': '#ff44bb', 'Ms. Jean': '#ffd700', 'Larissa': '#8888cc',
            'Anavia': '#66ccaa', 'Contractor': '#cc4444', 'Grum North': '#aa5533',
            'Mirabel': '#c4566e',
        };

        // (Portraits are drawn from each character's look: APPEARANCES / lookFor / portraitOf in core/appearances.js.)

        // ─── DIALOGUE SEQUENCE ────────────────────────────────────────────────
        //  General-purpose multi-line dialogue player.
        //  Reusable for bonding, story beats, briefings, NPC lore, mid-mission comms.
        //
        //  Usage:
        //    game.dialogueSeq.play([
        //        { speaker: 'Larissa', text: 'We have a problem.' },
        //        { speaker: '949',     text: "When don't we?" },
        //    ], {
        //        finalButtonText: 'End Briefing',
        //        speakerColors: { '949': '#daa520', 'Larissa': '#8888cc' },
        //        onComplete: () => startMission()
        //    });
        // ──────────────────────────────────────────────────────────────────────
        // ============================================================================
        //  DIALOGUE TRANSCRIPT — Captures every line displayed via DialogueSequence
        //  so players can re-read accidentally-skipped dialogue. Capped at MAX entries
        //  with FIFO eviction. Persisted across sessions via the save system.
        // ============================================================================
        class DialogueTranscript {
            constructor() {
                this.MAX_ENTRIES = 200;
                this.entries = []; // [{ ts: worldMinutes, speaker, text }]
            }

            /** Record a single dialogue line. Dedupes the immediate previous entry to
             *  guard against double-fires from re-renders (peeking, etc.). */
            add(speaker, text, worldMinutes) {
                if (!speaker || !text) return;
                const last = this.entries[this.entries.length - 1];
                if (last && last.speaker === speaker && last.text === text) return;
                this.entries.push({
                    ts: typeof worldMinutes === 'number' ? worldMinutes : 0,
                    speaker: String(speaker),
                    text: String(text)
                });
                // FIFO eviction
                if (this.entries.length > this.MAX_ENTRIES) {
                    this.entries.splice(0, this.entries.length - this.MAX_ENTRIES);
                }
            }

            clear() { this.entries = []; }

            /** Format a worldMinutes timestamp as "Day N — HH:MM". */
            formatTime(ts) {
                const totalMinutes = Math.max(0, Math.floor(ts));
                const day = Math.floor(totalMinutes / 1440) + 1;
                const minutes = totalMinutes % 1440;
                const h = Math.floor(minutes / 60);
                const m = minutes % 60;
                return { day, time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
            }

            serialize() {
                return {
                    entries: this.entries.map(e => ({ ts: e.ts, speaker: e.speaker, text: e.text }))
                };
            }

            deserialize(data) {
                if (!data) return;
                if (Array.isArray(data.entries)) {
                    this.entries = data.entries
                        .filter(e => e && typeof e.speaker === 'string' && typeof e.text === 'string')
                        .map(e => ({ ts: e.ts || 0, speaker: e.speaker, text: e.text }));
                    if (this.entries.length > this.MAX_ENTRIES) {
                        this.entries.splice(0, this.entries.length - this.MAX_ENTRIES);
                    }
                }
            }
        }

        class DialogueSequence {
            constructor(game) {
                this.game = game;
                this._active = null; // { lines, lineIndex, peekIndex, options }
            }

            /**
             * Play a multi-line dialogue sequence.
             * @param {Array<{speaker: string, text: string, mood?: string}>} lines  (mood: a name from EXPRESSIONS; otherwise read from the text)
             * @param {Object} [options]
             * @param {Function} [options.onComplete]       - Called after last line is dismissed
             * @param {string}   [options.finalButtonText]  - Button label on last line (default 'Done')
             * @param {string}   [options.continueText]     - Button label for middle lines (default 'Continue ▶')
             * @param {Object}   [options.speakerColors]    - { speakerName: '#hex' } for name coloring
             */
            play(lines, options = {}) {
                if (!lines || lines.length === 0) return;
                this._active = { lines, lineIndex: 0, peekIndex: null, options };

                const g = this.game;
                g.pauseSystem.acquire('dialogue');
                g.dialogueBox.style.display = 'block';
                g.dialogueBox.classList.remove('peeking');
                document.getElementById('dialogue-caption').style.display = 'none';

                g.btnAccept.textContent = options.continueText || 'Continue ▶';
                g.btnAccept.style.display = '';
                g.btnDecline.style.display = 'none';

                this._renderLine();
            }

            /** True iff the player is currently reviewing an earlier line in the sequence. */
            _isPeeking() {
                return this._active && this._active.peekIndex !== null;
            }

            /** Returns the index of the line to actually display (peek if peeking, else current). */
            _visibleIndex() {
                return this._isPeeking() ? this._active.peekIndex : this._active.lineIndex;
            }

            _renderLine() {
                const { lines, options } = this._active;
                const visibleIndex = this._visibleIndex();
                const line = lines[visibleIndex];
                const isLast = this._active.lineIndex >= lines.length - 1;
                const peeking = this._isPeeking();
                const g = this.game;

                g.npcNameEl.textContent = line.speaker;
                g.npcTextEl.textContent = line.text;

                // Speaker color (options override, then SPEAKER_COLORS fallback)
                const colors = options.speakerColors || {};
                g.npcNameEl.style.color = colors[line.speaker] || SPEAKER_COLORS[line.speaker] || '#ccc';

                // Render portrait for current speaker
                if (g.renderDialoguePortrait) g.renderDialoguePortrait(line.speaker, line.mood, line.text);

                // (Transcript capture is handled by GameEngine._installDialogueCapture's
                // MutationObserver — covers DialogueSequence AND single-line writes.)

                // Visual peek state
                g.dialogueBox.classList.toggle('peeking', peeking);

                // Nav button visibility
                const prevBtn = document.getElementById('btn-dialogue-prev');
                const nextBtn = document.getElementById('btn-dialogue-next');
                if (prevBtn) {
                    prevBtn.style.display = (visibleIndex > 0) ? '' : 'none';
                    prevBtn.disabled = (visibleIndex <= 0);
                }
                if (nextBtn) {
                    nextBtn.style.display = peeking ? '' : 'none';
                }

                // Continue button: hidden while peeking, visible normally
                g.btnAccept.style.display = peeking ? 'none' : '';
                if (!peeking) {
                    g.btnAccept.textContent = isLast
                        ? (options.finalButtonText || 'Done')
                        : (options.continueText || 'Continue ▶');
                }
            }

            /** Step backward into review mode (or further back if already peeking). */
            peekBack() {
                if (!this._active) return;
                if (this._active.peekIndex === null) {
                    if (this._active.lineIndex <= 0) return;
                    this._active.peekIndex = this._active.lineIndex - 1;
                } else if (this._active.peekIndex > 0) {
                    this._active.peekIndex--;
                }
                this._renderLine();
            }

            /** Step forward through reviewed lines. Exits peek mode when caught up. */
            peekForward() {
                if (!this._active || this._active.peekIndex === null) return;
                this._active.peekIndex++;
                if (this._active.peekIndex >= this._active.lineIndex) {
                    this._active.peekIndex = null; // caught up to live position
                }
                this._renderLine();
            }

            advance() {
                if (!this._active) return;
                // Advance always operates on the live position, not the peek position.
                this._active.peekIndex = null;
                this._active.lineIndex++;

                if (this._active.lineIndex >= this._active.lines.length) {
                    const onComplete = this._active.options.onComplete;
                    this._active = null;
                    this.game.endDialogue();
                    if (onComplete) onComplete();
                    return;
                }

                this._renderLine();
            }

            isActive() { return !!this._active; }

            /** Cancel without calling onComplete. */
            cancel() {
                this._active = null;
                this.game.endDialogue();
            }
        }

        class BondingSystem {
            constructor() {
                this.seenDialogues = {};      // { 'Victoria': { '0': [0,1], '1': [0] } }
                this.bondedThisRest = new Set();
                this.relationshipGain = 8;
            }

            getTier(relationship) {
                let tier = 0;
                for (let i = BONDING_TIERS.length - 1; i >= 0; i--) {
                    if (relationship >= BONDING_TIERS[i].min) { tier = i; break; }
                }
                return tier;
            }


            canBond(teammate) {
                if (!teammate.recruited) return false;
                if (this.bondedThisRest.has(teammate.name)) return false;
                return !!this._peekDialogue(teammate);
            }

            /** Pick a dialogue without marking it seen (for canBond check). */
            _peekDialogue(teammate) {
                const charDialogues = BONDING_DIALOGUES[teammate.name];
                if (!charDialogues) return null;
                const tier = this.getTier(teammate.relationship || 0);
                const pool = charDialogues[tier];
                return (pool && pool.length > 0) ? pool : null;
            }

            /** Pick and mark a dialogue as seen. Returns the lines array. */
            _pickDialogue(teammate) {
                const charDialogues = BONDING_DIALOGUES[teammate.name];
                if (!charDialogues) return null;

                const tier = this.getTier(teammate.relationship || 0);
                const tierKey = String(tier);
                const pool = charDialogues[tier];
                if (!pool || pool.length === 0) return null;

                const seen = (this.seenDialogues[teammate.name] || {})[tierKey] || [];
                const unseen = pool.map((d, i) => i).filter(i => !seen.includes(i));

                let pick;
                if (unseen.length === 0) {
                    pick = Math.floor(Math.random() * pool.length);
                } else {
                    pick = unseen[Math.floor(Math.random() * unseen.length)];
                    if (!this.seenDialogues[teammate.name]) this.seenDialogues[teammate.name] = {};
                    if (!this.seenDialogues[teammate.name][tierKey]) this.seenDialogues[teammate.name][tierKey] = [];
                    this.seenDialogues[teammate.name][tierKey].push(pick);
                }

                return pool[pick];
            }

            startBonding(teammate, game) {
                const lines = this._pickDialogue(teammate);
                if (!lines) return false;

                game.dialogueSeq.play(lines, {
                    finalButtonText: '♡ Bond',
                    speakerColors: { '949': '#daa520' },
                    onComplete: () => this._completeBonding(teammate, game)
                });
                return true;
            }

            _completeBonding(teammate, game) {
                const oldTier = this.getTier(teammate.relationship || 0);
                teammate.relationship = Math.min(100, (teammate.relationship || 0) + this.relationshipGain);
                const newTier = this.getTier(teammate.relationship);

                this.bondedThisRest.add(teammate.name);

                showMessage(`♡ ${teammate.name.toUpperCase()} +${this.relationshipGain} RELATIONSHIP`);
                audioSys.sfx('ui');

                if (newTier > oldTier && BONDING_TIERS[newTier].message) {
                    game.addPausableTimeout(() => {
                        showMessage(`${teammate.name.toUpperCase()}: ${BONDING_TIERS[newTier].message}`);
                    }, 1500);
                }
            }

            resetCooldowns() {
                this.bondedThisRest.clear();
            }

            serialize() {
                return {
                    seenDialogues: this.seenDialogues,
                    bondedThisRest: [...this.bondedThisRest]
                };
            }

            deserialize(data) {
                if (!data) return;
                this.seenDialogues = data.seenDialogues || {};
                this.bondedThisRest = new Set(data.bondedThisRest || []);
            }
        }
        
