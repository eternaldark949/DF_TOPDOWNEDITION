        /* =====================================================================
           THE CAST (directory/game-db/cast.json, scene_cast) — who can speak in a scene: the name on their subtitle, their
           colour (from SPEAKER_COLORS by their name, or color_of), whose face their cameo wears (core/appearances.js), and which
           side of the screen they stand on (949 on the left, others on the right).
           ===================================================================== */
        const SCENE_CAST = GAME_DB.cast.scene_cast;   // directory/game-db/cast.json
        for (const C of Object.values(SCENE_CAST)) { C.color = SPEAKER_COLORS[C.color_of || C.name]; delete C.color_of; }
