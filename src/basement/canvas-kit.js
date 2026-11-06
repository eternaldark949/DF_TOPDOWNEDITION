        // ===== LV0 BASEMENT =====
        // The canvas kit: off-screen drawing layers (sprite bakes, caches, light and bloom buffers, portraits).
        // A free-standing tool, so code that runs while the game is still loading can use it, and the
        // renderer is one more user of it rather than its owner.
        //
        // LAYER PACKET: [width, height] or [width, height, context_options]
        //   width, height     pixels; leave both out for an unsized layer that is sized later
        //   context_options   passed to getContext('2d', ...), e.g. { willReadFrequently: true }
        //
        // GLOW PACKET: [size, stops]   a size x size square, filled with a radial falloff from its centre
        //   stops             [[offset, color], ...] as for addColorStop, 0 = the centre, 1 = the edge
        //
        //   const { canvas, ctx } = canvasKit.createLayer([w, h]);
        //   canvasKit.fitLayer(canvas, w, h);   // resize only if the size changed (a resize clears the layer)
        //   const halo = canvasKit.glow([64, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]]);
        //   const sprite = canvasKit.bake(cache, key, () => paintIt());   // made the first time, kept after
        const canvasKit = {
            /** A new layer from a packet: { canvas, ctx }. */
            createLayer (layer_packet) {
                const canvas = document.createElement('canvas');
                if (layer_packet && layer_packet.length >= 2) {
                    canvas.width = layer_packet[0];
                    canvas.height = layer_packet[1];
                }
                const ctx = canvas.getContext('2d', layer_packet && layer_packet[2]);
                return { canvas, ctx };
            },

            /** Resize a layer only when its size changed. Returns true if it was resized (and so cleared). */
            fitLayer (canvas, width, height) {
                if (canvas.width === width && canvas.height === height) return false;
                canvas.width = width;
                canvas.height = height;
                return true;
            },

            /** A soft radial sprite from a glow packet. Pass `layer` to repaint an existing canvas instead. */
            glow (glow_packet, layer) {
                const size = glow_packet[0], stops = glow_packet[1], half = size / 2;
                let canvas = layer, ctx;
                if (canvas) { canvas.width = canvas.height = size; ctx = canvas.getContext('2d'); }
                else ({ canvas, ctx } = this.createLayer([size, size]));
                const g = ctx.createRadialGradient(half, half, 0, half, half, half);
                for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
                ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
                return canvas;
            },

            /** Bake once, keep forever: the cached value for `key` in `cache` (a Map or a plain object),
             *  made with make() the first time it's asked for. */
            bake (cache, key, make) {
                if (cache instanceof Map) {
                    let v = cache.get(key);
                    if (!v) cache.set(key, v = make());
                    return v;
                }
                return cache[key] || (cache[key] = make());
            }
        };
