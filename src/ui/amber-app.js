        /* =====================================================================
           AMBER DELIVERY — the delivery loop on her phone.

             Ren and the Bartender text the job they hand her in person: the
             drop-off, or the corner the mark hangs about, as a pin (jobText).
             After each delivery Ren asks if she's up for another (a brief in
             Messages; Accept and Amber's courier brings the box to wherever
             she is: no trip back to the cafe). Five runs in, Ren puts her on
             the driver app instead (afterDelivery).

             The app (#screen-amber): orders near her, any time (pay by the
             distance, an estimate of the time it should take), tips on top
             (on time and the box in one piece: MissionSystem._tipFor), her
             rating, and Amber Premium (1,200 PP once: tips half again, an
             Express order on the board, a fourth order). Online, a new order
             pings her phone while she's free.

           The state lives on game.missions.amber (saved with the missions).
           ===================================================================== */
        const AMBER_PREMIUM_COST = 1200;
        const REN_AGAIN = [
            'That was quick! Got another one ready. The courier can meet you wherever you are. Want it?',
            'People are loving you. Another order just came in. You in?',
            'Three for three, Stella. One more?',
            'Rush hour at Cozy. Can you take one more?',
        ];
        const REN_APP = [
            'Five runs, Stella. You\'re officially our favourite driver.',
            'Amber has a driver app. Orders whenever you want, tips straight to you, the works. I put your name in. Check your phone!',
        ];

        const _amberBaseHome = phoneSystem.showHome;

        Object.assign(phoneSystem, {
            /* ───────────────────────── texts from the people who hand out jobs ───────────────────────── */
            /** Whoever handed her a job in person texts where it is, as a pin she can set a waypoint from */
            jobText(who, m, text) {
                const spot = this._jobSpot(m);
                if (spot) this.dropPin(who, spot, text, 1800);
            },

            /** A delivery's done: Ren asks for another, or (five in) hands her over to the app */
            afterDelivery(m, g, tip) {
                const M = g.missions, A = M.amber;
                if (m.source === 'amber') { this._amberOrders(true); this._amberPing(false); if (this.currentApp === 'amber') this.renderAmber(); return; }
                if (A.unlocked) return;
                const n = M.completedDeliveries;
                if (n >= 5) {
                    A.unlocked = true;
                    A.pingAt = (g.worldMinutes || 0) + 10;
                    this.sendText('Barista Ren', REN_APP[0], true, 2200);
                    g.addPausableTimeout(() => {
                        this.sendText('Barista Ren', REN_APP[1], true, 2400);
                        g.addPausableTimeout(() => { showMessage('NEW APP · AMBER DELIVERY'); this._amberIcon(); }, 2600);
                    }, 2600);
                    return;
                }
                const onHub = g.activeMap && g.activeMap.id === 'hub_949';
                this.sendBrief('Barista Ren', 'delivery', REN_AGAIN[(n - 1) % REN_AGAIN.length],
                    { source: 'ren', handed: true, from: onHub ? { x: g.player.x, y: g.player.y } : null });
            },

            /* ───────────────────────── the app ───────────────────────── */
            _amber() { return typeof game !== 'undefined' && game && game.missions ? game.missions.amber : null; },

            /** The icon on the home screen, once Ren's put her on the app; its dot while an order's waiting */
            _amberIcon() {
                const A = this._amber(), icon = document.getElementById('app-amber');
                if (icon) icon.style.display = A && A.unlocked ? '' : 'none';
                const dot = document.getElementById('badge-amber');
                if (dot) dot.classList.toggle('active', !!(A && A.unlocked && A.fresh));
            },

            showHome() {
                _amberBaseHome.call(this);
                this._amberIcon();
            },

            showAmber() {
                const A = this._amber();
                if (!A || !A.unlocked) return;
                this.currentApp = 'amber';
                this.homeScreen.style.display = 'none';
                document.querySelectorAll('.phone-app-screen').forEach(s => s.style.display = 'none');
                document.getElementById('screen-amber').style.display = 'flex';
                A.fresh = false; this._amberIcon();
                this._amberOrders(false);
                this.renderAmber();
            },

            /** Where she is, for an order's distance: herself in the city, the cafe from anywhere else */
            _amberFrom() {
                const g = game;
                if (g.activeMap && g.activeMap.id === 'hub_949') return { x: g.player.x, y: g.player.y };
                const P = this._place('cozy_cafe');
                return P ? { x: P.tx, y: P.ty } : null;
            },

            /** The board: three orders (four with Premium, the first an Express), kept half an hour of world time */
            _amberOrders(force) {
                const g = game, A = this._amber();
                if (!A || !g.missions) return [];
                const now = g.worldMinutes || 0;
                if (!force && A.orders.length && A.ordersAt != null && now - A.ordersAt < 30) return A.orders;
                const from = this._amberFrom(), n = A.premium ? 4 : 3, out = [];
                for (let i = 0; i < n; i++) {
                    const m = g.missions.generateDelivery(g, { source: 'amber', handed: true, from, express: A.premium && i === 0 });
                    if (m && !out.some(o => o.targetLabel === m.targetLabel && Math.abs(o.targetX - m.targetX) < 1)) out.push(m);
                }
                A.orders = out; A.ordersAt = now;
                return out;
            },

            /** Take an order: the courier hands her the box where she stands, and the drop-off goes on UMaps */
            acceptAmber(i) {
                const g = game, A = this._amber(), o = A && A.orders[i];
                if (!o) return;
                if (g.activeMap.id !== 'hub_949') { showMessage('AMBER ORDERS ARE PICKED UP IN THE CITY.'); return; }
                const m = { ...o, id: `delivery_${Date.now()}` };
                if (!g.missions.acceptMission(m, g)) return;
                A.orders.splice(i, 1);
                showMessage('AMBER\'S COURIER HANDS YOU THE PACKAGE. WALK IT TO THE DOOR.');
                const spot = this._jobSpot(m);
                if (spot) this.setWaypoint(spot);
                this.renderAmber();
            },

            buyAmberPremium() {
                const g = game, A = this._amber();
                if (!A || A.premium) return;
                if (g.currency < AMBER_PREMIUM_COST) { showMessage(`AMBER PREMIUM · ${AMBER_PREMIUM_COST} PP NEEDED`); return; }
                g.currency -= AMBER_PREMIUM_COST;
                A.premium = true;
                g.updateUI();
                audioSys.sfx('ui');
                showMessage('AMBER PREMIUM · WELCOME ABOARD');
                this._amberOrders(true);
                this.renderAmber();
            },

            toggleAmberOnline() {
                const A = this._amber();
                if (!A) return;
                A.online = !A.online;
                A.pingAt = (game.worldMinutes || 0) + 6;
                showMessage(A.online ? 'AMBER · YOU\'RE ONLINE' : 'AMBER · OFFLINE');
                this.renderAmber();
            },

            /** Online and free in the city: now and then a new order lands on the board, with a ping */
            _amberPing(announce = true) {
                const g = game, A = this._amber();
                if (!A) return;
                A.pingAt = (g.worldMinutes || 0) + 18 + Math.floor(Math.random() * 22);
                if (!announce) return;
                const o = this._amberOrders(true)[0];
                if (!o) return;
                A.fresh = true; this._amberIcon();
                showMessage(`AMBER · NEW ORDER · ${o.targetLabel.toUpperCase()} · ${o.reward} PP`);
                audioSys.sfx('ui');
                if (this.currentApp === 'amber' && this.isOpen) this.renderAmber();
            },
            _amberTick() {
                const g = typeof game !== 'undefined' && game, A = this._amber();
                if (!g || !A || !A.unlocked || !A.online || !g.running || g.missions.activeMission) return;
                if (!g.activeMap || g.activeMap.id !== 'hub_949') return;
                if (A.pingAt == null) A.pingAt = (g.worldMinutes || 0) + 6;
                if ((g.worldMinutes || 0) >= A.pingAt) this._amberPing(true);
            },

            _amberStars() {
                const s = this._amber().stars;
                return s.length ? (s.reduce((a, b) => a + b, 0) / s.length) : 5;
            },

            renderAmber() {
                const el = document.getElementById('amber-body'), A = this._amber(), g = game;
                if (!el || !A) return;
                const on = document.getElementById('amber-online');
                if (on) { on.textContent = A.online ? 'Online' : 'Offline'; on.classList.toggle('on', A.online); }
                const esc = t => String(t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
                const now = g.worldMinutes || 0, m = g.missions.activeMission;
                let h = '';
                // Her numbers
                h += `<div class="amb-stats"><div><b>${this._amberStars().toFixed(1)}<i>★</i></b><small>Rating</small></div>`
                   + `<div><b>${A.runs}</b><small>Runs</small></div><div><b>${A.tips}</b><small>Tips · PP</small></div>`
                   + `<div><b>${A.earned}</b><small>Earned · PP</small></div></div>`;
                // The order she's on
                if (m && m.type === 'delivery' && m.status === 'active') {
                    const took = Math.max(0, now - (m.startTime || now)), eta = m.etaMin || 6, late = took > eta;
                    const cond = m.condition == null ? 100 : m.condition;
                    h += `<div class="amb-card amb-live"><div class="amb-k">${m.source === 'amber' ? (m.express ? 'Express · on the way' : 'On the way') : 'Delivery for Ren'}</div>`
                       + `<b>${esc(m.targetLabel)}</b>`
                       + `<div class="amb-bars"><span>Time <em class="${late ? 'late' : ''}">${took} / ${eta} min</em></span><span>Box <em class="${cond < 60 ? 'late' : ''}">${cond}%</em></span></div>`
                       + `<div class="amb-meter"><i style="width:${Math.min(100, took / eta * 100)}%" class="${late ? 'late' : ''}"></i></div>`
                       + `<button class="amb-btn ghost" data-amb="way">Set waypoint</button></div>`;
                }
                if (A.lastTip && now - A.lastTip.at < 60) {
                    h += `<div class="amb-tip">${'★'.repeat(A.lastTip.stars)}${'☆'.repeat(5 - A.lastTip.stars)} · ${esc(A.lastTip.label)} tipped <b>${A.lastTip.tip} PP</b>${A.lastTip.onTime ? ' · on time' : ''}</div>`;
                }
                // The board
                h += `<div class="amb-sec">Orders near you<small>${A.online ? 'pings on' : 'go online for pings'}</small></div>`;
                const busy = !!m, orders = this._amberOrders(false);
                if (!orders.length) h += '<div class="amb-none">No orders right now.</div>';
                orders.forEach((o, i) => {
                    const tipMax = Math.round(o.reward * 0.35 * 1.15 * (A.premium ? 1.5 : 1));
                    h += `<div class="amb-card${o.express ? ' express' : ''}"><div class="amb-k">${o.express ? '⚡ Express' : 'Cozy Cafe'} · ${(o.km / 1000).toFixed(1)} km · ~${o.etaMin} min</div>`
                       + `<b>${esc(o.targetLabel)}</b>`
                       + `<div class="amb-row"><span>${o.reward} PP <small>+ tips up to ${tipMax}</small></span>`
                       + `<button class="amb-btn" data-amb="take" data-i="${i}"${busy ? ' disabled' : ''}>${busy ? 'Busy' : 'Accept'}</button></div></div>`;
                });
                // Premium
                if (A.premium) h += '<div class="amb-prem on"><b>Amber Premium</b><small>Tips ×1.5 · Express orders · a fourth order on the board</small></div>';
                else h += `<div class="amb-prem"><b>Amber Premium</b><small>Tips ×1.5 · Express orders that pay 60% more · a fourth order on the board</small>`
                        + `<button class="amb-btn gold" data-amb="prem">${AMBER_PREMIUM_COST} PP</button></div>`;
                el.innerHTML = h;
                el.querySelectorAll('[data-amb]').forEach(b => b.addEventListener('click', e => {
                    e.stopPropagation();
                    const k = b.dataset.amb;
                    if (k === 'take') this.acceptAmber(+b.dataset.i);
                    else if (k === 'prem') this.buyAmberPremium();
                    else if (k === 'way') { const spot = this._jobSpot(game.missions.activeMission); if (spot && this.setWaypoint(spot)) audioSys.sfx('ui'); }
                }));
            },
        });

        document.getElementById('app-amber').addEventListener('click', () => phoneSystem.showAmber());
        document.getElementById('amber-back').addEventListener('click', () => phoneSystem.showHome());
        document.getElementById('amber-online').addEventListener('click', () => phoneSystem.toggleAmberOnline());
        setInterval(() => {
            phoneSystem._amberTick();
            if (phoneSystem.isOpen && phoneSystem.currentApp === 'amber' && game && game.missions.activeMission) phoneSystem.renderAmber();
        }, 1000);
