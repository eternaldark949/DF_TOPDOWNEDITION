        // ===== LV0 BASEMENT =====
        // The material kit: linked materials, like Blender's. A MATERIAL is a named packet of what a
        // surface is made of; any number of items link to it by name, so one definition changes them all.
        // A RULE says how a finish or a fabric is drawn: a property list the draw code reads instead of
        // testing names, so tweaking velvet is one line in one place. The kit knows nothing about any
        // game: the rules and materials are the game's (Directory).
        //
        // MATERIAL PACKET: [color, fabric, finish]   leave out what doesn't apply
        //   color             '#rrggbb'
        //   fabric            'sequin', 'satin', 'velvet' ...: what the cloth is (its weave)
        //   finish            'gloss', 'sparkle', 'velvet' ...: how its surface takes the light
        //
        //   materialKit.rule('velvet', { boot_shade: 0.16, nap: true });   // how a finish draws
        //   materialKit.define('crimson_velvet', ['#7a0f22', 'velvet']);    // a named material
        //   top: { type: 'off_shoulder', material: 'crimson_velvet' }        // an item linked to it
        //   materialKit.linkAll(items);                                      // fill items from their materials
        //   const F = materialKit.finishOf(item);  if (F.nap) ...             // draw by the rule
        const materialKit = {
            _rules: new Map(),
            _materials: new Map(),

            /** Set a finish's or fabric's drawing rules (merged over any already set). `none` is the rule for no finish. */
            rule (name, props) {
                this._rules.set(name, { name, ...(this._rules.get(name) || {}), ...props });
            },

            /** Name a material from a packet [color, fabric, finish]. */
            define (name, material_packet) {
                const [color, fabric, finish] = material_packet;
                this._materials.set(name, { color, fabric, finish });
            },

            /** The named material, or null. */
            material (name) {
                return this._materials.get(name) || null;
            },

            /** Fill an item from the material it links to (`item.material`): its colour, fabric and finish,
             *  unless the item sets its own. Returns the item. */
            link (item) {
                const M = item && item.material && this._materials.get(item.material);
                if (!M) return item;
                for (const k of ['color', 'fabric', 'finish']) if (item[k] === undefined && M[k] !== undefined) item[k] = M[k];
                return item;
            },

            /** Link every item in a list (or an object's values). */
            linkAll (items) {
                for (const item of Array.isArray(items) ? items : Object.values(items)) this.link(item);
            },

            /** The drawing rules for an item's finish: `none` when it has none (or one with no rules). */
            finishOf (item) {
                const f = item && item.finish;
                return (f && this._rules.get(f)) || this._rules.get('none') || {};
            },

            /** The drawing rules for an item's fabric, or null. */
            fabricOf (item) {
                return (item && item.fabric && this._rules.get(item.fabric)) || null;
            }
        };
