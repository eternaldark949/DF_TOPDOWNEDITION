        // ===== LV0 BASEMENT =====
        // The angle kit: degrees for people, radians for the code. Data meant to be edited by hand gives
        // angles in degrees; the code that reads it turns them into the radians Math and the canvas use.
        //
        //   angleKit.toRad(90)            // 1.5707963267948966 (exactly Math.PI / 2)
        //   angleKit.toDeg(Math.PI)       // 180
        //   angleKit.degToRad(obj)        // obj.deg (degrees) becomes obj.a (radians); returns obj
        //
        // Angles run clockwise on screen (y grows down): 0 faces east, 90 south, 180 west, -90 north.
        // Multiples of 45 degrees convert to exactly the value written as a fraction of Math.PI.
        const angleKit = {
            toRad (deg) { return deg * Math.PI / 180; },
            toDeg (rad) { return rad * 180 / Math.PI; },
            /** Replace `deg` on obj with `a` in radians (what poses and seats read). */
            degToRad (obj) {
                if (obj && typeof obj.deg === 'number') { obj.a = angleKit.toRad(obj.deg); delete obj.deg; }
                return obj;
            }
        };
