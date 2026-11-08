        // ===== LV2 DIRECTORY: GAME DB =====
        /* The game's data, one chapter per JSON file in directory/game-db/. tools/build.mjs inlines each
           chapter as GAME_DB.<chapter> (items.json → GAME_DB.items), right after this file, so everything
           loaded later can read it. The JSON is the source: edit it by hand or in a data editor, and
           tools/test-game-db.cjs checks it. Each chapter's _about says what its tables hold and in what units.
           Chapters hold data only. Where an entry needs code, it names it in a `hooks` field and the system that
           owns the table adds the functions with attachDataHooks (see CONSUMABLE_HOOKS, core/registries.js). */
        const GAME_DB = {};

        /** Give each entry of `table` that names `hooks: '<name>'` the functions in hooks[name]; returns the table. */
        function attachDataHooks(table, hooks) {
            for (const [id, entry] of Object.entries(table)) {
                if (!entry || !entry.hooks) continue;
                const fns = hooks[entry.hooks];
                if (!fns) throw new Error(`GAME_DB: ${id} names hooks '${entry.hooks}', which nothing provides`);
                Object.assign(entry, fns);
            }
            return table;
        }
