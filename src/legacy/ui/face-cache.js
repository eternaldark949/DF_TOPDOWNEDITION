        /* =====================================================================
           FACE CACHE: every app's painted faces, painted once and kept
           ---------------------------------------------------------------------
           A face is a painted bust (ui/portrait-real.js): hundreds of hair strands
           and dozens of blurred forms, a few tens of milliseconds apiece on a laptop
           and a couple of hundred on a slow phone. Painting a screenful of them in
           one go is what made the portrait apps sit frozen when they opened. So:

             - few sizes (FaceCache.SMALL for avatars and chips, .LARGE for the big
               cards), always on a transparent ground (the CSS gives the backdrop),
               so one person is painted once for Messages, Contacts, Team and the
               dialogue chips alike;
             - a face that isn't painted yet shows its initial and is painted one per
               task afterwards (FaceCache.queue), so the screen keeps moving between;
             - painted faces are kept across sessions (CacheDB, keyed by the look and
               signed by the build), so the next time they're there at once.

             FaceCache.ready(name, size)       its picture if painted already, else null
             FaceCache.paint(name, size)       paint it now (slow), keep it, return it
             FaceCache.queue(name, size, cb)   paint it soon, then cb(url)
             FaceCache.pump()                  a promise for the queue being empty
             FaceCache.html(name, size, mono)  an <img> if ready, else `mono` marked to
                                               turn into the face once it's painted
           ===================================================================== */
        const FaceCache = {
            SMALL: 96,
            LARGE: 128,
            _mem: new Map(),
            _queue: [],
            _pumping: null,

            /** The face's look as a key (null if this person has no painted portrait) */
            look(name) {
                try {
                    if (typeof game === 'undefined' || !game || !game.resolvePortraitConfig) return null;
                    const config = game.resolvePortraitConfig(name);
                    return config && !config.isFallback ? game.portraitCacheKey(config) : null;
                } catch (err) { return null; }
            },
            has(name) { return !!this.look(name); },
            _storeKey(name, size, look) {
                let h = 7; for (let i = 0; i < look.length; i++) h = (h * 31 + look.charCodeAt(i)) % 2147483647;
                return `face|${size}|${name}|${h}`;
            },
            _sig(look) { return (typeof DFAB_BUILD !== 'undefined' ? DFAB_BUILD : 'dev') + '|' + look; },

            ready(name, size = this.SMALL) {
                const look = this.look(name);
                if (!look) return null;
                const id = size + '|' + name + '|' + look;
                let url = this._mem.get(id);
                if (!url && typeof CacheDB !== 'undefined') {
                    url = CacheDB.get(this._storeKey(name, size, look), this._sig(look));
                    if (url) this._mem.set(id, url);
                }
                return url || null;
            },
            paint(name, size = this.SMALL) {
                const look = this.look(name);
                if (!look) return null;
                const id = size + '|' + name + '|' + look;
                let url = this._mem.get(id) || this.ready(name, size);
                if (url) return url;
                try { url = game.getPortraitDataURL(name, size, null); } catch (err) { return null; }
                if (!url) return null;
                this._mem.set(id, url);
                if (typeof CacheDB !== 'undefined') CacheDB.put(this._storeKey(name, size, look), this._sig(look), url);
                return url;
            },
            url(name, size = this.SMALL) { return this.ready(name, size) || this.paint(name, size); },

            /** Paint soon, one face per task; cb(url) once it's painted. cb may return false to say it's no longer wanted. */
            queue(name, size, cb) {
                const job = this._queue.find(j => j.name === name && j.size === size);
                if (job) job.cbs.push(cb); else this._queue.push({ name, size, cbs: [cb] });
                return this.pump();
            },
            pump() {
                if (this._pumping) return this._pumping;
                if (!this._queue.length) return Promise.resolve();
                this._pumping = new Promise(resolve => {
                    const step = () => {
                        const job = this._queue.shift();
                        if (!job) { this._pumping = null; resolve(); return; }
                        // only paint for someone still wanting it (an element still on screen, say)
                        const live = job.cbs.filter(cb => !cb.wanted || cb.wanted());
                        if (live.length) {
                            const url = this.paint(job.name, job.size);
                            if (url) live.forEach(cb => { try { cb(url); } catch (e) { console.error(e); } });
                        }
                        requestAnimationFrame(() => setTimeout(step, 0));
                    };
                    setTimeout(step, 0);
                });
                return this._pumping;
            },
            get pending() { return this._queue.length; },

            /** For HTML built as a string: the face if it's ready, else `mono` (an element's HTML), marked so the
             *  face replaces it once painted. */
            html(name, size, mono) {
                const url = this.ready(name, size);
                if (url) return `<img alt="" src="${url}">`;
                if (!this.has(name)) return mono;
                clearTimeout(this._scanTimer);
                this._scanTimer = setTimeout(() => this.scan(), 0);
                const esc = String(name).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                return mono.replace(/^<(\w+)/, `<$1 data-face="${esc}" data-face-size="${size}"`);
            },
            /** Queue every marked placeholder now in the page */
            scan(root = document) {
                root.querySelectorAll('[data-face]:not([data-face-queued])').forEach(el => {
                    el.setAttribute('data-face-queued', '');
                    const cb = (url) => {
                        const img = new Image(); img.alt = ''; img.src = url; img.className = 'face-in';
                        el.replaceWith(img);
                    };
                    cb.wanted = () => el.isConnected;
                    this.queue(el.dataset.face, +el.dataset.faceSize || this.SMALL, cb);
                });
            }
        };
