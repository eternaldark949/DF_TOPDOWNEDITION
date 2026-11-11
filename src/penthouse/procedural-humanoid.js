        // ===== LV3 PENTHOUSE =====
        // THE PROCEDURAL HUMANOID: every person in the game, drawn from code each frame (no sprites).
        // One instance per person (proceduralHumanoid.of(entity)), kept for as long as the person is,
        // so its packets and buffers are reused frame to frame.
        //
        // Native packets carry a simulation-resolved rigPose. Their artist reads those joints;
        // the gait/pose/settling stages below remain for classic city callers.
        //
        // A CLASSIC FRAME runs in stages, each a method, in this order:
        //   SET UP     configure (look, stance, held, weather, shading, build) → dress (wardrobe pieces)
        //              → stride (gait) → strikePose (ui/poses.js) → placeHands (joint targets)
        //              → settle (ease the joints, then the walk swing, hits, kicks, punches, blades)
        //   DRAW       drawWeapons → drawSeated (in a vehicle: done) → rig (the skeleton and the
        //              wardrobe's geometry packet) → drawLegs → drawHips → drawArms → drawTorso
        //              → drawHead → drawHeld
        //
        // JOINT PACKETS: fists [lx, ly, rx, ry] and elbows [lx, ly, rx, ry], in the body's frame
        // (x forward, y to the right). The skeleton's feet, knees and hip points live in `geometry`,
        // which the wardrobe draws from (ui/wardrobe.js `g`).
        //
        // ATTACHMENT POINTS: point('hand_l' | 'hand_r' | 'head' | 'muzzle') → a virtualChild of the
        // person, for anything in the world that rides on them (a thrown glass leaving the hand).
        //
        // The shapes come from ui/bodies.js, the clothes from ui/wardrobe.js, the hair and heads from
        // ui/humanoid-render.js. drawProceduralHumanoid (ui/humanoid-render.js) is still the way in:
        // it picks the silhouette, timing and scale, then hands the body to this class.
        /** The pose (ui/poses.js) a standing person strikes this frame, and how far it has faded in: { pose, w },
         *  or null (none). It fades in after a moment standing, out the moment they walk (some poses hold while
         *  walking: pushing furniture). Ticks the person's pose clock (entity._pose), once a frame however often
         *  it's asked. config._pose ({ pose, w }, or null) strikes that pose instead (a crowd bake's frame: ui/crowd-impostors.js). */
        function humanoidPose(entity, config, gaitSpeed, gender) {
            if (config.pose === 'none') return null;
            if (config._pose !== undefined) return config._pose;
            const ps = entity._pose || (entity._pose = { still: 0, t: 0, name: null, w: 0, last: _gameTimeSec, seed: Math.random() * 97 });
            const dt = Math.max(0, Math.min(0.1, _gameTimeSec - ps.last));
            ps.last = _gameTimeSec;
            const moving = gaitSpeed > 0.15;
            ps.still = moving ? 0 : ps.still + dt;
            const name = POSES[config.pose] ? config.pose : 'idle';
            if (name !== ps.name) { ps.name = name; ps.t = 0; }
            ps.t += dt;
            const target = config.poseWhileMoving || (!moving && ps.still > 0.4) ? 1 : 0;
            ps.w += (target - ps.w) * Math.min(1, dt * (target ? 3 : 10));
            if (config.poseInstant) ps.w = target;                             // a fall can't wait for the pose to fade in
            if (!(ps.w > 0.001)) return null;
            return { pose: POSES[name](ps.t, { still: ps.still, seed: ps.seed, gender, beat: name === 'dance' ? mapBeatN() : null }), w: ps.w };
        }

        class proceduralHumanoid {
            static _people = new WeakMap();
            /** The humanoid for a person (made the first time they're drawn). */
            static of (entity) {
                let h = proceduralHumanoid._people.get(entity);
                if (!h) proceduralHumanoid._people.set(entity, h = new proceduralHumanoid(entity));
                return h;
            }

            constructor (entity) {
                // Kept across frames
                this.clothes = {};
                this.shade_config = { _wet: 0 };
                this.scale_frame = { x: 1, y: 1, k: 1 };
                this.limb_geometry = { length: 0, angle: 0 };
                this.cloth_dyn = { wind: null };
                this.drive_dyn = { owner: entity, sway: 0, drag: 0, bounce: 0, wiggle: 0, android: null };
                this.walk_dyn = { owner: entity, sway: 0, drag: 0, bounce: 0, wiggle: 0, wind: null, android: null };
                this.geometry = null;
                this.punch_guard = null;
                this.fists = [0, 0, 0, 0];
                this.elbows = [0, 0, 0, 0];
                this.points = null;                            // attachment points, made when first asked for (point)
                this.skin_chain = null;                        // [root, joint, end] for a skinned limb (drawSkinnedArm)
                // This frame: who, and how (configure, dress)
                this.ctx = null; this.entity = entity; this.config = null; this.scale = null; this.android = null;
                this.skin = null; this.wet = 0; this.shade = null; this.body = null;
                this.driving = false; this.shooting_from_car = false; this.recoil = 0; this.gender = null;
                this.blade_game = null; this.blade_swing = null; this.blade_wide = false; this.stance = null; this.held = null;
                this.weather = null; this.umbrella = null; this.umbrella_open = 0; this.glass_hand = null; this.parcel = false;
                this.top_piece = null; this.sleeve = null; this.sleeve_color = null;
                // The gait and the pose (stride, strikePose)
                this.gait = null; this.gait_speed = 0; this.hovering = false; this.stride_len = 0; this.strafe_len = 0; this.sway = 0;
                this.fwd_amt = 1; this.side_amt = 0; this.walk_cycle = 0; this.walk_sin = 0; this.walk_opp_sin = 0;
                this.walk_bounce = 0; this.walk_sway = 0; this.bounce = 0; this.punch_strike = null; this.body_recoil = 0;
                this.drive_offset = 0; this.hip_anchor_x = 0; this.shoulder_x = 0; this.shoulder_pose_x = 0;
                this.hip_rotation = 0; this.torso_rotation = 0; this.arm_swing = 0; this.pose = null; this.pose_w = 0;
                // The joints (placeHands, settle) and what's in hand (drawWeapons)
                this.walk_arms = false; this.hit_k = 0; this.gun_hand = false;
                // The skeleton and the clothes on it (rig, drawLegs, drawHead)
                this.bottom_piece = null; this.shoe_piece = null; this.leg_color = null; this.top_gloss = false; this.bottom_gloss = false;
                this.ground_train = null; this.head_x = 0; this.wind_local = 0;
                // A colour darkened by `frac`, plus the rain's wet on clothes (not skin). Bound: the wardrobe calls it as g.darken.
                this.darken = (hex, frac) => hex ? darkenHex(hex, Math.floor(255 * (hex === this.skin ? frac : frac + this.wet))) : '#000';
            }

            /** Draw this person: ctx is translated and rotated to them; S the build's scale frame (or null), A the android look (or null). */
            draw (ctx, entity, config, S, A) {
                this.configure(ctx, entity, config, S, A);
                if(entity.rigPose)this.readNativePose();
                else {
                    this.stride();
                    this.strikePose();
                    this.placeHands();
                    this.settle();
                }
                this.drawWeapons();
                if (this.drawSeated()) return;
                this.rig();
                this.drawLegs();
                this.drawHips();
                this.drawArms();
                this.drawTorso();
                this.drawHead();
                this.drawHeld();
            }

            /** The skeleton only, no drawing: every set-up stage and the rig, for a renderer that isn't Canvas 2D
             *  (penthouse/gl-humanoid.js). Reads back from fists, elbows, geometry and the pose fields. */
            skeleton (entity, config) {
                this.configure(null, entity, config, null, null);
                if(entity.rigPose)this.readNativePose();
                else {
                    this.stride();
                    this.strikePose();
                    this.placeHands();
                    this.settle();
                }
                this.rig();
                return this;
            }

            /** Native packets return detached rig anchor data; physical users request physics.rigs.getAnchor.
             *  Classic callers retain an attachment point on this person as a virtualChild (basement/virtual-child.js), placed from
             *  this frame's skeleton: 'hand_l', 'hand_r', 'head', or 'muzzle' (null while no gun is drawn).
             *    body.point('hand_r').updatePosition()   → world_x, world_y: her right hand in the world */
            point (name) {
                if(this.entity.rigPose)return this.entity.rigPose.anchors[name]?structuredClone(this.entity.rigPose.anchors[name]):null;
                const S = this.scale, kx = S ? S.x : 1, ky = S ? S.y : 1, F = this.fists, m = this.entity._muzzleLocal;
                const local = name === 'hand_l' ? [F[0] * kx, F[1] * ky] : name === 'hand_r' ? [F[2] * kx, F[3] * ky]
                    : name === 'head' ? [this.head_x * kx, 0] : name === 'muzzle' ? (m && [m.x, m.y]) : null;
                if (!local) return null;
                const P = this.points || (this.points = {}), child = P[name] || (P[name] = new virtualChild(this.entity, local));
                child.init_position = local; return child;
            }

            /** Native simulation supplies the complete resolved skeleton. */
            readNativePose () {
                const j=this.entity.rigPose.joints;
                for(const [i,side] of [[0,'l'],[2,'r']]){
                    this.fists[i]=j['hand_'+side].position[0];this.fists[i+1]=j['hand_'+side].position[1];
                    this.elbows[i]=j['elbow_'+side].position[0];this.elbows[i+1]=j['elbow_'+side].position[1];
                }
                this.hip_anchor_x=j.pelvis.position[0];this.hip_rotation=j.pelvis.rotation;
                this.shoulder_x=j.torso.position[0];this.torso_rotation=j.torso.rotation;
                this.head_x=j.head.position[0];this.bounce=j.head.position[0];
                this.walk_cycle=0;this.walk_sin=0;this.walk_opp_sin=0;this.gait_speed=0;
                this.pose=null;this.pose_w=0;this.body_recoil=0;this.hit_k=0;this.hook=null;
            }

            nativeGeometry () {
                const j=this.entity.rigPose.joints,BC=this.body,clothes=this.clothes,WD=typeof WARDROBE!=='undefined'?WARDROBE:null;
                const pair=name=>[j[name+'_l'].position.slice(),j[name+'_r'].position.slice()];
                const g=this.geometry={darken:this.darken,skin:this.skin,gender:this.gender,walkCycle:0,android:this.android,body:BC,
                    torso:{x:BC.tb,w:BC.tf-BC.tb},hip:{x:BC.hb,w:BC.hf-BC.hb},headX:j.head.position[0],headInTorso:j.head.position[0]-j.pelvis.position[0],
                    feet:pair('foot'),knees:pair('knee'),hipPt:pair('hip'),fists:pair('hand'),elbows:pair('elbow'),
                    cloth:(key,spec)=>clothGeometry(this.ctx,this.entity,key,spec,this.cloth_dyn)};
                this.bottom_piece=WD&&clothes.bottom?WD.bottoms[clothes.bottom.type]:null;
                this.shoe_piece=WD&&clothes.shoes?WD.shoes[clothes.shoes.type]:null;
                this.leg_color=clothes.bottom?(clothes.bottom.under||clothes.bottom.color):null;
                this.top_gloss=_glossy(this.top_piece,clothes.top);this.bottom_gloss=_glossy(this.bottom_piece,clothes.bottom);
                return g;
            }

            // --- HELPERS ---
            /** The head keeps its shape under a build's scale: draw it through this. */
            withHead (hx, draw) {
                const ctx = this.ctx, S = this.scale;
                if (!S) return draw(hx);
                ctx.save(); ctx.scale(S.k / S.x, S.k / S.y); draw(hx * S.x / S.k); ctx.restore();
            }

            /** The pose's offset for a joint (`key`: lf, rf, head), axis i, weighted by how far the pose has faded in. */
            pf (key, i) { return this.pose && this.pose[key] ? this.pose[key][i] * this.pose_w : 0; }

            /** A limb segment between two joints, tapered by T (ui/bodies.js): round at each joint so the next
             *  segment carries on from the same circle. Only fillStyle changes without a shade, so restore that
             *  explicitly. The path is cleared after the fill: the browser would otherwise re-map it through every
             *  later transform, save and restore. */
            drawLimb (x1, y1, x2, y2, T, color, gloss) {
                const ctx = this.ctx, SH = this.shade;
                if (!SH) {
                    const fill = ctx.fillStyle;
                    ctx.fillStyle = color; bodyLimbPath(ctx, x1, y1, x2, y2, T); ctx.fill(); ctx.beginPath();
                    ctx.fillStyle = fill;
                    return;
                }
                const shaded = gloss || SH.lx || SH.ly, geometry = shaded ? this.limb_geometry : null;
                ctx.fillStyle = color; bodyLimbPath(ctx, x1, y1, x2, y2, T, geometry); ctx.fill(); ctx.beginPath();
                if (shaded) this.shadeLimb(x1, y1, x2, y2, T, gloss);
            }

            /** The light across one limb segment: a gloss streak, or the soft shade on its far side (limb_geometry already set). */
            shadeLimb (x1, y1, x2, y2, T, gloss) {
                const ctx = this.ctx, SH = this.shade, geometry = this.limb_geometry;
                const len = geometry.length/2 + 2, ang = geometry.angle, width = Math.max(T[0], T[1]);
                const c = Math.cos(ang), s = Math.sin(ang), ly = -s * SH.lx + c * SH.ly, lx = (c * SH.lx + s * SH.ly) * len * 0.1;
                ctx.save(); ctx.translate((x1+x2)/2, (y1+y2)/2); ctx.rotate(ang);
                if (gloss) {
                    ctx.fillStyle = SH.hl2;
                    ctx.beginPath(); ctx.ellipse(lx, ly * width * 0.4, len * 0.78, width * 0.32, 0, 0, Math.PI*2); ctx.fill();
                } else {
                    _softSpot(ctx, -lx, -ly * width * 0.75, len * 1.6, width * 1.3, _SHADOW_RGB, SH.shA * 1.3);
                }
                ctx.restore();
            }

            /** A whole arm as one skinned outline (BODY_SKIN.arms, ui/bodies.js): the forearm's colour down the
             *  chain, the upper arm over it from the shoulder, each segment shaded as before. */
            drawSkinnedArm (sx, sy, ex, ey, fx, fy, upperColor, foreColor, upperGloss, foreGloss) {
                const ctx = this.ctx, SH = this.shade, BC = this.body, P = this.skin_chain || (this.skin_chain = [0, 0, 0, 0, 0, 0]);
                const ux = ex - sx, uy = ey - sy, fx2 = fx - ex, fy2 = fy - ey;
                if (ux * fx2 + uy * fy2 < -0.5 * Math.hypot(ux, uy) * Math.hypot(fx2, fy2)) {    // folded past 120°: no bend to skin, two segments
                    this.drawLimb(ex, ey, fx, fy, BC.fore, foreColor, foreGloss);
                    return this.drawLimb(sx, sy, ex, ey, BC.upper, upperColor, upperGloss);
                }
                P[0] = sx; P[1] = sy; P[2] = ex; P[3] = ey; P[4] = fx; P[5] = fy;
                ctx.fillStyle = foreColor; bodySkinnedLimbPath(ctx, P, BC.upper, BC.fore); ctx.fill();
                ctx.fillStyle = upperColor; bodySkinnedLimbPath(ctx, P, BC.upper, BC.fore, true); ctx.fill(); ctx.beginPath();
                if (!SH) return;
                const G = this.limb_geometry;
                if (foreGloss || SH.lx || SH.ly) { G.length = Math.hypot(fx - ex, fy - ey); G.angle = Math.atan2(fy - ey, fx - ex); this.shadeLimb(ex, ey, fx, fy, BC.fore, foreGloss); }
                if (upperGloss || SH.lx || SH.ly) { G.length = Math.hypot(ex - sx, ey - sy); G.angle = Math.atan2(ey - sy, ex - sx); this.shadeLimb(sx, sy, ex, ey, BC.upper, upperGloss); }
            }

            // --- SET UP ---
            /** Who is drawn, and how, this frame: the look, the stance, what is held, the weather on them, their shading and their build. */
            configure (ctx, entity, config, S, A) {
                this.ctx = ctx; this.entity = entity; this.config = config; this.android = A;
                // --- 1. CONFIGURATION ---
                const skinColor = A ? A.plate : (config.skinColor || '#8d5524');
                const isDriving = config.isDriving || false;
                const isShootingFromCar = config.isShootingFromCar || false;
                const carAngle = config.carAngle || 0;
                const recoil = config.recoil || 0;
                const gender = config.gender || 'androgynous';
                const bladeGame = !isDriving && entity.type === 'player' && entity._game &&
                    entity._game.weaponMode === 'melee' && !entity._game.weaponHolstered ? entity._game : null;
                const bladeSwing = bladeGame && bladeGame.slashAngle ? bladeGame.slashAngle() : null;
                const bladeWide = !!(bladeGame && bladeGame.currentWeapon && weaponModel(bladeGame.currentWeapon.id).swing === 'wide');
                const stance = bladeGame ? 'knife' : (config.stance || 'idle');
                const held = config.held || null;
                // Which hand (if any) is holding a drink — it's held out and swings less
                // Weather on this character (world/weather-response.js): wind, rain, lightning; null indoors
                const W = !isDrivingCfg(config) ? weatherAt(entity) : null;
                // An umbrella opens in the rain (or when told to) and is held like a drink
                const umbrella = held && held.type === 'umbrella' && !isDrivingCfg(config) ? held : null;
                const umbrellaOpen = umbrella ? (umbrella.open !== undefined ? umbrella.open : (W && W.rain > 0.05 ? 1 : 0)) : 0;
                const glassHand = (held && !isDrivingCfg(config) && (held.type === 'glass' || held.type === 'champagne_glass' || umbrella)) ? (held.hand || 'right') : null;
                // A parcel is carried in both hands, out in front (a delivery: PARCEL_HELD)
                const parcel = !!(held && held.type === 'parcel' && !isDrivingCfg(config) && stance === 'idle');

                const clothes = this.clothes;
                this.scale = S; this.skin = skinColor;
                clothes.hair = config.hair || null; clothes.hat = config.hat || null;
                clothes.top = config.top || null; clothes.bottom = config.bottom || null;
                clothes.shoes = config.shoes || null; clothes.train = config.train || null;
                clothes.jewelry = config.jewelry || null;

                // Rain darkens clothes a touch (not skin)
                const wet = W ? W.rain * 0.08 : 0;
                this.wet = wet; this.shade_config._wet = W ? W.rain : 0;
                this.shade = isDriving ? null : humanShade(ctx, entity, this.shade_config);
                // --- 2. PROPORTIONS ---
                // The body's shape for this gender and build (ui/bodies.js BODY_CANON)
                const BC = bodyCanon(gender, config.build);
                this.driving = isDriving; this.shooting_from_car = isShootingFromCar; this.recoil = recoil; this.gender = gender;
                this.blade_game = bladeGame; this.blade_swing = bladeSwing; this.blade_wide = bladeWide; this.stance = stance; this.held = held;
                this.weather = W; this.umbrella = umbrella; this.umbrella_open = umbrellaOpen; this.glass_hand = glassHand; this.parcel = parcel; this.body = BC;
                this.dress();
            }

            /** The wardrobe pieces for this outfit (ui/wardrobe.js; unknown types draw as plain colour), and the sleeves. */
            dress () {
                const WD = typeof WARDROBE !== 'undefined' ? WARDROBE : null;
                const clothes = this.clothes;
                const topP = WD && clothes.top ? WD.tops[clothes.top.type] : null;
                const sleeve = clothes.top ? (topP ? topP.sleeve : 'long') : 'none';
                // Sleeves can come from the shirt under a vest; legs from trousers under an apron
                const sleeveCol = clothes.top ? (topP && topP.sleeveFrom === 'inner' ? (clothes.top.inner || '#f2f2f2') : topColor(clothes.top)) : null;
                this.top_piece = topP; this.sleeve = sleeve; this.sleeve_color = sleeveCol;
            }

            /** The gait: how fast and which way they walk, where in the step they are, and the sway, bounce and lean that go with it. */
            stride () {
                const entity = this.entity, config = this.config, A = this.android, isDriving = this.driving, recoil = this.recoil, stance = this.stance;
                // --- 3. GAIT (shared controller — see CONFIG.GAIT / syncHumanoidGait) ---
                const gait = syncHumanoidGait(entity);
                const gaitSpeed = isDriving ? 0 : gait.speed;
                const hovering = !!(A && A.hover);                              // floats instead of walking
                const strideLen = hovering ? 0 : humanoidStrideLength(gaitSpeed);
                const strafeLen = strideLen * CONFIG.GAIT.STRAFE_RATIO;
                const sway = Math.min(1, gaitSpeed / CONFIG.GAIT.FULL_SWAY_SPEED);

                // Directional orientation (travel direction relative to facing)
                let fwdAmt = 1.0, sideAmt = 0.0;
                if (gaitSpeed > 0 && entity.angle !== undefined) {
                    const cos = Math.cos(-entity.angle);
                    const sin = Math.sin(-entity.angle);
                    fwdAmt = gait.dirX * cos - gait.dirY * sin;
                    sideAmt = gait.dirX * sin + gait.dirY * cos;
                }

                // Walk phase blends with the body when RenderInterp has this entity mid-tick
                let walkCycle = entity.walkPhase || 0;
                if (entity._ipActive && gait.phasePrev !== undefined && Math.abs(walkCycle - gait.phasePrev) < 2) {
                    walkCycle = gait.phasePrev + (walkCycle - gait.phasePrev) * RenderInterp.alpha;
                }
                // Walk oscillations. Like the arm swing, these are applied AFTER the pose
                // smoothing in step 6 — the per-render lerp there would mute and delay
                // them — so the pose targets below are built without them.
                const walkSin = Math.sin(walkCycle), walkOppSin = isDriving ? 0 : Math.sin(walkCycle + Math.PI);
                const walkBounce = (isDriving || hovering) ? 0 : Math.abs(walkSin) * (gaitSpeed * 0.2); // Bounce scales with speed
                const walkSway = walkSin * 0.3 * sway;  // sway is 0 when driving or stopped
                let bounce = 0;         // pose-target bounce; walk bounce is added after smoothing

                // Punch strike 0..1 (null unless the caller passes punchTicks). Applied after
                // smoothing in step 6; the body lean follows the same curve.
                // A haymaker (entity.punchHay, the knuckles) throws the hook instead: its weight stands in for the strike.
                const ticked = stance === 'punch' && typeof config.punchTicks === 'number';
                const hook = this.hook = ticked && entity.punchHay ? humanoidHookPose(config.punchTicks, this.hook_pose || (this.hook_pose = [0, 0, 0, 0, 0])) : null;
                const punchStrike = ticked ? (hook ? hook[0] : humanoidPunchCurve(config.punchTicks)) : null;
                let bodyRecoil = punchStrike === null ? recoil * 2 : hook ? -hook[4] * CONFIG.HAYMAKER.LUNGE : punchStrike * CONFIG.PUNCH.BODY_LEAN;
                const driveOffset = isDriving ? 14 : 0;
                const hipAnchorX = -3 + walkBounce - bodyRecoil + driveOffset;
                const shoulderX = hipAnchorX;
                // Elbow targets use the shoulder without walk bounce (re-added after smoothing),
                // and without the punch lean (also applied after smoothing)
                const shoulderPoseX = hipAnchorX - walkBounce + (punchStrike !== null ? bodyRecoil : 0);
                let hipRotation = 0;    // pose targets; walk sway is added after smoothing
                let torsoRotation = 0;
                const armSwing = isDriving ? 0 : walkOppSin * gaitSpeed;
                this.gait = gait; this.gait_speed = gaitSpeed; this.hovering = hovering; this.stride_len = strideLen; this.strafe_len = strafeLen; this.sway = sway; this.fwd_amt = fwdAmt; this.side_amt = sideAmt; this.walk_cycle = walkCycle; this.walk_sin = walkSin; this.walk_opp_sin = walkOppSin; this.walk_bounce = walkBounce; this.walk_sway = walkSway; this.bounce = bounce; this.punch_strike = punchStrike; this.body_recoil = bodyRecoil; this.drive_offset = driveOffset; this.hip_anchor_x = hipAnchorX; this.shoulder_x = shoulderX; this.shoulder_pose_x = shoulderPoseX; this.hip_rotation = hipRotation; this.torso_rotation = torsoRotation; this.arm_swing = armSwing;
            }

            /** The pose (ui/poses.js): what the body does while standing still. It fades in after a moment standing, out the moment they walk. */
            strikePose () {
                // --- 3b. POSE (ui/poses.js): what the body does while standing still ---
                const P = this.driving ? null : humanoidPose(this.entity, this.config, this.gait_speed, this.gender);
                this.pose = P ? P.pose : null; this.pose_w = P ? P.w : 0;
            }

            /** Where the hands and elbows want to be for the stance, a held drink, umbrella or parcel, and the pose. */
            placeHands () {
                const entity = this.entity, config = this.config, isDriving = this.driving, recoil = this.recoil, stance = this.stance, umbrellaOpen = this.umbrella_open, glassHand = this.glass_hand, parcel = this.parcel, shoulderSpread = this.body.sh, punchStrike = this.punch_strike, bodyRecoil = this.body_recoil, driveOffset = this.drive_offset, shoulderPoseX = this.shoulder_pose_x, pose = this.pose, poseW = this.pose_w;
                let bounce = this.bounce, hipRotation = this.hip_rotation, torsoRotation = this.torso_rotation;
                // --- 5. HAND POSITIONS ---
                let lFistX, rFistX, lFistY, rFistY;

                if (isDriving) {
                    lFistX = 18 + driveOffset; rFistX = 18 + driveOffset;
                    lFistY = -3; rFistY = 3;
                } else if (stance === 'pistol') {
                    // Base pose only — the walk swing is added after smoothing (step 6)
                    lFistX = -5 + bounce - bodyRecoil;
                    lFistY = -11 + bounce - bodyRecoil;
                    rFistX = 22 + bounce - bodyRecoil - (recoil * 6);
                    rFistY = 3 + bounce - bodyRecoil;
                } else if (stance === 'rifle' || stance === 'sniper') {
                    // Two-handed: stock hand at the right shoulder, support hand forward ON the
                    // gun line (it used to sit ~8px inside the gun, and both hands' Y was
                    // accidentally computed from the forward aim value).
                    rFistX = 6 + bounce - bodyRecoil - (recoil * 6);
                    rFistY = 14 - (config.scopeK || 0) * 11;                               // scoped: the gun comes up to her eye (engine/scope.js)
                    const gunLineY = stance === 'sniper' ? rFistY + 0.5 : rFistY - 0.5;   // centerline of the drawn model
                    lFistX = rFistX + (stance === 'sniper' ? 18 : 14) + (config.scopeK || 0) * 4;   // on the handguard / fore-end (further out, scoped)
                    lFistY = gunLineY;
                } else if (stance === 'knife') {
                    lFistX = 5; lFistY = -10;
                    rFistX = 8; rFistY = 9;
                } else if (stance === 'punch' && punchStrike !== null) {
                    // --- PUNCH: guard pose only. The strike (reach, cross, off-hand pull,
                    // torso twist, lean) is shaped by CONFIG.PUNCH and added after smoothing.
                    lFistX = 6;
                    rFistX = 6;
                    lFistY = -8;
                    rFistY = 8;
                } else if (stance === 'punch') {
                    // --- LEGACY PUNCH (callers that don't pass punchTicks) ---

                    // 1. Base Guard Position
                    lFistX = 6 + bounce - bodyRecoil;
                    rFistX = 6 + bounce - bodyRecoil;
                    lFistY = -8; 
                    rFistY = 8;

                    // 2. Check for active punch
                    if (recoil > 0) {
                        const punchExt = recoil * 15;
                        // Retrieve punch side from entity, default to right
                        const punchSide = entity.punchSide || 'right';

                        if (punchSide === 'right') {
                            // -- RIGHT PUNCH --
                            torsoRotation -= recoil * 0.5; // twist left: the right shoulder comes forward (+ turns clockwise, toward the right)
                            rFistX += punchExt;
                            rFistY -= punchExt * 0.2; // Cross inward
                            lFistX -= recoil * 3;     // Retract Left
                        } else {
                            // -- LEFT PUNCH --
                            torsoRotation += recoil * 0.5; // twist right: the left shoulder comes forward
                            lFistX += punchExt;
                            lFistY += punchExt * 0.2; // Cross inward (Positive Y moves from -8 towards 0)
                            rFistX -= recoil * 3;     // Retract Right
                        }
                    } else {
                        // Idle Breathing
                        const breath = Math.sin(_frameTime / 250) * 1.5;
                        lFistX += breath;
                        rFistX += breath;
                    }
                } else {
                    // Idle/Walking — base pose only. The walk swing is added after the
                    // smoothing below so the lerp can't soak it up.
                    lFistX = -2 + bounce - bodyRecoil;
                    rFistX = -2 + bounce - bodyRecoil;
                    lFistY = -13;
                    rFistY = 13;
                    // Holding a drink: that hand is held out a little in front, elbow softly bent
                    if (glassHand === 'right') { rFistX += 7; rFistY = 9; }
                    else if (glassHand === 'left') { lFistX += 7; lFistY = -9; }
                    // An open umbrella's handle is held up close to the chest
                    if (umbrellaOpen > 0.15) { if (glassHand === 'right') { rFistX = 3 + bounce; rFistY = 5; } else { lFistX = 3 + bounce; lFistY = -5; } }
                    // Carrying a parcel: both hands forward, either side of the box
                    if (parcel) { lFistX = rFistX = 7.5 + bounce * 0.3; lFistY = -6.6; rFistY = 6.6; }
                }
                const walkArms = !isDriving && stance !== 'pistol' && stance !== 'rifle' && stance !== 'sniper' && stance !== 'punch' && stance !== 'knife';
                // Pose: hands (unarmed only; a hand holding a drink keeps it), twist and breathing
                if (pose) {
                    if (walkArms && pose.l && glassHand !== 'left' && !parcel) { lFistX += (pose.l[0] - lFistX) * poseW; lFistY += (pose.l[1] - lFistY) * poseW; }
                    if (walkArms && pose.r && glassHand !== 'right' && !parcel) { rFistX += (pose.r[0] - rFistX) * poseW; rFistY += (pose.r[1] - rFistY) * poseW; }
                    torsoRotation += (pose.torso || 0) * poseW;
                    hipRotation += (pose.hip || 0) * poseW;
                    bounce += (pose.bounce || 0) * poseW;
                }

                const lShoulderY = -shoulderSpread;
                const rShoulderY = shoulderSpread;

                let lElbowX = (shoulderPoseX + lFistX) / 2;
                let rElbowX = (shoulderPoseX + rFistX) / 2;
                let lElbowY = (lShoulderY + lFistY) / 2;
                let rElbowY = (rShoulderY + rFistY) / 2;
                // Drink hand: elbow bent softly out to the side
                if (glassHand === 'right' && stance === 'idle') rElbowY += 3.5;
                else if (glassHand === 'left' && stance === 'idle') lElbowY -= 3.5;
                if (parcel) { lElbowY -= 3; rElbowY += 3; }                     // elbows out round the box
                if (pose && walkArms) {
                    if (pose.le && glassHand !== 'left' && !parcel) { lElbowX += (pose.le[0] - lElbowX) * poseW; lElbowY += (pose.le[1] - lElbowY) * poseW; }
                    if (pose.re && glassHand !== 'right' && !parcel) { rElbowX += (pose.re[0] - rElbowX) * poseW; rElbowY += (pose.re[1] - rElbowY) * poseW; }
                }

                if (isDriving) {
                    lElbowX = 8 + driveOffset; lElbowY = -shoulderSpread - 5;
                    rElbowX = 8 + driveOffset; rElbowY = shoulderSpread + 5;
                }

                if (stance === 'rifle' || stance === 'sniper') {
                    lElbowY -= 4; rElbowY += 4;
                } else if (stance === 'punch') {
                    lElbowY -= 6;
                    rElbowY += 6;
                }

                // Guard-pose targets, kept so the punch can blend onto them (see step 6)
                const punchGuard = punchStrike !== null ? (this.punch_guard || (this.punch_guard = new Array(8))) : null;
                if (punchGuard) {
                    punchGuard[0] = lFistX; punchGuard[1] = lFistY; punchGuard[2] = rFistX; punchGuard[3] = rFistY;
                    punchGuard[4] = lElbowX; punchGuard[5] = lElbowY; punchGuard[6] = rElbowX; punchGuard[7] = rElbowY;
                }
                this.fists[0] = lFistX; this.fists[1] = lFistY; this.fists[2] = rFistX; this.fists[3] = rFistY; this.elbows[0] = lElbowX; this.elbows[1] = lElbowY; this.elbows[2] = rElbowX; this.elbows[3] = rElbowY; this.walk_arms = walkArms; this.bounce = bounce; this.hip_rotation = hipRotation; this.torso_rotation = torsoRotation;
            }

            /** Ease the joints toward where they want to be, then add what must not be smoothed: the walk swing, bounce, a hit, a kick, a punch or a blade stroke. */
            settle () {
                const entity = this.entity, config = this.config, isDriving = this.driving, bladeGame = this.blade_game, bladeSwing = this.blade_swing, bladeWide = this.blade_wide, stance = this.stance, glassHand = this.glass_hand, parcel = this.parcel, strideLen = this.stride_len, walkOppSin = this.walk_opp_sin, walkBounce = this.walk_bounce, walkSway = this.walk_sway, punchStrike = this.punch_strike, bodyRecoil = this.body_recoil, shoulderX = this.shoulder_x, armSwing = this.arm_swing, walkArms = this.walk_arms, lShoulderY = -this.body.sh, rShoulderY = this.body.sh, punchGuard = this.punch_guard;
                let bounce = this.bounce, hipRotation = this.hip_rotation, torsoRotation = this.torso_rotation, lFistX = this.fists[0], lFistY = this.fists[1], rFistX = this.fists[2], rFistY = this.fists[3], lElbowX = this.elbows[0], lElbowY = this.elbows[1], rElbowX = this.elbows[2], rElbowY = this.elbows[3];
                // --- 6. ANIMATION INTERPOLATION ---
                // Smoothly interpolate limb positions to avoid snappy transitions
                const lerpSpeed = config.lerpSpeed || 0.15;

                // Initialize animation state on entity if not present
                if (!entity._animState) {
                    entity._animState = {
                        lFistX: lFistX, lFistY: lFistY,
                        rFistX: rFistX, rFistY: rFistY,
                        lElbowX: lElbowX, lElbowY: lElbowY,
                        rElbowX: rElbowX, rElbowY: rElbowY,
                        hipRotation: hipRotation,
                        torsoRotation: torsoRotation,
                        bounce: bounce
                    };
                }

                const anim = entity._animState;

                // Lerp function
                const lerp = _humanoidLerp;

                // Interpolate hand positions (key for stance transitions)
                anim.lFistX = lerp(anim.lFistX, lFistX, lerpSpeed);
                anim.lFistY = lerp(anim.lFistY, lFistY, lerpSpeed);
                anim.rFistX = lerp(anim.rFistX, rFistX, lerpSpeed);
                anim.rFistY = lerp(anim.rFistY, rFistY, lerpSpeed);

                // Interpolate elbow positions
                anim.lElbowX = lerp(anim.lElbowX, lElbowX, lerpSpeed);
                anim.lElbowY = lerp(anim.lElbowY, lElbowY, lerpSpeed);
                anim.rElbowX = lerp(anim.rElbowX, rElbowX, lerpSpeed);
                anim.rElbowY = lerp(anim.rElbowY, rElbowY, lerpSpeed);

                // Interpolate body rotations
                anim.hipRotation = lerp(anim.hipRotation, hipRotation, lerpSpeed);
                anim.torsoRotation = lerp(anim.torsoRotation, torsoRotation, lerpSpeed);
                anim.bounce = lerp(anim.bounce, bounce, lerpSpeed * 2); // Bounce can be faster

                // Use interpolated values for rendering
                lFistX = anim.lFistX;
                lFistY = anim.lFistY;
                rFistX = anim.rFistX;
                rFistY = anim.rFistY;
                lElbowX = anim.lElbowX;
                lElbowY = anim.lElbowY;
                rElbowX = anim.rElbowX;
                rElbowY = anim.rElbowY;

                // Unarmed walk arm swing, applied AFTER smoothing. The per-render lerp
                // above acts as a low-pass filter: fed an oscillating target it only
                // passed ~34-58% of the swing (less at lower frame rates) and lagged
                // it behind the legs. Arms mirror the opposite leg and scale with
                // stride; the weight fades in/out on stance changes so there's no pop.
                if (anim.armSwingW === undefined) anim.armSwingW = walkArms ? 1 : 0;
                anim.armSwingW = lerp(anim.armSwingW, walkArms ? 1 : 0, lerpSpeed);
                if (anim.armSwingW > 0.001 && strideLen > 0) {
                    const handSwing = walkOppSin * strideLen * CONFIG.GAIT.ARM_SWING_RATIO * anim.armSwingW;
                    const ls = parcel ? 0.12 : glassHand === 'left' ? 0.25 : 1, rs = parcel ? 0.12 : glassHand === 'right' ? 0.25 : 1;   // keep the drink (or the box) steady
                    lFistX += handSwing * ls;
                    rFistX -= handSwing * rs;
                    lElbowX += handSwing * 0.5 * ls;   // elbow sits midway between shoulder and hand
                    rElbowX -= handSwing * 0.5 * rs;
                }
                hipRotation = anim.hipRotation;
                torsoRotation = anim.torsoRotation;
                bounce = anim.bounce;

                // Pistol walk swing, after smoothing: the off hand swings diagonally and the
                // gun hand sways slightly sideways (same amounts as before, now unmuted).
                // Fades in/out on stance changes like the unarmed swing.
                const pistolWalk = !isDriving && stance === 'pistol';
                if (anim.pistolSwingW === undefined) anim.pistolSwingW = pistolWalk ? 1 : 0;
                anim.pistolSwingW = lerp(anim.pistolSwingW, pistolWalk ? 1 : 0, lerpSpeed);
                if (anim.pistolSwingW > 0.001 && armSwing !== 0) {
                    const ps = armSwing * 0.5 * anim.pistolSwingW;
                    lFistX += ps; lFistY += ps; rFistY += ps;
                    lElbowX += ps * 0.5; lElbowY += ps * 0.5; rElbowY += ps * 0.5;  // elbows sit midway
                }

                // Walk sway and bounce on top of the smoothed pose (in step with the legs)
                hipRotation += walkSway;
                torsoRotation -= walkSway;
                bounce += walkBounce;
                // Hit flinch (engine/combat-fx.js sets _hitT): twist away from the blow, head knocked back
                const hitK = entity._hitT !== undefined ? Math.max(0, 1 - (_gameTimeSec - entity._hitT) / 0.18) : 0;
                if (hitK > 0) {
                    const side = Math.sin((entity._hitDir || 0) - (entity.angle || 0)) >= 0 ? 1 : -1;
                    torsoRotation += hitK * 0.32 * side; hipRotation += hitK * 0.12 * side; bounce -= hitK * 1.6;
                }
                lFistX += walkBounce; rFistX += walkBounce;
                lElbowX += walkBounce; rElbowX += walkBounce;
                if (stance === 'pistol') {
                    // The pistol pose's hand targets carry bounce on Y as well
                    lFistY += walkBounce; rFistY += walkBounce;
                    lElbowY += walkBounce * 0.5; rElbowY += walkBounce * 0.5;
                }

                // Weapon kick for NPC shooters (config.kick 0..1), after smoothing so it isn't muted.
                // Two-handed weapons ride the kick with both hands.
                if (!isDriving && config.kick > 0 && (stance === 'pistol' || stance === 'rifle' || stance === 'sniper')) {
                    const kx = config.kick * 6;
                    rFistX -= kx; rElbowX -= kx * 0.5;
                    if (stance !== 'pistol') { lFistX -= kx; lElbowX -= kx * 0.5; }
                }

                // Punch strike on top of the smoothed guard pose
                if (punchStrike !== null) {
                    const P = CONFIG.PUNCH;
                    // As the strike builds, blend the hands onto the guard pose, so a punch
                    // thrown from a relaxed stance still lands at full reach while the
                    // smoothed pose is catching up (at strike 0 nothing changes).
                    const k = punchStrike, G = punchGuard;
                    lFistX += (G[0] + walkBounce - lFistX) * k;  lFistY += (G[1] - lFistY) * k;
                    rFistX += (G[2] + walkBounce - rFistX) * k;  rFistY += (G[3] - rFistY) * k;
                    lElbowX += (G[4] + walkBounce - lElbowX) * k; lElbowY += (G[5] - lElbowY) * k;
                    rElbowX += (G[6] + walkBounce - rElbowX) * k; rElbowY += (G[7] - rElbowY) * k;

                    const reach = punchStrike * P.REACH;
                    const pull = punchStrike * P.OFFHAND_PULL;
                    // Hands move with the body lean (shoulders already have it via hipAnchorX)
                    lFistX -= bodyRecoil; rFistX -= bodyRecoil;
                    lElbowX -= bodyRecoil; rElbowX -= bodyRecoil;
                    const hook = this.hook;
                    if (hook) {
                        // The hook: the fist swings round her chest on an arc (wound out wide, across, through),
                        // the elbow bent out to its own side, the torso turning through it, the other fist at the chin
                        const H = CONFIG.HAYMAKER, s = (entity.punchSide || 'right') === 'right' ? 1 : -1, w = hook[0];
                        const tx = walkBounce - bodyRecoil + Math.cos(hook[1]) * hook[2], ty = s * Math.sin(hook[1]) * hook[2];
                        torsoRotation -= s * hook[3] * w;
                        const shY = s > 0 ? rShoulderY : lShoulderY, sx = shoulderX - shY * Math.sin(torsoRotation), sy = shY * Math.cos(torsoRotation);
                        const dx = tx - sx, dy = ty - sy, d = Math.max(.001, Math.hypot(dx, dy)), bend = Math.sqrt(Math.max(0, 14 * 14 - d * d / 4)) * s;
                        const ex = (sx + tx) / 2 - dy / d * bend, ey = (sy + ty) / 2 + dx / d * bend, pull = w * Math.max(0, hook[4]) * H.OFFHAND_PULL;
                        // The other arm turns with the torso about the chest (forward on the wind-up, driven back
                        // as the hook lands) and its elbow drives back past the ribs: the whole body throws it
                        const ra = -s * hook[3] * w * H.OFFHAND_TURN, rc = Math.cos(ra), rs = Math.sin(ra), cx = shoulderX;
                        const turn = (x, y) => [cx + (x - cx) * rc - y * rs, (x - cx) * rs + y * rc];
                        if (s > 0) {
                            rFistX += (tx - rFistX) * w; rFistY += (ty - rFistY) * w; rElbowX += (ex - rElbowX) * w; rElbowY += (ey - rElbowY) * w;
                            [lFistX, lFistY] = turn(lFistX - pull, lFistY); [lElbowX, lElbowY] = turn(lElbowX - pull * H.OFFHAND_ELBOW, lElbowY);
                        } else {
                            lFistX += (tx - lFistX) * w; lFistY += (ty - lFistY) * w; lElbowX += (ex - lElbowX) * w; lElbowY += (ey - lElbowY) * w;
                            [rFistX, rFistY] = turn(rFistX - pull, rFistY); [rElbowX, rElbowY] = turn(rElbowX - pull * H.OFFHAND_ELBOW, rElbowY);
                        }
                    } else if ((entity.punchSide || 'right') === 'right') {
                        rFistX += reach;  rFistY -= reach * P.CROSS;              // jab crosses inward
                        rElbowX += reach * 0.5; rElbowY -= reach * P.CROSS * 0.5;
                        lFistX -= pull;   lElbowX -= pull * 0.5;                  // other fist pulls back
                        torsoRotation -= punchStrike * P.TWIST;                   // twist into the punch: right shoulder forward
                    } else {
                        lFistX += reach;  lFistY += reach * P.CROSS;
                        lElbowX += reach * 0.5; lElbowY += reach * P.CROSS * 0.5;
                        rFistX -= pull;   rElbowX -= pull * 0.5;
                        torsoRotation += punchStrike * P.TWIST;                   // left shoulder forward
                    }
                }

                // The strike goes on AFTER smoothing, as with punches: a short cut must
                // reach its full pose even when the display only shows a few attack frames.
                if (bladeGame) {
                    // A long blade (swing 'wide': Blood Pact) is held in both hands, at guard or mid-sweep
                    // (engine/status-effects.js); the left hand rides the grip behind the right
                    const pose = bladeWide ? (bladeSwing || wideGrip({ ...WIDE_SWING.guard, twist: 0 })) : bladeSwing;
                    if (pose) {
                        rFistX = pose.handX + walkBounce; rFistY = pose.handY;
                        torsoRotation += pose.twist || 0;
                        if (bladeWide) { lFistX = pose.lHandX + walkBounce; lFistY = pose.lHandY; }
                        else lFistX -= Math.max(0, pose.reach) * .2;
                    }
                    // Elbows bend outward to their own side: the right arm's to her right, the left's to her left
                    const ik = (shY, fx, fy, out) => {
                        const sx = shoulderX - shY * Math.sin(torsoRotation), sy = shY * Math.cos(torsoRotation);
                        const dx = fx - sx, dy = fy - sy, d = Math.max(.001, Math.hypot(dx, dy));
                        const bend = Math.sqrt(Math.max(0, 14 * 14 - d * d / 4)) * out;
                        return [(sx + fx) / 2 - dy / d * bend, (sy + fy) / 2 + dx / d * bend];
                    };
                    [rElbowX, rElbowY] = ik(rShoulderY, rFistX, rFistY, 1);
                    if (bladeWide) [lElbowX, lElbowY] = ik(lShoulderY, lFistX, lFistY, -1);
                }
                this.fists[0] = lFistX; this.fists[1] = lFistY; this.fists[2] = rFistX; this.fists[3] = rFistY; this.elbows[0] = lElbowX; this.elbows[1] = lElbowY; this.elbows[2] = rElbowX; this.elbows[3] = rElbowY; this.hip_rotation = hipRotation; this.torso_rotation = torsoRotation; this.bounce = bounce; this.hit_k = hitK;
            }


            // --- DRAW ---
            /** The weapon in hand, behind the hands: the player's (with the holster animation) or an NPC's. */
            drawWeapons () {
                if(this.entity.rigPose){
                    const game=this.entity.type==='player'?this.entity._game:null,weapon=game?(!game.weaponHolstered?game.currentWeapon:null):this.config.weapon;
                    this.gun_hand=!!weapon;
                    if(weapon?.id&&(!game||['normal','sniper','melee'].includes(game.weaponMode)))drawWeapon(this.ctx,weapon.id,this.fists[2],this.fists[3],0,1,false);
                    return;
                }
                const entity = this.entity, config = this.config, ctx = this.ctx, isDriving = this.driving, bladeSwing = this.blade_swing, bladeWide = this.blade_wide, rFistX = this.fists[2], rFistY = this.fists[3];
                let gunHand = false;                                            // the right hand closes round a drawn weapon

                // --- DRAW WEAPON (Behind hands) ---
                // Only draw if player and has a weapon, and NOT driving (driving has its own weapon logic)
                if (!isDriving && entity.type === 'player' && entity._game && entity._game.currentWeapon) {
                    const game = entity._game;

                    // Step the holster animation toward target (~0.2s of game time, same at any frame rate)
                    const target = (game.holsterAnimTarget !== undefined) ? game.holsterAnimTarget : 1;
                    if (game.holsterAnim === undefined) { game.holsterAnim = 1; game._holsterT = _gameTimeSec; }
                    const hdt = Math.max(0, Math.min(0.1, _gameTimeSec - (game._holsterT ?? _gameTimeSec)));
                    game._holsterT = _gameTimeSec;
                    const hd = target - game.holsterAnim;
                    game.holsterAnim += Math.sign(hd) * Math.min(Math.abs(hd), hdt / 0.2);

                    const anim = game.holsterAnim;
                    entity._muzzleLocal = null;

                    // Skip rendering once fully holstered — weapon is "stowed"
                    if (anim > 0.02) {
                        const weaponId = game.currentWeapon.id;
                        gunHand = true;

                        // Lerp from hip-ish stow position back to the fist as anim → 1
                        const hipX = rFistX * 0.4 - 2;
                        const hipY = rFistY * 0.4 + 6;
                        const wx = hipX + (rFistX - hipX) * anim;
                        const wyBase = hipY + ((rFistY - 2) - hipY) * anim;

                        const scale = 0.5 + 0.5 * anim;

                        ctx.save();
                        ctx.globalAlpha = anim;

                        // Draw whenever a weapon mode is active (not from the visual `stance`,
                        // which flips to 'idle' the moment holster is toggled and would skip
                        // the retract). Sniper models sit 2px lower in the hand, matching NPCs.
                        if (game.weaponMode === 'normal' || game.weaponMode === 'sniper') {
                            const wy = wyBase + (weaponId.includes('sniper') ? 2 : 0);
                            const laser = !!(game.inventory && game.items.hasAttachment('laser_sight'));
                            // the finisher's twirl (engine/finisher.js): the gun spins round her trigger finger
                            const tw = game.twirlAngle ? game.twirlAngle() : 0;
                            drawWeapon(ctx, weaponId, wx, wy, tw, scale, laser && !tw);
                            // Muzzle in the player's frame — laser sight and shots start here
                            const mz = weaponMuzzleLocal(weaponId);
                            entity._muzzleLocal = { x: wx + mz.x * scale, y: wy + mz.y * scale };
                            entity._muzzleReady = anim > 0.95;
                        } else if (game.weaponMode === 'melee') {
                            // The blade stays in the animated fist, rather than extending
                            // independently from a stationary arm.
                            const ang = bladeSwing ? bladeSwing.a : bladeWide ? WIDE_SWING.guard.a : .35;
                            const wy = hipY + (rFistY - hipY) * anim;
                            drawWeapon(ctx, weaponId, wx, wy, ang, scale * .95, false);
                            entity._muzzleLocal = null; entity._muzzleReady = false;
                        }

                        ctx.restore();
                    }
                }

                // --- NPC WEAPON (teammates, gangers): the real weapon model, in the gun hand ---
                // config.weapon = { id, ready }. Ready: aimed in the stance's gun hand, like the
                // player's. Not ready: carried at low ready in the right hand, muzzle angled out.
                // The raise/lower eases over ~0.2s of game time (same at any frame rate).
                if (!isDriving && config.weapon && config.weapon.id && entity.type !== 'player') {
                    const W = config.weapon, target = W.ready ? 1 : 0;
                    gunHand = true;
                    if (entity._wpnReady === undefined) { entity._wpnReady = target; entity._wpnT = _gameTimeSec; }
                    const dt = Math.max(0, Math.min(0.1, _gameTimeSec - entity._wpnT));
                    entity._wpnT = _gameTimeSec;
                    const d = target - entity._wpnReady;
                    entity._wpnReady += Math.sign(d) * Math.min(Math.abs(d), dt / 0.2);
                    const k = entity._wpnReady;
                    const yOff = (W.id.includes('sniper') ? 2 : -2) * k;          // matches the player's hand offsets
                    const wAng = 0.9 * (1 - k), wScale = 0.8 + 0.2 * k;
                    drawWeapon(ctx, W.id, rFistX, rFistY + yOff, wAng, wScale);
                    // Muzzle in the actor's frame — shots leave from here (see aimFromMuzzle)
                    const mz = weaponMuzzleLocal(W.id), ca = Math.cos(wAng), sa = Math.sin(wAng);
                    entity._muzzleLocal = { x: rFistX + (mz.x * ca - mz.y * sa) * wScale, y: rFistY + yOff + (mz.x * sa + mz.y * ca) * wScale };
                }

                this.gun_hand = gunHand;
            }

            /** In a vehicle: seated in a car's seat (vehiclePose), or the driving and shooting-from-the-car poses. False when walking. */
            drawSeated () {
                const entity = this.entity, config = this.config, ctx = this.ctx, A = this.android, skinColor = this.skin, isDriving = this.driving, isShootingFromCar = this.shooting_from_car, recoil = this.recoil, clothes = this.clothes, darken = this.darken, BC = this.body, shoulderSpread = this.body.sh, bodyRecoil = this.body_recoil, driveOffset = this.drive_offset, lFistX = this.fists[0], lFistY = this.fists[1], rFistX = this.fists[2], rFistY = this.fists[3], lElbowX = this.elbows[0], lElbowY = this.elbows[1], rElbowX = this.elbows[2], rElbowY = this.elbows[3], lShoulderY = -this.body.sh, rShoulderY = this.body.sh, sleeve = this.sleeve, sleeveCol = this.sleeve_color;
                if (isDriving && config.vehiclePose) {
                    const q = config.vehiclePose, k = VEHICLE_OCCUPANT_SCALE, side = q.side;
                    const sleeveColor = sleeve !== 'none' ? darken(sleeveCol,.15) : skinColor;
                    const foreColor = sleeve === 'long' ? darken(sleeveCol,.2) : skinColor;
                    const lean = q.lean, torsoY = side * lean * 4 / k;
                    const turn = Math.max(-.5, Math.min(.5, q.rel)) * lean;
                    // Hips remain at the seat. Only the shoulders and head lean toward the window.
                    ctx.save();ctx.translate(0,torsoY);ctx.rotate(turn);
                    ctx.fillStyle=darken(clothes.top ? topColor(clothes.top) : skinColor,.1);
                    ctx.fill(bodyTorsoPath(BC,1));ctx.restore();
                    const sy=side*BC.sh+torsoY;
                    const gx=q.gripX/k,gy=q.gripY/k;
                    const active=lean>.05;
                    const hx=active?gx:13,hy=active?gy:side*4;
                    const ex=hx*.48,ey=(sy+hy)*.5;
                    this.drawLimb(0,sy,ex,ey,BC.upper,sleeveColor);
                    this.drawLimb(ex,ey,hx,hy,BC.fore,foreColor);
                    ctx.fillStyle=skinColor;drawBodyHand(ctx,ex,ey,hx,hy,true,BC);
                    // Driver keeps the other hand forward on the wheel; passengers brace inside.
                    const bs=-side*BC.sh+torsoY,bx=q.driver?16:6,by=q.driver?-side*3:-side*6;
                    this.drawLimb(0,bs,6,bs,BC.upper,sleeveColor);this.drawLimb(6,bs,bx,by,BC.fore,foreColor);
                    ctx.fillStyle=skinColor;drawBodyHand(ctx,6,bs,bx,by,true,BC);
                    if(active && q.weaponId) drawWeapon(ctx,q.weaponId,gx,gy,q.rel,q.scale/k);
                    ctx.save();ctx.translate(0,side*lean*7/k);ctx.rotate(turn);
                    const driveDyn=this.drive_dyn;driveDyn.android=A;
                    this.withHead(0,hx=>drawHeadAndHair(ctx,hx,skinColor,config.faceDark||'#3e2723',config.faceLight||'#5d4037',clothes.hair,driveDyn,clothes.hat,clothes.jewelry));
                    ctx.restore();return true;
                }

                if (isDriving) {
                    // Driving mode rendering - different poses for shooting vs not shooting
                    ctx.save();

                    // Calculate lean amount for shooting
                    const shootLean = isShootingFromCar ? 8 : 0; // Lean forward when shooting
                    const headForward = isShootingFromCar ? 6 : 0; // Head moves forward when shooting

                    ctx.translate(driveOffset - bodyRecoil + shootLean, 0);

                    // --- TORSO --- (seated: a touch fuller, the lap under it)
                    ctx.fillStyle = darken(clothes.top ? topColor(clothes.top) : skinColor, 0.1);
                    ctx.fill(bodyTorsoPath(BC, 1));

                    const sleeveColor = sleeve !== 'none' ? darken(sleeveCol, 0.15) : darken(skinColor, 0.15);
                    const skinArmColor = sleeve === 'long' ? darken(sleeveCol, 0.3) : darken(skinColor, 0.3);
                    const capColor = sleeve !== 'none' ? darken(sleeveCol, 0.12) : darken(skinColor, 0.12);

                    if (isShootingFromCar) {
                        // --- SHOOTING POSE ---
                        // Left arm extended out window with weapon
                        // Right arm can stay on wheel or brace

                        // Adjust positions for lean
                        const adjDriveOffset = driveOffset - bodyRecoil - shootLean;

                        // Right arm on wheel (stays relatively normal)
                        const rElbowXAdj = 4;
                        const rElbowYAdj = shoulderSpread + 3;
                        const rFistXAdj = 10;
                        const rFistYAdj = 4;

                        this.drawLimb(0, rShoulderY, rElbowXAdj, rElbowYAdj, BC.upper, sleeveColor);
                        this.drawLimb(rElbowXAdj, rElbowYAdj, rFistXAdj, rFistYAdj, BC.fore, skinArmColor);
                        ctx.fillStyle = darken(skinColor, 0.4);
                        drawBodyHand(ctx, rElbowXAdj, rElbowYAdj, rFistXAdj, rFistYAdj, true, BC);

                        // Left arm extended out window (shooting arm)
                        // Arm reaches forward-left out the driver window
                        const lElbowXAdj = 10;
                        const lElbowYAdj = -shoulderSpread - 8;
                        const lFistXAdj = 20 - (recoil * 4); // Recoil pulls back
                        const lFistYAdj = -12;

                        this.drawLimb(0, lShoulderY, lElbowXAdj, lElbowYAdj, BC.upper, sleeveColor);
                        this.drawLimb(lElbowXAdj, lElbowYAdj, lFistXAdj, lFistYAdj, BC.fore, skinArmColor);
                        ctx.fillStyle = darken(skinColor, 0.4);
                        drawBodyHand(ctx, lElbowXAdj, lElbowYAdj, lFistXAdj, lFistYAdj, true, BC);

                        // Draw weapon in left hand
                        if (entity.type === 'player' && entity._game && entity._game.currentWeapon) {
                            const weaponId = entity._game.currentWeapon.id;
                            const grip = drivingWeaponGrip(recoil);
                            drawWeapon(ctx, weaponId, grip.x - (driveOffset - bodyRecoil + shootLean), grip.y, 0, grip.scale);
                        }
                        drawBodyCaps(ctx, BC, capColor, lElbowXAdj, lElbowYAdj, rElbowXAdj, rElbowYAdj);

                    } else {
                        // --- NORMAL DRIVING POSE (hands on wheel) ---
                        const adjDriveOffset = driveOffset - bodyRecoil;

                        // Both arms forward to steering wheel
                        this.drawLimb(0, lShoulderY, lElbowX - adjDriveOffset, lElbowY, BC.upper, sleeveColor);
                        this.drawLimb(0, rShoulderY, rElbowX - adjDriveOffset, rElbowY, BC.upper, sleeveColor);
                        this.drawLimb(lElbowX - adjDriveOffset, lElbowY, lFistX - adjDriveOffset, lFistY, BC.fore, skinArmColor);
                        this.drawLimb(rElbowX - adjDriveOffset, rElbowY, rFistX - adjDriveOffset, rFistY, BC.fore, skinArmColor);
                        ctx.fillStyle = darken(skinColor, 0.4);
                        drawBodyHand(ctx, lElbowX - adjDriveOffset, lElbowY, lFistX - adjDriveOffset, lFistY, true, BC);
                        drawBodyHand(ctx, rElbowX - adjDriveOffset, rElbowY, rFistX - adjDriveOffset, rFistY, true, BC);
                        drawBodyCaps(ctx, BC, capColor, lElbowX - adjDriveOffset, lElbowY, rElbowX - adjDriveOffset, rElbowY);
                        // NO weapon drawn when not shooting
                    }

                    // --- HEAD & HAIR ---
                    const headX = 0 + headForward;
                    const driveDyn = this.drive_dyn;
                    driveDyn.android = A;
                    this.withHead(headX, hx => drawHeadAndHair(ctx, hx, skinColor, config.faceDark || '#3e2723', config.faceLight || '#5d4037', clothes.hair, driveDyn, clothes.hat, clothes.jewelry));

                    ctx.restore();
                    return true;
                }
                return false;
            }

            /** The skeleton: hips, knees and feet from the gait and pose, and the geometry packet the wardrobe draws from (ui/wardrobe.js `g`). */
            rig () {
                if(this.entity.rigPose)return this.nativeGeometry();
                const entity = this.entity, A = this.android, skinColor = this.skin, gender = this.gender, W = this.weather, clothes = this.clothes, darken = this.darken, BC = this.body, strideLen = this.stride_len, strafeLen = this.strafe_len, fwdAmt = this.fwd_amt, sideAmt = this.side_amt, walkCycle = this.walk_cycle, walkSin = this.walk_sin, walkOppSin = this.walk_opp_sin, bounce = this.bounce, bodyRecoil = this.body_recoil, hipAnchorX = this.hip_anchor_x, hipRotation = this.hip_rotation, lFistX = this.fists[0], lFistY = this.fists[1], rFistX = this.fists[2], rFistY = this.fists[3], lElbowX = this.elbows[0], lElbowY = this.elbows[1], rElbowX = this.elbows[2], rElbowY = this.elbows[3], WD = (typeof WARDROBE !== 'undefined' ? WARDROBE : null), topP = this.top_piece;
                // --- 4. CALCULATE POSITIONS ---
                // Feet stand under the leg roots; the legs hang from the pelvis, so their roots turn with it
                const lBaseY = -BC.leg, rBaseY = BC.leg;
                const hipC = Math.cos(hipRotation), hipS = Math.sin(hipRotation);
                const lHipX = hipAnchorX - lBaseY * hipS, lHipY = lBaseY * hipC, rHipX = hipAnchorX - rBaseY * hipS, rHipY = rBaseY * hipC;

                const lWalkX = walkSin * strideLen * fwdAmt;
                const rWalkX = walkOppSin * strideLen * fwdAmt;
                const lWalkY = walkSin * strafeLen * sideAmt;
                const rWalkY = walkOppSin * strafeLen * sideAmt;

                const lFootX = -3 + lWalkX + this.pf('lf', 0);
                const rFootX = -3 + rWalkX + this.pf('rf', 0);
                const lFootY = lBaseY + lWalkY + this.pf('lf', 1);
                const rFootY = rBaseY + rWalkY + this.pf('rf', 1);

                const lKneeX = (lHipX + lFootX) / 2;
                const lKneeY = (lHipY + lFootY) / 2;
                const rKneeX = (rHipX + rFootX) / 2;
                const rKneeY = (rHipY + rFootY) / 2;
                const botP = WD && clothes.bottom ? WD.bottoms[clothes.bottom.type] : null;
                const shoeP = WD && clothes.shoes ? WD.shoes[clothes.shoes.type] : null;
                const legCol = clothes.bottom ? (clothes.bottom.under || clothes.bottom.color) : null;
                const topGloss = _glossy(topP, clothes.top), botGloss = _glossy(botP, clothes.bottom);
                const headX0 = bounce - bodyRecoil;
                this.cloth_dyn.wind = W ? W.wind : null;
                let g = this.geometry;
                if (!g) {
                    const pair = () => [[0, 0], [0, 0]];
                    g = this.geometry = { darken, torso: { x: 0, w: 0 }, hip: { x: 0, w: 0 },
                        feet: pair(), knees: pair(), hipPt: pair(), fists: pair(), elbows: pair(),
                        cloth: (key, spec) => clothGeometry(this.ctx, entity, key, spec, this.cloth_dyn) };
                }
                g.skin = skinColor; g.gender = gender; g.walkCycle = walkCycle; g.android = A;
                g.torso.x = BC.tb; g.torso.w = BC.tf - BC.tb; g.hip.x = BC.hb; g.hip.w = BC.hf - BC.hb; g.body = BC;
                g.headX = headX0; g.headInTorso = headX0 - hipAnchorX;
                g.feet[0][0] = lFootX; g.feet[0][1] = lFootY; g.feet[1][0] = rFootX; g.feet[1][1] = rFootY;
                g.knees[0][0] = lKneeX; g.knees[0][1] = lKneeY; g.knees[1][0] = rKneeX; g.knees[1][1] = rKneeY;
                g.hipPt[0][0] = lHipX; g.hipPt[0][1] = lHipY; g.hipPt[1][0] = rHipX; g.hipPt[1][1] = rHipY;
                g.fists[0][0] = lFistX; g.fists[0][1] = lFistY; g.fists[1][0] = rFistX; g.fists[1][1] = rFistY;
                g.elbows[0][0] = lElbowX; g.elbows[0][1] = lElbowY; g.elbows[1][0] = rElbowX; g.elbows[1][1] = rElbowY;

                this.bottom_piece = botP; this.shoe_piece = shoeP; this.leg_color = legCol; this.top_gloss = topGloss; this.bottom_gloss = botGloss;
            }

            /** Floor-layer trains, the feet, calves and thighs, legwear and boots. */
            drawLegs () {
                const ctx = this.ctx, A = this.android, skinColor = this.skin, clothes = this.clothes, darken = this.darken, BC = this.body, hipAnchorX = this.hip_anchor_x, torsoRotation = this.torso_rotation, WD = (typeof WARDROBE !== 'undefined' ? WARDROBE : null), botP = this.bottom_piece, shoeP = this.shoe_piece, legCol = this.leg_color, botGloss = this.bottom_gloss, g = this.geometry, lFootX = this.geometry.feet[0][0], lFootY = this.geometry.feet[0][1], rFootX = this.geometry.feet[1][0], rFootY = this.geometry.feet[1][1], lKneeX = this.geometry.knees[0][0], lKneeY = this.geometry.knees[0][1], rKneeX = this.geometry.knees[1][0], rKneeY = this.geometry.knees[1][1], lHipX = this.geometry.hipPt[0][0], lHipY = this.geometry.hipPt[0][1], rHipX = this.geometry.hipPt[1][0], rHipY = this.geometry.hipPt[1][1];
                // Floor-layer trains paint before the feet; waist overlays paint after the hips below.
                const groundTrain = WD && clothes.train && WD.trains[clothes.train.type];
                if (groundTrain && !groundTrain.overWaist) {
                    ctx.save(); ctx.translate(hipAnchorX, 0); ctx.rotate(torsoRotation * 0.8);
                    groundTrain.draw(ctx, g, clothes.train);
                    ctx.restore();
                }

                // 1. Feet
                if (shoeP) {
                    shoeP.draw(ctx, g, clothes.shoes);
                } else {
                    // The foot point (lFootX, lFootY) is the ANKLE, where the calf ends; the heel
                    // sits a quarter of the foot behind it (ui/bodies.js bodyFootPath).
                    ctx.fillStyle = darken(clothes.shoes ? clothes.shoes.color : skinColor, 0.55);
                    drawBodyFoot(ctx, lFootX, lFootY, -1, 0, false, BC.foot);
                    drawBodyFoot(ctx, rFootX, rFootY, 1, 0, false, BC.foot);
                }

                // LEG COLOURS: which parts of the leg the bottom covers ('bare' | 'thigh' | 'full')
                const legs = clothes.bottom ? (botP ? botP.legs : 'full') : 'bare';
                const legColor = legs === 'full' ? darken(legCol, (botP && botP.shade) || 0.45) : darken(skinColor, 0.15);
                const thighColor = legs !== 'bare' ? darken(legCol, 0.35) : darken(skinColor, 0.05);

                // 2. Calves
                this.drawLimb(lKneeX, lKneeY, lFootX, lFootY, BC.calf, legColor, legs === 'full' && botGloss);
                this.drawLimb(rKneeX, rKneeY, rFootX, rFootY, BC.calf, legColor, legs === 'full' && botGloss);
                if (shoeP && shoeP.calf && !shoeP.thigh) {                    // boots come up the calf
                    const bootColor = darken(clothes.shoes.color, 0.45), c = shoeP.calf;
                    this.drawLimb(lFootX, lFootY, lFootX + (lKneeX - lFootX) * c, lFootY + (lKneeY - lFootY) * c, BOOT_SHAFT, bootColor);
                    this.drawLimb(rFootX, rFootY, rFootX + (rKneeX - rFootX) * c, rFootY + (rKneeY - rFootY) * c, BOOT_SHAFT, bootColor);
                }

                // 3. Thighs
                this.drawLimb(lHipX, lHipY, lKneeX, lKneeY, BC.thigh, thighColor, legs !== 'bare' && botGloss);
                this.drawLimb(rHipX, rHipY, rKneeX, rKneeY, BC.thigh, thighColor, legs !== 'bare' && botGloss);
                if (A && legs !== 'full') {                                     // android knees
                    ctx.strokeStyle = A.trim; ctx.lineWidth = 0.6;
                    for (const [x, y] of [[lKneeX, lKneeY], [rKneeX, rKneeY]]) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.stroke(); }
                }
                if (clothes.jewelry && WD) for (const j of clothes.jewelry) {  // tights and stockings, under boots and bands
                    const p = WD.jewelry[j.type];
                    if (p && p.at === 'legs') p.draw(ctx, g, j, { legs, boot: shoeP && shoeP.calf && !shoeP.thigh ? shoeP.calf : 0 });
                }
                if (botP && botP.detail) botP.detail(ctx, g, clothes.bottom);   // cuffs, pockets, stripes
                if (shoeP && shoeP.thigh) {
                    // Paint the entire boot AFTER both bare leg segments: the rounded thigh end must
                    // not cover the calf's knee cap. Extend the thigh span by the actual joint radius,
                    // not a fraction of the projected length (which approaches zero mid-step).
                    const shoe = clothes.shoes, F = materialKit.finishOf(shoe), gloss = F.boot_shine, shade = F.boot_shade;   // (directory/game-materials.js)
                    const bootColor = darken(shoe.color, shade), welt = darken(shoe.color, shade + 0.12), t0 = 1 - shoeP.thigh;
                    const T = BC.calf, S = [T[0] + 0.3, T[1] + 0.3, T[2], T[3] + 0.3];
                    // A limb seen end-on collapses its tapered outline. Keep the complete knee
                    // covered even in the passing pose, where hip, knee and ankle coincide.
                    ctx.fillStyle = bootColor; ctx.beginPath();
                    const kneeR = Math.max(BC.thigh[3], BC.calf[0]) + 0.3;
                    ctx.arc(lKneeX, lKneeY, kneeR, 0, Math.PI * 2);
                    ctx.moveTo(rKneeX + kneeR, rKneeY); ctx.arc(rKneeX, rKneeY, kneeR, 0, Math.PI * 2);
                    ctx.fill(); ctx.beginPath();
                    this.drawLimb(lKneeX, lKneeY, lFootX, lFootY, S, bootColor, gloss);
                    this.drawLimb(rKneeX, rKneeY, rFootX, rFootY, S, bootColor, gloss);
                    for (const [hx, hy, kx, ky] of [[lHipX, lHipY, lKneeX, lKneeY], [rHipX, rHipY, rKneeX, rKneeY]]) {
                        const end = 1 + (BC.thigh[3] + 0.3) / Math.max(1e-6, Math.hypot(kx - hx, ky - hy));
                        fillLimbSpan(ctx, hx, hy, kx, ky, BC.thigh, t0, end, 0.3, bootColor, gloss);
                        fillLimbSpan(ctx, hx, hy, kx, ky, BC.thigh, t0, t0 + 0.05, 0.35, welt);
                    }
                    if (shoeP.fabric) shoeP.fabric(ctx, g, shoe);
                }
                if (clothes.jewelry && WD) for (const j of clothes.jewelry) {  // thigh bands
                    const p = WD.jewelry[j.type]; if (p && p.at === 'thighs') p.draw(ctx, g, j);
                }
                this.ground_train = groundTrain;
            }

            /** The hips and skirt, waist trains, dress trains and coat tails. */
            drawHips () {
                const ctx = this.ctx, skinColor = this.skin, clothes = this.clothes, darken = this.darken, BC = this.body, hipAnchorX = this.hip_anchor_x, hipRotation = this.hip_rotation, torsoRotation = this.torso_rotation, topP = this.top_piece, botP = this.bottom_piece, g = this.geometry, groundTrain = this.ground_train;
                // 4. Hips & Skirt
                ctx.save(); ctx.translate(...(this.entity.rigPose?this.entity.rigPose.joints.pelvis.position:[hipAnchorX,0])); ctx.rotate(hipRotation);

                // Base Hips
                ctx.fillStyle = darken(clothes.bottom ? clothes.bottom.color : skinColor, 0.2);
                ctx.fill(bodyHipPath(BC));

                // Skirts and other hip overlays (same geometry as the hips)
                if (botP && botP.hips) botP.hips(ctx, g, clothes.bottom);
                ctx.restore();

                // Crimson Flame attaches over the waist, before arms and the upper body.
                if (groundTrain && groundTrain.overWaist) {
                    ctx.save(); ctx.translate(hipAnchorX, 0); ctx.rotate(torsoRotation * 0.8);
                    groundTrain.draw(ctx, g, clothes.train);
                    ctx.restore();
                }

                // 5. Trains (Dress Train)
                if (clothes.train) {
                    ctx.save(); ctx.translate(hipAnchorX, 0); ctx.rotate(torsoRotation * 0.8);
                    if (clothes.train.type === 'dress_train') {
                        // Two heavy panels trailing from the hips
                        for (const s of [-1, 1]) {
                            const panel = g.cloth(s < 0 ? 'train_l' : 'train_r', { segs: 4, stiffness: 0.07, damping: 0.9, chains: [
                                { a: { x: BC.hb + 2, y: s * 10 }, t: { x: -30, y: s * 14 } },
                                { a: { x: BC.hb + 2, y: s * 6 },  t: { x: -30, y: s * 8 } },
                                { a: { x: BC.hb + 2, y: s * 2 },  t: { x: -30, y: s * 2 } } ] });
                            drawClothPanel(ctx, panel, darken(clothes.train.color, 0.1));
                        }
                    } else if (clothes.train.type === 'silk_flow') {
                        // Periwinkle silk: light, floaty, never quite still
                        const panel = g.cloth('train_silk', { segs: 5, stiffness: 0.045, damping: 0.93, drift: 0.25, chains: [
                            { a: { x: BC.hb + 2, y: -10 }, t: { x: -36, y: -12 } },
                            { a: { x: BC.hb + 2, y: -5 },  t: { x: -42, y: -2 } },
                            { a: { x: BC.hb + 2, y: 0 },   t: { x: -40, y: 8 } } ] });
                        ctx.globalAlpha = 0.9;
                        drawClothPanel(ctx, panel, clothes.train.color);
                        ctx.globalAlpha = 1.0;
                    }

                    ctx.restore();
                }

                // 5b. Coat tails
                if (topP && topP.tail) {
                    ctx.save(); ctx.translate(hipAnchorX, 0); ctx.rotate(torsoRotation * 0.8);
                    topP.tail(ctx, g, clothes.top);
                    ctx.restore();
                }
            }

            /** The hands, forearms, wrists, knuckle dusters and upper arms. */
            drawArms () {
                const config = this.config, ctx = this.ctx, A = this.android, skinColor = this.skin, isDriving = this.driving, stance = this.stance, glassHand = this.glass_hand, clothes = this.clothes, darken = this.darken, BC = this.body, shoulderX = this.shoulder_x, torsoRotation = this.torso_rotation, lFistX = this.fists[0], lFistY = this.fists[1], rFistX = this.fists[2], rFistY = this.fists[3], lElbowX = this.elbows[0], lElbowY = this.elbows[1], rElbowX = this.elbows[2], rElbowY = this.elbows[3], lShoulderY = -this.body.sh, rShoulderY = this.body.sh, gunHand = this.gun_hand, WD = (typeof WARDROBE !== 'undefined' ? WARDROBE : null), topP = this.top_piece, sleeve = this.sleeve, sleeveCol = this.sleeve_color, topGloss = this.top_gloss, g = this.geometry;
                // 6. Hands, turned along the forearm: a fist round whatever they hold (a pistol's off hand stays relaxed)
                ctx.fillStyle = darken(skinColor, 0.4);
                const bothGrip = stance === 'rifle' || stance === 'sniper' || stance === 'punch';
                drawBodyHand(ctx, lElbowX, lElbowY, lFistX, lFistY, bothGrip || glassHand === 'left', BC);
                drawBodyHand(ctx, rElbowX, rElbowY, rFistX, rFistY, bothGrip || stance === 'pistol' || gunHand || glassHand === 'right', BC);

                // 7. Forearms (fabric only under long sleeves), with whatever passes under the wrists beneath them
                if (clothes.jewelry && WD) for (const j of clothes.jewelry) {
                    const p = WD.jewelry[j.type]; if (p && p.under) p.under(ctx, g, j);
                }
                const foreColor = sleeve === 'long' ? darken(sleeveCol, 0.3) : darken(skinColor, 0.3);
                const upperColor = sleeve !== 'none' ? darken(sleeveCol, 0.15) : darken(skinColor, 0.15);
                const torC = Math.cos(torsoRotation), torS = Math.sin(torsoRotation);
                const nativeJoints=this.entity.rigPose?.joints;
                const lShX = nativeJoints?nativeJoints.shoulder_l.position[0]:shoulderX - lShoulderY * torS, lShY = nativeJoints?nativeJoints.shoulder_l.position[1]:lShoulderY * torC, rShX = nativeJoints?nativeJoints.shoulder_r.position[0]:shoulderX - rShoulderY * torS, rShY = nativeJoints?nativeJoints.shoulder_r.position[1]:rShoulderY * torC;
                const skinned = BODY_SKIN.arms;
                if (skinned) {                                                  // each arm as one skinned outline (ui/bodies.js)
                    this.drawSkinnedArm(lShX, lShY, lElbowX, lElbowY, lFistX, lFistY, upperColor, foreColor, sleeve !== 'none' && topGloss, sleeve === 'long' && topGloss);
                    this.drawSkinnedArm(rShX, rShY, rElbowX, rElbowY, rFistX, rFistY, upperColor, foreColor, sleeve !== 'none' && topGloss, sleeve === 'long' && topGloss);
                } else {
                    this.drawLimb(lElbowX, lElbowY, lFistX, lFistY, BC.fore, foreColor, sleeve === 'long' && topGloss);
                    this.drawLimb(rElbowX, rElbowY, rFistX, rFistY, BC.fore, foreColor, sleeve === 'long' && topGloss);
                }
                if (clothes.jewelry && WD) for (const j of clothes.jewelry) {
                    const p = WD.jewelry[j.type]; if (p && p.at === 'wrists') p.draw(ctx, g, j);
                }
                if (A) {                                                        // android wrists: the seam over the top of each
                    ctx.strokeStyle = A.trim; ctx.lineWidth = 0.6; ctx.beginPath();
                    for (let i = 0; i < 2; i++) {
                        const [ex, ey] = g.elbows[i], [fx, fy] = g.fists[i];
                        bodyRingHalf(ctx, fx, fy, BC.fore[3], Math.atan2(fy - ey, fx - ex), bodyForearmReach(Math.hypot(fx - ex, fy - ey)), 1);
                    }
                    ctx.stroke();
                }

                // 7b. Golden Retribution: a gilded knuckle bar across each fist (engine/knuckles.js)
                if (config.knuckles && typeof drawKnuckleDuster === 'function' && !isDriving) {
                    const vamp = config.knuckles === 'vamp';                                  // Vampiric Fists: garnet studs
                    drawKnuckleDuster(ctx, lFistX, lFistY, Math.atan2(lFistY - lElbowY, lFistX - lElbowX), 1, vamp);
                    drawKnuckleDuster(ctx, rFistX, rFistY, Math.atan2(rFistY - rElbowY, rFistX - rElbowX), 1, vamp);
                }

                // 8. Upper Arms (fabric under short or long sleeves). They hang from the shoulders, so their
                // roots turn with the torso: forward with the opposite leg on a step, into the blow in a punch.
                if (!skinned) {
                    this.drawLimb(lShX, lShY, lElbowX, lElbowY, BC.upper, upperColor, sleeve !== 'none' && topGloss);
                    this.drawLimb(rShX, rShY, rElbowX, rElbowY, BC.upper, upperColor, sleeve !== 'none' && topGloss);
                }
                if (A) {                                                        // android elbows: a round joint plate on each
                    ctx.strokeStyle = A.trim; ctx.lineWidth = 0.6;
                    for (const [x, y] of [[lElbowX, lElbowY], [rElbowX, rElbowY]]) { ctx.beginPath(); ctx.arc(x, y, 1.9, 0, Math.PI * 2); ctx.stroke(); }
                }
                if (topP && topP.armStripe) {                                // track-jacket stripes down the sleeves
                    ctx.strokeStyle = clothes.top.trim || '#f5f5f5'; ctx.lineWidth = 0.8; ctx.beginPath();
                    ctx.moveTo(lShX, lShY); ctx.lineTo(lElbowX, lElbowY); ctx.lineTo(lFistX, lFistY);
                    ctx.moveTo(rShX, rShY); ctx.lineTo(rElbowX, rElbowY); ctx.lineTo(rFistX, rFistY);
                    ctx.stroke();
                }
            }

            /** The torso: skin, the top, shoulder caps, collar, necklaces, the form shading and android plating. */
            drawTorso () {
                const torC = Math.cos(this.torso_rotation), torS = Math.sin(this.torso_rotation);
                const ctx = this.ctx, A = this.android, skinColor = this.skin, clothes = this.clothes, SH = this.shade, darken = this.darken, BC = this.body, hipAnchorX = this.hip_anchor_x, torsoRotation = this.torso_rotation, lElbowX = this.elbows[0], lElbowY = this.elbows[1], rElbowX = this.elbows[2], rElbowY = this.elbows[3], WD = (typeof WARDROBE !== 'undefined' ? WARDROBE : null), topP = this.top_piece, sleeve = this.sleeve, sleeveCol = this.sleeve_color, topGloss = this.top_gloss, g = this.geometry;
                // 9. Torso
                ctx.save(); ctx.translate(...(this.entity.rigPose?this.entity.rigPose.joints.torso.position:[hipAnchorX,0])); ctx.rotate(torsoRotation);

                ctx.fillStyle = darken(skinColor, 0.1);
                ctx.fill(bodyTorsoPath(BC));

                if (BC.bust && !clothes.top) {
                    ctx.fillStyle = darken(skinColor, 0.15);
                    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(BC.bust.x, s * BC.bust.y, BC.bust.r, 0, Math.PI*2); ctx.fill(); }
                }

                if (clothes.top) {
                    if (topP) topP.draw(ctx, g, clothes.top);
                    else { ctx.fillStyle = darken(topColor(clothes.top), 0.1); ctx.fill(bodyTorsoPath(BC)); }
                }
                // The shoulders: deltoid caps over the torso's edge in the sleeve's colour (bare in a tank
                // top), leaning toward the elbows (brought into the torso's frame)
                {
                    const lx = lElbowX - hipAnchorX, rx = rElbowX - hipAnchorX;
                    drawBodyCaps(ctx, BC, sleeve !== 'none' ? darken(sleeveCol, 0.12) : darken(skinColor, 0.12),
                        lx * torC + lElbowY * torS, -lx * torS + lElbowY * torC, rx * torC + rElbowY * torS, -rx * torS + rElbowY * torC,
                        topP && topP.padded || 0, topP && topP.armStripe ? clothes.top.trim || '#f5f5f5' : null, !!(topP && topP.seams));
                }
                if (topP && topP.collar) topP.collar(ctx, g, clothes.top);       // hood, turtleneck, coat collar
                if (clothes.jewelry && WD) for (const j of clothes.jewelry) {
                    const p = WD.jewelry[j.type]; if (p && p.at === 'neck') p.draw(ctx, g, j);
                }
                if (SH && SH.body) {                                            // the torso's form: soft shade on the side away from the sun
                    const cx = (BC.tb + BC.tf) * 0.5, span = (BC.sh + BC.del) * 1.3;
                    if (SH.lx || SH.ly) _softSpot(ctx, cx - SH.lx * 2.5, -SH.ly * span * 0.44, (BC.tf - BC.tb) * 1.5, span, _SHADOW_RGB, SH.shA * 1.3);
                    if (topGloss) {                                             // glossy fabric: a crisp ridge across the shoulders too
                        ctx.fillStyle = SH.hl2;
                        ctx.beginPath(); ctx.roundRect(cx - 1.4 + SH.lx * 1.5, -BC.sh * 0.8 + SH.ly * 1.5, 2.8, BC.sh * 1.6, 1.4); ctx.fill();
                    }
                }
                if (A && !clothes.top) {                                        // bare plating: chest panel seams and the Double Nights mark
                    ctx.strokeStyle = A.trim; ctx.lineWidth = 0.6; ctx.beginPath();
                    ctx.moveTo(BC.tb + 1.2, 0); ctx.lineTo(BC.tf - 1, 0);
                    for (const s of [-1, 1]) { ctx.moveTo(BC.tb + 2, s * BC.back * 0.75); ctx.lineTo(BC.tf - 2.6, s * BC.chest * 0.8); }
                    ctx.stroke();
                    if (A.emblem) drawDNEmblem(ctx, BC.tf - 3.2, -BC.chest * 0.45, 2, A.glow);
                }
                ctx.restore();
            }

            /** The head and hair (tipped by wind, a scope or the pose), the rim light, and the flash of a hit. */
            drawHead () {
                const entity = this.entity, config = this.config, ctx = this.ctx, A = this.android, skinColor = this.skin, W = this.weather, clothes = this.clothes, SH = this.shade, BC = this.body, gaitSpeed = this.gait_speed, bounce = this.bounce, bodyRecoil = this.body_recoil, torsoRotation = this.torso_rotation, pose = this.pose, poseW = this.pose_w, hitK = this.hit_k;
                // 10. Head & Hair
                // In strong wind the head dips into it (toward where it's blowing from)
                const windLocal = W ? W.dir - (entity.angle || 0) : 0, dip = W ? W.strong * 1.3 : 0;
                // Scoped (engine/scope.js): cheek down to the stock, head tipped toward the sight
                const scopeK = config.scopeK || 0;
                const headX = this.entity.rigPose?this.entity.rigPose.joints.head.position[0]:0 + bounce - bodyRecoil + this.pf('head', 0) - Math.cos(windLocal) * dip + scopeK * 3.5;
                const headY = this.entity.rigPose?this.entity.rigPose.joints.head.position[1]:this.pf('head', 1) - Math.sin(windLocal) * dip + scopeK * 3, headTurn = this.entity.rigPose?this.entity.rigPose.joints.head.rotation:(pose ? (pose.turn || 0) * poseW : 0) + scopeK * 0.18;   // looking around
                // 1.0 at the player's base walk speed — keeps the old player hair tuning, now shared by everyone
                const hairMove = gaitSpeed / 5.2;
                // Hair motion comes from the strand physics (hairGeometry): the owner's head
                // position in the world, plus the shoulder sway the strands swing with.
                const walkDyn = this.walk_dyn;
                walkDyn.sway = torsoRotation; walkDyn.wind = W ? W.hairWind : null; walkDyn.android = A;
                const turning = headY !== 0 || headTurn !== 0;
                this.withHead(headX, hx => {
                    if (turning) { ctx.save(); ctx.translate(hx, headY); ctx.rotate(headTurn); ctx.translate(-hx, 0); }
                    drawHeadAndHair(ctx, hx, skinColor, config.faceDark || '#3e2723', config.faceLight || '#5d4037', clothes.hair, walkDyn, clothes.hat, clothes.jewelry);
                    if (SH && SH.level > 1 && (SH.lx || SH.ly)) {               // the head as a matte dome: hair gradients in its own colour, then shade away from the sun
                        const ht = clothes.hair && !clothes.hat ? _hairTone(clothes.hair.color) : null;
                        if (ht) { const s = ht.up ? 1 : -1; _softSpot(ctx, hx + s * SH.lx * 3, s * SH.ly * 3, 13, 13, ht.rgb, 0.55 * Math.hypot(SH.lx, SH.ly)); }
                        _softSpot(ctx, hx - SH.lx * 3.5, -SH.ly * 3.5, 13, 13, _SHADOW_RGB, SH.shA * (SH.body ? 1.3 : 0.9));
                    }
                    if (turning) ctx.restore();
                });
                if ((SH && SH.rim) || entity._bakePed !== undefined) {
                    const rimY = BC.sh + BC.del * 0.55;                         // round the shoulders
                    const crown = clothes.hair && !clothes.hat ? HAIR_CROWNS[clothes.hair.type] : null;     // round the hair, not the scalp under it
                    const hcx = headX + (crown ? crown[0] : 0), hr = crown ? Math.max(crown[1], crown[2]) - 0.3 : 8.5;
                    if (entity._bakePed !== undefined) entity._rimGeo = { rimY, hcx, hr };   // a crowd bake: its live rim goes here (ui/crowd-impostors.js)
                    else drawHumanRim(ctx, SH.rim, rimY, hcx, hr);
                }
                if (hitK > 0.05) {                                              // the flash of the hit
                    ctx.save(); ctx.globalCompositeOperation = 'lighter';       // a cached glow (lightning flashes every body outdoors at once)
                    ctx.globalAlpha *= 0.45 * hitK; drawGlow(ctx, headX * 0.5, 0, 15, '255, 235, 235', 0);
                    ctx.restore();
                }
                this.head_x = headX; this.wind_local = windLocal;
            }

            /** What is held: a glass, a parcel (carried or tucked), an umbrella. */
            drawHeld () {
                const entity = this.entity, config = this.config, ctx = this.ctx, skinColor = this.skin, held = this.held, W = this.weather, umbrella = this.umbrella, umbrellaOpen = this.umbrella_open, parcel = this.parcel, walkCycle = this.walk_cycle, lFistX = this.fists[0], lFistY = this.fists[1], rFistX = this.fists[2], rFistY = this.fists[3], headX = this.head_x, windLocal = this.wind_local;
                // 11. HELD ITEMS
                if (held) {
                    let hX, hY;
                    if (held.hand === 'left') { hX = lFistX; hY = lFistY; } else { hX = rFistX; hY = rFistY; }
                    // 'champagne_glass' is the legacy id (NPC configs); it's the glass with champagne
                    if (held.type === 'glass' || held.type === 'champagne_glass') {
                        drawHeldGlass(ctx, hX, hY, held.drink || 'champagne', entity, held.hand, held.mirror, held.level ?? 1);
                    } else if (held.type === 'parcel' && held.tucked && !isDrivingCfg(config)) {
                        ctx.save(); ctx.translate(-1.5, -12.5); ctx.rotate(0.12);           // against her left side, under the arm
                        drawCozyParcel(ctx, 10, 6.5, 0.6);
                        ctx.restore();
                    } else if (parcel) {
                        // The box between her hands, a little ahead of them, then her fingertips over its sides
                        const bx = (lFistX + rFistX) / 2 + 4, by = (lFistY + rFistY) / 2, lat = Math.max(10, rFistY - lFistY - 0.6);
                        ctx.save(); ctx.translate(bx, by);
                        drawCozyParcel(ctx, 11, lat, 0.75);
                        ctx.restore();
                        ctx.fillStyle = skinColor;
                        for (const [fx, fy] of [[lFistX + 1.6, lFistY + 0.9], [rFistX + 1.6, rFistY - 0.9]]) { ctx.beginPath(); ctx.ellipse(fx, fy, 1.7, 1.2, 0, 0, Math.PI * 2); ctx.fill(); }
                    } else if (umbrella) {
                        // Canopy over the head, held a little into the wind, bobbing with the step
                        const lean = W ? 2.5 + W.strong * 3 : 0;
                        const ux = headX * 0.5 - Math.cos(windLocal) * lean + Math.sin(walkCycle * 2) * 0.5, uy = -Math.sin(windLocal) * lean;
                        const eased = entity._umbOpen = (entity._umbOpen === undefined ? umbrellaOpen : entity._umbOpen + (umbrellaOpen - entity._umbOpen) * 0.12);
                        drawUmbrella(ctx, ux, uy, hX, hY, eased, umbrella);
                    }
                }

                // DEBUG: Red circle at entity center point
                if (!entity._reflectionProxy && typeof game !== 'undefined' && game.dbg && game.dbg('colliders')) {
                    ctx.fillStyle = 'rgba(255, 106, 184, 0.9)';
                    ctx.beginPath();
                    ctx.arc(0, 0, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
