        // ===== LV0 BASEMENT =====
        // The frame clock: the engine's four time values, and the only code meant to move them.
        //
        //   _frameTime / _frameTimeSec  REAL time (Date.now) of the frame being drawn. Light flicker, UI.
        //                               Stamped once per accepted frame by the Lobby (lobby/level-lobby.js).
        //   _simTick                    SIMULATION steps taken. Frozen while paused. Gait, AI timers, lifetimes.
        //   _gameTimeSec                Smooth GAME time for draw code: follows the sim ticks (so it follows
        //                               GAME_SPEED and stops while paused), blended between ticks. Foliage sway, bobbing.
        //
        // They stay plain globals because hundreds of draw and update lines read them every frame; a global
        // read is the cheapest thing there is. Reading them anywhere is fine. Writing them goes through
        // frame_clock, so there is one place to look for who moves time. (A few render helpers that briefly
        // pretend it's another moment, crowd baking and prop sprites, save and restore them in place.)
        let _frameTime = performance.now();
        let _frameTimeSec = _frameTime / 1000;
        /** Sim tick counter: advanced once per fixed simulation step (frame_clock.advanceTick: the Lobby, or GameEngine.update() called directly). */
        let _simTick = 0;
        /** Smooth GAME time in seconds for draw code: advances with sim ticks (so it
         *  follows CONFIG.LOOP.GAME_SPEED and stops while paused), blended between
         *  ticks. Use it for world motion drawn from a clock (foliage sway, bobbing);
         *  keep _frameTime for real-time effects like light flicker and UI. */
        let _gameTimeSec = 0;

        class frameClock {
            // --- WRITERS ---
            /** A new frame is being drawn: stamp real time. */
            stampFrame () {
                _frameTime = Date.now();
                _frameTimeSec = _frameTime / 1000;
            }
            /** One simulation step has begun. */
            advanceTick () { _simTick++; if (typeof game_timers !== 'undefined') game_timers.tick(); }   // the game's timers (basement/timer-kit.js) move with it
            /** Where this drawn frame sits in game time, in seconds. */
            setGameTime (seconds) { _gameTimeSec = seconds; }

            // --- READERS (for new code; old code reads the globals) ---
            get frame_time () { return _frameTime; }
            get frame_time_sec () { return _frameTimeSec; }
            get sim_tick () { return _simTick; }
            get game_time_sec () { return _gameTimeSec; }
        }
        const frame_clock = new frameClock();
