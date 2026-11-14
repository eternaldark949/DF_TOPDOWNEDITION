        // ===== LV2 DIRECTORY =====
        // PauseSystem: the Lobby's pause registry (lobby/level-pause.js) wired to this game. Every change is
        // mirrored to game.paused, which the loop, AI and draw code read; the token registry is where pauses
        // are written. Pausing also lets go of every held gameplay input, so nothing is stuck down on resume.
        //
        //   On open:   game.pauseSystem.acquire('your_token_name');
        //   On close:  game.pauseSystem.release('your_token_name');
        class PauseSystem extends levelPause {
            constructor(game) {
                super();
                this.game = game;
            }

            onChange(paused) {
                if (this.game) {
                    if (paused && !this.game.paused) clearGameplayInputs(this.game);
                    this.game.paused = paused;
                }
            }
        }
