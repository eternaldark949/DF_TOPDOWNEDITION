        // ===== LV1 LOBBY =====
        // The stage switch: which stage the engine is on, and the one place that changes it. A stage is a
        // name ('menu', 'loading', 'world', or any the game adds); the game plugs in what happens on the
        // way into and out of each. The pause registry (levelPause, lobby/level-pause.js) holds the world
        // still while a stage is up; the two together are the game's screen state.
        //
        // STAGE JACKS (each optional):  { enter(from), leave(to) }
        //
        //   game.level_stages.plugIn({ world: { enter: () => showCanvas(), leave: () => tidyUp() } });
        //   game.level_stages.go('world');            // leave the current stage, enter this one (no-op if already on it)
        //   if (game.level_stages.is('menu', 'loading')) ...
        class levelStages {
            constructor (first_stage) {
                this.stage = first_stage;              // the stage the engine is on
                this.previous = null;                  // the one before it
                this.jacks = {};
            }

            /** Plug in stages: { name: { enter(from), leave(to) } }. Later calls add to or replace earlier ones. */
            plugIn (stage_jacks) {
                for (const name of Object.keys(stage_jacks)) this.jacks[name] = Object.assign(this.jacks[name] || {}, stage_jacks[name]);
                return this;
            }

            /** Move to a stage: the current one's leave(to), then the new one's enter(from). False if already there. */
            go (name) {
                const from = this.stage;
                if (from === name) return false;
                const out = this.jacks[from], into = this.jacks[name];
                if (out && out.leave) out.leave(name);
                this.previous = from;
                this.stage = name;
                if (into && into.enter) into.enter(from);
                return true;
            }

            /** Is the engine on (one of) these stage(s)? */
            is (...names) { return names.includes(this.stage); }
        }
