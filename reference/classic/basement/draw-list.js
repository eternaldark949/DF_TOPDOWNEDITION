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
        //   ['frame', tx, ty, rot, scx, scy] ... ['unframe']   what's between is drawn in that frame
        //   ['path', width, color, alpha, x0, y0, x1, y1, ...]  a line through the points
        //   ['poly', color, alpha, x0, y0, x1, y1, ...]         a closed shape through the points, filled
        //   ['circle', x, y, r, color, alpha]                   filled
        //   ['ring', x, y, r, width, color, alpha]              outlined
        //   ['arc', x, y, rx, ry, rot, a0, a1, width, color, alpha]   part of an ellipse's outline, a0 to a1
        //   ['ellipse', x, y, rx, ry, rot, color, alpha]        filled
        //   ['radial', x, y, r, alpha, offset, color, offset, color, ...]   a circle filled with a radial fade
        //                                                       from its centre (the gradient's stops)
        //   ['blob', color, alpha, x, y, rx, ry, rot, cx, cy, cr, ...]   an ellipse and circles, filled as one
        //                                                       shape (where they overlap it is painted once)
        //   ['shadow', color, blur]                             a soft shadow under what follows (blur 0: none)
        //   ['screen', color, alpha]                            the whole view, in screen space (a flash)
        //   ['text', text, x, y, font, color, alpha, outline, width]   centred on x, y; outlined first (width 0: not)
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
            frame(tx, ty, rot = 0, scx = 1, scy = 1) { this._op().push('frame', tx, ty, rot, scx, scy); }
            unframe() { this._op().push('unframe'); }
            /** A line (path) or a filled shape (poly) through points: returns the packet (add them with pt). */
            path(width, color, alpha) { const o = this._op(); o.push('path', width, color, alpha); return o; }
            poly(color, alpha) { const o = this._op(); o.push('poly', color, alpha); return o; }
            pt(o, x, y) { o.push(x, y); }
            circle(x, y, r, color, alpha) { this._op().push('circle', x, y, r, color, alpha); }
            ring(x, y, r, width, color, alpha) { this._op().push('ring', x, y, r, width, color, alpha); }
            arc(x, y, rx, ry, rot, a0, a1, width, color, alpha) { this._op().push('arc', x, y, rx, ry, rot, a0, a1, width, color, alpha); }
            ellipse(x, y, rx, ry, rot, color, alpha) { this._op().push('ellipse', x, y, rx, ry, rot, color, alpha); }
            /** A radial fade: returns the packet (add its stops with stop, centre first). */
            radial(x, y, r, alpha) { const o = this._op(); o.push('radial', x, y, r, alpha); return o; }
            stop(o, offset, color) { o.push(offset, color); }
            /** An ellipse and circles as one shape: returns the packet (add the circles with dot). */
            blob(color, alpha, x, y, rx, ry, rot) { const o = this._op(); o.push('blob', color, alpha, x, y, rx, ry, rot); return o; }
            dot(o, cx, cy, cr) { o.push(cx, cy, cr); }
            shadow(color, blur) { this._op().push('shadow', color, blur); }
            screen(color, alpha) { this._op().push('screen', color, alpha); }
            text(text, x, y, font, color, alpha, outline = null, width = 0) { this._op().push('text', text, x, y, font, color, alpha, outline, width); }
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
                        case 'frame':
                            ctx.save(); ctx.translate(o[1], o[2]);
                            if (o[3]) ctx.rotate(o[3]);
                            if (o[4] !== 1 || o[5] !== 1) ctx.scale(o[4], o[5]);
                            break;
                        case 'unframe': ctx.restore(); break;
                        case 'path':
                            ctx.globalAlpha = A * o[3]; ctx.strokeStyle = o[2]; ctx.lineWidth = o[1];
                            ctx.beginPath(); ctx.moveTo(o[4], o[5]);
                            for (let k = 6; k < o.length; k += 2) ctx.lineTo(o[k], o[k + 1]);
                            ctx.stroke();
                            break;
                        case 'poly':
                            ctx.globalAlpha = A * o[2]; ctx.fillStyle = o[1];
                            ctx.beginPath(); ctx.moveTo(o[3], o[4]);
                            for (let k = 5; k < o.length; k += 2) ctx.lineTo(o[k], o[k + 1]);
                            ctx.closePath(); ctx.fill();
                            break;
                        case 'circle':
                            ctx.globalAlpha = A * o[5]; ctx.fillStyle = o[4];
                            ctx.beginPath(); ctx.arc(o[1], o[2], o[3], 0, Math.PI * 2); ctx.fill();
                            break;
                        case 'ring':
                            ctx.globalAlpha = A * o[6]; ctx.strokeStyle = o[5]; ctx.lineWidth = o[4];
                            ctx.beginPath(); ctx.arc(o[1], o[2], o[3], 0, Math.PI * 2); ctx.stroke();
                            break;
                        case 'arc':
                            ctx.globalAlpha = A * o[10]; ctx.strokeStyle = o[9]; ctx.lineWidth = o[8];
                            ctx.beginPath(); ctx.ellipse(o[1], o[2], o[3], o[4], o[5], o[6], o[7]); ctx.stroke();
                            break;
                        case 'ellipse':
                            ctx.globalAlpha = A * o[7]; ctx.fillStyle = o[6];
                            ctx.beginPath(); ctx.ellipse(o[1], o[2], o[3], o[4], o[5], 0, Math.PI * 2); ctx.fill();
                            break;
                        case 'radial': {
                            const g = ctx.createRadialGradient(o[1], o[2], 0, o[1], o[2], o[3]);
                            for (let k = 5; k < o.length; k += 2) g.addColorStop(o[k], o[k + 1]);
                            ctx.globalAlpha = A * o[4]; ctx.fillStyle = g;
                            ctx.beginPath(); ctx.arc(o[1], o[2], o[3], 0, Math.PI * 2); ctx.fill();
                            break;
                        }
                        case 'blob':
                            ctx.globalAlpha = A * o[2]; ctx.fillStyle = o[1];
                            ctx.beginPath(); ctx.ellipse(o[3], o[4], o[5], o[6], o[7], 0, Math.PI * 2);
                            for (let k = 8; k < o.length; k += 3) { ctx.moveTo(o[k] + o[k + 2], o[k + 1]); ctx.arc(o[k], o[k + 1], o[k + 2], 0, Math.PI * 2); }
                            ctx.fill();
                            break;
                        case 'shadow': ctx.shadowColor = o[1]; ctx.shadowBlur = o[2]; break;
                        case 'screen':
                            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                            ctx.globalAlpha = A * o[2]; ctx.fillStyle = o[1]; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                            ctx.restore();
                            break;
                        case 'text':
                            ctx.globalAlpha = A * o[6]; ctx.font = o[4]; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                            if (o[8]) { ctx.lineJoin = 'round'; ctx.lineWidth = o[8]; ctx.strokeStyle = o[7]; ctx.strokeText(o[1], o[2], o[3]); }
                            ctx.fillStyle = o[5]; ctx.fillText(o[1], o[2], o[3]);
                            break;
                    }
                }
                ctx.restore();
            }
        };
