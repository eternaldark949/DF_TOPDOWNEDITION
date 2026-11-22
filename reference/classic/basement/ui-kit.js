        // ===== LV0 BASEMENT =====
        // The UI kit: building and showing DOM panels, and nothing about any game. The HUD, menus and
        // phone apps are this game's own (Directory); the kit is what they're built with.
        //
        // EL PACKET: [tag, className, text]   a new element; leave out what you don't set
        //   tag               'div', 'span', 'button' ...
        //   className         its class (set even when empty, as an assignment would; null leaves it unset)
        //   text              its textContent
        //
        // A REF is an element or an element's id. show / hide also take a list of refs. A ref that
        // finds nothing is skipped.
        //
        //   const row = uiKit.make(['div', 'msg-sec', 'Pinned'], list);   // made, filled and appended
        //   uiKit.show('map-interface');            // display: block
        //   uiKit.show(this.interactBtn, 'flex');   // or any display value
        //   uiKit.hide(['inventory-list-container', 'stats-container']);
        //   uiKit.toggle(el, on, 'flex');           // shown as flex when on, hidden when not
        //   if (uiKit.isShown(this.dialogueBox)) ...
        const uiKit = {
            /** The element for a ref (an element, or an id). */
            find (ref) {
                return typeof ref === 'string' ? document.getElementById(ref) : ref;
            },

            /** A new element from a packet, appended to `parent` when one is given. */
            make (el_packet, parent) {
                const e = document.createElement(el_packet[0]);
                if (el_packet.length > 1 && el_packet[1] !== null) e.className = el_packet[1];
                if (el_packet.length > 2) e.textContent = el_packet[2];
                if (parent) parent.appendChild(e);
                return e;
            },

            /** Show a ref (or a list of refs) with a display value: 'block' unless told, '' to fall back to the stylesheet. */
            show (refs, display = 'block') {
                if (Array.isArray(refs)) { for (const r of refs) this.show(r, display); return; }
                const e = this.find(refs);
                if (e) e.style.display = display;
            },

            /** Hide a ref (or a list of refs). */
            hide (refs) {
                if (Array.isArray(refs)) { for (const r of refs) this.hide(r); return; }
                const e = this.find(refs);
                if (e) e.style.display = 'none';
            },

            /** Show (with `display`) when `on`, hide when not. */
            toggle (refs, on, display = 'block') {
                if (on) this.show(refs, display); else this.hide(refs);
            },

            /** Is it shown? (Not hidden with display: none.) */
            isShown (ref) {
                const e = this.find(ref);
                return !!e && e.style.display !== 'none';
            }
        };
