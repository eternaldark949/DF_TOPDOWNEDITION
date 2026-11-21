        /* =====================================================================
           BOOT LOADER and the LOADING SCREEN
           ---------------------------------------------------------------------
           The page carries every game script as an inert <script type="text/dfab">
           block (tools/build.mjs). This, the one plain script, runs them in order,
           one at a time, so the browser paints the loading screen between them and
           the bar shows how much of the game has run.

           Each block becomes a classic script from a blob URL, added as the one
           before it finishes: they share one global scope just as the single big
           <script> did, and the page's load event still waits for the last of them
           (tools and tests that wait for "load" see a booted game). One difference
           from the single script: a function declared in a later file isn't there
           yet while an earlier file runs its top level (tools/test-game-runtime.cjs
           runs the blocks the same way, so the regression tests catch it).

           LoadingScreen is the same screen later on, between the menu and the world:
             LoadingScreen.run([{ label, weight, run }], opts)   steps with a painted frame between each
             LoadingScreen.show(label) / .set(p, label) / .hide() / .fail(message)
           Its motion is all CSS (styles/loading-screen.css), so it keeps moving even
           through a step that holds the main thread for a while.
           ===================================================================== */
        const LoadingScreen = (() => {
            let el = null, fill = null, pct = null, status = null, errorBox = null;
            let shown = 0, hideTimer = 0, visible = false;
            const grab = () => {
                if (el && el.isConnected) return el;
                el = document.getElementById('loading-screen');
                if (!el) return null;
                fill = el.querySelector('.ls-fill'); pct = el.querySelector('.ls-pct');
                status = el.querySelector('.ls-status-text'); errorBox = el.querySelector('.ls-error');
                visible = !el.classList.contains('ls-gone') && !el.classList.contains('ls-hide');
                return el;
            };
            const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));   // after the next paint
            const wait = (ms) => new Promise(r => setTimeout(r, ms));

            const api = {
                get visible() { grab(); return visible; },
                /** Progress 0..1 (it only goes forward while the screen is up) and, optionally, what it's doing now */
                set(p, label) {
                    if (!grab()) return;
                    p = Math.max(0, Math.min(1, p));
                    if (p >= shown) {
                        shown = p;
                        fill.style.transform = `scaleX(${p.toFixed(4)})`;
                        const n = Math.floor(p * 100);
                        pct.textContent = n + '%';
                        el.setAttribute('aria-valuenow', n);
                    }
                    if (label && status.textContent !== label) status.textContent = label;
                },
                /** Bring the screen up (fading in over whatever is there), the bar back at 0 */
                async show(label) {
                    if (!grab()) return;
                    clearTimeout(hideTimer);
                    el.classList.remove('ls-failed');
                    shown = 0;
                    fill.style.transition = 'none'; fill.style.transform = 'scaleX(0)'; pct.textContent = '0%';
                    void fill.offsetWidth; fill.style.transition = '';
                    if (label) status.textContent = label;
                    if (visible) return;
                    el.classList.remove('ls-gone'); el.classList.add('ls-enter');
                    void el.offsetWidth;
                    el.classList.remove('ls-hide', 'ls-enter');
                    visible = true;
                    await wait(720);                                            // the fade in (0.7s in the CSS)
                },
                /** Fill the bar, then fade the screen away (resolves once it's gone) */
                async hide() {
                    if (!grab() || !visible) return;
                    api.set(1);
                    await wait(380);                                            // the bar's last stretch
                    el.classList.add('ls-hide');
                    visible = false;
                    await new Promise(r => { hideTimer = setTimeout(() => { el.classList.add('ls-gone'); r(); }, 720); });
                },
                /** Something broke: say so on the screen, and let a tap take it away */
                fail(message) {
                    if (!grab()) return;
                    el.classList.add('ls-failed');
                    status.textContent = 'Something went wrong';
                    errorBox.textContent = (message || 'The game hit an error while loading.') + ' Tap to carry on anyway.';
                    errorBox.onclick = () => { el.classList.remove('ls-failed'); api.hide(); };
                },
                frame, wait,
                /**
                 * Run steps under the loading screen. Each step: { label, weight (default 1), run(progress) }.
                 * run() may return a promise, and may call progress(0..1) for how far through the step it is.
                 * A painted frame comes before each step, so its label and the bar are on screen as it starts.
                 * opts.hide (default true): fade out at the end.
                 */
                async run(steps, opts = {}) {
                    const total = steps.reduce((s, st) => s + (st.weight ?? 1), 0) || 1;
                    await api.show(steps[0] && steps[0].label);
                    let done = 0;
                    for (const st of steps) {
                        const w = st.weight ?? 1, base = done / total;
                        api.set(base, st.label);
                        await frame();
                        try { await st.run((p) => api.set(base + Math.max(0, Math.min(1, p)) * w / total)); }
                        catch (e) { console.error('Loading step "' + st.label + '"', e); api.fail(e && e.message); throw e; }
                        done += w;
                        api.set(done / total);
                    }
                    if (opts.hide !== false) await api.hide();
                }
            };
            return api;
        })();

        // ── Boot: run the game's script blocks under the loading screen ─────────────────────────────────
        (function bootGame() {
            // One-file runtimes (tools/test-game-runtime.cjs) have already run every block themselves
            if (typeof GameEngine !== 'undefined' || typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
            const tags = Array.from(document.querySelectorAll('script[type="text/dfab"]'));
            if (!tags.length) return;
            // What the bar says while each part runs (by the file's folder)
            const LABELS = [
                [/^core\//, 'Tuning the resonance'], [/^assets#/, 'Tuning the radio'], [/^story\//, 'Writing the story'],
                [/^(world|physics|traffic|buildings)\//, 'Raising the city'], [/^(entities|ui)\//, 'Waking the crowd'],
                [/^audio\//, 'Tuning the radio'], [/^engine\//, 'Starting the engine'], [/^app\//, 'Opening the menu']
            ];
            const labelFor = (src) => { for (const [re, l] of LABELS) if (re.test(src)) return l; return null; };
            // How long each file takes to run, roughly (tools/build.mjs writes it: the size, the music counted light).
            // Small files go together, about a fortieth of the game a script: each script costs a round trip, and a
            // fortieth is still short enough for the bar to move smoothly.
            const costOf = (t) => +t.dataset.cost || 1;
            const total = tags.reduce((a, t) => a + costOf(t), 0) || 1, per = total / 40;
            const blocks = [];
            for (const t of tags) {
                const last = blocks[blocks.length - 1];
                if (last && last.cost < per && labelFor(last.tags[0].dataset.src) === labelFor(t.dataset.src)) { last.tags.push(t); last.cost += costOf(t); }
                else blocks.push({ tags: [t], cost: costOf(t) });
            }
            blocks.forEach(b => { b.src = b.tags[0].dataset.src + (b.tags.length > 1 ? ` (+${b.tags.length - 1})` : ''); });
            const weights = blocks.map(b => b.cost);
            const t0 = performance.now();
            let ran = 0;
            const errors = [];
            const onError = (e) => { errors.push(e.message || String(e.error || e)); };
            window.addEventListener('error', onError);
            window.__dfabBoot = { files: tags.length, blocks: blocks.length, ran: 0, ms: 0, errors };

            let resolveReady;
            window.dfabReady = new Promise(r => { resolveReady = r; });
            const finish = () => {
                window.removeEventListener('error', onError);
                window.__dfabBoot.ms = Math.round(performance.now() - t0);
                LoadingScreen.set(1, 'Ready');
                if (errors.length) LoadingScreen.fail(errors[0]);
                else LoadingScreen.hide();
                window.dispatchEvent(new Event('dfab:ready'));
                resolveReady(window.__dfabBoot);
            };
            const blockRan = (i) => {
                ran += weights[i]; window.__dfabBoot.ran = i + 1;
                const nextBlock = blocks[i + 1];
                LoadingScreen.set(ran / total, nextBlock ? labelFor(nextBlock.src) : 'Opening the menu');
                if (i === blocks.length - 1) finish();
            };
            LoadingScreen.set(0, labelFor(blocks[0].src));

            let blobs = true;
            try { URL.revokeObjectURL(URL.createObjectURL(new Blob(['']))); } catch (e) { blobs = false; }
            // (each file keeps its name for the console and the debugger only when it runs alone; a group is named by its first)
            const source = (b) => b.tags.map(t => t.text).join('\n') + `\n//# sourceURL=dfab://src/${b.tags[0].dataset.src}\n`;
            // One block at a time, each added as the one before it finishes: only that block's text is copied when
            // its turn comes, the browser gets the gaps between them to paint, and since each is in the document
            // before the last one's load event is over, the page's load event waits for the whole chain.
            // (A block that throws still counts as run: its load event fires all the same, and the error is listed.)
            let i = 0;
            const next = () => {
                const b = blocks[i], at = i++;
                if (!b) return;
                const s = document.createElement('script');
                if (blobs) {
                    s.async = false;
                    s.src = URL.createObjectURL(new Blob([source(b)], { type: 'text/javascript' }));
                    s.dataset.src = b.src;
                    s.onload = s.onerror = (e) => {
                        if (e.type === 'error') errors.push('Could not run ' + b.src);
                        URL.revokeObjectURL(s.src); s.remove();
                        blockRan(at); next();
                    };
                    b.tags.forEach(t => t.remove());
                    document.body.appendChild(s);
                } else {
                    // No blob URLs: run the block inline, then yield to the browser before the next
                    s.text = source(b);
                    b.tags.forEach(t => t.remove()); document.body.appendChild(s); s.remove();
                    blockRan(at);
                    setTimeout(next, 0);
                }
            };
            next();
        })();
