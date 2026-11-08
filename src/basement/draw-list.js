        // ===== LV0 BASEMENT =====
        // The draw list: WHAT to draw, apart from HOW. A system fills a list with shape packets and never
        // touches a canvas; a renderer draws the list. canvasRenderer (below) draws it with Canvas 2D, and a
        // WebGL renderer can read the very same list, so nothing above the renderer changes when one is added.
        // (Baked sprites stay baked: they are plain images, and a GPU renderer uploads them as textures.)
        //
        // SHAPE PACKETS (world space, drawn in order; alpha 0..1, times the context's own alpha at the flush,
        // a product past 1 is ignored as Canvas 2D does):
        //   ['blend', mode]                              'source-over' | 'lighter' for what follows
        //   ['cap', cap]                                 line ends for what follows: 'butt' | 'round' | 'square'
        //   ['rect', x, y, w, h, color, alpha]
        //   ['lines', width, color, alpha, x1, y1, x2, y2, ...]    segments, stroked as one path
        //   ['image', image, x, y, w, h, alpha]          a whole image (a baked sprite) into a rect
        //   ['sprite', image, sx, sy, sw, sh, dx, dy, dw, dh, alpha, tx, ty, rot, scx, scy]
        //                                                part of an image (sw 0: all of it, at its own size) at
        //                                                dx, dy in a frame moved to tx, ty, turned by rot, then scaled
        //
        //   const out = new drawList();
        //   out.clear(); out.blend('lighter'); out.rect(x, y, 2, 2, '#ffd76a', 0.8);
        //   const o = out.lines(0.5, '#fff', 1); out.seg(o, x - r, y, x + r, y); out.seg(o, x, y - r, x, y + r);
        //   canvasRenderer.flush(ctx, out);
        //
        // The list keeps its packets from frame to frame (clear() only rewinds it), so filling it every
        // frame makes no garbage once it has grown to its size.
        class drawList {
            constructor() { this.ops = []; this.n = 0; }
            clear() { this.n = 0; }
            /** The next packet slot, emptied (an array kept from earlier frames). */
            _op() { let o = this.ops[this.n]; if (!o) o = this.ops[this.n] = []; else o.length = 0; this.n++; return o; }
            blend(mode) { this._op().push('blend', mode); }
            cap(cap) { this._op().push('cap', cap); }
            rect(x, y, w, h, color, alpha) { this._op().push('rect', x, y, w, h, color, alpha); }
            /** A path of segments (add them with seg): returns the packet. */
            lines(width, color, alpha) { const o = this._op(); o.push('lines', width, color, alpha); return o; }
            seg(o, x1, y1, x2, y2) { o.push(x1, y1, x2, y2); }
            image(image, x, y, w, h, alpha) { this._op().push('image', image, x, y, w, h, alpha); }
            sprite(image, sx, sy, sw, sh, dx, dy, dw, dh, alpha, tx, ty, rot, scx, scy) {
                this._op().push('sprite', image, sx, sy, sw, sh, dx, dy, dw, dh, alpha, tx, ty, rot, scx, scy);
            }
        }

        /** Canvas 2D: a draw list onto a context, in the context's current (world) transform. */
        const canvasRenderer = {
            flush(ctx, list) {
                if (!list.n) return;
                const A = ctx.globalAlpha;
                ctx.save();
                for (let i = 0; i < list.n; i++) {
                    const o = list.ops[i];
                    switch (o[0]) {
                        case 'blend': ctx.globalCompositeOperation = o[1]; break;
                        case 'cap': ctx.lineCap = o[1]; break;
                        case 'rect': ctx.globalAlpha = A * o[6]; ctx.fillStyle = o[5]; ctx.fillRect(o[1], o[2], o[3], o[4]); break;
                        case 'lines':
                            ctx.globalAlpha = A * o[3]; ctx.strokeStyle = o[2]; ctx.lineWidth = o[1];
                            ctx.beginPath();
                            for (let k = 4; k < o.length; k += 4) { ctx.moveTo(o[k], o[k + 1]); ctx.lineTo(o[k + 2], o[k + 3]); }
                            ctx.stroke();
                            break;
                        case 'image': ctx.globalAlpha = A * o[6]; ctx.drawImage(o[1], o[2], o[3], o[4], o[5]); break;
                        case 'sprite':
                            ctx.save();
                            ctx.translate(o[11], o[12]); ctx.rotate(o[13]); ctx.scale(o[14], o[15]);
                            ctx.globalAlpha = A * o[10];
                            if (o[4]) ctx.drawImage(o[1], o[2], o[3], o[4], o[5], o[6], o[7], o[8], o[9]);
                            else ctx.drawImage(o[1], o[6], o[7]);
                            ctx.restore();
                            break;
                    }
                }
                ctx.restore();
            }
        };
