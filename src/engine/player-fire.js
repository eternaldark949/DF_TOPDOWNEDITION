// One input/aim path and one shot geometry for on-foot and drive-by fire.
engineMixin({
    clampPlayerFireAngle(angle) {
        if (!this.isDriving || !this.car) return angle;
        return this.car.seatAim(0, angle);
    },
    getPlayerShotGeometry() {
        const p = this.player, angle = this.clampPlayerFireAngle(p.angle);
        if (this.isDriving && this.car) {
            return this.car.occupantShot(0, angle, this.player._vehicleLean || 0, this.currentWeapon?.id);
        }
        const ap = p._aimPoint;
        return aimFromMuzzle(p, angle, ap?.x, ap?.y, p._muzzleLocal || { x: 15, y: 5 });
    },
    /** Returns whether aim was supplied, so walking can otherwise face movement. */
    updatePlayerFireInput() {
        const F = this.fireJoystick, driving = this.isDriving && this.car;
        const releasing = this._releaseShot !== null && this._releaseShot !== undefined;
        const stickAim = F.active && F.aimed;
        const mouseAim = !!(this.mouseDown && this.mouseX);
        this.isShootingFromCar = !!(driving && (stickAim || mouseAim || releasing));
        if (driving) this.player._vehicleLean = (this.player._vehicleLean || 0)
            + ((this.isShootingFromCar ? 1 : 0) - (this.player._vehicleLean || 0)) * .18;
        const ready = !driving || this.player._vehicleLean >= .7;
        const resolve = angle => {
            if (!driving) return angle;
            const actual = this.car.seatAim(0, angle, this._vehicleAimAngle, true);
            this._vehicleAimAngle = actual;
            this._vehicleAimLimited = !this.car.isAngleValidForSeat(0, angle);
            return actual;
        };
        this.player._aimPoint = null;
        if (this._quickDraw && this._quickDraw.phase !== 'ready') {
            this.player.angle = this._quickDraw.angle;
            this.player._aimPoint = this._quickDraw.aimPoint;
            return true;
        }
        if (releasing) {
            this.player.angle = resolve(this._releaseShot);
            if (this.shootCooldown <= 0 && ready) { this.fireWeapon(); this._releaseShot = null; }
            else if (++this._releaseWait > 30) this._releaseShot = null;
            if (this._releaseShot === null) this._releaseWait = 0;
            return true;
        }
        if (stickAim || mouseAim) {
            let angle;
            if (stickAim) angle = Math.atan2(F.dy, F.dx);
            else {
                const point = this.viewToWorld(this.mouseX, this.mouseY);
                angle = Math.atan2(point.y - this.player.y, point.x - this.player.x);
                if (!driving) this.player._aimPoint = point;
            }
            this.player.angle = resolve(angle);
            if ((stickAim ? F.firing : this.mouseDown) && this.shootCooldown <= 0 && ready) this.fireWeapon();
            return true;
        }
        if (!this.isShootingFromCar) { this._vehicleAimAngle = null; this._vehicleAimLimited = false; }
        return false;
    },
    drawVehicleAimGuide(ctx) {
        if (!this.isDriving || !this.isShootingFromCar || this.paused) return;
        const car=this.car, w=car.occupantWindows().windows[0], r=28;
        ctx.save();ctx.translate(car.x,car.y);ctx.rotate(car.angle);
        const center=-Math.PI/2, start=center-VEHICLE_SEAT_ARC,end=center+VEHICLE_SEAT_ARC;
        ctx.strokeStyle=this._vehicleAimLimited?'#ffb16b':'rgba(255,225,174,.65)';ctx.lineWidth=1;
        ctx.beginPath();ctx.arc(w.x,-w.outer,r,start,end);ctx.stroke();
        for(const a of [start,end]){ctx.beginPath();ctx.moveTo(w.x+Math.cos(a)*(r-3),-w.outer+Math.sin(a)*(r-3));ctx.lineTo(w.x+Math.cos(a)*(r+3),-w.outer+Math.sin(a)*(r+3));ctx.stroke();}
        const a=this.player.angle-car.angle,x=w.x+Math.cos(a)*r,y=-w.outer+Math.sin(a)*r;
        ctx.fillStyle=this._vehicleAimLimited?'#ffb16b':'#fff0c5';ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();
        if(this._vehicleAimLimited){ctx.beginPath();ctx.moveTo(x-3,y-3);ctx.lineTo(x+3,y+3);ctx.moveTo(x+3,y-3);ctx.lineTo(x-3,y+3);ctx.stroke();}
        ctx.restore();
    }
});
