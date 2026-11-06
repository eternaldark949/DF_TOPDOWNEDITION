        // ===== LV0 BASEMENT =====
        // The canvas kit: off-screen drawing layers (sprite bakes, caches, light and bloom buffers, portraits).
        // A free-standing tool, so code that runs while the game is still loading can use it, and the
        // renderer is one more user of it rather than its owner.
        //
        // LAYER PACKET: [width, height] or [width, height, context_options]
        //   width, height     pixels; leave both out for an unsized layer that is sized later
        //   context_options   passed to getContext('2d', ...), e.g. { willReadFrequently: true }
        //
        //   const { canvas, ctx } = canvasKit.createLayer([w, h]);
        //   canvasKit.fitLayer(canvas, w, h);   // resize only if the size changed (a resize clears the layer)
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
            }
        };
