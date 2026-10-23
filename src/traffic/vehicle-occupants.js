// Seated bodies stay in the car frame. Windows, weapons and shots share these poses.
const VEHICLE_OCCUPANT_SCALE = 0.65;
const VEHICLE_SEAT_ARC = 85 * Math.PI / 180;
Object.assign(TrafficVehicle.prototype, {
    occupantWindows() {
        const g = carGeo(this), key = g.key + ':' + this.seats;
        if (this._occupantWindows?.key === key) return this._occupantWindows;
        const rows = Math.ceil(this.seats / 2), front = g.x1 - 2, rear = g.x2 + 3;
        const step = rows > 1 ? (front - rear) / (rows - 1) : 0;
        const windows = this.seatLayout.map((seat, i) => {
            const x = rows === 1 ? (g.x1 + g.x2) / 2 : front - Math.floor(i / 2) * step;
            const half = Math.max(3, Math.min(9, rows > 1 ? Math.abs(step) / 2 - 1.5 : (g.x1 - g.x2) / 2 - 1));
            seat.localX = x; seat.localY = (seat.side === 'left' ? -1 : 1) * this.width * .34;
            return { x, half, side: seat.side === 'left' ? -1 : 1, inner: this.width * .37 - 2.6, outer: this.width / 2 + .6 };
        });
        return (this._occupantWindows = { key, windows });
    },
    seatAim(index, angle, previous, soft = false) {
        const seat = this.seatLayout[index];
        if (!seat) return angle;
        const center = this.angle + (seat.side === 'left' ? -Math.PI / 2 : Math.PI / 2);
        let d = Math.atan2(Math.sin(angle - center), Math.cos(angle - center));
        // When aiming through the opposite door, keep the selected end of this window
        // rather than flipping 170 degrees as the thumb crosses that door's centre.
        if (soft && Math.abs(d) > Math.PI / 2 && Number.isFinite(previous)) {
            const old = Math.atan2(Math.sin(previous - center), Math.cos(previous - center));
            if (Math.abs(old) > .3) d = Math.sign(old) * Math.abs(d);
        }
        if (soft) {
            const knee = 65 * Math.PI / 180, span = VEHICLE_SEAT_ARC - knee;
            if (Math.abs(d) > knee) d = Math.sign(d) * (knee + span * Math.tanh((Math.abs(d) - knee) / span));
        }
        return center + Math.max(-VEHICLE_SEAT_ARC, Math.min(VEHICLE_SEAT_ARC, d));
    },
    occupantPose(index, angle, lean = 1, weaponId) {
        const w = this.occupantWindows().windows[index], seat = this.seatLayout[index];
        if (!w || !seat) return null;
        const a = this.seatAim(index, angle), rel = a - this.angle, k = Math.max(0, Math.min(1, lean));
        const ca = Math.cos(rel), sa = Math.sin(rel), scale = .7;
        const gripX = w.x + ca * 8 * k;
        const gripY = seat.localY + (w.side * (w.outer + 3) - seat.localY) * k + sa * 8 * k;
        const tip = weaponMuzzleLocal(weaponId);
        return { seatX: seat.localX, seatY: seat.localY, side: w.side, lean: k, angle: a, rel,
            gripX: gripX - seat.localX, gripY: gripY - seat.localY, scale,
            muzzleX: gripX + (tip.x * ca - tip.y * sa) * scale,
            muzzleY: gripY + (tip.x * sa + tip.y * ca) * scale,
            weaponId, driver: index === 0 };
    },
    occupantShot(index, angle, lean, weaponId) {
        const pose = this.occupantPose(index, angle, lean, weaponId);
        const seat = this.getSeatWorldPos(index), c = Math.cos(this.angle), s = Math.sin(this.angle);
        const x = this.x + pose.muzzleX * c - pose.muzzleY * s, y = this.y + pose.muzzleX * s + pose.muzzleY * c;
        const map = typeof game !== 'undefined' && game.activeMap;
        if (map && isLineBlocked(seat.x, seat.y, x, y, map.walls || [], getColliders(map)))
            return { x: seat.x, y: seat.y, angle: pose.angle };
        return { x, y, angle: pose.angle };
    },
    clipOccupant(ctx, index, exposed = true) {
        const w = this.occupantWindows().windows[index];
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        ctx.beginPath();
        ctx.rect(w.x - w.half, w.side < 0 ? -w.outer : w.inner, w.half * 2, w.outer - w.inner);
        if (exposed) ctx.rect(-this.length / 2 - 100, w.side < 0 ? -this.width / 2 - 140 : this.width / 2,
            this.length + 200, 140);
        ctx.restore(); ctx.clip();
    },
    occupantLayers() {
        const sprite = carSprite(this), windows = this.occupantWindows();
        const key = windows.key;
        if (sprite.occupants?.key === key) return sprite.occupants;
        const {SCALE:S,PAD:P} = CAR_ART, g = carGeo(this);
        const make = () => {const cv=document.createElement('canvas');cv.width=sprite.cv.width;cv.height=sprite.cv.height;return cv;};
        const lower=make(),upper=make(),lc=lower.getContext('2d'),uc=upper.getContext('2d');
        for (const ctx of [lc,uc]) {ctx.drawImage(sprite.cv,0,0);ctx.setTransform(S,0,0,S,(g.L/2+P)*S,(g.W/2+P)*S);}
        // Partition the existing artwork: the cabin floor below, the roof and its glass (whole, as when parked) above.
        // A window opens only while someone leans out of it (drawOccupantOverlay clips it out).
        lc.globalCompositeOperation='destination-out';lc.fillRect(g.x3-1,-g.W/2-2,g.x0-g.x3+2,g.W+4);
        lc.globalCompositeOperation='source-over';lc.fillStyle='#100c18';
        lc.fillRect(g.x3-1,-g.W/2+1,g.x0-g.x3+2,g.W-2);
        uc.globalCompositeOperation='destination-in';uc.fillRect(g.x3-1,-g.W/2-2,g.x0-g.x3+2,g.W+4);
        return (sprite.occupants={key,lower,upper});
    },
    drawOccupantLower(ctx) {
        const layers=this.occupantLayers(),P=CAR_ART.PAD;
        drawCarFrontTyres(ctx,this);
        ctx.drawImage(layers.lower,-this.length/2-P,-this.width/2-P,this.length+P*2,this.width+P*2);
    },
    drawOccupantOverlay(ctx) {
        if (!this.visible || !this.hasDriver) return;
        const layers=this.occupantLayers(),P=CAR_ART.PAD,windows=this.occupantWindows().windows;
        ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.angle);
        // The car's own glass stays shut; an occupant leaning out opens their window (cut from the roof pass)
        let open=null;
        for(let i=0;i<this.seatLayout.length;i++){
            const actor=i===0?game.player:this.seatOccupants[i],w=windows[i];
            if(!w || !actor || actor===true || (actor._vehicleLean||0)<=.1) continue;
            if(!open){open=new Path2D();open.rect(-this.length/2-P,-this.width/2-P,this.length+P*2,this.width+P*2);}
            open.rect(w.x-w.half,w.side<0?-w.outer:w.inner,w.half*2,w.outer-w.inner);
        }
        ctx.save();if(open)ctx.clip(open,'evenodd');
        ctx.drawImage(layers.upper,-this.length/2-P,-this.width/2-P,this.length+P*2,this.width+P*2);
        drawCarSheen(ctx,this);ctx.restore();
        this.drawLights(ctx,false);ctx.restore();
    }
});
