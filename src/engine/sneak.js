        // GameEngine — Sneak. Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        //
        // A toggle (the SNEAK button by HOLSTER, or C): she drops into a low, careful crouch and
        // moves at 55%. Her steps carry a third as far (a puddle still splashes, a little), she's
        // a quarter harder to make out, and an unaware back is hers to take (engine/executions.js).
        // Driving, a scene or the furniture ends it.
        //
        // The crew sneaks with her: they crouch, keep her pace, close up behind her, and hold
        // fire on anyone who hasn't noticed them (crewMayEngage) — until it goes loud: a guard
        // turns ALERT (they fire on the aware ones), or she fires (weapons free for 10 s).

        const SNEAK = { SPEED: 0.55, STEP_NOISE: 0.35, PUDDLE_NOISE: 0.6, VISIBILITY: 0.75 };

        engineMixin({
            setSneak(on) {
                on = !!on && !this.isDriving;
                if (this.sneaking === on) return;
                this.sneaking = on;
                const b = document.getElementById('btn-sneak');
                if (b) b.classList.toggle('active', on);
                document.body.classList.toggle('sneaking', on);
            },
            toggleSneak() { this.setSneak(!this.sneaking); },

            /** The crew's half of it: sneaking with her (pace, crouch, quiet steps)? */
            crewSneaking() { return !!this.sneaking && !this.isDriving; },

            /** May the crew shoot at (or move to a firing spot on) this enemy? Quiet: only the aware ones. */
            crewMayEngage(e) {
                if (!this.sneaking || _gameTimeSec < (this._loudUntil || 0)) return true;
                return e.state === undefined || e.state === 'ALERT' || e.state === 'SUPPRESSING';
            },

            /** Once per tick: what ends a sneak, and the speed it allows */
            updateSneak() {
                if (this.sneaking && (this.isDriving || (this.scenes && this.scenes.running) || (this.furniture && this.furniture.busy()))) this.setSneak(false);
            }
        });
