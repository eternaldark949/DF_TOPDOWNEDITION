        /* =====================================================================
           PAUSE LOOK — the world behind the pause menu, after ETERNAL's prototype
           ---------------------------------------------------------------------
           When the pause menu opens, the frame on screen is copied once, small,
           into two canvases: the picture, and a copy of it pushed so only the
           lights survive (the bloom). CSS does the rest on those still images:
           a heavy blur, the lights spread into soft orbs, a magenta-to-violet
           grade, a vignette, and strong film grain moving over it all
           (styles/hud-menus.css, #pause-menu .pause-look). The copy is taken once
           and never redrawn, so the treatment costs nothing while the menu is up
           (no live backdrop blur).
           ===================================================================== */
        const PauseLook = {
            SCALE: 1 / 3,                    // the copy's size: it is blurred anyway, and small is quick
            capture() {
                const src = document.getElementById('game-canvas');
                const host = document.querySelector('#pause-menu .pause-look');
                if (!src || !host || !src.width || !src.height) return false;
                const w = Math.max(64, Math.round(src.width * this.SCALE)), h = Math.max(36, Math.round(src.height * this.SCALE));
                let ok = true;
                for (const cv of host.querySelectorAll('canvas')) {
                    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
                    const ctx = cv.getContext('2d');
                    try { ctx.clearRect(0, 0, w, h); ctx.drawImage(src, 0, 0, w, h); } catch (e) { ok = false; }
                }
                host.classList.toggle('has-still', ok);
                document.getElementById('pause-menu')?.classList.toggle('has-look', ok);
                return ok;
            },
            /** Let go of the copies' pixels once the menu is closed (they're redrawn next time) */
            release() {
                const host = document.querySelector('#pause-menu .pause-look');
                if (!host) return;
                for (const cv of host.querySelectorAll('canvas')) { cv.width = cv.height = 0; }
                host.classList.remove('has-still');
                document.getElementById('pause-menu')?.classList.remove('has-look');
            }
        };
