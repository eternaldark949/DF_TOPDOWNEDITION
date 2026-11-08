        // ===== LV0 BASEMENT =====
        // The life kit: lists of short-lived things (shot smoke, ripples, damage numbers, flashes, markers)
        // that tick or age every frame and drop out when they're done.
        //
        //   lifeKit.sweep(list, (item, i) => done);   // walk the list, drop each item whose step returns true
        //   lifeKit.cull(list, (item, i) => done);    // the same, but a dropped item's place goes to the last one
        //
        // The walk goes from the end to the start, so dropping an item never skips the next one, and items
        // added during the walk wait for the next one. Return nothing (or false) to keep an item. sweep keeps
        // the order (for lists drawn in order); cull is O(1) a drop and shuffles the tail (rain, leaves, decals).
        const lifeKit = {
            sweep (list, each) {
                for (let i = list.length - 1; i >= 0; i--) if (each(list[i], i)) list.splice(i, 1);
            },
            cull (list, each) {
                for (let i = list.length - 1; i >= 0; i--) if (each(list[i], i)) { list[i] = list[list.length - 1]; list.pop(); }
            }
        };
