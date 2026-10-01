        /* The action dock: context buttons as glass pills above the right-hand cluster, clear of the
           fire ring. #btn-interact (E: talk, search, buy, enter a car…) sits nearest the thumb,
           #btn-transition (F: doors, elevators, portals) above it. Each pill is a medallion with a
           gold glyph, the verb in small caps and what it's for beneath (Mirabel, Moon City…);
           desktops also get a keycap. Built once per pill; only rewritten when the text changes. */
        const ACTION_ICONS = (() => {
            const s = body => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
            return {
                talk:   s('<path d="M4 5h16v10H9l-4 4v-4H4z"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="12" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/>'),
                door:   s('<path d="M6 21V9a6 6 0 0 1 12 0v12"/><path d="M4 21h16"/><circle cx="14.5" cy="14" r=".8" fill="currentColor"/>'),
                exit:   s('<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/>'),
                hand:   s('<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.5 0-4-1.5-5.5-4L4 12.5a1.5 1.5 0 0 1 2.5-1.5L8 13"/>'),
                coin:   s('<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v11"/>'),
                moon:   s('<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>'),
                gear:   s('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>'),
                page:   s('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 15.5h5"/>'),
                bulb:   s('<path d="M9 17h6M10 20h4M8.5 13.5A5 5 0 1 1 15.5 13.5c-.8.8-1.5 1.8-1.5 3.5h-4c0-1.7-.7-2.7-1.5-3.5z"/>'),
                heart:  s('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
                cross:  s('<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>'),
                car:    s('<path d="M4 15l1.5-5A2 2 0 0 1 7.4 8.5h9.2a2 2 0 0 1 1.9 1.5L20 15v3H4z"/><circle cx="7.5" cy="15.5" r="1.2"/><circle cx="16.5" cy="15.5" r="1.2"/>'),
                portal: s('<ellipse cx="12" cy="12" rx="6" ry="8.5"/><path d="M12 7c2 1.5 2 8.5 0 10M9 9.5c1.8.5 4.2.5 6 0"/>')
            };
        })();

        const ACTION_VERBS = {
            talk: 'talk', bond: 'heart', adopt: 'heart', search: 'hand', 'pick up': 'hand', buy: 'coin', shop: 'coin',
            rest: 'moon', craft: 'gear', loadout: 'gear', read: 'page', lights: 'bulb', refill: 'cross',
            hail: 'car', hijack: 'car', drive: 'car', grab: 'hand', hold: 'hand', 'let go': 'hand', enter: 'door', exit: 'exit', leave: 'exit', go: 'portal'
        };

        /** Set a pill's verb, what it's for, and its keycap; the DOM is only touched when they change. */
        function setActionPill(el, verb, name, key) {
            const sig = verb + '|' + (name || '') + '|' + key;
            if (el._apSig === sig) return;
            el._apSig = sig;
            if (!el._ap) {
                el.classList.add('action-pill');
                el.innerHTML = '<span class="ap-medal"></span><span class="ap-text"><span class="ap-verb"></span><span class="ap-name"></span></span><span class="ap-key"></span>';
                el._ap = { medal: el.querySelector('.ap-medal'), verb: el.querySelector('.ap-verb'), name: el.querySelector('.ap-name'), key: el.querySelector('.ap-key') };
            }
            const icon = ACTION_VERBS[verb.toLowerCase()] || 'door';
            el._ap.medal.innerHTML = ACTION_ICONS[icon];
            el._ap.verb.textContent = verb;
            el._ap.name.textContent = name || '';
            el._ap.name.style.display = name ? '' : 'none';
            el._ap.key.textContent = key;
            // Re-run the arrival flourish for a new action
            el.classList.remove('ap-arrive'); void el.offsetWidth; el.classList.add('ap-arrive');
        }

        /** A door label ("Enter Club", "Exit Nightclub", "Elevator") as verb + where it goes. */
        function transitionAction(label) {
            const m = /^(Enter|Exit|Leave)\s+(?:the\s+)?(.+)$/i.exec(label || '');
            if (m) return [m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), m[2]];
            return ['Go', label || ''];
        }
