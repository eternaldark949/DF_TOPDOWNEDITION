        // GameEngine — Sneak. Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        //
        // A toggle (the SNEAK button by HOLSTER, or C): she drops into a low, careful crouch and
        // moves at 55%. Her steps carry a third as far (a puddle still splashes, a little), she's
        // a quarter harder to make out, and an unaware back is hers to take (engine/executions.js).
        // Driving, a scene or the furniture ends it.

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

            /** Once per tick: what ends a sneak, and the speed it allows */
            updateSneak() {
                if (this.sneaking && (this.isDriving || (this.scenes && this.scenes.running) || (this.furniture && this.furniture.busy()))) this.setSneak(false);
            }
        });
