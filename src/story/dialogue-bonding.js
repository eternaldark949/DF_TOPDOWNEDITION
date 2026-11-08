        // ─── BONDING SYSTEM ──────────────────────────────────────────────────
        //  Relationship-building conversations at the apartment.
        //  Per-character, per-tier dialogue pools with multi-line exchanges.
        //  Cooldown resets each time the player sleeps.
        // ────────────────────────────────────────────────────────────────────────

        const BONDING_DIALOGUES = GAME_DB.dialogue.bonding.dialogues;   // directory/game-db/dialogue.json

        const BONDING_TIERS = GAME_DB.dialogue.bonding.tiers;   // directory/game-db/dialogue.json

        const APT_IDLE_POSITIONS = GAME_DB.cast.apartment_idle;   // directory/game-db/cast.json

        /** Every speaker's colour, in one place: name tags, the dialogue box, captions, the phone and the
         *  cinematic subtitles (story/scenes/cast.js reads it). */
        const SPEAKER_COLORS = GAME_DB.cast.speaker_colors;   // directory/game-db/cast.json

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
                uiKit.show(g.dialogueBox);
                g.dialogueBox.classList.remove('peeking');
                uiKit.hide('dialogue-caption');

                g.btnAccept.textContent = options.continueText || 'Continue ▶';
                uiKit.show(g.btnAccept, '');
                uiKit.hide(g.btnDecline);

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

                // Name and colour before the text: the text write is what the
                // transcript and the box tint (screens-ui.js observers) react to.
                g.npcNameEl.textContent = line.speaker;
                const colors = options.speakerColors || {};
                g.npcNameEl.style.color = colors[line.speaker] || SPEAKER_COLORS[line.speaker] || '#ccc';
                g.npcTextEl.textContent = line.text;

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
                    uiKit.toggle(prevBtn, visibleIndex > 0, '');
                    prevBtn.disabled = (visibleIndex <= 0);
                }
                if (nextBtn) {
                    uiKit.toggle(nextBtn, peeking, '');
                }

                // Continue button: hidden while peeking, visible normally
                uiKit.toggle(g.btnAccept, !peeking, '');
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
                    game_timers.after(1.5, () => {
                        showMessage(`${teammate.name.toUpperCase()}: ${BONDING_TIERS[newTier].message}`);
                    }, 'world');
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
        
