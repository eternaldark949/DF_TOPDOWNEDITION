        // ===== LV2 DIRECTORY =====
        // THE GAME'S MATERIALS (basement/material-kit.js): how each finish is drawn, and the named
        // materials the wardrobe's items link to. Tweak a finish and every boot, gown and portrait
        // that wears it changes with it (the data is in cast.json, below).
        //
        // The finish rules and named materials are data: directory/game-db/cast.json (finishes, materials;
        // _about.fields.finishes says what each rule does). A material packet is [color, fabric, finish].
        for (const [name, props] of Object.entries(GAME_DB.cast.finishes)) materialKit.rule(name, props);
        for (const [name, packet] of Object.entries(GAME_DB.cast.materials)) materialKit.define(name, packet);

        // Link the cosmetics to their materials (once, before anything wears them)
        for (const item of Object.values(COSMETICS_REGISTRY)) {
            const D = item.data;
            if (D) materialKit.linkAll([D.top, D.bottom, D.shoes, D.train].filter(Boolean));
        }
