        // ===== LV2 DIRECTORY =====
        // THE GAME'S MATERIALS (basement/material-kit.js): how each finish is drawn, and the named
        // materials the wardrobe's items link to. Tweak a finish here and every boot, gown and portrait
        // that wears it changes with it.
        //
        // FINISH RULES (read by the draw code, never by name):
        //   sheen        clothes catch a crisp highlight (ui/humanoid-render.js _glossy)
        //   boot_shine   a thigh boot's shaft is drawn glossy, and boot_shade how far it's darkened
        //   pump_shade   the boot's pointed pump, darkened; pump_shine a highlight on its toe
        //   surface      the boot gets a surface pass (ui/wardrobe.js bootSurface): nap or flecks
        //   nap          velvet's soft nap (and a deeper tone in portraits)
        //   flecks       stardust: fixed flecks with a slow glint
        //   portrait_shine   the portrait's highlight strength on boots and shoes (null: by the shoe's shape)
        materialKit.rule('none',    { sheen: false, boot_shine: true,  boot_shade: 0.45, pump_shade: 0.5,  pump_shine: true,  surface: false, nap: false, flecks: false, portrait_shine: null });
        materialKit.rule('gloss',   { sheen: true,  boot_shine: true,  boot_shade: 0.22, pump_shade: 0.26, pump_shine: true,  surface: false, nap: false, flecks: false, portrait_shine: null });
        materialKit.rule('sparkle', { sheen: false, boot_shine: true,  boot_shade: 0.22, pump_shade: 0.26, pump_shine: true,  surface: true,  nap: false, flecks: true,  portrait_shine: null });
        materialKit.rule('velvet',  { sheen: false, boot_shine: false, boot_shade: 0.16, pump_shade: 0.2,  pump_shine: false, surface: true,  nap: true,  flecks: false, portrait_shine: 0.15 });

        // NAMED MATERIALS: [color, fabric, finish]
        materialKit.define('silver_sequin',   ['#c9ccd8', 'sequin', 'gloss']);
        materialKit.define('crimson_velvet',  ['#7a0f22', 'velvet']);
        materialKit.define('champagne_satin', ['#e9d8b4', 'satin']);

        // Link the cosmetics to their materials (once, before anything wears them)
        for (const item of Object.values(COSMETICS_REGISTRY)) {
            const D = item.data;
            if (D) materialKit.linkAll([D.top, D.bottom, D.shoes, D.train].filter(Boolean));
        }
