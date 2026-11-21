        /* =====================================================================
           CACHE DB — results that are slow to compute and the same every time,
           kept across sessions in IndexedDB (async, roomy; localStorage stays for
           saves and settings). Everything is read into memory once at boot, so a
           lookup during a map load is synchronous; writes go out in the
           background. Each entry carries a signature of its inputs, so a changed
           map or a new build never gets stale data. Fails quietly to "no cache"
           (private mode, quota, file:// quirks).
             CacheDB.get(key, sig)     → value or null
             CacheDB.put(key, sig, v)  → stores (memory now, disk soon)
           ===================================================================== */
        const CacheDB = {
            VERSION: 1,                         // bump when a cached algorithm changes
            _mem: new Map(), _db: null, ready: false,
            open() {
                if (this._opening) return this._opening;
                this._opening = new Promise(resolve => {
                    try {
                        if (typeof indexedDB === 'undefined') return resolve(false);
                        const req = indexedDB.open('dfab_cache', 1);
                        req.onupgradeneeded = () => req.result.createObjectStore('kv');
                        req.onerror = () => resolve(false);
                        req.onsuccess = () => {
                            this._db = req.result;
                            const all = this._db.transaction('kv').objectStore('kv').openCursor();
                            all.onsuccess = () => {
                                const c = all.result;
                                if (c) { if (c.value && c.value.v === this.VERSION) this._mem.set(c.key, c.value); c.continue(); }
                                else { this.ready = true; resolve(true); }
                            };
                            all.onerror = () => resolve(false);
                        };
                    } catch (e) { resolve(false); }
                });
                return this._opening;
            },
            get(key, sig) {
                const e = this._mem.get(key);
                return e && e.sig === sig ? e.data : null;
            },
            put(key, sig, data) {
                const e = { v: this.VERSION, sig, data };
                this._mem.set(key, e);
                if (!this._db) return;
                try { this._db.transaction('kv', 'readwrite').objectStore('kv').put(e, key); } catch (err) { /* quota / closed: memory only */ }
            }
        };
        CacheDB.open();
