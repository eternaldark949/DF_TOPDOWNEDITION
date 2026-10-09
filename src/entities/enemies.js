        /**
         * =====================================================================
         *  VELVET CAT — Dreampunk Feline Companion
         * =====================================================================
         * A small velvet-furred cat that follows 949 through the city.
         * Procedurally rendered, curious idle behaviors, rides in vehicles.
         * Acquired once, persists via questState.hasVelvetCat.
         */
        // Retained coat options for future customization. Palette records and semantic colors are immutable.
        // Eye, muzzle, nose, inner-ear and whisker colors remain part of the shared feline artwork.
        const VELVET_CAT_PALETTES = Object.freeze({
            default: Object.freeze({
                id: 'default', label: 'Default plum',
                colors: Object.freeze({
                    tailBase: "#211226",
                    tailMiddle: "#2f1c35",
                    tailTip: "#190d20",
                    tailNap: "rgba(123,87,142,.18)",
                    raisedPaw: "#3a2440",
                    pawTop: "#2b1932",
                    pawShadow: "#160b1c",
                    pawRim: "rgba(108,75,120,.24)",
                    legShade: "#1b0e23",
                    bodyTop: "#35223d",
                    bodyMiddle: "#27152e",
                    bodyShade: "#1b0d22",
                    bodyDeep: "#120a19",
                    napStart: "rgba(125,91,147,0)",
                    napHighlight: "rgba(143,109,160,.10)",
                    napShade: "rgba(118,84,139,.055)",
                    napEnd: "rgba(118,84,139,0)",
                    furStroke: "rgba(164,126,180,.065)",
                    bodyRim: "rgba(110,78,128,.23)",
                    earTip: "#211126",
                    earMiddle: "#3b2541",
                    earBase: "#24142d",
                    earRim: "rgba(151,103,147,.20)",
                    headTop: "#382440",
                    headMiddle: "#2c1934",
                    headShadow: "#190e22",
                    cheekFur: "rgba(133,92,150,.21)",
                    groomArm: "#24122c",
                })
            }),
            tinge: Object.freeze({
                id: 'tinge', label: 'Velvet tinge',
                colors: Object.freeze({
                    tailBase: "#2b1226",
                    tailMiddle: "#3d1c31",
                    tailTip: "#200d1e",
                    tailNap: "rgba(134,78,117,.18)",
                    raisedPaw: "#46223a",
                    pawTop: "#35172d",
                    pawShadow: "#1a0b1b",
                    pawRim: "rgba(122,70,105,.24)",
                    legShade: "#240e23",
                    bodyTop: "#442039",
                    bodyMiddle: "#30142c",
                    bodyShade: "#210d21",
                    bodyDeep: "#150a18",
                    napStart: "rgba(137,82,120,0)",
                    napHighlight: "rgba(155,93,127,.10)",
                    napShade: "rgba(133,75,112,.055)",
                    napEnd: "rgba(133,75,112,0)",
                    furStroke: "rgba(171,113,145,.065)",
                    bodyRim: "rgba(123,70,107,.23)",
                    earTip: "#2b1126",
                    earMiddle: "#482239",
                    earBase: "#2f1329",
                    earRim: "rgba(156,92,128,.20)",
                    headTop: "#452139",
                    headMiddle: "#36172f",
                    headShadow: "#210d21",
                    cheekFur: "rgba(145,83,123,.21)",
                    groomArm: "#2d1128",
                })
            }),
            full: Object.freeze({
                id: 'full', label: 'Full velvet color',
                colors: Object.freeze({
                    tailBase: "#581832",
                    tailMiddle: "#70203d",
                    tailTip: "#330f25",
                    tailNap: "rgba(190,89,126,.18)",
                    raisedPaw: "#7a2542",
                    pawTop: "#5e1935",
                    pawShadow: "#310e24",
                    pawRim: "rgba(174,78,111,.24)",
                    legShade: "#3e1029",
                    bodyTop: "#8a2545",
                    bodyMiddle: "#681d39",
                    bodyShade: "#49132d",
                    bodyDeep: "#330f25",
                    napStart: "rgba(188,83,119,0)",
                    napHighlight: "rgba(204,104,139,.10)",
                    napShade: "rgba(171,71,108,.055)",
                    napEnd: "rgba(171,71,108,0)",
                    furStroke: "rgba(215,132,157,.065)",
                    bodyRim: "rgba(174,76,104,.23)",
                    earTip: "#4e1430",
                    earMiddle: "#79243f",
                    earBase: "#561730",
                    earRim: "rgba(179,88,115,.20)",
                    headTop: "#8e2d4d",
                    headMiddle: "#671e3a",
                    headShadow: "#350f25",
                    cheekFur: "rgba(188,91,124,.21)",
                    groomArm: "#4d142e",
                })
            }),
        });

        class VelvetCat extends ActorEntity {
            constructor(x, y) {
                super({
                    x, y,
                    radius: 8,
                    type: 'companion',
                    alliance: 'friendly',
                    hp: 999999,
                    mass: 3,
                    friction: 0.85,
                    speed: 4.5,
                    hasCollision: true,
                    invincibleDuration: 999
                });
                this.name = 'Velvet';
                this.state = 'idle';       // idle, following, sitting, sleeping
                this.inCar = false;
                this.visible = true;
                this.coatPalette = 'default'; // Reserved for future customization; current appearance is unchanged.
                
                // Animation
                this.walkPhase = 0;
                this.tailPhase = Math.random() * Math.PI * 2;
                this.idleTimer = 0;
                this.idleBehavior = null;   // 'sit', 'look', 'groom'
                this.lookTarget = null;
                this.curiosityTimer = 0;
                this.angle = 0;
                
                // Wander offset for natural following
                this._wanderAngle = 0;
                this._wanderTimer = 0;
            }
            
            update(player, dt) {
                if (!this.visible || this.inCar) return;
                
                const dx = player.x - this.x;
                const dy = player.y - this.y;
                const dist = Math.hypot(dx, dy);
                
                // Wander offset — drifts the follow target left/right
                this._wanderTimer += dt || 1;
                if (this._wanderTimer > 120) {
                    this._wanderAngle += (Math.random() - 0.5) * 1.2;
                    this._wanderTimer = 0;
                }
                
                // Target point: behind and slightly to the side of player
                const behindDist = 60;
                const targetX = player.x - Math.cos(player.angle) * behindDist + Math.sin(this._wanderAngle) * 25;
                const targetY = player.y - Math.sin(player.angle) * behindDist + Math.cos(this._wanderAngle) * 25;
                const tDist = Math.hypot(this.x - targetX, this.y - targetY);
                
                if (dist > 500) {
                    // Teleport if too far (map transition, etc.)
                    this.x = player.x - Math.cos(player.angle) * 40;
                    this.y = player.y - Math.sin(player.angle) * 40;
                    this.state = 'following';
                } else if (tDist > 200) {
                    // Sprint to catch up — exceeds player speed so the cat can close gaps
                    this.state = 'following';
                    const angle = Math.atan2(targetY - this.y, targetX - this.x);
                    this.angle = angle;
                    this.x += Math.cos(angle) * 6.5;
                    this.y += Math.sin(angle) * 6.5;
                    this.walkPhase += 0.45;
                    this.idleTimer = 0;
                } else if (tDist > 120) {
                    // Trot at player speed — keeps up while moving
                    this.state = 'following';
                    const angle = Math.atan2(targetY - this.y, targetX - this.x);
                    this.angle = angle;
                    this.x += Math.cos(angle) * 5.2;
                    this.y += Math.sin(angle) * 5.2;
                    this.walkPhase += 0.35;
                    this.idleTimer = 0;
                } else if (tDist > 40) {
                    // Lazy walk — natural feline saunter when keeping pace at close range
                    this.state = 'following';
                    const angle = Math.atan2(targetY - this.y, targetX - this.x);
                    this.angle = angle;
                    this.x += Math.cos(angle) * 2.4;
                    this.y += Math.sin(angle) * 2.4;
                    this.walkPhase += 0.2;
                    this.idleTimer = 0;
                } else {
                    // Close enough — idle behaviors
                    this.state = 'idle';
                    this.walkPhase *= 0.9;
                    this.idleTimer++;
                    
                    if (this.idleTimer > 180 && !this.idleBehavior) {
                        // Pick a random idle behavior
                        const roll = Math.random();
                        if (roll < 0.4) this.idleBehavior = 'sit';
                        else if (roll < 0.7) this.idleBehavior = 'groom';
                        else this.idleBehavior = 'look';
                    }
                    
                    if (this.idleTimer > 400) {
                        this.idleBehavior = null;
                        this.idleTimer = 100; // Reset cycle
                    }
                }
                
                // Tail always animates
                this.tailPhase += 0.04;
            }
            
            draw(ctx) {
                if (!this.visible || this.inCar) return;

                // A missing/unrecognized selector uses the exact original coat colors.
                const coatColors = Object.prototype.hasOwnProperty.call(VELVET_CAT_PALETTES, this.coatPalette)
                    ? VELVET_CAT_PALETTES[this.coatPalette].colors : VELVET_CAT_PALETTES.default.colors;

                const phase = Number.isFinite(this.tailPhase) ? this.tailPhase : 0;
                const sleeping = this.state === 'sleeping';
                const sitting = this.state === 'sitting' || (this.state === 'idle' && this.idleBehavior === 'sit');
                const grooming = this.state === 'idle' && this.idleBehavior === 'groom';
                const looking = this.state === 'idle' && this.idleBehavior === 'look';
                const walking = this.state === 'following';
                const stride = walking ? Math.sin(this.walkPhase) * 2.5 : 0;
                const lift = walking ? Math.cos(this.walkPhase) : 0;
                const length = sitting ? 12 : 16;
                const headX = sleeping ? 5.3 : length - 2;
                const headY = sleeping ? 2.1 : 0;
                const headTurn = sleeping ? .77 : grooming ? -.17 + Math.sin(phase * 3.2) * .045 : looking ? Math.sin(phase * .7) * .15 : 0;

                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.shadowBlur = 0;

                // A compact ground shadow; the feline outline itself stays smooth and short-haired.
                ctx.fillStyle = 'rgba(0,0,0,.27)';
                ctx.beginPath();
                ctx.ellipse(sleeping ? -3 : -1, 2.5, sleeping ? 13 : length + 1, sleeping ? 9 : 7.2, 0, 0, Math.PI * 2);
                ctx.fill();

                // Supple, tapering tail, painted behind the rump. All motion comes from update's phase.
                const sway = Math.sin(phase) * 5.3;
                const curl = Math.sin(phase * 1.3 + 1) * 2;
                const tailShade = ctx.createLinearGradient(-length, -2, -35, 6);
                tailShade.addColorStop(0, coatColors.tailBase);
                tailShade.addColorStop(.48, coatColors.tailMiddle);
                tailShade.addColorStop(1, coatColors.tailTip);
                ctx.strokeStyle = tailShade;
                ctx.lineWidth = 3.2;
                ctx.beginPath();
                if (sleeping) {
                    ctx.moveTo(-13, -1);
                    ctx.bezierCurveTo(-20, 5, -12, 11.4, -2, 10.1);
                    ctx.bezierCurveTo(5, 9.6, 9.5, 7.7, 10, 4.8);
                } else if (sitting) {
                    ctx.moveTo(-length + 2, 0);
                    ctx.bezierCurveTo(-21, sway * .35, -24, 9 + curl, -17, 10);
                    ctx.bezierCurveTo(-12, 10.6, -9, 9.5, -8, 7.8);
                } else {
                    ctx.moveTo(-length + 2, 0);
                    ctx.bezierCurveTo(-21, 1 + sway * .40, -29, 7 + sway * .45, -33, 4 + sway * .40);
                }
                ctx.stroke();
                if (!sleeping && !sitting) {
                    ctx.lineWidth = 1.9;
                    ctx.beginPath();
                    ctx.moveTo(-33, 4 + sway * .40);
                    ctx.bezierCurveTo(-36, 1.5 + sway * .32, -34.1, -1 + curl, -31.7, .1 + curl);
                    ctx.stroke();
                }
                ctx.strokeStyle = coatColors.tailNap;
                ctx.lineWidth = .65;
                ctx.beginPath();
                if (sleeping) {
                    ctx.moveTo(-14, .3);ctx.bezierCurveTo(-17, 5.7, -10, 10.3, -3, 9.8);
                } else if (sitting) {
                    ctx.moveTo(-11, -.5);ctx.bezierCurveTo(-20, sway * .35, -22, 8, -17, 9.7);
                } else {
                    ctx.moveTo(-15, -.6);ctx.bezierCurveTo(-22, .5 + sway * .40, -28, 6.3 + sway * .45, -32.4, 3.8 + sway * .40);
                }
                ctx.stroke();

                // Round paws belong beneath the torso. Opposite diagonal pairs step along facing +X.
                const paw = (x, y, rx = 2.8, ry = 1.85, raised = false) => {
                    const g = ctx.createLinearGradient(x - rx, y - ry, x + rx, y + ry);
                    g.addColorStop(0, raised ? coatColors.raisedPaw : coatColors.pawTop);
                    g.addColorStop(1, coatColors.pawShadow);
                    ctx.fillStyle = g;ctx.beginPath();ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);ctx.fill();
                    ctx.strokeStyle = coatColors.pawRim;ctx.lineWidth = .45;
                    ctx.beginPath();ctx.moveTo(x + rx * .63, y - .48);ctx.lineTo(x + rx * .84, y - .48);
                    ctx.moveTo(x + rx * .63, y + .42);ctx.lineTo(x + rx * .84, y + .42);ctx.stroke();
                };
                if (!sleeping) {
                    if (sitting) {
                        paw(-5.5, -6.4, 3.2, 2.1);paw(-5.5, 6.4, 3.2, 2.1);
                        paw(10.1, -2.8, 2.8, 1.75);paw(10.1, 2.8, 2.8, 1.75);
                    } else {
                        for (const side of [-1, 1]) {
                            for (const front of [false, true]) {
                                if (grooming && front && side === -1) continue;
                                const sign = (front ? 1 : -1) * side;
                                const jointX = front ? 7.8 : -9.1;
                                const footX = (front ? 9.4 : -10.5) + stride * sign;
                                const footY = side * (front ? 6.6 : 6.1) + side * Math.max(0, lift * sign) * .38;
                                ctx.strokeStyle = coatColors.legShade;ctx.lineWidth = 3;
                                ctx.beginPath();ctx.moveTo(jointX, side * 4.1);ctx.quadraticCurveTo(footX - .8, side * 5.2, footX, footY);ctx.stroke();
                                paw(footX, footY, front ? 2.65 : 2.95, 1.8);
                            }
                        }
                    }
                }

                // Rounded haunches, a small waist, and muscular shoulders replace the capsule body.
                const body = new Path2D();
                if (sleeping) {
                    body.moveTo(-15, 1);
                    body.bezierCurveTo(-15.5, -5.1, -8.8, -8.9, -3, -8.1);
                    body.bezierCurveTo(4.1, -8, 9.1, -3.2, 8.5, 3);
                    body.bezierCurveTo(7.7, 8.1, -.1, 10.2, -7.5, 8.8);
                    body.bezierCurveTo(-12.8, 7.5, -15.4, 5.1, -15, 1);
                } else {
                    const s = length / 16;
                    body.moveTo(-16 * s, 0);
                    body.bezierCurveTo(-16 * s, -4.5, -12.2 * s, -7.1, -8.5 * s, -7.1);
                    body.bezierCurveTo(-4.2 * s, -7, -3.7 * s, -4.9, .2 * s, -4.8);
                    body.bezierCurveTo(4.2 * s, -4.9, 5.9 * s, -6.7, 9.1 * s, -6.2);
                    body.bezierCurveTo(12.6 * s, -5.8, 14.4 * s, -3.6, 14.2 * s, 0);
                    body.bezierCurveTo(14.4 * s, 3.6, 12.6 * s, 5.8, 9.1 * s, 6.2);
                    body.bezierCurveTo(5.9 * s, 6.7, 4.2 * s, 4.9, .2 * s, 4.8);
                    body.bezierCurveTo(-3.7 * s, 4.9, -4.2 * s, 7, -8.5 * s, 7.1);
                    body.bezierCurveTo(-12.2 * s, 7.1, -16 * s, 4.5, -16 * s, 0);
                }
                body.closePath();
                const coat = ctx.createLinearGradient(-5, -7.5, 4, 7.5);
                coat.addColorStop(0, coatColors.bodyTop);
                coat.addColorStop(.36, coatColors.bodyMiddle);
                coat.addColorStop(.7, coatColors.bodyShade);
                coat.addColorStop(1, coatColors.bodyDeep);
                ctx.fillStyle = coat;ctx.fill(body);
                ctx.save();ctx.clip(body);
                // A broad soft band of directional nap, with restrained short fur rather than gloss.
                const nap = ctx.createLinearGradient(-11, -6, 6, 5);
                nap.addColorStop(0, coatColors.napStart);
                nap.addColorStop(.40, coatColors.napHighlight);
                nap.addColorStop(.62, coatColors.napShade);
                nap.addColorStop(1, coatColors.napEnd);
                ctx.fillStyle = nap;ctx.fill(body);
                ctx.strokeStyle = coatColors.furStroke;ctx.lineWidth = .26;
                ctx.beginPath();
                for (let i = 0; i < 17; i++) {
                    // Irrational offsets scatter the fixed strands without a visible row pattern or RNG.
                    const x = -12.3 + ((i * .61803398875 + .19) % 1) * 24;
                    const y = -5.6 + ((i * .41421356237 + .36) % 1) * 11.2;
                    const short = .70 + (Math.sin(i * 2.41) + 1) * .23;
                    const tilt = Math.sin(i * 1.73) * .16;
                    ctx.moveTo(x, y);ctx.quadraticCurveTo(x + short * .48, y + tilt + .06, x + short, y + tilt);
                }
                ctx.stroke();ctx.restore();
                ctx.strokeStyle = coatColors.bodyRim;ctx.lineWidth = .6;
                ctx.beginPath();
                if (sleeping) {ctx.moveTo(-13, -3);ctx.bezierCurveTo(-10, -8, -4.2, -8.5, .5, -6.9);}
                else {ctx.moveTo(-length + 2, -3.4);ctx.bezierCurveTo(-length + 5, -7.2, -6, -6.3, -3.8, -5.4);}
                ctx.stroke();

                // The face turns slightly for existing look/groom states; no animation state is written here.
                ctx.save();ctx.translate(headX, headY);ctx.rotate(headTurn);
                for (const side of [-1, 1]) {
                    const ear = ctx.createLinearGradient(-2, side * 9.8, 0, side * 3.7);
                    ear.addColorStop(0, coatColors.earTip);ear.addColorStop(.55, coatColors.earMiddle);ear.addColorStop(1, coatColors.earBase);
                    ctx.fillStyle = ear;ctx.beginPath();
                    ctx.moveTo(-4.0, side * 3.5);
                    ctx.quadraticCurveTo(-3.0, side * 6.8, -1.55, side * 10.1);
                    ctx.quadraticCurveTo(-1.12, side * 10.9, -.68, side * 9.8);
                    ctx.lineTo(1.6, side * 4.25);ctx.closePath();ctx.fill();
                    ctx.fillStyle = '#593047';ctx.beginPath();
                    ctx.moveTo(-2.65, side * 4.4);ctx.lineTo(-1.18, side * 8.7);ctx.lineTo(.38, side * 4.7);ctx.closePath();ctx.fill();
                    ctx.strokeStyle = coatColors.earRim;ctx.lineWidth = .5;
                    ctx.beginPath();ctx.moveTo(-3.15, side * 4.7);ctx.lineTo(-1.55, side * 9.2);ctx.stroke();
                }
                const face = ctx.createLinearGradient(-3, -5.2, 5, 4.5);
                face.addColorStop(0, coatColors.headTop);face.addColorStop(.42, coatColors.headMiddle);face.addColorStop(1, coatColors.headShadow);
                ctx.fillStyle = face;ctx.beginPath();
                ctx.moveTo(-4.7, 0);
                ctx.bezierCurveTo(-4.8, -4.1, -1.8, -5.7, 1.3, -4.75);
                ctx.bezierCurveTo(3.8, -4.1, 4.45, -2.55, 5.8, -1.05);
                ctx.quadraticCurveTo(6.45, 0, 5.8, 1.05);
                ctx.bezierCurveTo(4.45, 2.55, 3.8, 4.1, 1.3, 4.75);
                ctx.bezierCurveTo(-1.8, 5.7, -4.8, 4.1, -4.7, 0);ctx.closePath();ctx.fill();
                // Just three small cheek tips per side suggest a short plush coat.
                ctx.strokeStyle = coatColors.cheekFur;ctx.lineWidth = .42;
                ctx.beginPath();
                for (const side of [-1, 1]) {
                    ctx.moveTo(.8, side * 4.5);ctx.lineTo(1.7, side * 4.85);
                    ctx.moveTo(1.7, side * 4.1);ctx.lineTo(2.65, side * 4.55);
                    ctx.moveTo(2.55, side * 3.6);ctx.lineTo(3.3, side * 3.95);
                }
                ctx.stroke();
                for (const side of [-1, 1]) {
                    ctx.save();ctx.translate(2.55, side * 2.42);ctx.rotate(side * .22);
                    if (sleeping) {
                        ctx.strokeStyle = '#b18abc';ctx.lineWidth = .65;
                        ctx.beginPath();ctx.moveTo(-1.35, 0);ctx.quadraticCurveTo(0, .58, 1.3, -.04);ctx.stroke();
                    } else {
                        ctx.beginPath();ctx.moveTo(-1.68, 0);ctx.quadraticCurveTo(-.1, -1.04, 1.6, 0);ctx.quadraticCurveTo(-.1, 1.0, -1.68, 0);
                        ctx.fillStyle = '#ac7fc4';ctx.fill();ctx.strokeStyle = '#120918';ctx.lineWidth = .48;ctx.stroke();
                        ctx.fillStyle = '#170d20';ctx.beginPath();ctx.ellipse(.18, 0, .35, .78, 0, 0, Math.PI * 2);ctx.fill();
                        ctx.fillStyle = '#e8d7ed';ctx.beginPath();ctx.arc(-.48, -.30, .32, 0, Math.PI * 2);ctx.fill();
                    }
                    ctx.restore();
                }
                // Paired muzzle pads and tiny muted-pink nose preserve a compact feline snout.
                ctx.fillStyle = '#422a45';ctx.beginPath();
                ctx.ellipse(4.55, -1.12, 1.38, 1.27, -.16, 0, Math.PI * 2);
                ctx.ellipse(4.55, 1.12, 1.38, 1.27, .16, 0, Math.PI * 2);ctx.fill();
                ctx.fillStyle = '#b38c9c';ctx.beginPath();ctx.moveTo(6.1, 0);ctx.lineTo(5.12, -.66);ctx.lineTo(5.12, .66);ctx.closePath();ctx.fill();
                ctx.strokeStyle = '#170d20';ctx.lineWidth = .45;ctx.beginPath();
                ctx.moveTo(5.28, 0);ctx.lineTo(4.86, 0);ctx.quadraticCurveTo(4.8, -.46, 4.32, -.66);
                ctx.moveTo(4.86, 0);ctx.quadraticCurveTo(4.8, .46, 4.32, .66);ctx.stroke();
                ctx.strokeStyle = 'rgba(168,142,176,.44)';ctx.lineWidth = .35;ctx.beginPath();
                for (const side of [-1, 1]) {
                    ctx.moveTo(4.9, side * 1.35);ctx.quadraticCurveTo(3.5, side * 3.2, 2.65, side * 5.5);
                    ctx.moveTo(5.15, side * 1.1);ctx.quadraticCurveTo(5.0, side * 3.5, 5.6, side * 5.3);
                    ctx.moveTo(5.45, side * .82);ctx.quadraticCurveTo(6.9, side * 2.1, 7.15, side * 3.95);
                }
                ctx.stroke();
                if (grooming) {
                    const lick = Math.sin(phase * 3.2);
                    ctx.strokeStyle = coatColors.groomArm;ctx.lineWidth = 2.8;
                    ctx.beginPath();ctx.moveTo(-5.0, -4.1);ctx.quadraticCurveTo(-.5, -4.7, 4.55, -3.7 + lick * .26);ctx.stroke();
                    paw(4.65, -3.7 + lick * .26, 2.15, 1.5, true);
                    if (lick > .25) {
                        ctx.strokeStyle = '#b27f97';ctx.lineWidth = .75;
                        ctx.beginPath();ctx.moveTo(5.7, -.4);ctx.lineTo(5.45, -1.12 - lick * .38);ctx.stroke();
                    }
                }
                ctx.restore();
                ctx.restore();
            }
        }

        /**
         * =====================================================================
         *  DRONE (Flying Combat Enemy - extends ActorEntity)
         * =====================================================================
         * Hovering combat drones with LOS-based targeting.
         * Now part of the unified collision system.
         * 
         * Features:
         * - Circle collision for prop/wall interactions
         * - HP system with knockback support
         * - Hover animation effect
         * - Line-of-sight checking
         * - Strafe AI when blocked
         */
        class Drone extends ActorEntity {
            constructor(x, y) {
                // Initialize ActorEntity with circle collision
                super({
                    x: x,
                    y: y,
                    radius: 15,
                    type: 'drone',
                    alliance: 'hostile',
                    hp: 60,
                    mass: 8,          // Light (flying)
                    friction: 0.9,
                    speed: 3,
                    hasCollision: true,
                    invincibleDuration: 15
                });
                
                // Combat
                this.cooldown = Math.random() * 100;
                
                // Telegraph
                this.telegraphThreshold = 8; // ~0.13s window
                this.telegraphAngle = 0;
                this.isTelegraphing = false;
                this._prevPlayerX = 0;
                this._prevPlayerY = 0;
                
                // Animation
                this.hoverOffset = Math.random() * Math.PI * 2;
                
                // AI
                this.strafeDir = Math.random() > 0.5 ? 1 : -1;
                this.strafeTimer = 0;
            }
            
            /**
             * Check if there's line of sight to target.
             */
            hasLineOfSight(targetX, targetY, walls) {
                const dx = targetX - this.x;
                const dy = targetY - this.y;
                const dist = Math.hypot(dx, dy);
                const steps = Math.ceil(dist / 20);
                
                for (let i = 1; i < steps; i++) {
                    const t = i / steps;
                    const checkX = this.x + dx * t;
                    const checkY = this.y + dy * t;
                    
                    for (let w of walls) {
                        if (checkX > w.x && checkX < w.x + w.w && 
                            checkY > w.y && checkY < w.y + w.h) {
                            return false;
                        }
                    }
                }
                return true;
            }
            
            /**
             * Override ActorEntity update for drone AI.
             */
            update(playerX, playerY, walls) {
                if (this.dead) return null;
                
                // Hover animation
                this.hoverOffset += 0.1;
                
                // Decrement invincibility
                if (this.invincibleTimer > 0) {
                    this.invincibleTimer--;
                }
                
                // Apply knockback physics
                if (this.knockbackVx || this.knockbackVy) {
                    this.vx += this.knockbackVx;
                    this.vy += this.knockbackVy;
                    this.knockbackVx *= this.knockbackFriction;
                    this.knockbackVy *= this.knockbackFriction;
                    if (Math.abs(this.knockbackVx) < 0.1) this.knockbackVx = 0;
                    if (Math.abs(this.knockbackVy) < 0.1) this.knockbackVy = 0;
                }
                
                const dx = playerX - this.x; 
                const dy = playerY - this.y;
                const dist = Math.hypot(dx, dy); 
                const angle = Math.atan2(dy, dx);
                const targetDist = 200;
                
                // Check line of sight to player
                const hasLOS = this.hasLineOfSight(playerX, playerY, walls);
                
                if (!hasLOS) {
                    // No LOS - strafe to find a better angle
                    this.strafeTimer++;
                    if (this.strafeTimer > 60) {
                        this.strafeDir *= -1;
                        this.strafeTimer = 0;
                    }
                    
                    // Move perpendicular to player direction + slightly toward player
                    const strafeAngle = angle + (Math.PI / 2) * this.strafeDir;
                    this.vx += Math.cos(strafeAngle) * 0.3;
                    this.vy += Math.sin(strafeAngle) * 0.3;
                    
                    // Also move toward player slowly
                    this.vx += Math.cos(angle) * 0.1;
                    this.vy += Math.sin(angle) * 0.1;
                } else {
                    // Has LOS - normal behavior
                    this.strafeTimer = 0;
                    if (dist > targetDist) { 
                        this.vx += Math.cos(angle) * 0.2; 
                        this.vy += Math.sin(angle) * 0.2; 
                    } else { 
                        this.vx -= Math.cos(angle) * 0.1; 
                        this.vy -= Math.sin(angle) * 0.1; 
                    }
                }
                
                // Apply velocity with friction
                this.vx *= 0.9; 
                this.vy *= 0.9; 
                this.x += this.vx; 
                this.y += this.vy;
                
                // Wall collision (bounce off walls) - CollisionSystem handles separation
                // but we still want bounce behavior for drones
                for(let w of walls) {
                    if (this.x + this.radius > w.x && this.x - this.radius < w.x + w.w && 
                        this.y + this.radius > w.y && this.y - this.radius < w.y + w.h) {
                        this.vx *= -1; 
                        this.vy *= -1; 
                        this.x += this.vx * 2; 
                        this.y += this.vy * 2; 
                    }
                }
                
                // Shooting
                this.cooldown--;
                // Estimate player velocity from frame-to-frame delta
                const playerVelX = playerX - this._prevPlayerX;
                const playerVelY = playerY - this._prevPlayerY;
                this._prevPlayerX = playerX;
                this._prevPlayerY = playerY;
                
                // Telegraph: track player with predictive aim
                if (this.cooldown > 0 && this.cooldown <= this.telegraphThreshold && dist < 500 && hasLOS) {
                    this.isTelegraphing = true;
                    const projSpeed = 24;
                    const travelTime = dist / projSpeed;
                    const predX = playerX + playerVelX * travelTime;
                    const predY = playerY + playerVelY * travelTime;
                    this.telegraphAngle = Math.atan2(predY - this.y, predX - this.x);
                } else if (this.cooldown > this.telegraphThreshold || !hasLOS) {
                    this.isTelegraphing = false;
                }
                if (this.cooldown <= 0 && dist < 500 && hasLOS) { 
                    this.isTelegraphing = false;
                    this.cooldown = 80 + Math.random() * 40; 
                    return new ProjectileEntity({ 
                        x: this.x, 
                        y: this.y, 
                        angle: this.telegraphAngle, 
                        isEnemy: true,
                        owner: this
                    }); 
                }
                return null;
            }
            
            /**
             * Override onProjectileHit to only take damage from player projectiles.
             */
            onProjectileHit(projectile, game) {
                // Only take damage from player projectiles
                if (projectile.isEnemy) return;
                this.lastHitBy = projectile.owner; this.lastHitMelee = !!projectile.melee;   // who gets the Resonance
                
                const speed = Math.hypot(projectile.vx, projectile.vy);
                if (speed > 0) {
                    // Drones are light (mass 8) - sniper shots send them FLYING
                    const projMomentum = (projectile.mass || 1) * speed;
                    const damageMultiplier = projectile.damage / 20;
                    const knockbackStrength = Math.min((projMomentum * damageMultiplier) / (this.mass || 8), 80);
                    
                    const kbX = (projectile.vx / speed) * knockbackStrength;
                    const kbY = (projectile.vy / speed) * knockbackStrength;
                    this.takeDamage(projectile.damage, kbX, kbY);
                } else {
                    this.takeDamage(projectile.damage);
                }
            }
            
            /**
             * Legacy takeDamage for non-projectile damage (e.g., vehicle hits).
             */
            takeDamageOld(amount, bulletAngle) { 
                const kbX = Math.cos(bulletAngle) * 8;
                const kbY = Math.sin(bulletAngle) * 8;
                this.takeDamage(amount, kbX, kbY);
            }
            
            draw(ctx) {
                if (this.dead) return;
                
                // Flash if invincible
                if (this.invincibleTimer > 0 && this.invincibleTimer % 6 < 3) {
                    return;
                }
                
                ctx.save(); 
                ctx.translate(this.x, this.y + Math.sin(this.hoverOffset) * 3);
                
                // Body
                ctx.fillStyle = '#444'; 
                ctx.beginPath(); 
                ctx.arc(0, 0, 15, 0, Math.PI*2); 
                ctx.fill();
                
                // Eye (glowing) — flashes crimson during telegraph
                const eyeColor = this.isTelegraphing ? '#ff2244' : '#a469ff';
                ctx.fillStyle = eyeColor; 
                ctx.shadowColor = eyeColor; 
                ctx.shadowBlur = this.isTelegraphing ? 18 : 10; 
                ctx.beginPath(); 
                ctx.arc(0, 0, 6, 0, Math.PI*2); 
                ctx.fill();
                ctx.shadowBlur = 0; 
                
                // Rotating wings
                ctx.fillStyle = '#666'; 
                const rOffset = _frameTime / 50;
                ctx.beginPath(); 
                ctx.arc(Math.cos(rOffset)*20, Math.sin(rOffset)*20, 4, 0, Math.PI*2); 
                ctx.fill();
                ctx.beginPath(); 
                ctx.arc(Math.cos(rOffset + 2)*20, Math.sin(rOffset + 2)*20, 4, 0, Math.PI*2); 
                ctx.fill();
                
                // (Health bar: drawn with the other combat overlays once hit — engine/combat-fx.js)
                ctx.restore();

                // Telegraph aim line (world space)
                if (this.isTelegraphing && this.cooldown > 0) {
                    drawEnemyTelegraph(ctx, this.x, this.y, this.telegraphAngle,
                        this.cooldown, this.telegraphThreshold, '#a469ff');
                }
            }
        }
        
        /* --- TRAFFIC & GANGERS --- */
        /**
         * =====================================================================
         *  GATLING GUNNER (Boss Enemy - extends ActorEntity)
         * =====================================================================
         * Heavy combat enemy with squad formation AI and gatling gun.
         * Now part of the unified collision system.
         * 
         * Features:
         * - Circle collision for prop/wall interactions
         * - HP system (200) with knockback support
         * - Squad formation AI (triangle, pincer, circle strafe)
         * - Gatling fire mechanics (burst, spin-up, reload)
         */
        /* The Sanctum's three (the Triumvirate): the same gatling automaton, each in its own guise.
           A persona switches on boss mode (dormant until the intro, sight-gated fire, a longer telegraph)
           and its own art; the gauntlet's gunners have none and keep the plain look. */
        const WARDENS = {
            vesper:   { name: 'Vesper, the Censer',     accent: '#c42a3c', trim: '#e8c27a', mantle: '#5a0c1c', eye: '255, 60, 40' },
            matins:   { name: 'Matins, the Choir',      accent: '#e8c27a', trim: '#fff1c2', mantle: '#1a1216', eye: '255, 190, 80' },
            compline: { name: 'Compline, the Penitent', accent: '#8a5cff', trim: '#e6ddd0', mantle: '#24163a', eye: '200, 120, 255' }
        };

        class GatlingGunner extends ActorEntity {
            constructor(x, y, id, opts = {}) {
                // Initialize ActorEntity with circle collision
                super({
                    x: x,
                    y: y,
                    radius: 20,
                    type: 'gatlinggunner',
                    alliance: 'hostile',
                    hp: 200,          // Boss-level HP
                    mass: 25,         // Heavy
                    friction: 0.85,
                    speed: 2,
                    hasCollision: true,
                    invincibleDuration: 10
                });
                
                this.id = id; // Unique ID (0, 1, 2) for squad formation
                this.angle = 0;
                
                // Gatling mechanics
                this.burstCooldown = 0;
                this.burstCount = 0;
                this.maxBurstCount = 10;
                this.burstDelay = 6; 
                this.burstTimer = 0;
                this.reloadTime = 210; 
                
                // Movement
                this.moveTimer = 0;
                this.strafeDirection = 1;
                
                // Telegraph (warns before burst starts)
                this.telegraphThreshold = 12; // ~0.2s window
                this.telegraphAngle = 0;
                this.isTelegraphing = false;
                this._prevPlayerX = 0;
                this._prevPlayerY = 0;

                // Boss mode (the Sanctum, engine/boss-intro.js): spawned kneeling and dark (dormant), woken
                // by the intro; then they hunt her anywhere in their arena but only open fire with a clear
                // line on her (sightGated), after a longer, readable telegraph.
                this.dormant = false;
                this.sightGated = false;
                this._eyeK = 1;           // eyes: 0 dark … 1 burning
                this._riseK = 1;          // 0 kneeling … 1 standing
                this._holdFire = 0;       // frames before the first burst may begin
                this.persona = WARDENS[opts.persona] ? opts.persona : null;
                if (this.persona) {
                    this.radius = 30; this.width = this.height = 60;   // twice her size (she's 15)
                    this.artScale = 1.7;
                    this.sightGated = true;
                    this.telegraphThreshold = 30;                 // ~0.5 s: dodgeable on reaction
                    this.bossName = WARDENS[this.persona].name;
                }
                this._heat = 0;           // the Wardens' original barrel heat
                // Ordinary gunner visual momentum: advanced by simulation, never by draw().
                this._barrelPhase = 0;
                this._barrelSpeed = 0;
                this._barrelHeat = 0;
            }

            /** Sleep until the intro wakes them (kneeling, eyes dark). */
            makeDormant() { this.dormant = true; this._eyeK = 0; this._riseK = 0; this.burstCooldown = 0; this.burstCount = 0; this.angle = Math.PI / 2; }

            /** Wake: move now, but the first burst waits `hold` frames (and still telegraphs). */
            awaken(hold = 60) { this.dormant = false; this._eyeK = 1; this._riseK = 1; this._holdFire = hold; }

            /** Has she a clear line from here (walls, props, shut doors)? Checked every few frames. */
            _hasSight(px, py) {
                if ((this._sightTick = (this._sightTick || 0) + 1) % 3 === 1 || this._sight === undefined) {
                    const map = typeof game !== 'undefined' && game ? game.activeMap : null;
                    this._sight = map ? hasShotLine(this.x, this.y, px, py, map) : true;
                }
                return this._sight;
            }

            /** The source-order roster must still match: deaths, inserts and ID changes can happen mid-tick. */
            static _squadFor(allEnemies) {
                const caches = GatlingGunner._squadCaches || (GatlingGunner._squadCaches = new WeakMap());
                const cache = caches.get(allEnemies);
                if (cache) {
                    let i = 0, same = true;
                    for (const enemy of allEnemies) {
                        if (!(enemy instanceof GatlingGunner) || enemy.dead) continue;
                        if (cache.input[i] !== enemy || cache.ids[i] !== enemy.id) { same = false; break; }
                        i++;
                    }
                    if (same && i === cache.input.length) return cache.sorted;
                }
                const input = allEnemies.filter(e => e instanceof GatlingGunner && !e.dead);
                const sorted = input.slice().sort((a, b) => a.id - b.id);
                caches.set(allEnemies, { input, ids: input.map(e => e.id), sorted });
                return sorted;
            }

            /**
             * Override ActorEntity update for squad AI and gatling mechanics.
             */
            update(playerX, playerY, allEnemies, walls) {
                if (this.dead) return null;
                if (this.dormant) {                               // kneeling at the altar until the intro wakes them
                    this._eyeK += ((this._eyeT || 0) - this._eyeK) * 0.15;
                    this._riseK += ((this._riseT || 0) - this._riseK) * 0.08;
                    if (this._igniteFlash) this._igniteFlash *= 0.92;
                    return [];
                }
                if (this._igniteFlash) this._igniteFlash *= 0.92;
                
                // Decrement invincibility
                if (this.invincibleTimer > 0) {
                    this.invincibleTimer--;
                }
                
                // Apply knockback physics
                if (this.knockbackVx || this.knockbackVy) {
                    this.x += this.knockbackVx;
                    this.y += this.knockbackVy;
                    this.knockbackVx *= this.knockbackFriction;
                    this.knockbackVy *= this.knockbackFriction;
                    if (Math.abs(this.knockbackVx) < 0.1) this.knockbackVx = 0;
                    if (Math.abs(this.knockbackVy) < 0.1) this.knockbackVy = 0;
                }
                
                const dx = playerX - this.x;
                const dy = playerY - this.y;
                const distToPlayer = Math.hypot(dx, dy);
                this.angle = Math.atan2(dy, dx);
                
                // Estimate player velocity from frame-to-frame delta
                const playerVelX = playerX - this._prevPlayerX;
                const playerVelY = playerY - this._prevPlayerY;
                this._prevPlayerX = playerX;
                this._prevPlayerY = playerY;
                
                // --- SQUAD FORMATION LOGIC ---
                const squad = GatlingGunner._squadFor(allEnemies);
                
                const myIndex = squad.indexOf(this);
                const squadSize = squad.length;
                
                const idealRange = this.persona ? 280 : 240; 
                let moveX = 0;
                let moveY = 0;

                if (squadSize > 1) {
                    // TRIANGLE (3) or PINCER (2)
                    const formationSpin = _frameTime / 2000;
                    const angleOffset = (Math.PI * 2) / squadSize;
                    const myTargetAngle = formationSpin + (myIndex * angleOffset);
                    
                    const targetX = playerX + Math.cos(myTargetAngle) * idealRange;
                    const targetY = playerY + Math.sin(myTargetAngle) * idealRange;
                    
                    const tdx = targetX - this.x;
                    const tdy = targetY - this.y;
                    const distToTarget = Math.hypot(tdx, tdy);
                    
                    if (distToTarget > 10) {
                        moveX += (tdx / distToTarget) * 1.5;
                        moveY += (tdy / distToTarget) * 1.5;
                    }
                } else {
                    // SOLO (1) - Circle Strafe Behavior
                    this.moveTimer += 0.02;
                    
                    if (distToPlayer < 180) {
                        moveX -= Math.cos(this.angle) * 2;
                        moveY -= Math.sin(this.angle) * 2;
                    } else if (distToPlayer > 300) {
                        moveX += Math.cos(this.angle) * 2.5;
                        moveY += Math.sin(this.angle) * 2.5;
                    } else {
                        const strafeAngle = this.angle + (Math.PI / 2) * this.strafeDirection;
                        moveX += Math.cos(strafeAngle) * 2;
                        moveY += Math.sin(strafeAngle) * 2;
                    }
                    if (Math.random() < 0.01) this.strafeDirection *= -1;
                }

                // Indoors (the gauntlet house) the formation can't see through walls: with no clear
                // line on her, route round to her instead
                if (this.navMap && (this._losTick = (this._losTick || 0) + 1) % 10 === 1) this._clearLine = hasShotLine(this.x, this.y, playerX, playerY, this.navMap);
                if (this.navMap && !this._clearLine) {
                    const st = actorSteer(this, playerX, playerY, 2, this.navMap);
                    moveX = st.x; moveY = st.y;
                }

                // SEPARATION FORCE (Prevent Overlap)
                const separationDist = this.persona ? 90 : 60;
                for (let ally of squad) {
                    if (ally === this) continue;
                    const adx = this.x - ally.x;
                    const ady = this.y - ally.y;
                    const dist = Math.hypot(adx, ady);
                    
                    if (dist < separationDist && dist > 0) {
                        const push = (separationDist - dist) / separationDist;
                        moveX += (adx / dist) * push * 3.0;
                        moveY += (ady / dist) * push * 3.0;
                    }
                }

                // Apply Movement
                this.x += moveX;
                this.y += moveY;
                
                // WALL COLLISION & ANTI-CLIPPING
                for(let w of walls) {
                    if (this.x > w.x - this.radius && this.x < w.x + w.w + this.radius && 
                        this.y > w.y - this.radius && this.y < w.y + w.h + this.radius) {
                        
                        const centerX = w.x + w.w/2;
                        const centerY = w.y + w.h/2;
                        const pushAng = Math.atan2(this.y - centerY, this.x - centerX);
                        this.x += Math.cos(pushAng) * 5;
                        this.y += Math.sin(pushAng) * 5;
                    }
                }
                
                // GATLING FIRE LOGIC
                const shots = [];
                const firingNow = this.burstCount > 0 && this.burstCooldown === 0;
                this._heat = Math.max(0, Math.min(1, this._heat + (firingNow ? 0.05 : -0.012)));
                // Boss mode: no burst begins (or goes on) without a clear line on her, nor in the grace after waking
                if (this._holdFire > 0) this._holdFire--;
                if (this.sightGated && (this._holdFire > 0 || !this._hasSight(playerX, playerY))) {
                    this.isTelegraphing = false;
                    if (this.burstCount > 0) { this.burstCount = 0; this.burstTimer = 0; }
                    this.burstCooldown = Math.max(this.burstCooldown, this.telegraphThreshold + 1);   // it'll telegraph again first
                    this._updateBarrelVisuals();
                    return shots;
                }
                if (this.burstCooldown > 0) {
                    this.burstCooldown--;
                    // Telegraph before burst starts — track with predictive aim
                    if (this.burstCooldown <= this.telegraphThreshold && this.burstCooldown > 0) {
                        this.isTelegraphing = true;
                        const projSpeed = 24;
                        const travelTime = distToPlayer / projSpeed;
                        const predX = playerX + playerVelX * travelTime;
                        const predY = playerY + playerVelY * travelTime;
                        this.telegraphAngle = Math.atan2(predY - this.y, predX - this.x);
                    }
                    if (this.burstCooldown <= 0) this.isTelegraphing = false;
                } else if (this.burstCount < this.maxBurstCount) {
                    this.isTelegraphing = false;
                    this.burstTimer--;
                    if (this.burstTimer <= 0 && this.sightGated && !(this._sight = hasShotLine(this.x, this.y, playerX, playerY, game.activeMap))) {
                        this.burstCount = 0; this.burstTimer = 0; this.burstCooldown = this.telegraphThreshold + 1;   // she slipped behind cover mid-burst
                    } else if (this.burstTimer <= 0) {
                        const spread = (Math.random() - 0.5) * 0.15;
                        const muzzleOffset = this.persona ? 60 : 35; 
                        const mx = this.x + Math.cos(this.angle) * muzzleOffset;
                        const my = this.y + Math.sin(this.angle) * muzzleOffset;

                        shots.push(new ProjectileEntity({ 
                            x: mx, // Use Muzzle X
                            y: my, // Use Muzzle Y
                            angle: this.angle + spread, 
                            isEnemy: true, 
                            color: '#ffaa00',
                            owner: this
                        }));
                        this.burstCount++;
                        this.burstTimer = this.burstDelay;
                    }
                } else {
                    this.burstCooldown = this.reloadTime;
                    this.burstCount = 0;
                    this.burstTimer = 0;
                }
                this._updateBarrelVisuals();
                return shots;
            }

            /** Wind up before a burst, retain momentum afterward, and cool back to dark steel. */
            _updateBarrelVisuals() {
                if (this.persona) return; // the Sanctum Wardens retain their authored animation
                const firing = this.burstCount > 0 && this.burstCooldown === 0;
                const lead = Math.max(0, Math.min(1, (36 - this.burstCooldown) / 36));
                const anticipating = this.burstCooldown >= 0 && this.burstCooldown < 36 && this._holdFire <= 0;
                const target = firing ? 0.32 : anticipating ? 0.32 * lead * lead * (3 - 2 * lead) : 0;
                const speed = this._barrelSpeed || 0;
                this._barrelSpeed = target > speed ? Math.min(target, speed + 0.012) : Math.max(target, speed - 0.004);
                this._barrelPhase = ((this._barrelPhase || 0) + this._barrelSpeed) % (Math.PI * 2);
                this._barrelHeat = Math.max(0, Math.min(1, (this._barrelHeat || 0) + (firing ? 0.0185 : -0.007)));
            }

            /** Six parallel barrels. Paint the rear of the cylinder before its near side. */
            _drawBarrels(ctx) {
                const phase = this._barrelPhase || 0;
                for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 6; i++) {
                    const a = phase + i * Math.PI / 3, depth = Math.cos(a);
                    if ((depth >= 0 ? 1 : 0) !== pass) continue;
                    const by = Math.sin(a) * 8, shade = Math.round(38 + (depth + 1) * 12);
                    ctx.fillStyle = `rgb(${shade},${shade},${shade + 3})`;
                    ctx.fillRect(5, by - 2, 30, 4);
                    ctx.fillStyle = 'rgba(175,180,190,0.20)';
                    ctx.fillRect(5, by - 1.6, 30, 0.45);
                    ctx.fillStyle = 'rgba(0,0,0,0.38)';
                    ctx.fillRect(11, by - 2, 0.8, 4);
                    ctx.fillRect(29, by - 2, 0.8, 4);
                }
            }

            /** Three small shared incandescent strips; cross-fades give a smooth heat ramp. */
            static _getHeatStrips() {
                if (GatlingGunner._heatStrips) return GatlingGunner._heatStrips;
                return (GatlingGunner._heatStrips = [
                    ['rgba(65,3,2,0)', '#631008', '#c72e0b', '#ee5415'],
                    ['rgba(90,14,3,0)', '#8e2108', '#ee6913', '#ffc34d'],
                    ['rgba(110,25,4,0)', '#ad420d', '#ffc245', '#fff1ba']
                ].map((colors,stage) => {
                    const cv = document.createElement('canvas'); cv.width = 120; cv.height = 16;
                    const c = cv.getContext('2d'), g = c.createLinearGradient(0,0,120,0);
                    for (const [i,stop] of [0,0.22,0.72,1].entries()) g.addColorStop(stop,colors[i]);
                    c.fillStyle = g; c.fillRect(0,0,120,16);
                    c.fillStyle = stage === 2 ? 'rgba(255,250,214,0.85)' : stage === 1 ? 'rgba(255,204,100,0.55)' : 'rgba(255,100,24,0.35)';
                    c.fillRect(68,2,52,2);
                    c.fillRect(116,0,4,16);
                    return cv;
                }));
            }

            /** Incandescence above ambient darkness, restricted to the heated barrel metal. */
            drawHeat(ctx) {
                if (this.dead || this.visible === false || this.persona || this._barrelHeat <= 0.02 ||
                    (this.invincibleTimer > 0 && this.invincibleTimer % 6 < 3)) return;
                const heat = this._barrelHeat, intensity = heat * heat;
                const strips = GatlingGunner._getHeatStrips();
                const stage = heat * 2, lo = Math.min(2, Math.floor(stage)), hi = Math.min(2, lo + 1), blend = stage - lo;
                ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this.angle);
                const alpha = ctx.globalAlpha;
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * 0.25 * intensity;
                drawGlow(ctx,25,0,22 + heat * 6,'255,88,20',0);
                ctx.globalAlpha = alpha * 0.16 * intensity * heat;
                drawGlow(ctx,34,0,11,'255,202,91',0.1);
                for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 6; i++) {
                    const a = (this._barrelPhase || 0) + i * Math.PI / 3, depth = Math.cos(a);
                    if ((depth >= 0 ? 1 : 0) !== pass) continue;
                    const by = Math.sin(a) * 8, light = intensity * (0.70 + (depth + 1) * 0.15);
                    ctx.globalAlpha = alpha * light * (1 - blend);
                    ctx.drawImage(strips[lo],5,by - 2,30,4);
                    if (blend > 0) {
                        ctx.globalAlpha = alpha * light * blend;
                        ctx.drawImage(strips[hi],5,by - 2,30,4);
                    }
                }
                ctx.restore();
            }
            
            /**
             * Override onProjectileHit to only take damage from player projectiles.
             */
            onProjectileHit(projectile, game) {
                // Only take damage from player projectiles
                if (projectile.isEnemy) return;
                this.lastHitBy = projectile.owner; this.lastHitMelee = !!projectile.melee;   // who gets the Resonance
                
                const speed = Math.hypot(projectile.vx, projectile.vy);
                if (speed > 0) {
                    // GatlingGunners are heavy (mass 25) but sniper can still push them
                    const projMomentum = (projectile.mass || 1) * speed;
                    const damageMultiplier = projectile.damage / 20;
                    const knockbackStrength = Math.min((projMomentum * damageMultiplier) / (this.mass || 25), 35);
                    
                    const kbX = (projectile.vx / speed) * knockbackStrength;
                    const kbY = (projectile.vy / speed) * knockbackStrength;
                    this.takeDamage(projectile.damage, kbX, kbY);
                } else {
                    this.takeDamage(projectile.damage);
                }
            }

            /**
             * Legacy takeDamage for non-projectile damage.
             */
            takeDamageOld(amount, bulletAngle) {
                const kbX = Math.cos(bulletAngle) * 5;
                const kbY = Math.sin(bulletAngle) * 5;
                this.takeDamage(amount, kbX, kbY);
            }

            draw(ctx) {
                if (this.dead) return;
                
                // Flash if invincible
                if (this.invincibleTimer > 0 && this.invincibleTimer % 6 < 3) {
                    return;
                }
                if (this.persona) return this._drawWarden(ctx);
                
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);
                
                // Shadow
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.beginPath(); 
                ctx.ellipse(0, 10, 20, 12, 0, 0, Math.PI*2); 
                ctx.fill();
                
                // In night vision the body burns white-hot: drawn into a capture and stamped back (ui/silhouette-fx.js)
                const heat = SilhouetteFX.heat, cap = heat > 0.01 ? SilhouetteFX.begin(ctx, 56) : null;
                try { this._drawGunnerBody(cap || ctx); }
                finally { if (cap) SilhouetteFX.end('heat', heat); }
                
                // (Health bar: drawn with the other combat overlays once hit — engine/combat-fx.js)
                ctx.restore();

                // Telegraph aim line (world space)
                if (this.isTelegraphing && this.burstCooldown > 0) {
                    drawEnemyTelegraph(ctx, this.x, this.y, this.telegraphAngle,
                        this.burstCooldown, this.telegraphThreshold, '#ffaa00', 350);
                }
            }

            /** The gunner itself (body, head, barrels, muzzle flash), in its own turned frame. */
            _drawGunnerBody(ctx) {
                // Body
                ctx.fillStyle = '#1a1a1a';
                ctx.beginPath(); 
                ctx.arc(0, 0, 20, 0, Math.PI*2); 
                ctx.fill();
                ctx.strokeStyle = '#ff3300'; 
                ctx.lineWidth = 2; 
                ctx.stroke();
                
                // Head
                ctx.fillStyle = '#ff0000'; 
                ctx.shadowColor = '#ff0000'; 
                ctx.shadowBlur = 10;
                ctx.beginPath(); 
                ctx.arc(6, 0, 8, 0, Math.PI*2); 
                ctx.fill(); 
                ctx.shadowBlur = 0;
                
                // Barrels
                const spinning = this.burstCount > 0 && this.burstCooldown === 0;
                this._drawBarrels(ctx);
                
                // Muzzle Flash
                if (spinning && this.burstTimer < 3) {
                    ctx.fillStyle = '#ffaa00'; 
                    ctx.shadowColor = '#ffaa00'; 
                    ctx.shadowBlur = 20;
                    ctx.beginPath(); 
                    ctx.arc(35, 0, 8, 0, Math.PI*2); 
                    ctx.fill(); 
                    ctx.shadowBlur = 0;
                }
            }

            /** A Sanctum warden: a mantled war automaton in its own guise (WARDENS). Kneeling and dark while
             *  dormant; the eye slit ignites, the halo / chains / censer smoke come alive, and it rises. */
            _drawWarden(ctx) {
                const W = WARDENS[this.persona], t = _frameTime / 1000, rise = this._riseK, kneel = 1 - rise, eye = this._eyeK;
                const tele = this.isTelegraphing && this.burstCooldown > 0, spinning = this.burstCount > 0 && this.burstCooldown === 0;
                const big = (this.persona === 'matins' ? 1.12 : 1) * (this.artScale || 1), S = this.artScale || 1;
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(3, 8, 26 * big, 18 * big, 0, 0, Math.PI * 2); ctx.fill();
                ctx.rotate(this.angle);
                ctx.scale(big * (1 - 0.14 * kneel), big * (1 - 0.14 * kneel));
                // The mantle: a long cape behind, fluttering; pooled wide on the floor while kneeling
                const fl = Math.sin(t * 3 + this.id * 2) * 2.5 * rise;
                ctx.fillStyle = W.mantle; ctx.beginPath();
                ctx.moveTo(4, -16); ctx.quadraticCurveTo(-18 - 10 * kneel, -26 - 6 * kneel + fl, -34 - 6 * kneel, -10 + fl);
                ctx.quadraticCurveTo(-40 - 8 * kneel, 0, -34 - 6 * kneel, 10 - fl); ctx.quadraticCurveTo(-18 - 10 * kneel, 26 + 6 * kneel - fl, 4, 16); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = W.accent; ctx.lineWidth = 1.2; ctx.stroke();
                // Armoured body: black iron plates, gold filigree
                ctx.fillStyle = '#16121a'; ctx.beginPath(); ctx.ellipse(0, 0, 16, 18, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = W.trim; ctx.lineWidth = 1; ctx.stroke();
                for (const sy of [-1, 1]) {                                    // pauldrons
                    ctx.fillStyle = '#231c28'; ctx.beginPath(); ctx.ellipse(-2, sy * 15, this.persona === 'matins' ? 10 : 8, 6, sy * 0.3, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = W.accent; ctx.lineWidth = 1; ctx.stroke();
                }
                ctx.strokeStyle = W.trim; ctx.globalAlpha = 0.5; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(0, 0, 10, -1.2, 1.2); ctx.moveTo(-6, -8); ctx.quadraticCurveTo(-2, 0, -6, 8); ctx.stroke(); ctx.globalAlpha = 1;
                if (this.persona === 'compline') {                             // chains across the chest
                    ctx.strokeStyle = W.trim; ctx.lineWidth = 1.4; ctx.setLineDash([2, 1.5]);
                    ctx.beginPath(); ctx.moveTo(-10, -14); ctx.quadraticCurveTo(0, 0 + Math.sin(t * 2) * rise, -10, 14); ctx.moveTo(-4, -16); ctx.lineTo(8, 10); ctx.stroke(); ctx.setLineDash([]);
                }
                // The weapon: rotary barrels on the right arm, lowered while kneeling; they glow as they heat
                ctx.save(); ctx.rotate(-0.9 * kneel); ctx.translate(4, 9);
                if (this.persona === 'vesper') { ctx.fillStyle = W.trim; ctx.beginPath(); ctx.arc(10, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#6a4f22'; ctx.lineWidth = 1; ctx.stroke(); }   // the thurible drum
                const spin = spinning ? _frameTime / 18 : 0, nB = this.persona === 'matins' ? 2 : 6;
                for (let i = 0; i < nB; i++) {
                    const off = nB === 2 ? (i ? 3.5 : -3.5) : Math.sin(spin + i * Math.PI / 3) * 4;
                    ctx.fillStyle = '#2e2a32'; ctx.fillRect(8, off - 1.6, 26, 3.2);
                    if (this._heat > 0.05) { ctx.fillStyle = `rgba(255,${120 + 80 * (1 - this._heat) | 0},40,${this._heat})`; ctx.fillRect(28, off - 1.6, 6, 3.2); }
                }
                if (this.persona === 'compline') { ctx.strokeStyle = W.trim; ctx.lineWidth = 1; ctx.setLineDash([2, 1.5]); ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(26, 6); ctx.moveTo(12, 6); ctx.lineTo(24, -6); ctx.stroke(); ctx.setLineDash([]); }
                if (spinning && this.burstTimer < 3) { ctx.fillStyle = '#ffcf6a'; ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(36, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
                ctx.restore();
                // The hood and the eye slit: dark while dormant; flaring white-red when about to fire
                ctx.fillStyle = '#0e0a10'; ctx.beginPath(); ctx.arc(2 - 3 * kneel, 0, 9, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = W.accent; ctx.lineWidth = 1.2; ctx.stroke();
                if (eye > 0.02) {
                    const flare = tele ? 0.6 + 0.4 * Math.sin(_frameTime / 40) : 0, flash = this._igniteFlash || 0;
                    ctx.shadowColor = `rgb(${W.eye})`; ctx.shadowBlur = 8 * eye + 14 * flash + 10 * flare;
                    ctx.fillStyle = flare > 0 ? `rgba(255,${200 * flare | 0},${200 * flare | 0},1)` : `rgba(${W.eye},${eye})`;
                    ctx.fillRect(6 - 3 * kneel, -4.5, 3, 9); ctx.shadowBlur = 0;
                }
                ctx.restore();
                // Matins' halo turns over its crown; Vesper's censer trails incense
                if (this.persona === 'matins') {
                    ctx.save(); ctx.translate(this.x, this.y); ctx.globalAlpha = 0.25 + 0.75 * eye;
                    ctx.scale(S * 1.12, S * 1.12); ctx.strokeStyle = W.trim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, -6 * rise - 2, 16, 6, 0, 0, Math.PI * 2); ctx.stroke();
                    for (let i = 0; i < 8; i++) { const a = t * 0.8 * rise + i * Math.PI / 4; ctx.fillStyle = W.accent; ctx.beginPath(); ctx.arc(Math.cos(a) * 16, -6 * rise - 2 + Math.sin(a) * 6, 1.4, 0, Math.PI * 2); ctx.fill(); }
                    ctx.restore();
                } else if (this.persona === 'vesper' && eye > 0.02) {
                    for (let i = 0; i < 5; i++) { const ph = (t * 0.6 + i / 5) % 1; ctx.globalAlpha = (1 - ph) * 0.25 * eye; ctx.fillStyle = '#b8a8c8'; ctx.beginPath(); ctx.arc(this.x - Math.cos(this.angle) * (10 + ph * 30) * S + Math.sin(t + i) * 4 * S, this.y - Math.sin(this.angle) * (10 + ph * 30) * S - ph * 10 * S, (3 + ph * 6) * S, 0, Math.PI * 2); ctx.fill(); }
                    ctx.globalAlpha = 1;
                }
                if (tele) drawEnemyTelegraph(ctx, this.x, this.y, this.telegraphAngle, this.burstCooldown, this.telegraphThreshold, `rgb(${W.eye})`, 380);
            }
        }
        
        class LastKnownMarker {
            constructor(x, y, angle) {
                this.x = x;
                this.y = y;
                this.angle = angle;
                this.active = true;
                this.opacity = 1.0;
                this.fadeSpeed = 0.0; // Only fades when "checked" by enemy
            }

            dismiss() {
                // Triggered when an enemy reaches this spot
                this.fadeSpeed = 0.05; 
            }

            update() {
                if (this.fadeSpeed > 0) {
                    this.opacity -= this.fadeSpeed;
                    if (this.opacity <= 0) this.active = false;
                }
            }

            draw(ctx) {
                if (!this.active) return;
                
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);
                ctx.globalAlpha = this.opacity * 0.6; // Ghostly transparency
                
                // Glowing White Outline
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 15;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                
                // Draw Player Shape Outline
                ctx.beginPath(); 
                ctx.moveTo(-15, -12); 
                ctx.lineTo(5, 0); 
                ctx.lineTo(-15, 12); 
                // Head
                ctx.moveTo(12, 0);
                ctx.arc(0, 0, 12, 0, Math.PI * 2);
                ctx.stroke();
                
                ctx.shadowBlur = 0;
                ctx.restore();
            }
        }

        /* =====================================================================
           GANGER CLASS (STEALTH AI ENEMY - extends ActorEntity)
           ---------------------------------------------------------------------
           Street gang members with sophisticated stealth-game AI.
           Now part of the unified collision system.
           
           STATE MACHINE:
           ┌──────────┐    detect player    ┌────────────┐
           │   IDLE   │ ─────────────────►  │ SUSPICIOUS │
           └──────────┘                     └────────────┘
                 ▲                                 │
                 │ suspicion drains               │ suspicion maxed
                 │                                ▼
           ┌────────────┐   lost sight     ┌─────────┐
           │ SEARCHING  │ ◄───────────────  │  ALERT  │
           └────────────┘                   └─────────┘
                 │                                │
                 │                                │ lost sight briefly
                 ▼                                ▼
           (return to IDLE)              ┌─────────────┐
                                         │ SUPPRESSING │ (fire at last known pos)
                                         └─────────────┘
           
           DETECTION SYSTEM:
           - Vision Cone: 320 range, ~70° FOV
           - Proximity Detection: 50 units (can hear player)
           - Suspicion builds when player visible, drains when hidden
           - Line-of-sight blocked by walls and buildings
           
           COMBAT:
           - Shoots at player when in ALERT state
           - Creates "Last Known Position" marker when losing sight
           - Will suppress (shoot at) last known position
           ===================================================================== */
        class Ganger extends ActorEntity {
            /** Hot pink over dark maroon, readable at a glance (ROLE_LOOKS.ganger, core/appearances.js). */
            static makeLook(r) { return ROLE_LOOKS.ganger(r); }

            constructor(x, y, config) {
                const cfg = config || {};
                super({
                    x: x,
                    y: y,
                    radius: 15,
                    type: 'ganger',
                    alliance: 'hostile',
                    hp: cfg.hp || 40,
                    mass: 10,
                    friction: 0.9,
                    speed: cfg.speed || 2.5,
                    hasCollision: true,
                    invincibleDuration: 20
                });
                
                this.angle = Math.random() * 6.28;
                
                // Animation & Physics properties
                this.velX = 0;
                this.velY = 0;
                this.walkPhase = 0; 

                // AI Properties
                this.visionRange = cfg.visionRange || 320;
                this.visionFov = Math.PI / 2.5;
                this.state = 'IDLE';
                this.suspicion = 0;
                this.suspicionDrainDelay = 0;
                this.suppressionTimer = 0;
                
                this.startX = x;
                this.startY = y;
                this.wanderTarget = {x: x, y: y};
                this.wanderTimer = 0;
                this.investigateTarget = null;
                this.cooldown = 0;
                
                // ── TELEGRAPH (aim line before firing) ──
                this.telegraphThreshold = cfg.telegraphThreshold || 9; // ~0.15s window
                this.telegraphAngle = 0;
                this.isTelegraphing = false;
                
                // ── WEAPON SYSTEM (reads ITEM_REGISTRY) ──
                this.equippedWeaponId = cfg.weaponId || null;
                
                // Cache resolved stats (or use defaults for weaponless gangers)
                this._weaponStats = this._resolveWeaponStats();
            }
            
            /**
             * Resolve weapon stats from ITEM_REGISTRY, with ganger defaults as fallback.
             * Called once on construction — if weapon swapping is added, call again.
             */
            _resolveWeaponStats() {
                if (this.equippedWeaponId && typeof ITEM_REGISTRY !== 'undefined') {
                    const def = ITEM_REGISTRY[this.equippedWeaponId];
                    if (def && def.stats) {
                        return {
                            fireRate: def.stats.fireRate || 45,
                            damage: def.stats.damage || 10,
                            color: def.stats.projectileColor || '#ff0055',
                            speed: def.stats.projectileSpeed || 24,
                            spread: def.stats.spread || 0.15,
                            penetrating: def.stats.penetrating || false,
                            sticky: def.stats.sticky || false,
                            dotDamage: def.stats.dotDamage || 0,
                            dotTicks: def.stats.dotTicks || 0,
                            dotInterval: def.stats.dotInterval || 0,
                        };
                    }
                }
                // Default ganger weapon (hot pink pistol)
                return {
                    fireRate: 45,
                    damage: 10,
                    color: '#ff0055',
                    speed: 24,
                    spread: 0.15,
                    penetrating: false,
                    sticky: false,
                };
            }

            /** A landed melee hit breaks an ordinary gunner's aim; repeat hits cannot lock it down. */
            interruptMelee() {
                if (this.dead || this.hunter || this.bossName || this._noMeleeInterrupt || this.mass >= 20
                    || _gameTimeSec < (this._meleeResistUntil || 0)) return false;
                this._meleeInterruptUntil = _gameTimeSec + 0.20;
                this._meleeResistUntil = _gameTimeSec + 0.65;
                this.cooldown = Math.max(this.cooldown, this.telegraphThreshold + 1);
                this.isTelegraphing = false;
                this._aimPoint = null;
                return true;
            }

            // ... [canSeePoint method from previous turn] ...
            canSeePoint(tx, ty, walls, buildings) {
                const dist = Math.hypot(tx - this.x, ty - this.y);
                if (dist > this.visionRange) return false;

                const angleToPoint = Math.atan2(ty - this.y, tx - this.x);
                let angleDiff = angleToPoint - this.angle;
                angleDiff = normalizeAngle(angleDiff);

                if (Math.abs(angleDiff) > this.visionFov / 2) return false;

                if (typeof game !== 'undefined' && game.roomSystem.doorBlocks(this.x, this.y, tx, ty)) return false;   // not through a shut door
                return !isLineBlocked(this.x, this.y, tx, ty, walls, buildings); 
            }

            // ... [update method from previous turn] ...
            update(player, walls, buildings, markers, trafficCars, map, enemies) {
                if (this.dead) return null;
                if (this._execBy) return null;                                      // being executed (engine/executions.js): frozen
                // Flit: Afterimage — for a moment they still see you where you flitted from
                const ai = typeof game !== 'undefined' && game._afterimage;
                if (ai && _gameTimeSec < ai.until && player === game.player) player = Object.assign(Object.create(player), { x: ai.x, y: ai.y });
                // Nav-grid routing (null map → old straight-line movement)
                const navMap = (CONFIG.NAV.GANGER_NAV && map) ? map : null;
                
                if (this.invincibleTimer > 0) this.invincibleTimer--;
                
                // Physics Knockback
                if (this.knockbackVx || this.knockbackVy) {
                    this.x += this.knockbackVx;
                    this.y += this.knockbackVy;
                    this.knockbackVx *= this.knockbackFriction;
                    this.knockbackVy *= this.knockbackFriction;
                }
                
                const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
                const isVisible = player.visible && !player.isHidden;
                
                // Detection range (reduced by active buffs like Ms. Jean Soda)
                const effectiveVisionRange = player.buffSystem.getStat('detectionRange', this.visionRange);
                
                // --- 1. DETECTION LOGIC ---
                let canSee = false;
                // Up close they sense her, unless she comes from behind, slowly or hidden, out of the light (an execution)
                const toHer = Math.atan2(player.y - this.y, player.x - this.x);
                const pg = player._gait, hg = typeof game !== 'undefined' ? game : null;
                const sneaking = Math.abs(normalizeAngle(toHer - this.angle)) > Math.PI * 0.6
                    && ((hg && hg.sneaking && player === hg.player) || player.isHidden || ((pg ? pg.speed : 0) < 2.3 && (player.visibility ?? 0) < 0.75));
                if (distToPlayer < 50 && isVisible && !sneaking) {
                    canSee = true;
                    this.suspicion += 5;
                } else if (isVisible && distToPlayer <= effectiveVisionRange && this.canSeePoint(player.x, player.y, walls, buildings)) {
                    canSee = true;
                    let detectSpeed = 1.0;
                    detectSpeed *= (1.0 - (distToPlayer / effectiveVisionRange));
                    detectSpeed *= (player.visibility * 2.0);
                    if (detectSpeed < 0.1) detectSpeed = 0.1;
                    this.suspicion += detectSpeed * 2.5;
                    this.suspicionDrainDelay = 120;
                }
                
                if (canSee) {
                    markers.forEach(m => m.dismiss());
                    this.investigateTarget = {x: player.x, y: player.y};
                    this.sweep = null;
                    if (typeof game !== 'undefined') game._lastContactAt = _gameTimeSec;   // the gauntlet's stall breaker
                }
                
                if (!canSee && this.state !== 'SUPPRESSING') {
                    if (this.suspicionDrainDelay > 0) {
                        this.suspicionDrainDelay--;
                    } else {
                        this.suspicion -= (this.state === 'SEARCHING' ? 0.1 : 0.5);
                    }
                }
                
                this.suspicion = Math.max(0, Math.min(100, this.suspicion));

                // --- 2. STATE TRANSITIONS ---
                const oldState = this.state;
                if (this.suspicion >= 100) {
                    if (this.state !== 'SUPPRESSING' && this.state !== 'SEARCHING') this.state = 'ALERT';
                    if (canSee) this.state = 'ALERT';
                } else if (this.suspicion > 0 && this.state !== 'SEARCHING' && this.state !== 'SUPPRESSING') {
                    this.state = 'SUSPICIOUS';
                } else if (this.state !== 'SEARCHING' && this.state !== 'SUPPRESSING') {
                    this.state = 'IDLE';
                    markers.forEach(m => m.dismiss());
                }
                
                if (oldState === 'ALERT' && !canSee && this.suspicionDrainDelay > 0) {
                    if (this.investigateTarget) {
                        markers.push(new LastKnownMarker(this.investigateTarget.x, this.investigateTarget.y, player.angle));
                        showMessage("LKP ESTABLISHED");
                    }
                    this.state = 'SUPPRESSING';
                    this.suppressionTimer = 90; 
                }

                // --- 3. MOVEMENT & BEHAVIOR ---
                // Keep detecting and moving during the interruption, but hold aim/fire until it ends.
                const meleeInterrupted = _gameTimeSec < (this._meleeInterruptUntil || 0);
                if (meleeInterrupted) this.isTelegraphing = false;
                let moveX = 0;
                let moveY = 0;

                if (this.state === 'ALERT') {
                    this._flank = null;
                    this.angle = Math.atan2(player.y - this.y, player.x - this.x);
                    if (distToPlayer > 150) {
                        // Close in, routed around buildings (keeps facing the player)
                        const s = navMap ? actorSteer(this, player.x, player.y, 2.5, navMap)
                                         : { x: Math.cos(this.angle) * 2.5, y: Math.sin(this.angle) * 2.5 };
                        moveX = s.x;
                        moveY = s.y;
                    } else if (distToPlayer < 80) {
                        moveX = -Math.cos(this.angle) * 1.5;
                        moveY = -Math.sin(this.angle) * 1.5;
                    }
                    if (!meleeInterrupted) this.cooldown--;
                    // Telegraph: track player with predictive aim
                    if (!meleeInterrupted && this.cooldown > 0 && this.cooldown <= this.telegraphThreshold && canSee) {
                        this.isTelegraphing = true;
                        // Predictive aim: lead the player based on movement
                        const projSpeed = this._weaponStats.speed || 24;
                        const travelTime = distToPlayer / projSpeed;
                        const pSpeed = player.getCurrentSpeed ? player.getCurrentSpeed() : 4;
                        const predX = player.x + (player.velX || 0) * pSpeed * travelTime;
                        const predY = player.y + (player.velY || 0) * pSpeed * travelTime;
                        this.telegraphAngle = Math.atan2(predY - this.y, predX - this.x);
                        this.angle = this.telegraphAngle;   // body and gun point where the shot will go
                        this._aimPoint = { x: predX, y: predY };
                    } else {
                        this.isTelegraphing = false;
                    }
                    if (!meleeInterrupted && this.cooldown <= 0 && canSee) {
                        this.isTelegraphing = false;
                        const ws = this._weaponStats;
                        this.cooldown = ws.fireRate + Math.random() * 20;
                        this._shotTick = _simTick;   // recoil kick
                        const ap = this._aimPoint || player;
                        const shot = aimFromMuzzle(this, this.telegraphAngle, ap.x, ap.y);   // leaves the barrel, lands on the lead
                        return new ProjectileEntity({ 
                            x: shot.x, y: shot.y, 
                            angle: shot.angle + (Math.random()-0.5) * ws.spread, 
                            isEnemy: true, color: ws.color, owner: this,
                            speed: ws.speed, damage: ws.damage,
                            penetrating: ws.penetrating,
                            sticky: ws.sticky, dotDamage: ws.dotDamage,
                            dotTicks: ws.dotTicks, dotInterval: ws.dotInterval
                        });
                    }
                } else if (this.state === 'SUPPRESSING') {
                    if (this.investigateTarget) {
                        const T = this.investigateTarget;
                        this.angle = Math.atan2(T.y - this.y, T.x - this.x);
                        const clearShot = !navMap || hasShotLine(this.x, this.y, T.x, T.y, navMap);
                        if (navMap && CONFIG.NAV.GANGER_FLANK) {
                            if (clearShot) {
                                this._flank = null;                       // got eyes on it — hold here
                            } else {
                                const stale = this._flank && Math.hypot(this._flank.tx - T.x, this._flank.ty - T.y) > 24;
                                if ((!this._flank || stale) && _simTick >= (this._flankRetryAt || 0)) {
                                    const N = CONFIG.NAV;
                                    const avoid = (enemies || []).filter(o => o !== this && o._flank).map(o => o._flank);
                                    const spot = findShotSpot(navMap, this.x, this.y, T.x, T.y, {
                                        searchDist: N.GANGER_FLANK_SEARCH, minDist: 60, maxDist: Math.min(this.visionRange, 380),
                                        avoid, spacing: N.GANGER_FLANK_SPACING, maxChecks: 60, stride: N.SAMPLE_STRIDE,
                                        margin: { muzzle: aimedMuzzleLocal(this.equippedWeaponId || 'pistol_ganger'),
                                                  halfSpread: this._weaponStats.spread || 0.1, bulletR: 5, targetR: 12 }
                                    });
                                    this._flank = spot ? { x: spot.x, y: spot.y, tx: T.x, ty: T.y } : null;
                                    if (spot) this._navPath = spot.path && spot.path.length ? { pts: spot.path, idx: 0, goalX: spot.x, goalY: spot.y, repathAt: _simTick + N.REPATH_TICKS } : null;
                                    else this._flankRetryAt = _simTick + N.GANGER_FLANK_RETRY;
                                }
                                if (this._flank) {
                                    const s = actorSteer(this, this._flank.x, this._flank.y, 2.0, navMap);
                                    moveX = s.x;
                                    moveY = s.y;
                                }
                            }
                        }
                        if (!meleeInterrupted) this.cooldown--;
                        // Suppress only with a clear line (or rounds that go through walls)
                        if (!meleeInterrupted && this.cooldown <= 0 && (clearShot || this._weaponStats.penetrating)) {
                            const ws = this._weaponStats;
                            this.cooldown = 15; // Suppression fire stays fast
                            this._shotTick = _simTick;   // recoil kick
                            const shot = aimFromMuzzle(this, this.angle, T.x, T.y);
                            return new ProjectileEntity({ 
                                x: shot.x, y: shot.y, 
                                angle: shot.angle + (Math.random()-0.5) * (ws.spread * 2), 
                                isEnemy: true, color: ws.color, owner: this,
                                speed: ws.speed, damage: ws.damage,
                                penetrating: ws.penetrating
                            });
                        }
                    }
                    this.suppressionTimer--;
                    if (this.suppressionTimer <= 0) this.state = 'SEARCHING';
                } else if (this.state === 'SEARCHING') {
                    this._flank = null;
                    if (this.investigateTarget) {
                        const T = this.investigateTarget;
                        const distToTarget = Math.hypot(T.x - this.x, T.y - this.y);
                        // Walk toward the next waypoint (the marker itself when the way is clear)
                        const wp = navMap ? navWaypoint(this, T.x, T.y, navMap) : T;
                        const angleToTarget = Math.atan2(wp.y - this.y, wp.x - this.x);
                        let diff = angleToTarget - this.angle;
                        while (diff < -Math.PI) diff += Math.PI * 2; 
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        this.angle += diff * (navMap ? 0.2 : 0.1);

                        // No headway for 5 s (a jam at a doorway): give up on this spot, try the next
                        if (T !== this._searchT) { this._searchT = T; this._searchBest = distToTarget; this._searchSince = _simTick; }
                        else if (distToTarget < this._searchBest - 4) { this._searchBest = distToTarget; this._searchSince = _simTick; }
                        else if (distToTarget > 40 && _simTick - this._searchSince > 300) {
                            if (this.sweep && this.sweep.length) this.investigateTarget = this.sweep.shift();
                            else { this.state = 'IDLE'; this.sweep = null; this._sweepRooms = null; }
                        }

                        if (distToTarget > 40) {
                            if (navMap) {
                                const s = actorSteer(this, T.x, T.y, this.huntSpeed || 1.5, navMap);
                                moveX = s.x;
                                moveY = s.y;
                            } else {
                                moveX = Math.cos(this.angle) * (this.huntSpeed || 1.5);
                                moveY = Math.sin(this.angle) * (this.huntSpeed || 1.5);
                            }
                        } else {
                            markers.forEach(m => m.dismiss());
                            // Nothing here: look around a moment, then sweep the rooms beyond
                            if (this.sweep === null || this.sweep === undefined) { this.sweep = this._buildSweep(T, navMap); this._lookTimer = 45; }
                            if (this._lookTimer > 0) { this._lookTimer--; this.angle += 0.06; }
                            else if (this.sweep.length) { this.investigateTarget = this.sweep.shift(); this._lookTimer = 40; this.suspicion = Math.max(this.suspicion, 30); }
                            else {
                                this.angle += 0.05;
                                this.suspicion -= 1.0; 
                                if (this.suspicion <= 0) { this.state = 'IDLE'; this.sweep = null; this._sweepRooms = null; }
                            }
                        }
                    } else {
                        this.state = 'IDLE';
                    }
                } else if (this.state === 'SUSPICIOUS') {
                    if (canSee) {
                        const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
                        let diff = angleToPlayer - this.angle;
                        while (diff < -Math.PI) diff += Math.PI * 2; 
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        this.angle += diff * 0.05;
                    }
                } else { // IDLE
                    this._flank = null;
                    this.wanderTimer--;
                    if (this.wanderTimer <= 0) {
                        this.wanderTimer = 120 + Math.random() * 200;
                        this.wanderTarget.x = this.startX + (Math.random() - 0.5) * 400;
                        this.wanderTarget.y = this.startY + (Math.random() - 0.5) * 400;
                        // Snap the wander point onto walkable ground
                        const nav = navMap ? NavGrid.for(navMap) : null;
                        const free = nav ? nav.nearestFree(this.wanderTarget.x, this.wanderTarget.y) : null;
                        if (free !== null) { this.wanderTarget.x = nav.cx(free); this.wanderTarget.y = nav.cy(free); }
                    }
                    const distToWander = Math.hypot(this.wanderTarget.x - this.x, this.wanderTarget.y - this.y);
                    if (distToWander > 10) {
                        if (navMap) {
                            // Stroll along the route, turning to face where we're going
                            const s = actorSteer(this, this.wanderTarget.x, this.wanderTarget.y, 0.5, navMap);
                            let diff = Math.atan2(s.y, s.x) - this.angle;
                            while (diff < -Math.PI) diff += Math.PI * 2; 
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            this.angle += diff * 0.08;
                            moveX = s.x;
                            moveY = s.y;
                        } else {
                            const angleToWander = Math.atan2(this.wanderTarget.y - this.y, this.wanderTarget.x - this.x);
                            let diff = angleToWander - this.angle;
                            while (diff < -Math.PI) diff += Math.PI * 2; 
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            this.angle += diff * 0.02;
                            moveX = Math.cos(this.angle) * 0.5;
                            moveY = Math.sin(this.angle) * 0.5;
                        }
                    }
                }

                // --- CAPTURE VELOCITY ---
                this.velX = moveX;
                this.velY = moveY;

                // Apply Movement
                gaitCommand(this, moveX, moveY);
                this.x += moveX;
                this.y += moveY;

                this.checkCollisions(walls, buildings, trafficCars);
                
                return null;
            }

            // ... [collision/damage methods unchanged] ...
            checkCollisions(walls, buildings, trafficCars) {
                let hitObstacle = false;
                const checkBounds = (rect) => {
                    return (this.x > rect.x - this.radius && this.x < rect.x + rect.w + this.radius && this.y > rect.y - this.radius && this.y < rect.y + rect.h + this.radius);
                };
                const staticBlocked = () => walls.some(checkBounds) || (buildings ? buildings.some(checkBounds) : false);
                let hitStatic = staticBlocked();
                if (hitStatic && (this.velX || this.velY)) {
                    // Slide along the wall: keep whichever axis of the move is still clear
                    this.x -= this.velX;
                    if (staticBlocked()) {
                        this.x += this.velX; this.y -= this.velY;
                        if (staticBlocked()) this.x -= this.velX;   // neither axis is clear: full revert below
                        else hitStatic = false;
                    } else {
                        hitStatic = false;
                    }
                    if (hitStatic) { this.x += this.velX; this.y += this.velY; }   // restore, then the revert below undoes the whole move
                }
                hitObstacle = hitStatic;
                if (trafficCars) {
                    for (let car of trafficCars) {
                        const dist = Math.hypot(this.x - car.x, this.y - car.y);
                        if (dist < 40) { 
                            if (Math.abs(car.speed) > 2.0) {
                                const damage = Math.abs(car.speed) * 10;
                                const pushAngle = Math.atan2(this.y - car.y, this.x - car.x);
                                const force = Math.abs(car.speed) * 3;
                                this.takeDamage(damage, Math.cos(pushAngle) * force, Math.sin(pushAngle) * force);
                                showMessage("GANGER HIT BY VEHICLE!");
                                hitObstacle = false; 
                            } else { hitObstacle = true; }
                        }
                    }
                }
                if (hitObstacle) {
                    this.x -= this.velX; this.y -= this.velY;
                    if (this.state === 'IDLE') { this.angle += Math.PI + (Math.random() - 0.5); this.wanderTimer = 0; }
                }
            }
            
            /**
             * A sound (engine/noise.js): unless already fighting her, turn toward roughly where it
             * came from (`err` px off) and go to look. `strength` 0…1 — louder or closer is
             * more alarming. Returns true if it caught this ganger's attention.
             */
            hearNoise(nx, ny, strength, err) {
                if (this.dead || this.state === 'ALERT' || this.state === 'SUPPRESSING') return false;
                const a = Math.random() * Math.PI * 2, r = Math.random() * err;
                this.investigateTarget = { x: nx + Math.cos(a) * r, y: ny + Math.sin(a) * r };
                this.sweep = null; this._lookTimer = 0;
                this.suspicion = Math.min(99, Math.max(this.suspicion, 45) + 35 * strength);
                this.suspicionDrainDelay = 180;
                this.state = 'SEARCHING';
                this.angle = Math.atan2(ny - this.y, nx - this.x);
                return true;
            }

            /**
             * Where to look once the trail goes cold: the room the lead points into, then the rooms
             * joined to it by doors, nearest first — skipping rooms two others are already
             * searching. A couple of spots per room. [] off maps without rooms.
             */
            _buildSweep(T, map) {
                const rs = typeof game !== 'undefined' ? game.roomSystem : null;
                if (!rs || !rs.active) return [];
                const start = rs.getRoomAt(T.x, T.y);
                if (!start) return [];
                const ids = [start.id];
                for (const d of rs.doors) if (d.rooms.includes(start.id)) { const o = d.rooms[0] === start.id ? d.rooms[1] : d.rooms[0]; if (rs.rooms[o] && !ids.includes(o)) ids.push(o); }
                const centre = id => { const q = rs.rooms[id].rects[0]; return { x: q.x + q.w / 2, y: q.y + q.h / 2 }; };
                const claims = {};
                for (const e of game.enemies) if (e !== this && e._sweepRooms) for (const id of e._sweepRooms) claims[id] = (claims[id] || 0) + 1;
                const pick = [ids[0], ...ids.slice(1).sort((a, b) => Math.hypot(centre(a).x - T.x, centre(a).y - T.y) - Math.hypot(centre(b).x - T.x, centre(b).y - T.y))]
                    .filter(id => (claims[id] || 0) < 2).slice(0, 3);
                this._sweepRooms = pick;
                const nav = map ? NavGrid.for(map) : null, snap = (x, y) => { const f = nav && nav.nearestFree(x, y, 6); return f !== null && f !== undefined ? { x: nav.cx(f), y: nav.cy(f) } : { x, y }; };
                const pts = [];
                for (const id of pick) {
                    const q = rs.rooms[id].rects[0], c = centre(id);
                    pts.push(snap(c.x, c.y), snap(q.x + q.w * (0.2 + Math.random() * 0.6), q.y + q.h * (0.2 + Math.random() * 0.6)));
                }
                return pts;
            }

            onProjectileHit(projectile, game) {
                if (projectile.isEnemy) return;
                this.lastHitBy = projectile.owner; this.lastHitMelee = !!projectile.melee;   // who gets the Resonance
                this.suspicion = 100;
                this.state = 'ALERT';
                
                // Face the direction the bullet came from
                const speed = Math.hypot(projectile.vx, projectile.vy);
                if (speed > 0) {
                    // Bullet velocity points away from shooter — reverse it to face source
                    this.angle = Math.atan2(-projectile.vy, -projectile.vx);
                    
                    // Set investigate target along that direction (estimated shooter position)
                    const estimatedDist = 200;
                    this.investigateTarget = {
                        x: this.x + Math.cos(this.angle) * estimatedDist,
                        y: this.y + Math.sin(this.angle) * estimatedDist
                    };
                    
                    const knockbackStrength = projectile.damage * 0.3;
                    const kbX = (projectile.vx / speed) * knockbackStrength;
                    const kbY = (projectile.vy / speed) * knockbackStrength;
                    if (this.takeDamage(projectile.damage, kbX, kbY) && projectile.melee) this.interruptMelee();
                } else if (this.takeDamage(projectile.damage) && projectile.melee) { this.interruptMelee(); }
            }

            /** The vision cone's outline in world space, cast against the map's walls and buildings (cached). */
            _visionCone() {
                const r = this._coneRange || this.visionRange, c = this._coneCache;
                if (c && Math.abs(c.x - this.x) < 2 && Math.abs(c.y - this.y) < 2 && Math.abs(c.a - this.angle) < 0.02 && Math.abs(c.r - r) < 2) return c.poly;
                const map = typeof game !== 'undefined' && game.activeMap;
                const poly = computeVisibilityPoly(this.x, this.y, r, getOccluders(map), { aMin: this.angle - this.visionFov / 2, aMax: this.angle + this.visionFov / 2, arcStep: 0.08 });
                this._coneCache = { x: this.x, y: this.y, a: this.angle, r, poly };
                return poly;
            }

            draw(ctx) {
                if (this.dead) return;
                
                // 1. SAVE CONTEXT FOR ROTATED BODY
                ctx.save(); 
                ctx.translate(this.x, this.y); 
                ctx.rotate(this.angle);
                
                // VISION CONE — exactly what they can see: it stops at walls and buildings, and it
                // shrinks with anything that dulls their senses (Ms. Jean soda: detectionRange ×0.6)
                let coneColor = 'rgba(255, 255, 255, 0.05)';
                if (this.state === 'SUSPICIOUS') coneColor = 'rgba(255, 255, 0, 0.15)';
                if (this.state === 'ALERT' || this.state === 'SUPPRESSING') coneColor = 'rgba(255, 0, 0, 0.2)';
                if (this.hunter) coneColor = this.state === 'ALERT' || this.state === 'SUPPRESSING' ? 'rgba(255, 40, 60, 0.07)' : 'rgba(255, 60, 60, 0.035)';   // a hunter's red sight
                const pl = typeof game !== 'undefined' && game.player;
                const wantRange = pl && pl.buffSystem ? pl.buffSystem.getStat('detectionRange', this.visionRange) : this.visionRange;
                this._coneRange = this._coneRange === undefined ? wantRange : this._coneRange + (wantRange - this._coneRange) * 0.08;
                const cone = this._visionCone();
                ctx.save();
                ctx.rotate(-this.angle); ctx.translate(-this.x, -this.y);   // the cone is in world space
                ctx.fillStyle = coneColor;
                ctx.beginPath(); ctx.moveTo(this.x, this.y);
                for (const pt of cone) ctx.lineTo(pt.x, pt.y);
                ctx.closePath(); ctx.fill();
                ctx.restore();

                // PROCEDURAL BODY (Rotates with body) — aims in the weapon's stance while
                // alert/suppressing and holds the real weapon model; low ready otherwise.
                const aiming = this.state === 'ALERT' || this.state === 'SUPPRESSING';
                const weaponId = this.equippedWeaponId || 'pistol_ganger';   // default: the hot pink pistol
                if (!this.look) this.look = Ganger.makeLook(seededRandom(Math.random()));
                drawProceduralHumanoid(ctx, this, {
                    ...this.look,
                    stance: aiming ? stanceForWeapon(weaponId) : 'idle',
                    kick: aiming ? shotKick(this) : 0,
                    weapon: { id: weaponId, ready: aiming },
                });

                // 2. RESTORE CONTEXT (BACK TO UPRIGHT / SCREEN SPACE)
                ctx.restore();

                // TELEGRAPH AIM LINE (drawn in world space, not body-rotated)
                if (this.isTelegraphing && this.cooldown > 0) {
                    drawEnemyTelegraph(ctx, this.x, this.y, this.telegraphAngle, 
                        this.cooldown, this.telegraphThreshold, this._weaponStats.color);
                }

                // 3. DRAW UI ELEMENTS (Using absolute x/y, NO ROTATION)
                
                // Suspicion bar
                if (this.suspicion > 0) {
                    ctx.fillStyle = '#333';
                    ctx.fillRect(this.x - 15, this.y - 30, 30, 4);
                    // Color based on state
                    ctx.fillStyle = (this.state === 'ALERT' || this.state === 'SUPPRESSING') ? '#f00' : (this.state === 'SUSPICIOUS' ? '#ff0' : '#fa0');
                    ctx.fillRect(this.x - 15, this.y - 30, 30 * (this.suspicion / 100), 4);
                }

                // Status Icons
                ctx.font = "bold 20px Orbitron";
                ctx.textAlign = "center";
                if (this.state === 'SUSPICIOUS') {
                    ctx.fillStyle = '#ffaa00';
                    ctx.fillText("?", this.x, this.y - 40);
                } else if (this.state === 'ALERT' || this.state === 'SUPPRESSING') {
                    ctx.fillStyle = '#ff0000';
                    ctx.fillText("!", this.x, this.y - 40);
                }
            }
        }

        // ═══════════════════════════════════════════════════════════
        //  RESTRICTED ZONE — Hostile farming area with respawning enemies
        // ═══════════════════════════════════════════════════════════
        class RestrictedZone {
            constructor(config) {
                this.id = config.id || 'rz_0';
                this.name = config.name || 'RESTRICTED ZONE';
                this.x = config.x;
                this.y = config.y;
                this.w = config.w;
                this.h = config.h;
                this.hostileCount = config.hostileCount || 8;
                this.respawnDelay = config.respawnDelay || 600; // 10 seconds at 60fps
                this.respawnTimer = 0;
                this.cleared = false;
                this.clearCount = 0;
                this.hostiles = [];
                this.mapId = config.mapId || 'hub_949';
                this.active = false; // Only active when first entered or respawning
            }

            spawn(game) {
                this.hostiles = [];
                this.cleared = false;
                this.active = true;
                const margin = 50;
                for (let i = 0; i < this.hostileCount; i++) {
                    const ex = this.x + margin + Math.random() * (this.w - margin * 2);
                    const ey = this.y + margin + Math.random() * (this.h - margin * 2);
                    // Wave 6+: last 2 gangers get sniper rifles
                    // Wave 3-5: all get RB-98 rapid blasters
                    let weaponId = null;
                    if (this.clearCount >= 6 && i >= this.hostileCount - 2) {
                        weaponId = 'sniper_sr86';
                    } else if (this.clearCount >= 3) {
                        weaponId = 'rifle_rb98';
                    }
                    const ganger = new Ganger(ex, ey, {
                        hp: 50 + this.clearCount * 8,
                        speed: 2.6 + Math.min(this.clearCount * 0.15, 1.2),
                        visionRange: 360,
                        weaponId: weaponId
                    });
                    ganger._restrictedZoneId = this.id;
                    this.hostiles.push(ganger);
                    game.enemies.push(ganger);
                }
            }

            _playerInside(game) {
                const p = game.player;
                return p.x >= this.x && p.x <= this.x + this.w &&
                       p.y >= this.y && p.y <= this.y + this.h;
            }

            update(game) {
                if (game.activeMap.id !== this.mapId) {
                    // Player left the map — mark hostiles as lost (not cleared)
                    if (this.active && !this.cleared && this.hostiles.length > 0) {
                        this._pendingRespawn = true;
                    }
                    this.hostiles = [];
                    return;
                }

                // Returning to map with pending respawn
                if (this._pendingRespawn) {
                    this._pendingRespawn = false;
                    this.spawn(game);
                    showMessage(`⚠ ${this.name} — HOSTILES REGROUPED`);
                    return;
                }

                // First entry — spawn hostiles when player walks in
                if (!this.active && this._playerInside(game)) {
                    this.spawn(game);
                    showMessage(`⚠ ${this.name} — ${this.hostileCount} HOSTILES`);
                    return;
                }

                if (!this.active) return;

                // Prune dead/removed references
                this.hostiles = this.hostiles.filter(h => !h.dead && game.enemies.includes(h));

                // Check for clear
                if (!this.cleared && this.hostiles.length === 0) {
                    this.cleared = true;
                    this.clearCount++;
                    this.respawnTimer = this.respawnDelay;
                    const bonus = 30 + this.clearCount * 15;
                    game.currency = (game.currency || 0) + bonus;
                    if (game.resonance) game.earnResonance(60 + this.clearCount * 15, 'ZONE CLEARED');
                    game.updateUI();
                    showMessage(`${this.name} CLEARED ×${this.clearCount} — +${bonus} PERSONICS`);
                }

                // Respawn countdown
                if (this.cleared) {
                    this.respawnTimer--;
                    if (this.respawnTimer <= 0) {
                        this.spawn(game);
                        showMessage(`⚠ ${this.name} — HOSTILES REGROUPED`);
                    }
                }
            }
        }

        // ═══════════════════════════════════════════════════════════
        //  HORDE GAUNTLET — wave combat on a choice of maps (Grum's GAUNTLET menu)
        // ═══════════════════════════════════════════════════════════
        /* The gauntlet's maps. A playable one names its map, where enemies come in (spawns —
           walkable spots in every room, kept ≥ SPAWN_MIN_DIST from 949) and where the heavy
           gunners stand (gunnerSpawns — the big rooms). Sealed entries are placeholders for
           maps to come: shown in the menu, greyed out. */
        const GAUNTLET_MAPS = [
            {
                id: 'house_of_death', label: 'The House of Death', mapId: 'house_of_death',
                blurb: 'A gothic villa of glass and black marble. Doors swing under fire, rooms sink into shadow — hold the house, wave after wave.',
                spawns: [
                    [120, 380], [440, 390], [280, 110],                     // library
                    [900, 300], [610, 100], [1195, 380],                    // chapel
                    [1300, 300], [1450, 250], [1620, 200],                  // bedroom, bath
                    [80, 800], [480, 850], [300, 520],                      // dining
                    [650, 500], [1150, 950], [760, 960], [1150, 700],       // grand hall
                    [1350, 600], [1700, 700], [1400, 880], [1650, 580],     // courtyard
                    [100, 1100], [450, 1350], [300, 1120],                  // kitchen
                    [650, 1300], [1150, 1100],                              // foyer
                    [1300, 1090], [1710, 1250], [1560, 1090],               // gallery
                    [1300, 1320], [1560, 1330]                              // reliquary
                ],
                gunnerSpawns: [[760, 700], [1380, 560], [280, 820], [700, 380]]
            },
            {
                id: 'demoness_palace', label: 'The Demoness Palace', mapId: 'demoness_palace',
                blurb: 'Obsidian and gold, lit by embers. Her hunters see in the dark and cross a room in a blink, and every fifth wave she hunts you herself.',
                spawns: [
                    [150, 180], [760, 180], [1000, 150], [1300, 150], [1600, 310],     // garden, shrine, bath
                    [140, 520], [460, 900], [1350, 520], [1650, 900],                  // the galleries
                    [690, 490], [1110, 960], [420, 1300], [120, 1250], [1300, 1300], [1700, 1300]   // throne hall, dressing room, kennels
                ],
                gunnerSpawns: [],
                // Waves of hunters (night vision, dashes); an alpha from wave 3; the Demoness every fifth wave
                waves: (w) => ({ hunters: Math.min(3 + w, 10), alphas: w >= 3 ? 1 + Math.floor((w - 3) / 4) : 0, demoness: w % 5 === 0,
                                 hp: 55 + w * 8, speed: 2.6 + Math.min(w * 0.08, 1) })
            },
            { id: 'sealed_2', label: 'Sealed', locked: true, blurb: 'Coming soon.' },
            { id: 'sealed_3', label: 'Sealed', locked: true, blurb: 'Coming soon.' }
        ];
        const GAUNTLET_SPAWN_MIN_DIST = 350;
        const GAUNTLET_LEAD_ERR = 300;           // a wave arrives knowing only her rough area (px off)
        const GAUNTLET_STALL_SECS = 20;          // no one has seen or heard her this long → a vague lead…
        const GAUNTLET_STALL_ERR = 220;          // …this far off: enough to sweep the right rooms

        class HordeGauntlet {
            constructor() {
                this.active = false;
                this.wave = 0;
                this.highestWaves = {};          // best wave per gauntlet map
                this.hostiles = [];
                this.waveDelay = 0;
                this.totalKills = 0;
                this.entry = GAUNTLET_MAPS[0];
                this.mapId = this.entry.mapId;
                document.getElementById('ui-wave')?.classList.remove('show');   // a fresh game: no readout left over
                document.body.classList.remove('wave-hud');
            }

            /** Best wave on any map (old saves kept a single number). */
            get highestWave() { return Math.max(0, ...Object.values(this.highestWaves)); }
            set highestWave(v) { if (v > 0) this.highestWaves[GAUNTLET_MAPS[0].id] = Math.max(this.highestWaves[GAUNTLET_MAPS[0].id] || 0, v); }


            getWaveConfig(wave) {
                const gangerCount = Math.min(5 + wave, 14);
                const gunnerCount = wave >= 5 ? 1 + Math.floor((wave - 5) / 3) : 0;
                let weaponId = null;
                if (wave >= 8) weaponId = 'sniper_sr86';
                else if (wave >= 4) weaponId = 'rifle_rb98';
                const hp = 40 + wave * 6;
                const speed = 2.4 + Math.min(wave * 0.1, 1.5);
                return { gangerCount, gunnerCount, weaponId, hp, speed };
            }

            start(game, gauntletId = GAUNTLET_MAPS[0].id) {
                const entry = GAUNTLET_MAPS.find(g => g.id === gauntletId);
                if (!entry || entry.locked) return false;
                this.entry = entry;
                this.mapId = entry.mapId;
                this.active = true;
                this.wave = 0;
                this.totalKills = 0;
                this.hostiles = [];
                // Where to put her back when she walks out
                this._returnX = game.player.x;
                this._returnY = game.player.y;
                this._returnMap = game.activeMap.id;
                game.loadMap(this.mapId);
                // Start first wave after a brief pause
                this.waveDelay = 90; // 1.5 second before first wave
                return true;
            }

            /** Walkable spawn points far enough from 949, shuffled; reused (jittered) when a wave outnumbers them. */
            _spawnPoints(game, list, n) {
                const nav = NavGrid.for(game.activeMap), px = game.player.x, py = game.player.y;
                let pts = list.map(([x, y]) => ({ x, y }))
                    .filter(p => (!nav || nav.walkable(p.x, p.y)) && Math.hypot(p.x - px, p.y - py) >= GAUNTLET_SPAWN_MIN_DIST);
                if (!pts.length) pts = list.map(([x, y]) => ({ x, y }));
                for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
                const out = [];
                for (let i = 0; i < n; i++) {
                    const p = pts[i % pts.length];
                    if (i < pts.length) { out.push({ x: p.x, y: p.y }); continue; }
                    let q = { x: p.x + (Math.random() - 0.5) * 40, y: p.y + (Math.random() - 0.5) * 40 };
                    if (nav && !nav.walkable(q.x, q.y)) q = { x: p.x, y: p.y };
                    out.push(q);
                }
                return out;
            }

            /**
             * Give a hostile a rough lead on 949 — `err` px off, snapped to walkable ground — and
             * it comes to sweep that part of the house. No radar: they only ever learn where
             * she is by seeing her, hearing her, or (a wave's start, a long silence) a vague lead.
             */
            _lead(h, game, err) {
                if (!(h instanceof Ganger) || h.state === 'ALERT' || h.state === 'SUPPRESSING') return;
                const p = game.player, a = Math.random() * Math.PI * 2, r = err * (0.5 + Math.random() * 0.5);
                const nav = NavGrid.for(game.activeMap), f = nav && nav.nearestFree(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 8);
                h.investigateTarget = f !== null && f !== undefined ? { x: nav.cx(f), y: nav.cy(f) } : { x: p.x, y: p.y };
                h.sweep = null; h.state = 'SEARCHING'; h.suspicion = Math.max(h.suspicion, 60);
            }

            spawnWave(game) {
                this.wave++;
                const id = this.entry.id;
                if (this.wave > (this.highestWaves[id] || 0)) this.highestWaves[id] = this.wave;
                this.hostiles = [];
                this._waveStartedAt = _gameTimeSec;
                if (this.entry.waves) { this._spawnHunters(game, this.entry.waves(this.wave)); return; }
                const cfg = this.getWaveConfig(this.wave);
                const nav = game.activeMap;

                for (const pt of this._spawnPoints(game, this.entry.spawns, cfg.gangerCount)) {
                    const ganger = new Ganger(pt.x, pt.y, {
                        hp: cfg.hp, speed: cfg.speed, visionRange: 450, weaponId: cfg.weaponId
                    });
                    ganger._gauntletWave = this.wave;
                    ganger.huntSpeed = Math.min(2.6, cfg.speed * 0.8);
                    this._lead(ganger, game, GAUNTLET_LEAD_ERR);
                    this.hostiles.push(ganger);
                    game.enemies.push(ganger);
                }

                const gSpots = this._spawnPoints(game, this.entry.gunnerSpawns, cfg.gunnerCount);
                for (let i = 0; i < cfg.gunnerCount; i++) {
                    const gunner = new GatlingGunner(gSpots[i].x, gSpots[i].y, i);
                    gunner._gauntletWave = this.wave;
                    gunner.navMap = nav;                     // indoors: routes round walls to find a line on her
                    gunner.hp = 150 + this.wave * 15;
                    gunner.maxHp = gunner.hp;
                    this.hostiles.push(gunner);
                    game.enemies.push(gunner);
                }

                const gunnerText = cfg.gunnerCount > 0 ? ` + ${cfg.gunnerCount} GUNNER${cfg.gunnerCount > 1 ? 'S' : ''}` : '';
                showMessage(`WAVE ${this.wave} — ${cfg.gangerCount} GANGERS${gunnerText}`);
                game.triggerShake(8);
                this._waveSize = this.hostiles.length;
            }

            /** A palace wave: hunters, an alpha or two, and every fifth wave the Demoness with her intro */
            _spawnHunters(game, W) {
                for (const pt of this._spawnPoints(game, this.entry.spawns, W.hunters)) {
                    const h = new Hunter(pt.x, pt.y, { hp: W.hp, speed: W.speed });
                    h._gauntletWave = this.wave; h.navMap = game.activeMap;
                    this._lead(h, game, GAUNTLET_LEAD_ERR);
                    this.hostiles.push(h); game.enemies.push(h);
                }
                for (const pt of this._spawnPoints(game, this.entry.spawns, W.alphas)) {
                    const a = new Hunter(pt.x, pt.y, { hp: Math.round(W.hp * 1.9), speed: W.speed + 0.2, alpha: true, dashes: 2, dashCD: 180, claw: 18 });
                    a._gauntletWave = this.wave; a.navMap = game.activeMap;
                    this._lead(a, game, GAUNTLET_LEAD_ERR);
                    this.hostiles.push(a); game.enemies.push(a);
                }
                let text = `WAVE ${this.wave} — ${W.hunters} HUNTERS` + (W.alphas ? ` + ${W.alphas} ALPHA${W.alphas > 1 ? 'S' : ''}` : '');
                if (W.demoness) {
                    for (const h of this.hostiles) h.dormant = true;               // her hunters hold still while she makes her entrance
                    const d = new Demoness(900, 480, { hp: 700 + this.wave * 40 });
                    d._gauntletWave = this.wave;
                    this.hostiles.push(d);
                    game.bossIntro([d], { title: 'THE DEMONESS', seenFlag: 'demonessIntroSeen' });   // (bossIntro adds her to the enemies)
                    text += ' — AND SHE COMES';
                }
                showMessage(text);
                game.triggerShake(8);
                this._waveSize = this.hostiles.length;
            }

            /**
             * The wave readout (#ui-wave, top centre): the wave, how many are left and a
             * bar that drains, the countdown between waves, the summary at the end. The
             * message modal still announces each beat; this keeps the count where a loot
             * pickup or a flit message can't cover it. Writes the DOM only on change.
             */
            _hud(game, ended) {
                const el = this._el || (this._el = document.getElementById('ui-wave'));
                if (!el) return;
                let key, html = '', frac = 0;
                if (ended) {
                    key = 'end' + this.wave;
                    html = `<span class="w-title">Gauntlet over</span><span class="w-sep">◆</span><span class="w-sub">Wave ${this.wave} · ${this.totalKills} kills</span>`;
                } else if (!this.active || game.activeMap.id !== this.mapId || (game.scenes && game.scenes.running)) {
                    key = '';
                } else if (this.waveDelay > 0) {
                    const n = Math.ceil(this.waveDelay / 60);
                    key = 'gap' + this.wave + ':' + n;
                    html = this.wave > 0
                        ? `<span class="w-title">Wave ${this.wave} cleared</span><span class="w-sep">◆</span><span class="w-sub">Next in ${n}</span>`
                        : `<span class="w-title">Wave 1</span><span class="w-sep">◆</span><span class="w-sub">In ${n}</span>`;
                } else {
                    const left = this.hostiles.length, gun = this.hostiles.filter(h => h instanceof GatlingGunner).length;
                    const her = typeof Demoness !== 'undefined' && this.hostiles.some(h => h instanceof Demoness && !h.dead);
                    key = 'w' + this.wave + ':' + left + ':' + gun + ':' + her;
                    frac = this._waveSize ? left / this._waveSize : 0;
                    html = `<span class="w-title">Wave ${this.wave}</span><span class="w-sep">◆</span><span class="w-sub">${left} left</span>`
                         + (gun ? `<span class="w-chip">${gun > 1 ? gun + ' gunners' : 'Gunner'}</span>` : '')
                         + (her ? `<span class="w-chip">The Demoness</span>` : '');
                }
                if (key === this._hudKey) return;
                this._hudKey = key;
                if (!key) { el.classList.remove('show'); document.body.classList.remove('wave-hud'); return; }
                el.innerHTML = `<div class="w-line">${html}</div><div class="w-bar"><i style="transform:scaleX(${frac.toFixed(3)})"></i></div>`;
                el.classList.toggle('between', !frac);
                el.classList.add('show'); document.body.classList.add('wave-hud');
                if (ended) { clearTimeout(this._endT); this._endT = setTimeout(() => { if (!this.active) { this._hudKey = ''; el.classList.remove('show'); document.body.classList.remove('wave-hud'); } }, 6000); }
            }

            update(game) {
                if (!this.active) return;
                if (game.activeMap.id !== this.mapId) {
                    // Player left the arena via transition — end gauntlet
                    this.end(game);
                    return;
                }

                // Between-wave countdown
                if (this.waveDelay > 0) {
                    this.waveDelay--;
                    if (this.waveDelay <= 0) {
                        this.spawnWave(game);
                    }
                    this._hud(game);
                    return;
                }

                // Her intro over: her hunters wake
                if (!game._bossIntro) for (const h of this.hostiles) if (h.dormant && !(typeof Demoness !== 'undefined' && h instanceof Demoness)) h.dormant = false;
                // Prune dead
                const before = this.hostiles.length;
                this.hostiles = this.hostiles.filter(h => !h.dead && game.enemies.includes(h));
                this.totalKills += (before - this.hostiles.length);

                // Stall breaker: nobody has seen or heard her in a while → the idle get a vague lead
                if (game._lastContactAt === undefined || game._lastContactAt < this._waveStartedAt) game._lastContactAt = this._waveStartedAt;
                if (_gameTimeSec - game._lastContactAt > GAUNTLET_STALL_SECS) {
                    for (const h of this.hostiles) if (h.state === 'IDLE' || h.state === 'SUSPICIOUS') this._lead(h, game, GAUNTLET_STALL_ERR);
                    game._lastContactAt = _gameTimeSec - GAUNTLET_STALL_SECS * 0.4;   // again in ~15 s if still silent
                }

                // Wave cleared
                if (this.hostiles.length === 0 && this.wave > 0) {
                    const reward = 40 + this.wave * 20;
                    const scrapReward = Math.floor(this.wave * 2);
                    game.currency += reward;
                    game.scrap += scrapReward;
                    if (game.resonance) game.earnResonance(40 * this.wave, `WAVE ${this.wave}`);
                    if (this.wave % 3 === 0) game.loot.push(new Loot(game.player.x + 30, game.player.y, 'dark_element'));   // every 3rd wave
                    game.updateUI();
                    showMessage(`WAVE ${this.wave} CLEARED — +${reward} PERSONICS, +${scrapReward} SCRAP`);
                    this.waveDelay = 210; // 3.5 seconds between waves
                }
                this._hud(game);
            }

            end(game) {
                if (!this.active) return;
                this.active = false;
                this.waveDelay = 0;
                // Clean up
                for (let i = game.enemies.length - 1; i >= 0; i--) {
                    if (game.enemies[i]._gauntletWave) {
                        game.enemies.splice(i, 1);
                    }
                }
                this.hostiles = [];
                // Walked out the front door: back to where she met Grum
                if (game.activeMap && game.activeMap.id === this._returnMap && this._returnX !== undefined && game.player) {
                    game.player.x = this._returnX; game.player.y = this._returnY + 40;
                    if (game.camera) { game.camera.x = game.player.x; game.camera.y = game.player.y; }
                }
                if (this.wave > 0) {
                    showMessage(`GAUNTLET OVER — WAVE ${this.wave} — ${this.totalKills} KILLS`);
                    this._hud(game, true);
                } else this._hud(game);
            }
        }

