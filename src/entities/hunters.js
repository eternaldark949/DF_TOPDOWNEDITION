        /* =====================================================================
           HUNTERS — the Demoness's own (the Demoness Palace gauntlet)
           ---------------------------------------------------------------------
           A Hunter is a Ganger that was made for the dark:
             · night vision — her hiding in shadow doesn't blind it, and in the
               dark it still notices her (visibility floored at 0.55); its eyes
               burn ember, its sight cone shows red (the tell)
             · a dash — a crimson flit to close on her (ALERT, 150–420 px), or a
               sidestep when it's hit; a short cooldown, a noise she can hear
             · a claw — a swipe up close, with its sidearm for the rest
           The Hunter Alpha is tougher and dashes twice. The Demoness (a boss):
           horns, wings, a gown; chained dashes, a whip-claw at reach, she hunts
           by sound when she loses Stella; can't be executed; her intro under
           THE DEMONESS; her first defeat leaves the Maiden's Kukri.
           ===================================================================== */
        class Hunter extends Ganger {
            constructor(x, y, cfg = {}) {
                super(x, y, { hp: cfg.hp || 70, speed: cfg.speed || 2.8, visionRange: cfg.visionRange || 520, weaponId: cfg.weaponId || 'pistol_ganger' });
                this.hunter = true;
                this.nightVision = true;
                this.alpha = !!cfg.alpha;
                this.dashMax = cfg.dashes || 1; this.dashCDBase = cfg.dashCD || 230;
                this.dashCD = 90 + Math.random() * 120; this._chain = 0;
                this.clawCD = 0; this.clawDmg = cfg.claw || 14; this.clawReach = cfg.clawReach || 44;
                this.huntSpeed = cfg.huntSpeed || 2.4;
                this.look = cfg.look || Hunter.makeLook(this.alpha);
            }

            static makeLook(alpha) {
                const r = Math.random;
                return {
                    gender: r() < 0.5 ? 'female' : 'male', skinColor: ['#3a1a1a', '#5a2a24', '#2a1414', '#6a3a30'][r() * 4 | 0], eyeColor: '#ff5a1a', blood: 'ink',
                    build: alpha ? 'broad' : r() < 0.5 ? 'athletic' : 'slim', height: alpha ? 1.08 : 0.98 + r() * 0.06,
                    top: { type: 'coat', color: alpha ? '#2a0610' : '#120a0e', inner: '#2a0a12', trim: alpha ? '#e3a64a' : '#7a0618' },
                    bottom: { type: 'leggings', color: '#0c0608' }, shoes: { type: 'boots', color: '#0a0406' },
                    hat: { type: 'hood_up', color: alpha ? '#3a0614' : '#1a0a10' }
                };
            }

            update(player, walls, buildings, markers, traffic, map, enemies) {
                if (this.dead) return null;
                if (this.dormant || this._execBy) return null;
                // Night vision: she isn't hidden from it, and in the dark it still picks her out
                const seen = Object.create(player);
                seen.isHidden = false; seen.visibility = Math.max(player.visibility ?? 0, 0.55);
                let res = super.update(seen, walls, buildings, markers, traffic, map, enemies);
                if (this.dead || typeof game === 'undefined') return res;
                const g = game, dx = player.x - this.x, dy = player.y - this.y, d = Math.hypot(dx, dy);
                this.dashCD--; this.clawCD--;
                const engaged = this.state === 'ALERT' || this.state === 'SUPPRESSING';
                // A dash at her, from across the room (twice for an alpha, the second hard on the first)
                if (engaged && this.dashCD <= 0 && d > 150 && d < 420) {
                    const ux = dx / d, uy = dy / d;
                    if (this._dash(player.x - ux * 70, player.y - uy * 70, walls, buildings)) {
                        this._chain = (this._chain || 0) + 1;
                        this.dashCD = this._chain < this.dashMax ? 22 : this.dashCDBase * (0.8 + Math.random() * 0.4);
                        if (this._chain >= this.dashMax) this._chain = 0;
                    } else this.dashCD = 30;
                }
                // Hit: a sidestep out of the line of fire
                if (this._hitT && _gameTimeSec - this._hitT < 0.02 && this.dashCD > 40 && this.dashCD < this.dashCDBase && Math.random() < 0.5) {
                    const s = Math.random() < 0.5 ? 1 : -1, ux = dx / (d || 1), uy = dy / (d || 1);
                    if (this._dash(this.x - uy * 90 * s, this.y + ux * 90 * s, walls, buildings)) this.dashCD = Math.max(this.dashCD, 120);
                }
                // A claw up close
                if (engaged && d < this.clawReach && this.clawCD <= 0) {
                    this.clawCD = 45;
                    this._clawT = _gameTimeSec;
                    const a = Math.atan2(dy, dx);
                    const claw = new ProjectileEntity({ x: player.x - Math.cos(a) * 4, y: player.y - Math.sin(a) * 4, angle: a, radius: 18, speed: 0.5, life: 3,
                                                        damage: this.clawDmg, isEnemy: true, owner: this, color: 'rgba(0,0,0,0)', melee: true });
                    res = res ? [].concat(res, claw) : claw;
                }
                return res;
            }

            /** A crimson flit: to (tx, ty) if the way is clear (never into a wall); a noise she can hear */
            _dash(tx, ty, walls, buildings) {
                const g = typeof game !== 'undefined' ? game : null; if (!g) return false;
                const nav = NavGrid.for(g.activeMap);
                if (nav && !nav.walkable(tx, ty)) return false;
                if (isLineBlocked(this.x, this.y, tx, ty, walls, buildings)) return false;
                if (g.roomSystem && g.roomSystem.active && g.roomSystem.doorBlocks(this.x, this.y, tx, ty)) return false;
                const L = g.hunterDashes || (g.hunterDashes = []);
                L.push({ x0: this.x, y0: this.y, x1: tx, y1: ty, t0: _gameTimeSec, a: this.angle, look: this.look, boss: !!this.bossName, seed: Math.random() * 100 });
                if (L.length > 12) L.shift();
                this.x = tx; this.y = ty;
                g.emitNoise(tx, ty, 220, 'dash', false, { src: this });
                return true;
            }
        }

        class Demoness extends Hunter {
            constructor(x, y, cfg = {}) {
                super(x, y, { hp: cfg.hp || 900, speed: 3.0, visionRange: 640, dashes: 2, dashCD: 150, claw: 22, clawReach: 50, huntSpeed: 2.9, look: Demoness.look() });
                this.bossName = 'Lilitu, the Demoness';
                this.maxHp = this.hp;
                this._noExecute = true;
                this.whipCD = 60; this.telegraphThreshold = 30;
                this._eyeK = 1; this._eyeT = 1; this._riseK = 1; this._riseT = 1; this._igniteFlash = 0;
            }

            static look() {
                return {
                    gender: 'female', skinColor: '#8a0707', eyeColor: '#ff5a1a', blood: 'ink', build: 'curvy', height: 1.14,
                    hair: { type: 'demon_dancer', color: '#0a0000' },
                    hat: { type: 'demon_horns', color: '#160406', trim: '#e3a64a' },
                    top: { type: 'sleeved_crop', color: '#0a0406', trim: '#e3a64a' },
                    bottom: { type: 'long_skirt', color: '#0a0406', trim: '#b0122e' },
                    train: { type: 'dress_train', color: '#2a0610' },
                    shoes: { type: 'heels', color: '#0a0406' }
                };
            }

            makeDormant() { this.dormant = true; this._eyeT = 0; this._eyeK = 0; this._riseT = 0; this._riseK = 0; }
            awaken() {
                this.dormant = false; this._eyeT = 1; this._riseT = 1;
                const p = typeof game !== 'undefined' && game.player;
                if (p) { this.state = 'SEARCHING'; this.suspicion = 70; this.investigateTarget = { x: p.x, y: p.y }; }
            }

            update(player, walls, buildings, markers, traffic, map, enemies) {
                this._eyeK += (this._eyeT - this._eyeK) * 0.08; this._riseK += (this._riseT - this._riseK) * 0.05;
                this._igniteFlash = Math.max(0, (this._igniteFlash || 0) - 0.03);
                if (this.dead || this.dormant) return null;
                // She hunts by sound: lose her and she goes still, listening, then she's gone to the noise
                let res = super.update(player, walls, buildings, markers, traffic, map, enemies);
                if (this.dead || typeof game === 'undefined') return res;
                const dx = player.x - this.x, dy = player.y - this.y, d = Math.hypot(dx, dy);
                this.whipCD--;
                if ((this.state === 'ALERT' || this.state === 'SUPPRESSING') && this.whipCD <= 0 && d > 55 && d < 120 && !isLineBlocked(this.x, this.y, player.x, player.y, walls, buildings)) {
                    this.whipCD = 75; this._whipT = _gameTimeSec; this._whipTo = { x: player.x, y: player.y };
                    const a = Math.atan2(dy, dx);
                    const whip = new ProjectileEntity({ x: player.x - Math.cos(a) * 4, y: player.y - Math.sin(a) * 4, angle: a, radius: 20, speed: 0.5, life: 3,
                                                        damage: 18, isEnemy: true, owner: this, color: 'rgba(0,0,0,0)', melee: true });
                    res = res ? [].concat(res, whip) : whip;
                }
                if (this.state === 'SEARCHING' && this.investigateTarget && this.dashCD <= 0) {
                    const t = this.investigateTarget, dd = Math.hypot(t.x - this.x, t.y - this.y);
                    if (dd > 160 && dd < 460 && this._dash(t.x, t.y, walls, buildings)) this.dashCD = this.dashCDBase;
                }
                return res;
            }

            draw(ctx) {
                if (this.dead) return;
                // Her wings, behind her: two membranes of black and crimson that breathe as she moves
                const t = _gameTimeSec, flap = 0.12 * Math.sin(t * 3 + this.x * 0.01), rise = 0.6 + 0.4 * (this._riseK ?? 1);
                ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle); ctx.scale(rise, rise);
                for (const s of [-1, 1]) {
                    ctx.save(); ctx.rotate(s * (0.25 + flap));
                    ctx.fillStyle = 'rgba(14,2,6,0.92)'; ctx.strokeStyle = 'rgba(176,18,46,0.75)'; ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.moveTo(-4, s * 5);
                    ctx.quadraticCurveTo(-14, s * 30, -34, s * 40); ctx.lineTo(-30, s * 30); ctx.lineTo(-38, s * 26); ctx.lineTo(-30, s * 18); ctx.lineTo(-34, s * 10);
                    ctx.quadraticCurveTo(-18, s * 8, -6, s * 3); ctx.closePath(); ctx.fill(); ctx.stroke();
                    ctx.strokeStyle = 'rgba(227,166,74,0.5)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-5, s * 5); ctx.lineTo(-34, s * 40); ctx.moveTo(-5, s * 5); ctx.lineTo(-38, s * 26); ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();
                super.draw(ctx);
                // the whip-claw: a crimson lash to where she struck
                if (this._whipT && _gameTimeSec - this._whipT < 0.18 && this._whipTo) {
                    const k = 1 - (_gameTimeSec - this._whipT) / 0.18;
                    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,60,90,${0.8 * k})`; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
                    const mx = (this.x + this._whipTo.x) / 2 + Math.cos(this.angle + 1.57) * 18, my = (this.y + this._whipTo.y) / 2 + Math.sin(this.angle + 1.57) * 18;
                    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.quadraticCurveTo(mx, my, this._whipTo.x, this._whipTo.y); ctx.stroke(); ctx.restore();
                }
            }
        }

