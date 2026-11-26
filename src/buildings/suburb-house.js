        /* =====================================================================
           SUBURB HOUSE — a Darklands home (DRAFT)            [readable edition]
           ---------------------------------------------------------------------
           This is the same building as before, line for line in what it draws,
           rewritten so it reads like ETERNAL's g7 Python: one step per line,
           plain-English names, a comment on nearly everything.

           A two-storey American house on the tiered kit (buildings/tiered-kit.js),
           for the gated suburb in Darklands. Too neat, and too quiet:
             · the house: clapboard siding over a brick foundation, white corner
               boards and trim, sash windows with black shutters, the front door
               in the middle under a fanlight; some windows boarded over, one or
               two lit a weak amber that doesn't look like anyone's home;
             · a covered porch across the front on four white posts, its own
               light by the door;
             · the garage on one side (`garage: 'E' | 'W'`), a paneled door, its
               own low hip roof;
             · over the house, drawn with the kit's lean: a side-gabled shingle
               roof with siding in the gables, the chimney on one end, and the
               garage's hip roof;
             · out front: the lawn gone long, a concrete walk to the porch steps,
               the drive to the garage, a mailbox, dead shrubs.

           ---------------------------------------------------------------------
           HOW THIS FILE IS ORGANISED
             1. SUBURB_PLAN ........ the measurements (like a Python dict of constants)
             2. SUBURB_SCHEMES ..... the paint jobs (a dict of colour dicts)
             3. SuburbPen .......... tiny drawing helpers (fill a box, an oval, a circle)
             4. wall painters ...... one function per kind of wall: house, garage, porch, posts
             5. roof painters ...... flat roofs and the porch roof, baked once
             6. SuburbHouse ........ the building class: roofs, chimney, front yard
             7. createSuburbHouse .. the factory you call to put a house on the map

           ---------------------------------------------------------------------
           JAVASCRIPT FOR A PYTHON READER (just what this file uses)
             const x = 5;                  x = 5            (a name that won't be reassigned)
             let x = 5;                    x = 5            (a name that will change)
             { a: 1, b: 2 }                {'a': 1, 'b': 2} (and you read it as obj.a)
             [1, 2, 3]                     [1, 2, 3]
             for (const item of items)     for item in items:
             for (let i = 0; i < n; i++)   for i in range(n):
             (a, b) => a + b               lambda a, b: a + b
             cond ? a : b                  a if cond else b
             a || b                        a or b           (used for defaults: config.seed || 7)
             === / !==                     == / !=
             this                          self
             class B extends A             class B(A):
             super.method()                super().method()
             `text ${value}`               f"text {value}"

           DRAWING (the browser's 2D canvas; think Pillow's ImageDraw)
             ctx.fillStyle = '#ff0000'     choose the fill colour
             ctx.fillRect(x, y, w, h)      fill a rectangle (x, y is its top-left corner)
             ctx.strokeStyle / lineWidth   choose the line colour and thickness
             ctx.beginPath(); moveTo(); lineTo(); ...; fill() or stroke()
                                           trace a shape, then fill or outline it
             ctx.save() / ctx.restore()    remember / put back colours, clipping, rotation

           WALL ART: every wall painter gets two canvases. `day` is what the wall
           looks like; `light` holds only what glows at night (lit windows, the
           fanlight). The kit unrolls all of a tier's walls into ONE long strip,
           `wall_length` wide and `wall_height` tall, paints it once, then wraps
           it round the building. Inside a painter, x runs along the walls and y
           runs DOWN from the top of the wall.
           ===================================================================== */


        /* ---------------------------------------------------------------------
           1. THE MEASUREMENTS
           Horizontal sizes are world pixels. Heights (HOUSE, GARAGE.H, PORCH.Z)
           are the kit's design units: the building stands TierKit.Z_SCALE times
           taller in the world. RISE, EAVE and the chimney are world pixels.
           --------------------------------------------------------------------- */
        const SUBURB_PLAN = {
            W: 230,              // the house's width
            D: 140,              // the house's depth (front to back)
            HOUSE: 28,           // the house walls' height (design units)
            EAVE: 6,             // how far the roof overhangs the walls
            RISE: 46,            // how high the roof's ridge stands above the walls
            GARAGE: {
                W: 110,          // the garage's width
                Y: 24,           // how far back from the house's back wall the garage starts
                D: 116,          // the garage's depth
                H: 15,           // the garage walls' height (design units)
                RISE: 20         // how high the garage's hip roof rises
            },
            PORCH: {
                X: 50,           // where the porch starts along the front, from the house's left side
                W: 130,          // the porch's width
                D: 34,           // how far the porch comes out from the front wall
                Z: 13            // the height of the porch roof (design units)
            },
            CHIM: {
                w: 20,           // the chimney's width
                h: 22,           // the chimney's depth
                up: 12           // how far it stands above the roof's ridge
            }
        };


        /* ---------------------------------------------------------------------
           2. THE PAINT JOBS
           A house picks one with `scheme: 'ash'` (or sage, blue, cream).
           roof: four shades, one per roof slope, so the slopes read apart.
           --------------------------------------------------------------------- */
        const SUBURB_SCHEMES = {
            ash: {
                siding: '#8f9498', sidingLo: '#5f6468',     // the siding, light at the top fading to dark at the foot
                trim: '#e7e4dc',                            // the white trim: corner boards, window frames, sills
                shutter: '#1d2024',
                door: '#3b1f22',
                roof: ['#3a3d42', '#2c2e33', '#33363b', '#30333a'],
                ridge: '#1d1f23'                            // the line along the roof's edges
            },
            sage: {
                siding: '#7f8d7a', sidingLo: '#56634f',
                trim: '#e9e6da',
                shutter: '#20261d',
                door: '#5a1e1e',
                roof: ['#463c36', '#342c27', '#3d342f', '#392f2a'],
                ridge: '#221b17'
            },
            blue: {
                siding: '#7488a0', sidingLo: '#4c5d72',
                trim: '#ecebe4',
                shutter: '#161b24',
                door: '#2a2f45',
                roof: ['#3b3a40', '#2b2a30', '#333238', '#2f2e35'],
                ridge: '#1b1a1f'
            },
            cream: {
                siding: '#c9bc9c', sidingLo: '#91856b',
                trim: '#f2efe6',
                shutter: '#2b2621',
                door: '#1f3324',
                roof: ['#4a3b32', '#372b24', '#40332b', '#3b2f27'],
                ridge: '#241b16'
            }
        };


        /* ---------------------------------------------------------------------
           3. THE PEN: small helpers so the painters below read as sentences.
           Every function in the game shares one global space, so these live in
           one object (SuburbPen) rather than loose, where a name could clash.
           --------------------------------------------------------------------- */
        const SuburbPen = {

            /** Fill a rectangle in one colour. */
            fillBox(ctx, color, x, y, width, height) {
                ctx.fillStyle = color;
                ctx.fillRect(x, y, width, height);
            },

            /** Outline a rectangle (colour and thickness already chosen). */
            outlineBox(ctx, x, y, width, height) {
                ctx.strokeRect(x, y, width, height);
            },

            /** Fill an oval centred at (center_x, center_y). */
            fillOval(ctx, color, center_x, center_y, radius_x, radius_y) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.ellipse(center_x, center_y, radius_x, radius_y, 0, 0, Math.PI * 2);
                ctx.fill();
            },

            /** Fill the top half of an oval (an arch, like the fanlight over the door). */
            fillTopHalfOval(ctx, color, center_x, center_y, radius_x, radius_y) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.ellipse(center_x, center_y, radius_x, radius_y, 0, Math.PI, Math.PI * 2);
                ctx.fill();
            },

            /** Fill a circle. */
            fillCircle(ctx, color, center_x, center_y, radius) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(center_x, center_y, radius, 0, Math.PI * 2);
                ctx.fill();
            },

            /** Start a fresh outline through a list of [x, y] points, closed back to the first. Fill or stroke it after. */
            tracePolygon(ctx, points) {
                ctx.beginPath();
                points.forEach((point, index) => {
                    if (index === 0) ctx.moveTo(point[0], point[1]);
                    else ctx.lineTo(point[0], point[1]);
                });
                ctx.closePath();
            },

            /** The same outline as a reusable shape object (a Path2D), for filling, clipping and stroking it again. */
            polygonShape(points) {
                const shape = new Path2D();
                points.forEach((point, index) => {
                    if (index === 0) shape.moveTo(point[0], point[1]);
                    else shape.lineTo(point[0], point[1]);
                });
                shape.closePath();
                return shape;
            },

            /** A vertical gradient from top_color at y = 0 to bottom_color at y = height, ready to fill with. */
            topToBottomGradient(ctx, top_color, bottom_color, height) {
                const gradient = ctx.createLinearGradient(0, 0, 0, height);
                gradient.addColorStop(0, top_color);
                gradient.addColorStop(1, bottom_color);
                return gradient;
            },

            /** A point part of the way from one 3D point to another (fraction 0 = start, 1 = end). */
            between(start, end, fraction) {
                return [
                    start[0] + (end[0] - start[0]) * fraction,
                    start[1] + (end[1] - start[1]) * fraction,
                    start[2] + (end[2] - start[2]) * fraction
                ];
            }
        };


        /* ---------------------------------------------------------------------
           4. THE WALL PAINTERS
           The kit calls each one ONCE per tier with:
             day, light      the two canvases (see WALL ART above)
             tier            the tier's settings; tier.mitre lists its walls in
                             order round the plan, each with:
                               u0     where that wall starts along the strip
                               L      that wall's length
                               ny     1 for a wall facing the street (south)
                               hidden true if another tier covers it
             wall_height     the strip's height (design units)
             wall_length     the strip's length: all the walls end to end
           --------------------------------------------------------------------- */

        /** The wall facing the street, or nothing if this tier has none showing. */
        function suburbFindFrontWall(tier) {
            return tier.mitre.find(wall => wall && !wall.hidden && wall.ny > 0.99);
        }

        /** The walls showing on this tier (some entries are empty, or covered by another tier). */
        function suburbShowingWalls(tier) {
            return tier.mitre.filter(wall => wall && !wall.hidden);
        }

        /** Painted siding: the colour fading down the wall, then the shadow-and-highlight line of each clapboard. */
        function suburbPaintSiding(day, scheme, wall_height, wall_length, last_board_y, with_highlight) {
            const pen = SuburbPen;
            day.fillStyle = pen.topToBottomGradient(day, scheme.siding, scheme.sidingLo, wall_height);
            day.fillRect(0, 0, wall_length, wall_height);
            // one clapboard every 1.1 units down the wall: a dark shadow line under it, a faint highlight below that
            for (let board_y = 1.1; board_y < last_board_y; board_y += 1.1) {
                pen.fillBox(day, 'rgba(0,0,0,.18)', 0, board_y, wall_length, 0.25);
                if (with_highlight) pen.fillBox(day, 'rgba(255,255,255,.07)', 0, board_y + 0.25, wall_length, 0.2);
            }
        }

        /** One shuttered sash window (or a boarded-up one) centred at center_x, from top_y down to bottom_y. */
        function suburbPaintWindow(day, light, scheme, center_x, top_y, bottom_y, is_boarded, is_lit) {
            const pen = SuburbPen;
            const width = 9;                                     // the glass's width
            const half_width = width / 2;
            const height = bottom_y - top_y;

            // The two shutters, one either side
            pen.fillBox(day, scheme.shutter, center_x - half_width - 4.4, top_y - 0.3, 3.6, height + 0.6);
            pen.fillBox(day, scheme.shutter, center_x + half_width + 0.8, top_y - 0.3, 3.6, height + 0.6);
            // ...and their louvres, a thin light line every 1.2 units
            day.fillStyle = 'rgba(255,255,255,.08)';
            for (let louvre_y = top_y + 1; louvre_y < bottom_y; louvre_y += 1.2) {
                day.fillRect(center_x - half_width - 4.2, louvre_y, 3.2, 0.3);
                day.fillRect(center_x + half_width + 1, louvre_y, 3.2, 0.3);
            }

            // The white frame, then the dark glass inside it
            pen.fillBox(day, scheme.trim, center_x - half_width - 0.8, top_y - 0.8, width + 1.6, height + 1.6);
            pen.fillBox(day, '#14181c', center_x - half_width, top_y, width, height);

            if (is_boarded) {
                // Three planks nailed across at slight angles, each with a shadow line under it
                const planks = [
                    { tilt: -0.25, y: top_y + 1.6 },
                    { tilt: 0.2, y: top_y + 3.6 },
                    { tilt: -0.1, y: bottom_y - 1.8 }
                ];
                for (const plank of planks) {
                    day.save();
                    day.translate(center_x, plank.y);           // move the pen to the plank's middle...
                    day.rotate(plank.tilt * 0.5);               // ...and tilt it
                    pen.fillBox(day, '#6e5a44', -half_width - 1.5, -0.8, width + 3, 1.6);
                    pen.fillBox(day, 'rgba(0,0,0,.3)', -half_width - 1.5, 0.5, width + 3, 0.3);
                    day.restore();                              // straighten the pen again
                }
            } else {
                // A pale sky reflection in the top half of the glass
                pen.fillBox(day, 'rgba(160,180,200,.14)', center_x - half_width, top_y, width, height / 2);
                if (is_lit) {
                    pen.fillBox(light, 'rgba(255,190,110,.55)', center_x - half_width, top_y, width, height);   // the glow at night
                    pen.fillBox(day, 'rgba(255,200,130,.18)', center_x - half_width, top_y, width, height);     // a faint warmth by day
                }
                // The sash bars: one down the middle, one across
                pen.fillBox(day, scheme.trim, center_x - 0.3, top_y, 0.6, height);
                pen.fillBox(day, scheme.trim, center_x - half_width, (top_y + bottom_y) / 2 - 0.35, width, 0.7);
                if (is_lit) {
                    // the bars block the glow too
                    pen.fillBox(light, '#000', center_x - 0.3, top_y, 0.6, height);
                    pen.fillBox(light, '#000', center_x - half_width, (top_y + bottom_y) / 2 - 0.35, width, 0.7);
                }
            }

            // The sill under it
            pen.fillBox(day, scheme.trim, center_x - half_width - 1.4, bottom_y + 0.6, width + 2.8, 0.8);
        }

        /** The front door: a white surround, a fanlight over it (lit at night), four panels and a brass knob. */
        function suburbPaintFrontDoor(day, light, scheme, door_x, wall_height) {
            const pen = SuburbPen;
            const door_top = wall_height - 13.5;
            const ground_y = wall_height - 2.5;                 // where the foundation starts

            pen.fillBox(day, scheme.trim, door_x - 8, door_top - 3.4, 16, ground_y - door_top + 3.4);          // the surround
            pen.fillTopHalfOval(day, '#1c2024', door_x, door_top - 0.2, 5.6, 2.6);                             // the fanlight's glass
            pen.fillTopHalfOval(light, 'rgba(255,200,130,.45)', door_x, door_top - 0.2, 5.6, 2.6);             // ...lit from inside
            pen.fillBox(day, scheme.door, door_x - 5.6, door_top, 11.2, ground_y - door_top);                  // the door

            // Four panels, outlined
            day.strokeStyle = 'rgba(0,0,0,.35)';
            day.lineWidth = 0.4;
            const panels = [[-4.4, 1.2], [0.6, 1.2], [-4.4, 6], [0.6, 6]];
            for (const [panel_x, panel_y] of panels) pen.outlineBox(day, door_x + panel_x, door_top + panel_y, 3.8, 4);

            pen.fillBox(day, '#c9a85a', door_x + 3.6, door_top + 6, 0.8, 0.8);                                // the knob
        }

        /** The house's walls: siding, weather streaks, the brick foundation, corner boards, two storeys of windows, the door. */
        function suburbPaintHouseWalls(day, light, tier, wall_height, wall_length) {
            const pen = SuburbPen;
            const scheme = tier.scheme;
            const house = tier.house_details;
            const front_wall = suburbFindFrontWall(tier);
            const random = seededRandom(house.seed);            // the same seed gives the same "random" streaks every time

            suburbPaintSiding(day, scheme, wall_height, wall_length, wall_height - 2.5, true);

            // Weather streaks: one for every 6 units of wall, dark, thin, running down from somewhere in the top 60%
            for (let i = 0; i < wall_length / 6; i++) {
                const opacity = 0.05 + random() * 0.1;
                day.fillStyle = `rgba(30,32,30,${opacity})`;
                const streak_x = random() * wall_length;
                const streak_y = random() * wall_height * 0.6;
                const streak_width = 0.6 + random();
                const streak_length = 2 + random() * 8;
                day.fillRect(streak_x, streak_y, streak_width, streak_length);
            }

            // The brick foundation along the foot, a shadow line on its top edge
            pen.fillBox(day, '#4a2c24', 0, wall_height - 2.5, wall_length, 2.5);
            pen.fillBox(day, 'rgba(0,0,0,.3)', 0, wall_height - 2.5, wall_length, 0.4);
            // The white frieze under the eaves
            pen.fillBox(day, scheme.trim, 0, 0, wall_length, 1.1);

            // Where the door goes along the strip (far off the strip if this tier has no front)
            const door_x = front_wall ? front_wall.u0 + house.doorU : -1e4;
            // The two rows of windows: [top, bottom] of the ground floor, then of the upper floor
            const window_rows = [
                [wall_height - 12.5, wall_height - 5],
                [wall_height - 25, wall_height - 17.5]
            ];

            // Window numbers count up round the house; `boarded` and `lit` in the config pick windows by these numbers
            let window_number = 0;
            for (const wall of suburbShowingWalls(tier)) {
                // White corner boards at both ends of the wall
                pen.fillBox(day, scheme.trim, wall.u0, 0, 2.2, wall_height - 2.5);
                pen.fillBox(day, scheme.trim, wall.u0 + wall.L - 2.2, 0, 2.2, wall_height - 2.5);

                // About one window every 48 units of wall, at least one
                const windows_per_row = Math.max(1, Math.round(wall.L / 48));
                for (const [top_y, bottom_y] of window_rows) {
                    for (let i = 0; i < windows_per_row; i++, window_number++) {
                        const center_x = wall.u0 + wall.L * (i + 0.5) / windows_per_row;
                        // leave the door's place empty on the ground floor (the window number still counts)
                        const in_doorway = wall === front_wall && Math.abs(center_x - door_x) < 20 && top_y > wall_height - 14;
                        if (in_doorway) continue;
                        const is_boarded = house.boarded.includes(window_number);
                        const is_lit = house.lit.includes(window_number);
                        suburbPaintWindow(day, light, scheme, center_x, top_y, bottom_y, is_boarded, is_lit);
                    }
                }
            }

            if (front_wall) suburbPaintFrontDoor(day, light, scheme, door_x, wall_height);
        }

        /** The garage's walls: the same siding, and on the front a wide paneled door, rusty at its foot. */
        function suburbPaintGarageWalls(day, light, tier, wall_height, wall_length) {
            const pen = SuburbPen;
            const scheme = tier.scheme;
            const front_wall = suburbFindFrontWall(tier);

            suburbPaintSiding(day, scheme, wall_height, wall_length, wall_height - 2, false);
            pen.fillBox(day, '#4a2c24', 0, wall_height - 2, wall_length, 2);      // the brick foundation
            pen.fillBox(day, scheme.trim, 0, 0, wall_length, 1);                  // the frieze

            for (const wall of suburbShowingWalls(tier)) {                        // corner boards
                pen.fillBox(day, scheme.trim, wall.u0, 0, 2, wall_height - 2);
                pen.fillBox(day, scheme.trim, wall.u0 + wall.L - 2, 0, 2, wall_height - 2);
            }

            if (!front_wall) return;

            // The garage door: 14 units in from each corner, from near the top down to the foundation
            const door_left = front_wall.u0 + 14;
            const door_width = front_wall.L - 28;
            const door_top = 3.2;
            const door_bottom = wall_height - 2;
            const door_height = door_bottom - door_top;
            const section_height = door_height / 4;                              // it rolls up in four sections

            pen.fillBox(day, scheme.trim, door_left - 1.4, door_top - 1.4, door_width + 2.8, door_height + 1.4);   // the white frame
            pen.fillBox(day, '#d8d5cc', door_left, door_top, door_width, door_height);                            // the door

            // the joins between its sections
            day.fillStyle = 'rgba(0,0,0,.16)';
            for (let join_y = door_top + section_height; join_y < door_bottom - 0.5; join_y += section_height) {
                day.fillRect(door_left, join_y - 0.2, door_width, 0.4);
            }
            // eight faint panels across the top section
            for (let i = 0; i < 8; i++) {
                day.strokeStyle = 'rgba(0,0,0,.1)';
                day.lineWidth = 0.3;
                pen.outlineBox(day, door_left + 1 + i * door_width / 8, door_top + 0.8, door_width / 8 - 2, section_height - 1.6);
            }
            pen.fillBox(day, 'rgba(40,30,20,.35)', door_left, door_bottom - 2.2, door_width, 2.2);               // rust and dirt at its foot
        }

        /** The porch roof's edge (its fascia): white, with a shadow line along the bottom. */
        function suburbPaintPorchFascia(day, light, tier, wall_height, wall_length) {
            const pen = SuburbPen;
            pen.fillBox(day, tier.scheme.trim, 0, 0, wall_length, wall_height);
            pen.fillBox(day, 'rgba(0,0,0,.2)', 0, wall_height - 0.3, wall_length, 0.3);
        }

        /** A porch post: white, shaded from one side to the other so it reads round. */
        function suburbPaintPorchPost(day, light, tier, wall_height, wall_length) {
            const gradient = day.createLinearGradient(0, 0, wall_length, 0);
            gradient.addColorStop(0, '#f2efe6');
            gradient.addColorStop(1, '#b9b5ab');
            day.fillStyle = gradient;
            day.fillRect(0, 0, wall_length, wall_height);
        }


        /* ---------------------------------------------------------------------
           5. THE FLAT ROOF PAINTERS (baked once into a picture, seen from above)
           The kit calls these with (canvas, is_glow_layer, tier). They paint in
           world coordinates; tier.box is [left, top, right, bottom].
           Nothing on these roofs glows, so the glow layer is left empty.
           --------------------------------------------------------------------- */

        /** A plain dark roof: the house's and garage's real roofs are drawn on top of it (see drawHouseRoofs). */
        function suburbPaintFlatRoof(canvas, is_glow_layer, tier) {
            if (is_glow_layer) return;
            const [left, top, right, bottom] = tier.box;
            SuburbPen.fillBox(canvas, tier.scheme.ridge, left, top, right - left, bottom - top);
        }

        /** The porch roof: shingles in rows 5 apart, a white edge along the front. */
        function suburbPaintPorchRoof(canvas, is_glow_layer, tier) {
            if (is_glow_layer) return;
            const [left, top, right, bottom] = tier.box;
            SuburbPen.fillBox(canvas, tier.scheme.roof[0], left, top, right - left, bottom - top);

            canvas.strokeStyle = 'rgba(0,0,0,.3)';
            canvas.lineWidth = 1;
            canvas.beginPath();
            for (let row_y = top + 5; row_y < bottom; row_y += 5) {
                canvas.moveTo(left, row_y);
                canvas.lineTo(right, row_y);
            }
            canvas.stroke();

            canvas.strokeStyle = tier.scheme.trim;
            canvas.lineWidth = 1.4;
            canvas.beginPath();
            canvas.moveTo(left, bottom - 0.7);
            canvas.lineTo(right, bottom - 0.7);
            canvas.stroke();
        }

        /** Hooks the kit calls every frame to draw what stands on a tier (here, the sloped roofs). */
        function suburbHouseTop(ctx, is_glow_layer, tier, building) {
            ctx.save();
            building.drawHouseRoofs(ctx, is_glow_layer);
            ctx.restore();
        }
        function suburbGarageTop(ctx, is_glow_layer, tier, building) {
            ctx.save();
            building.drawRoof(ctx, building.roofPlanes().garage, is_glow_layer);
            ctx.restore();
        }


        /* ---------------------------------------------------------------------
           6. THE BUILDING
           Methods whose names start with _ are ones the kit expects every
           building to have (it calls them itself); leave those names alone.
           --------------------------------------------------------------------- */
        class SuburbHouse extends TieredBuilding {

            constructor(config) {
                super(config);
                this.house_details = config.house_details;      // { garage_shift, garage_on_west, scheme, seed }
                // How high the building reaches on screen (the roof's ridge plus the chimney, plus a margin)
                this.crownZ = (SUBURB_PLAN.HOUSE * TierKit.Z_SCALE + SUBURB_PLAN.RISE + SUBURB_PLAN.CHIM.up + 20) * this.hero;
            }

            // No sign, no stock roof-edge lights, nothing drawn as a sign
            _setupSign() { this.attachedSign = null; }
            _generateLights() { this.topReach = 40; }
            drawSign() {}

            /** The porch light: one lantern by the door, under the porch roof. */
            _entranceLamps() {
                // (the kit asks for this from inside super(config), before the constructor has set this.house_details;
                // doorCenter() reads the house tier instead, which the kit has already stored, so this works then too)
                const door_x = this.doorCenter();
                return [{
                    kind: 'lantern',
                    x: door_x + 14, y: SUBURB_PLAN.D, z: 10,   // just right of the door, on the front wall, 10 up
                    out: 4,                                     // how far it stands off the wall
                    rgb: '255, 196, 120',
                    light: [90, '#ffc477']                      // the pool of light it throws: radius, colour
                }];
            }

            /** The ground layer: the kit's own, then the front yard. */
            drawBase(ctx) {
                super.drawBase(ctx);
                this.drawFrontYard(ctx);
            }

            /** Where a 3D point (world x, y, and a height in world px) lands on screen, leaning with the camera. */
            projectPoint(x, y, height) {
                return this._tkP(x, y, height / TierKit.Z_SCALE);
            }

            /** The middle of the front door, measured from the building's left edge. */
            doorCenter() {
                // the house tier's left edge: 0, or the garage's width when the garage is on the west
                const house_tier = this._tkDefs.find(tier => tier.id === 'house');
                const house_left = house_tier.rect[0];
                return house_left + SUBURB_PLAN.PORCH.X + SUBURB_PLAN.PORCH.W / 2;
            }

            /** The seed for this house's moss, stains and lawn. */
            houseSeed() {
                return this.house_details.seed || 7;
            }

            /**
             * The roofs as flat planes between 3D corner points [x, y, height].
             *   The house: a side-gabled roof. Two slopes meet at a ridge running left to right,
             *              and a triangular gable wall closes each end.
             *   The garage: a hip roof. Four slopes, the two ends coming to points.
             * Worked out once and kept until the house moves.
             */
            roofPlanes() {
                if (this.roof_cache && this.roof_cache.x === this.x && this.roof_cache.y === this.y) return this.roof_cache;

                const plan = SUBURB_PLAN;
                const garage = plan.GARAGE;
                const scheme = this.house_details.scheme;
                const eave = plan.EAVE;
                const on_west = this.house_details.garage_on_west;

                // --- The house's roof ---
                const house_left = this.x + this.house_details.garage_shift - eave;   // the eaves overhang every side
                const house_right = house_left + plan.W + 2 * eave;
                const house_back = this.y - eave;
                const house_front = this.y + plan.D + eave;
                const wall_top = plan.HOUSE * TierKit.Z_SCALE;                        // the walls' height in world px
                const ridge_height = wall_top + plan.RISE;
                const ridge_y = (house_back + house_front) / 2;                        // the ridge runs along the middle

                const back_left = [house_left, house_back, wall_top];
                const back_right = [house_right, house_back, wall_top];
                const front_right = [house_right, house_front, wall_top];
                const front_left = [house_left, house_front, wall_top];
                const ridge_left = [house_left, ridge_y, ridge_height];
                const ridge_right = [house_right, ridge_y, ridge_height];

                // --- The garage's roof ---
                const garage_left = this.x + (on_west ? 0 : plan.W) - (on_west ? eave : 0);
                const garage_right = garage_left + garage.W + eave;
                const garage_back = this.y + garage.Y - eave;
                const garage_front = this.y + garage.Y + garage.D + eave;
                const garage_wall_top = garage.H * TierKit.Z_SCALE;
                const garage_ridge_height = garage_wall_top + garage.RISE;
                // the hip's ridge is shorter than the roof by half the roof's narrower side at each end
                const hip_inset = Math.min((garage_right - garage_left), (garage_front - garage_back)) / 2;
                const garage_ridge_y = (garage_back + garage_front) / 2;

                const g_back_left = [garage_left, garage_back, garage_wall_top];
                const g_back_right = [garage_right, garage_back, garage_wall_top];
                const g_front_right = [garage_right, garage_front, garage_wall_top];
                const g_front_left = [garage_left, garage_front, garage_wall_top];
                const g_ridge_left = [garage_left + hip_inset, garage_ridge_y, garage_ridge_height];
                const g_ridge_right = [garage_right - hip_inset, garage_ridge_y, garage_ridge_height];

                // Each plane lists its two eave corners first, then its top (the ridge's two ends, or one point)
                this.roof_cache = {
                    x: this.x, y: this.y,
                    wall_top, ridge_height, ridge_y, house_left, house_right,
                    house: [
                        { kind: 'slope', pts: [back_left, back_right, ridge_right, ridge_left], fill: scheme.roof[1] },
                        { kind: 'slope', pts: [front_right, front_left, ridge_left, ridge_right], fill: scheme.roof[0] },
                        { kind: 'gable', pts: [front_left, back_left, ridge_left], fill: scheme.siding },
                        { kind: 'gable', pts: [back_right, front_right, ridge_right], fill: scheme.sidingLo }
                    ],
                    garage: [
                        { kind: 'slope', pts: [g_back_left, g_back_right, g_ridge_right, g_ridge_left], fill: scheme.roof[1] },
                        { kind: 'slope', pts: [g_front_left, g_back_left, g_ridge_left], fill: scheme.roof[3] },
                        { kind: 'slope', pts: [g_back_right, g_front_right, g_ridge_right], fill: scheme.roof[2] },
                        { kind: 'slope', pts: [g_front_right, g_front_left, g_ridge_left, g_ridge_right], fill: scheme.roof[0] }
                    ]
                };
                return this.roof_cache;
            }

            /**
             * Draw one roof. Planes turned away from the camera go first, so the ones facing it cover them.
             * Slopes get rows of shingles and some moss; gables get rows of siding and a round attic vent.
             */
            drawRoof(ctx, planes, is_glow_layer) {
                if (is_glow_layer) return;                     // nothing on the roofs glows
                const pen = SuburbPen;
                const scheme = this.house_details.scheme;

                // Each plane's corners on screen
                const on_screen = planes.map(plane => ({
                    plane,
                    corners: plane.pts.map(point => this.projectPoint(point[0], point[1], point[2]))
                }));
                // Which way round the corners go on screen says which way the plane faces (the shoelace formula)
                const facesCamera = (corners) => {
                    let twice_area = 0;
                    for (let i = 0; i < corners.length; i++) {
                        const a = corners[i];
                        const b = corners[(i + 1) % corners.length];
                        twice_area += a[0] * b[1] - b[0] * a[1];
                    }
                    return twice_area > 0;
                };
                on_screen.sort((a, b) => facesCamera(a.corners) - facesCamera(b.corners));

                for (const { plane, corners } of on_screen) {
                    const is_gable = plane.kind === 'gable';
                    const shape = pen.polygonShape(corners);
                    ctx.fillStyle = plane.fill;
                    ctx.fill(shape);

                    // Rows (shingles, or siding in a gable): lines from the eave edge up toward the top
                    const pts = plane.pts;
                    const top_start = pts[pts.length - 1];       // the top above the first eave corner
                    const top_end = pts[2];                      // the top above the second (the same point on a triangle)
                    const row_count = is_gable ? 14 : 9;
                    const rows = new Path2D();
                    for (let i = 1; i < row_count; i++) {
                        const fraction = i / row_count;
                        const row_start = this.projectPoint(...pen.between(pts[0], top_start, fraction));
                        const row_end = this.projectPoint(...pen.between(pts[1], top_end, fraction));
                        rows.moveTo(row_start[0], row_start[1]);
                        rows.lineTo(row_end[0], row_end[1]);
                    }

                    ctx.save();
                    ctx.clip(shape);                             // keep everything below inside this plane
                    ctx.strokeStyle = is_gable ? 'rgba(0,0,0,.2)' : 'rgba(10,10,12,.35)';
                    ctx.lineWidth = is_gable ? 0.6 : 1;
                    ctx.stroke(rows);

                    if (is_gable) {
                        // A round attic vent, 42% of the way up the gable
                        const vent = this.projectPoint(...pen.between(pen.between(pts[0], pts[1], 0.5), pts[2], 0.42));
                        pen.fillCircle(ctx, scheme.trim, vent[0], vent[1], 4.5);
                        pen.fillCircle(ctx, '#16181b', vent[0], vent[1], 3.2);
                    } else {
                        // Four patches of moss and stains, seeded so they stay put from frame to frame
                        const random = seededRandom(this.houseSeed());
                        const middle = this.projectPoint(...pen.between(pen.between(pts[0], pts[1], 0.5), top_start, 0.4));
                        for (let i = 0; i < 4; i++) {
                            const tint = random() < 0.5 ? '60,70,40' : '20,20,22';      // mossy green or dirty black
                            const color = `rgba(${tint},${0.12 + random() * 0.1})`;
                            const patch_x = middle[0] + (random() - 0.5) * 120;
                            const patch_y = middle[1] + (random() - 0.5) * 30;
                            const radius_x = 10 + random() * 22;
                            const radius_y = 5 + random() * 8;
                            pen.fillOval(ctx, color, patch_x, patch_y, radius_x, radius_y);
                        }
                    }
                    ctx.restore();

                    // The plane's edges: white trim round a gable, dark along a slope
                    ctx.strokeStyle = is_gable ? scheme.trim : scheme.ridge;
                    ctx.lineWidth = is_gable ? 1.4 : 1.6;
                    ctx.stroke(shape);
                }
            }

            /** The brick chimney, on the ridge at the end away from the garage. */
            drawChimney(ctx) {
                const pen = SuburbPen;
                const size = SUBURB_PLAN.CHIM;
                const roof = this.roofPlanes();
                const camera = game.camera;

                const left = this.house_details.garage_on_west ? roof.house_right - 28 - size.w : roof.house_left + 28;
                const right = left + size.w;
                const back = roof.ridge_y - size.h / 2;
                const front = back + size.h;
                const bottom_height = roof.ridge_height - 8;    // it starts a little below the ridge
                const top_height = roof.ridge_height + size.up;

                // One side of the chimney, from the corner at (ax, ay) to the corner at (bx, by)
                const drawSide = (ax, ay, bx, by, color) => {
                    pen.tracePolygon(ctx, [
                        this.projectPoint(ax, ay, bottom_height),
                        this.projectPoint(bx, by, bottom_height),
                        this.projectPoint(bx, by, top_height),
                        this.projectPoint(ax, ay, top_height)
                    ]);
                    ctx.fillStyle = color;
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(232,190,140,.12)';  // a faint mortar-coloured edge
                    ctx.lineWidth = 0.6;
                    ctx.stroke();
                };
                // Only the sides the camera can see
                if (camera.y > front) drawSide(left, front, right, front, '#4e2c22');
                if (camera.y < back) drawSide(left, back, right, back, '#2e1914');
                if (camera.x > right) drawSide(right, back, right, front, '#3e2419');
                if (camera.x < left) drawSide(left, back, left, front, '#3e2419');

                // The top, and the dark flue opening in it
                const top_corners = [[left, back], [right, back], [right, front], [left, front]];
                pen.tracePolygon(ctx, top_corners.map(([x, y]) => this.projectPoint(x, y, top_height)));
                ctx.fillStyle = '#44271d';
                ctx.fill();
                ctx.strokeStyle = '#2a1712';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                const flue = this.projectPoint((left + right) / 2, (back + front) / 2, top_height);
                pen.fillOval(ctx, '#120b08', flue[0], flue[1], 5, 6);
            }

            /** The house's roof and its chimney (the garage's roof is drawn by its own tier). */
            drawHouseRoofs(ctx, is_glow_layer) {
                this.drawRoof(ctx, this.roofPlanes().house, is_glow_layer);
                if (!is_glow_layer) this.drawChimney(ctx);
            }

            /** Out front: the lawn gone long, the drive, the porch floor and steps, the walk, dead shrubs, a mailbox.
                Painted once into a picture (a sprite) and reused every frame after. */
            drawFrontYard(ctx) {
                const plan = SUBURB_PLAN;
                const garage = plan.GARAGE;
                const porch = plan.PORCH;
                const lot_width = plan.W + garage.W;
                const yard_depth = 90;

                const sprite = LandmarkKit.sprite(this, 'sh_ground', this.x - 20, this.y + plan.D - 4, lot_width + 40, yard_depth + 24, 1, (c) => {
                    const pen = SuburbPen;
                    const lot_left = this.x;
                    const yard_top = this.y + plan.D;                                   // the front wall's line
                    const random = seededRandom(this.houseSeed() + 3);
                    const door_x = this.x + this.doorCenter();
                    const garage_left = this.x + (this.house_details.garage_on_west ? 0 : plan.W);
                    const house_left = this.x + this.house_details.garage_shift;
                    const porch_left = house_left + porch.X;

                    // --- The lawn ---
                    pen.fillBox(c, '#26301f', lot_left - 16, yard_top, lot_width + 32, yard_depth);
                    // 420 blades of long grass, light or dark
                    for (let i = 0; i < 420; i++) {
                        c.fillStyle = random() < 0.5 ? 'rgba(70,86,48,.5)' : 'rgba(18,22,14,.5)';
                        const blade_x = lot_left - 16 + random() * (lot_width + 32);
                        const blade_y = yard_top + random() * yard_depth;
                        c.fillRect(blade_x, blade_y, 1, 2 + random() * 4);
                    }
                    // six dead patches
                    for (let i = 0; i < 6; i++) {
                        const patch_x = lot_left + random() * lot_width;
                        const patch_y = yard_top + 20 + random() * (yard_depth - 30);
                        const radius_x = 10 + random() * 16;
                        const radius_y = 5 + random() * 6;
                        pen.fillOval(c, 'rgba(90,80,50,.25)', patch_x, patch_y, radius_x, radius_y);
                    }

                    // --- The drive: cracked concrete out to the street ---
                    pen.fillBox(c, '#5b5a55', garage_left + 12, yard_top - 4, garage.W - 24, yard_depth + 4);
                    c.strokeStyle = 'rgba(0,0,0,.35)';
                    c.lineWidth = 0.8;
                    c.beginPath();
                    for (let joint_y = yard_top + 26; joint_y < yard_top + yard_depth; joint_y += 30) {     // expansion joints
                        c.moveTo(garage_left + 12, joint_y);
                        c.lineTo(garage_left + garage.W - 12, joint_y);
                    }
                    c.moveTo(garage_left + 40, yard_top + 10);                                            // a crack
                    c.lineTo(garage_left + 52, yard_top + 34);
                    c.lineTo(garage_left + 47, yard_top + 58);
                    c.stroke();
                    pen.fillOval(c, 'rgba(30,26,20,.35)', garage_left + garage.W / 2, yard_top + 40, 18, 9);  // an old oil stain

                    // --- The porch floor (boards 6 apart), its two steps, then the walk ---
                    pen.fillBox(c, '#6b6258', porch_left, yard_top, porch.W, porch.D);
                    c.strokeStyle = 'rgba(0,0,0,.25)';
                    c.lineWidth = 0.8;
                    c.beginPath();
                    for (let board_x = porch_left + 6; board_x < porch_left + porch.W; board_x += 6) {
                        c.moveTo(board_x, yard_top);
                        c.lineTo(board_x, yard_top + porch.D);
                    }
                    c.stroke();
                    for (let step = 0; step < 2; step++) pen.fillBox(c, '#7d766c', door_x - 16, yard_top + porch.D + step * 4, 32, 4);
                    pen.fillBox(c, '#6f6c66', door_x - 9, yard_top + porch.D + 8, 18, yard_depth - porch.D - 8);
                    c.strokeStyle = 'rgba(0,0,0,.3)';
                    c.lineWidth = 0.8;
                    c.beginPath();
                    for (let slab_y = yard_top + porch.D + 20; slab_y < yard_top + yard_depth; slab_y += 12) {   // the walk's slabs
                        c.moveTo(door_x - 9, slab_y);
                        c.lineTo(door_x + 9, slab_y);
                    }
                    c.stroke();

                    // --- Dead shrubs along the front: at both corners and either side of the porch ---
                    const shrub_xs = [house_left + 14, porch_left - 14, porch_left + porch.W + 14, house_left + plan.W - 16];
                    for (const shrub_x of shrub_xs) {
                        pen.fillOval(c, 'rgba(0,0,0,.3)', shrub_x + 3, yard_top + 10, 12, 7);    // its shadow
                        // nine bare twigs spreading out from the middle
                        c.strokeStyle = '#4a3a28';
                        c.lineWidth = 1;
                        c.beginPath();
                        for (let k = 0; k < 9; k++) {
                            const angle = k / 9 * Math.PI * 2;
                            c.moveTo(shrub_x, yard_top + 8);
                            c.lineTo(shrub_x + Math.cos(angle) * (6 + random() * 6), yard_top + 8 + Math.sin(angle) * (4 + random() * 4));
                        }
                        c.stroke();
                        // six dry leaves still on it
                        for (let k = 0; k < 6; k++) {
                            const leaf_x = shrub_x + (random() - 0.5) * 12;
                            const leaf_y = yard_top + 8 + (random() - 0.5) * 8;
                            pen.fillCircle(c, 'rgba(70,60,36,.6)', leaf_x, leaf_y, 1.6);
                        }
                    }

                    // --- The mailbox at the curb, its red flag down ---
                    const mailbox_x = door_x + 34;
                    const mailbox_y = yard_top + yard_depth - 8;
                    pen.fillBox(c, 'rgba(0,0,0,.35)', mailbox_x + 2, mailbox_y + 2, 12, 7);         // its shadow
                    c.fillStyle = '#2b2d30';
                    c.beginPath();
                    c.roundRect(mailbox_x, mailbox_y, 12, 7, [3, 3, 1, 1]);                          // rounded on top
                    c.fill();
                    pen.fillBox(c, '#7a1e1e', mailbox_x + 11, mailbox_y + 3, 3, 1.2);               // the flag
                });

                ctx.drawImage(sprite.cv, sprite.x, sprite.y, sprite.w, sprite.h);
            }
        }
        TierKit.profile(SuburbHouse);     // bill this house's drawing to the right rows of the dev profiler


        /* ---------------------------------------------------------------------
           7. THE FACTORY: call this to make a house.

             createSuburbHouse(x, y, {
                 scheme: 'sage',          // a SUBURB_SCHEMES name
                 garage: 'W',             // garage on the west (left) or 'E' (right, the default)
                 boarded: [2],            // window numbers to board up
                 lit: [6],                // window numbers to light
                 seed: 23                 // changes the streaks, moss and lawn
             })

           x, y is the lot's top-left corner; the house faces south (down).
           Window numbers count round the walls, ground floor then upper floor
           on each wall, starting from the first wall in the plan.
           --------------------------------------------------------------------- */
        function createSuburbHouse(x, y, config = {}) {
            const plan = SUBURB_PLAN;
            const garage = plan.GARAGE;
            const porch = plan.PORCH;
            const scheme = SUBURB_SCHEMES[config.scheme] || SUBURB_SCHEMES.ash;
            const garage_on_west = config.garage === 'W';
            const garage_shift = garage_on_west ? garage.W : 0;     // with the garage on the west, the house moves right to make room

            // What every wall painter needs to know about this particular house
            const house_details = {
                seed: config.seed || 7,
                boarded: config.boarded || [],
                lit: config.lit || [],
                doorU: porch.X + porch.W / 2                        // the door, in the middle of the porch
            };

            // Settings every tier shares, plus the tier's own
            const makeTier = (own_settings) => Object.assign({ scheme, house_details, S: 2, shade: [16, 16, 18] }, own_settings);
            // A thin white ledge round a tier's top at height `height`
            const makeLedge = (height, top_color) => ({ z: height, out: 1.5, th: 1.2, top: top_color, band: [60, 60, 60], lip: 'rgba(240,236,226,.55)' });

            // The four porch posts, evenly spaced along the porch's front
            const posts = [0, 1, 2, 3].map(i => makeTier({
                id: 'post' + i,
                solid: false,                                       // you can walk between them
                rect: [garage_shift + porch.X + 3 + i * (porch.W - 8) / 3, plan.D + porch.D - 5, 3, 3],
                z0: 0, z1: porch.Z,
                S: 4,
                fill: '#e8e4da',
                paint: suburbPaintPorchPost,
                roofRes: 1, roof: suburbPaintFlatRoof
            }));

            return new SuburbHouse({
                id: config.id || 'suburb_house',
                x, y,
                label: config.label || 'House',
                type: 'house',
                facing: 'S',
                hero: 1.2,                                          // leans a little harder than the street
                plan: { W: plan.W + garage.W, D: plan.D },
                // Colours the stock building code still reads
                roofColor: scheme.roof[0], roofLightColor: scheme.roof[0],
                wallColor: scheme.siding, wallLightColor: scheme.siding,
                accentColor: scheme.trim,
                windowColor: '#14181c', windowLitColor: '#ffc477', windowFrameColor: scheme.trim,
                balconies: [], roofProps: [], sign: null,
                house_details: { garage_shift, garage_on_west, scheme, seed: house_details.seed },
                tiers: [
                    // The house: its walls, a ledge at the top, a flat roof under the real roof drawn in `top`
                    makeTier({
                        id: 'house',
                        rect: [garage_shift, 0, plan.W, plan.D],
                        z0: 0, z1: plan.HOUSE,
                        fill: scheme.siding,
                        paint: suburbPaintHouseWalls,
                        ledges: [makeLedge(plan.HOUSE, scheme.trim)],
                        roofRes: 1, roof: suburbPaintFlatRoof,
                        top: suburbHouseTop
                    }),
                    // The garage, beside it
                    makeTier({
                        id: 'garage',
                        rect: [garage_on_west ? 0 : plan.W, garage.Y, garage.W, garage.D],
                        z0: 0, z1: garage.H,
                        fill: scheme.siding,
                        paint: suburbPaintGarageWalls,
                        ledges: [makeLedge(garage.H, scheme.trim)],
                        roofRes: 1, roof: suburbPaintFlatRoof,
                        top: suburbGarageTop
                    }),
                    // The porch roof: a thin slab floating at porch height on the posts.
                    // (It starts 1 px off the front wall: a tier back to back with a wall would hide that wall below it.)
                    makeTier({
                        id: 'porch',
                        solid: false,
                        rect: [garage_shift + porch.X, plan.D + 1, porch.W, porch.D],
                        z0: porch.Z, z1: porch.Z + 1.4,
                        S: 4,
                        fill: scheme.trim,
                        paint: suburbPaintPorchFascia,
                        roofRes: 1, roof: suburbPaintPorchRoof
                    }),
                    ...posts                                        // (...list spreads a list's items in, like *posts in Python)
                ],
                ...config                                           // anything else the caller passed (like **config)
            });
        }
