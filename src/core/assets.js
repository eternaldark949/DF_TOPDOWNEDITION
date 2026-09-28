        /* =====================================================================
           YOUR ASSETS — images and sounds from the assets/ folder
           ---------------------------------------------------------------------
           tools/build.mjs bakes every file in assets/images and assets/audio into
           the ASSETS table just above this file, so the game stays one offline
           file. A file's name (without extension, subfolders kept) is its key:
               assets/images/portrait_949.png        -> 'portrait_949'
               assets/images/signs/ollo.webp         -> 'signs/ollo'
               assets/audio/door_bell.mp3            -> 'door_bell'

           Usage:
               drawAsset(ctx, 'portrait_949', x, y, 64, 64);   // draws once it's loaded
               const img = getImage('portrait_949');           // the Image itself
               playSound('door_bell', { volume: 0.8 });        // one-shot through the game's audio
               playSound('rain_loop', { loop: true }).then(s => s && s.stop());
           ===================================================================== */
        const _assetImages = {};
        function getImage(name) {
            if (_assetImages[name]) return _assetImages[name];
            const src = ASSETS.images[name];
            if (!src) { console.warn(`getImage: no image named "${name}" in assets/images`); return null; }
            const img = new Image();
            img.src = src;
            return (_assetImages[name] = img);
        }

        function drawAsset(ctx, name, x, y, w, h) {
            const img = getImage(name);
            if (!img || !img.complete || !img.naturalWidth) return false;
            ctx.drawImage(img, x, y, w ?? img.naturalWidth, h ?? img.naturalHeight);
            return true;
        }

        const _assetSounds = {};
        /** Plays an asset sound through the master bus (so the audio toggle mutes it). Resolves to the source node, or null. */
        function playSound(name, opts = {}) {
            const src = ASSETS.audio[name];
            if (!src) { console.warn(`playSound: no sound named "${name}" in assets/audio`); return Promise.resolve(null); }
            const ctx = audioSys.ctx;
            if (!_assetSounds[name]) {
                const bin = atob(src.slice(src.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                _assetSounds[name] = ctx.decodeAudioData(bytes.buffer).catch(e => { console.warn(`playSound: could not decode "${name}"`, e); return null; });
            }
            return _assetSounds[name].then(buffer => {
                if (!buffer) return null;
                if (ctx.state === 'suspended') ctx.resume();
                const s = ctx.createBufferSource(), g = ctx.createGain();
                s.buffer = buffer; s.loop = !!opts.loop; s.playbackRate.value = opts.rate || 1;
                g.gain.value = opts.volume ?? 1;
                s.connect(g); g.connect(audioSys.masterGain);
                s.start();
                return s;
            });
        }

        // Start decoding every image right away so the first frame that uses one has it ready
        for (const name of Object.keys(ASSETS.images)) getImage(name);

