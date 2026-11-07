        // ===== LV0 BASEMENT =====
        // The virtual child: a "non-object" that behaves as a child of a parent without being one.
        // It has no body, no update of its own and no place in any list: it holds where it sits in
        // its parent's frame and works out where that is in the world when asked. A hat, a held glass,
        // a muzzle, a suitcase on a strap: anything that rides on something else.
        // (From the V2 engine design: init_position, parent_object, updatePosition() → worldPosition.)
        //
        // INIT POSITION PACKET: [x, y, angle]   in the parent's frame
        //   x                 forward (along the parent's angle)
        //   y                 to the parent's right
        //   angle             turn on top of the parent's (radians, 0 = same way)
        //
        // A parent is anything with x, y and angle (an entity, a walker, a plain object).
        //
        //   const bag = new virtualChild(walker, [-16, 7], { follow: 'trail', ease: 0.25 });
        //   bag.updatePosition();                              // each step: world_x, world_y, world_angle
        //   ctx.translate(bag.world_x, bag.world_y);            // draw it there
        //   virtualChild.toWorld(ent, [15, 5], angle)           // one-off: a local point in the world
        //
        // FOLLOW
        //   'rigid'  (default) sits exactly where the parent's frame puts it
        //   'trail'  eases toward that spot by `ease` a step, so it lags behind and swings round turns
        class virtualChild {
            constructor(parent_object, init_position = [0, 0, 0], options = {}) {
                this.parent_object = parent_object;
                this.init_position = init_position;
                this.follow = options.follow || 'rigid';
                this.ease = options.ease ?? 0.25;
                this.world_x = undefined;                  // undefined until the first updatePosition()
                this.world_y = undefined;
                this.world_angle = 0;
            }

            /** Placed in the world yet (a trailing child has nothing to ease from before its first update). */
            get placed() { return this.world_x !== undefined; }

            /** Where it is now, from the parent's frame. `angle` stands in for the parent's (a gun aimed
             *  off the facing). A trailing child starts on its spot, then eases toward it. */
            updatePosition(angle = this.parent_object.angle || 0) {
                const p = this.parent_object, [lx, ly = 0, la = 0] = this.init_position;
                const c = Math.cos(angle), s = Math.sin(angle);
                const tx = p.x + lx * c - ly * s, ty = p.y + lx * s + ly * c;
                if (this.follow === 'trail' && this.world_x !== undefined) {
                    this.world_x += (tx - this.world_x) * this.ease; this.world_y += (ty - this.world_y) * this.ease;
                } else { this.world_x = tx; this.world_y = ty; }
                this.world_angle = angle + la;
                return this;
            }

            /** A local point [x, y] of a parent in the world, facing `angle`: no child kept. */
            static toWorld(parent, local, angle = parent.angle || 0) {
                const c = Math.cos(angle), s = Math.sin(angle), lx = local[0], ly = local[1];
                return { x: parent.x + lx * c - ly * s, y: parent.y + lx * s + ly * c };
            }
        }
