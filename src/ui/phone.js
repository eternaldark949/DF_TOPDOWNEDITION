        /* --- PHONE SYSTEM --- */
        const phoneSystem = {
            overlay: document.getElementById('phone-overlay'),
            homeScreen: document.getElementById('phone-home'),
            timeDisplay: document.getElementById('phone-time'),
            contactsList: document.getElementById('contacts-list'),
            mapCanvas: document.getElementById('phone-map-canvas'),
            typingIndicator: document.getElementById('phone-typing-indicator'),
            
            // State
            isOpen: false,
            currentApp: 'home',
            currentContact: null,
            metNPCs: new Set(),
            contactOverrides: {},
            typingState: {},  // { contactName: true/false } - who is currently typing
            messageHistory: {}, // { contactName: [{text, timestamp, isNew}] } - persistent message history
            mapView: { zoom: 1.0, offsetX: 0, offsetY: 0, isDragging: false, lastX: 0, lastY: 0, baseScale: 1.0, lastPinchDist: 0 },
        
            // Helper to safely broadcast to NSM
            broadcast(eventType, payload) {
                if (game && game.story && game.story.nsm) {
                    game.story.nsm.notifyEvent(eventType, payload);
                }
            },
        
            initMapControls() { 
                const canvas = this.mapCanvas;
                // In landscape the phone is drawn scaled down (--phone-scale): pan by what the finger covered on the phone
                const k = () => document.body.classList.contains('landscape') ? 1 / (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--phone-scale')) || 1) : 1;
                canvas.addEventListener('wheel', (e) => { e.preventDefault(); const zoomSpeed = 0.1; const direction = e.deltaY > 0 ? -1 : 1; let newZoom = this.mapView.zoom + (direction * zoomSpeed * this.mapView.zoom); newZoom = Math.max(0.5, Math.min(newZoom, 8.0)); this.mapView.zoom = newZoom; this.drawMap(); });
                canvas.addEventListener('mousedown', (e) => { this.mapView.isDragging = true; this.mapView.lastX = e.clientX; this.mapView.lastY = e.clientY; canvas.style.cursor = 'grabbing'; });
                window.addEventListener('mousemove', (e) => { if (!this.mapView.isDragging || this.overlay.style.display === 'none') return; const dx = e.clientX - this.mapView.lastX; const dy = e.clientY - this.mapView.lastY; this.mapView.lastX = e.clientX; this.mapView.lastY = e.clientY; this.mapView.offsetX += dx * k(); this.mapView.offsetY += dy * k(); this.drawMap(); });
                window.addEventListener('mouseup', () => { this.mapView.isDragging = false; canvas.style.cursor = 'default'; });
                canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { this.mapView.isDragging = true; this.mapView.lastX = e.touches[0].clientX; this.mapView.lastY = e.touches[0].clientY; } else if (e.touches.length === 2) { this.mapView.isDragging = false; const dx = e.touches[0].clientX - e.touches[1].clientX; const dy = e.touches[0].clientY - e.touches[1].clientY; this.mapView.lastPinchDist = Math.hypot(dx, dy); } });
                canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (e.touches.length === 1 && this.mapView.isDragging) { const dx = e.touches[0].clientX - this.mapView.lastX; const dy = e.touches[0].clientY - this.mapView.lastY; this.mapView.lastX = e.touches[0].clientX; this.mapView.lastY = e.touches[0].clientY; this.mapView.offsetX += dx * k(); this.mapView.offsetY += dy * k(); this.drawMap(); } else if (e.touches.length === 2) { const dx = e.touches[0].clientX - e.touches[1].clientX; const dy = e.touches[0].clientY - e.touches[1].clientY; const currentDist = Math.hypot(dx, dy); if (this.mapView.lastPinchDist > 0) { const zoomFactor = currentDist / this.mapView.lastPinchDist; let newZoom = this.mapView.zoom * zoomFactor; newZoom = Math.max(0.5, Math.min(newZoom, 8.0)); this.mapView.zoom = newZoom; this.drawMap(); } this.mapView.lastPinchDist = currentDist; } });
                canvas.addEventListener('touchend', (e) => { if (e.touches.length < 2) this.mapView.lastPinchDist = 0; if (e.touches.length === 0) this.mapView.isDragging = false; if (e.touches.length === 1) { this.mapView.isDragging = true; this.mapView.lastX = e.touches[0].clientX; this.mapView.lastY = e.touches[0].clientY; } });
            },
        
            // ── Calls: a voice on the line while the scene plays on (no pause) ──
            call: null,
            /** Someone's calling: the phone buzzes, a call card rises; tapping it (or the phone button) answers. */
            ringCall(name, opts = {}) {
                this.endCall();
                const c = this.call = { name, subtitle: opts.subtitle || '', answered: false, t0: 0, el: null };
                const el = c.el = document.createElement('div');
                el.id = 'call-card';
                el.innerHTML = '<div class="cc-ring"><i></i><i></i><canvas width="120" height="120"></canvas></div>'
                    + '<div class="cc-who"><b></b><span></span></div><button class="cc-answer">Answer</button><div class="cc-time"></div>';
                el.querySelector('b').textContent = name;
                el.querySelector('span').textContent = c.subtitle || 'incoming call';
                document.body.appendChild(el);
                if (game.paintPortraitTo) game.paintPortraitTo(el.querySelector('canvas'), name, 'rgba(40, 10, 50, 0.95)');
                el.querySelector('.cc-answer').addEventListener('click', (e) => { e.stopPropagation(); this.answerCall(); });
                requestAnimationFrame(() => el.classList.add('show'));
                c.buzz = setInterval(() => { try { if (navigator.vibrate) navigator.vibrate([90, 60, 90]); } catch (e) { /* no haptics */ } audioSys.sfx('ui'); }, 1400);
                return c;
            },
            answerCall() {
                const c = this.call; if (!c || c.answered) return;
                c.answered = true; c.t0 = performance.now(); clearInterval(c.buzz);
                c.el.classList.add('live');
                c.el.querySelector('span').textContent = 'on the line';
                const time = c.el.querySelector('.cc-time');
                c.clock = setInterval(() => { const s = Math.floor((performance.now() - c.t0) / 1000); time.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 250);
                audioSys.sfx('ui');
                this.addMessage(c.name, '☎ Call', false, c.name);
            },
            callAnswered() { return !!(this.call && this.call.answered); },
            endCall() {
                const c = this.call; if (!c) return;
                clearInterval(c.buzz); clearInterval(c.clock);
                const el = c.el; el.classList.remove('show'); el.classList.add('gone'); setTimeout(() => el.remove(), 600);
                this.call = null;
            },

            open() {
                if (this.call && !this.call.answered) { this.answerCall(); return; }   // the phone's ringing: the button answers it
                this.isOpen = true;
                this.overlay.style.display = 'flex';
                this.showHome();
                this.updateTime();
                // NOTE: opening the phone no longer clears the badge. Unread state
                // is cleared per-conversation by markRead() when its detail view is
                // opened, so raising the phone for an unrelated reason no longer
                // discards the notification.
                game.pauseSystem.acquire('phone');
                audioSys.sfx('ui');
                this.broadcast('PHONE_OPENED', {}); // Report Event
            },
            
            close() {
                this.isOpen = false;
                this.currentApp = 'closed';
                this.overlay.style.display = 'none';
                game.pauseSystem.release('phone');
                audioSys.sfx('ui');
                this.broadcast('PHONE_CLOSED', {}); // Report Event
            },
            
            showHome() {
                this.currentApp = 'home';
                this.currentContact = null;
                document.querySelectorAll('.phone-app-screen').forEach(s => s.style.display = 'none');
                this.homeScreen.style.display = 'block';
                this.updateTime();
            },
            
            updateTime() {
                const h = Math.floor(game.worldMinutes / 60) % 24;
                const m = game.worldMinutes % 60;
                const ampm = h >= 12 ? 'PM' : 'AM';
                const displayH = h % 12 || 12; 
                this.timeDisplay.innerHTML = `${displayH}:${m.toString().padStart(2, '0')} <span id="phone-time-suffix">${ampm}</span>`;
                const wIcon = document.getElementById('weather-icon');
                const wText = document.getElementById('weather-text');
                const wTemp = document.querySelector('.weather-temp');
                // Report the SCHEDULED condition, not the render gate. Standing in
                // a cafe shouldn't make the forecast say Clear Sky while it's
                // hammering down outside the window.
                const w = game.weather;
                if (w && w.getCondition) {
                    const c = w.getCondition();
                    wIcon.textContent = c.icon;
                    wText.textContent = c.label;
                    // Temperature drifts a degree with the day/night cycle
                    const hourNow = Math.floor(game.worldMinutes / 60) % 24;
                    const nightDrop = (hourNow < 6 || hourNow >= 20) ? 2 : 0;
                    wTemp.textContent = `${c.temp - nightDrop}°C`;
                } else if (w && w.isRaining) {
                    wIcon.textContent = '🌧️'; wText.textContent = 'Raining'; wTemp.textContent = '18°C';
                } else {
                    wIcon.textContent = '🌙'; wText.textContent = 'Clear Sky'; wTemp.textContent = '21°C';
                }

                // The Sky.ME home icon doubles as an at-a-glance readout, so it
                // tracks the live condition instead of sitting on a fixed glyph.
                const skyIcon = document.getElementById('skyme-icon');
                if (skyIcon && w && w.getConditionIcon) skyIcon.textContent = w.getConditionIcon();

                // Re-render the app if it's the screen currently in front of the
                // player — opening the phone pauses the world, so this is the
                // moment its numbers are correct.
                if (this.currentApp === 'skyme') this._renderSkyMe();
            },
            
            meetNPC(npc) { if (!this.metNPCs.has(npc.name)) this.metNPCs.add(npc.name); },
            
            /** Ensure Freelancer crew and key contacts always appear in messageHistory. */
            seedDefaultContacts() {
                const crewMessages = {
                    '747':      'Stay sharp, Nine.',
                    'Victoria': 'Ready to roll out whenever you are.',
                    'Yenna':    'Eyes on the perimeter. All clear.',
                    'Sabrina':  'You know where to find me.',
                    'Max':      'I swear if one more thing goes sideways...',
                    'Josh':     'Intel updated. Standing by.',
                    'Mirabel':  '949. I hope you\'re awake.',
                    'Dr. Yin':  'Visit my clinic for supplies.',
                    'Larissa':  'Your assignment particulars are with Mirabel. Please coordinate with her directly.'
                };
                // Contacts whose opening line should ARRIVE rather than sit quietly in
                // history — it lands unread, badges the phone, and reads as NOW.
                // Gated on an empty conversation, which is the only reliable "first
                // time" signal here: this function also runs after a save is loaded
                // (messageHistory is restored first), so a message the player has
                // already read can never be re-flagged.
                const arrivesUnread = new Set(['Larissa']);

                for (const [name, msg] of Object.entries(crewMessages)) {
                    if (!this.messageHistory[name]) {
                        this.messageHistory[name] = [];
                    }
                    if (this.messageHistory[name].length === 0) {
                        if (arrivesUnread.has(name)) {
                            // Routed through the sanctioned writer so the unread
                            // ledger, recency stamp and badge all stay in step.
                            this._deliverMessage(name, msg);
                        } else {
                            this.messageHistory[name].push({ text: msg, timestamp: 0, isNew: false, from: 'them' });
                        }
                    }
                    this.metNPCs.add(name);
                }
            },
            
            /** Serialize metNPCs for save. */
            getMetNPCsList() { return [...this.metNPCs]; },
            
            /** Restore metNPCs from save data. */
            restoreMetNPCs(list) {
                this.metNPCs = new Set(list || []);
            },
            
            // --- MESSAGE HISTORY SYSTEM ---
            // Add a message to history (persists across mission steps)
            addMessage(contactName, text, isNew = true, from = 'them') {
                if (!this.messageHistory[contactName]) {
                    this.messageHistory[contactName] = [];
                }
                // Incoming lines dedupe on text so a repeated story beat doesn't
                // stack. Player replies never dedupe — answering "On my way." to
                // two different messages is legitimate and should show twice.
                if (from === 'them') {
                    const exists = this.messageHistory[contactName]
                        .some(m => m.text === text && (m.from || 'them') === 'them');
                    if (exists) return;
                }
                this.messageHistory[contactName].push({
                    text: text,
                    timestamp: game?.worldMinutes || 0,
                    isNew: isNew,
                    from: from
                });
            },
            
            // Get all messages for a contact (default + history)
            getMessages(contactName, defaultMessages = []) {
                const history = this.messageHistory[contactName] || [];
                // Combine defaults with history, avoiding duplicates. 949's own
                // replies are excluded — the contact-list preview should show what
                // THEY last said, not what she answered.
                const allMessages = [...defaultMessages];
                history.forEach(h => {
                    if ((h.from || 'them') !== 'them') return;
                    if (!allMessages.includes(h.text)) {
                        allMessages.push(h.text);
                    }
                });
                return allMessages;
            },
            
            // --- TYPING INDICATOR ---
            setTyping(contactName, isTyping) {
                this.typingState[contactName] = isTyping;
                this.updateTypingIndicator();
            },
            
            updateTypingIndicator() {
                const indicator = this.typingIndicator;
                if (!indicator) return;
                
                // Find who is typing
                const typingContact = Object.keys(this.typingState).find(name => this.typingState[name]);
                
                if (typingContact) {
                    indicator.querySelector('.typing-name').textContent = typingContact;
                    indicator.classList.add('active');
                } else {
                    indicator.classList.remove('active');
                }
            },
            
            // Send a new text message (sets override + adds to history + shows typing)
            sendText(contactName, text, showTypingFirst = false, typingDuration = 2000) {
                if (showTypingFirst) {
                    // Show typing indicator first
                    this.setTyping(contactName, true);
                    setTimeout(() => {
                        this.setTyping(contactName, false);
                        this._deliverMessage(contactName, text);
                    }, typingDuration);
                } else {
                    this._deliverMessage(contactName, text);
                }
            },
            
            _deliverMessage(contactName, text) {
                // Add to history
                this.addMessage(contactName, text, true);
                // Set as current override (shows in preview)
                this.contactOverrides[contactName] = text;
                // Bump the ledger — this is the ONLY place unread counts grow.
                this.unread[contactName] = (this.unread[contactName] || 0) + 1;
                // Recency stamp for contact-list ordering. Kept here rather than
                // read off messageHistory because addMessage dedupes on text, so a
                // repeated line would never refresh its history timestamp.
                this.lastMessageAt[contactName] = (typeof game !== 'undefined' && game) ? (game.worldMinutes || 0) : 0;
                this.refreshNotifications();
            },

            // ================================================================
            //  NOTIFICATION LEDGER
            //  `unread` is the single source of truth for notification state:
            //  contactName -> integer count of messages not yet read.
            //  _deliverMessage is the only writer; every piece of notification
            //  UI (home-button badge, its count, the contacts app dot) is
            //  DERIVED by refreshNotifications(). Nothing else should touch
            //  those elements directly — six call sites used to hand-toggle
            //  them from story steps and drifted out of sync with the real
            //  message state.
            // ================================================================
            unread: {},
            lastMessageAt: {},   // contactName -> worldMinutes of last delivery

            /** Total unseen messages across all contacts. */
            unreadTotal() {
                let n = 0;
                for (const k in this.unread) n += this.unread[k];
                return n;
            },

            /** Mark one conversation read. Called when its detail view opens. */
            markRead(contactName) {
                if (!this.unread[contactName] && !this.contactOverrides[contactName]) return;
                delete this.unread[contactName];
                // The message itself is already persisted to messageHistory by
                // showContactDetail, so dropping the override just demotes it
                // from "NOW" to "Recent" on the next view. That IS the read.
                delete this.contactOverrides[contactName];
                this.refreshNotifications();
            },

            /** Mark everything read — used by scripted story cleanup. */
            markAllRead() {
                this.unread = {};
                this.contactOverrides = {};
                this.refreshNotifications();
            },

            /** Re-derive all notification UI from the ledger. Idempotent. */
            refreshNotifications() {
                const total = this.unreadTotal();
                const badge = document.getElementById('phone-notification-badge');
                const btn = document.getElementById('btn-phone');
                const appDot = document.getElementById('badge-contacts');

                if (badge) {
                    badge.textContent = total > 99 ? '99+' : String(total);
                    badge.style.display = total > 0 ? 'flex' : 'none';
                }
                if (btn) btn.classList.toggle('notify', total > 0);
                if (appDot) appDot.classList.toggle('active', total > 0);

                // Keep an open phone live. A message landing while the player is
                // already looking at the contacts list previously left that list
                // stale until they navigated away and back — which is exactly
                // what happens to Anavia's intro message, since it lands 2.5s
                // after Mirabel's and the player is told to open the phone.
                if (this.isOpen && this.currentApp === 'contacts') {
                    this.renderContacts();
                }
            },
            
            showContacts() {
                this.currentApp = 'contacts';
                this.currentContact = null;
                
                // BROADCAST: Explicitly tell NSM contacts were opened
                this.broadcast('APP_OPENED', { app: 'contacts' });
                
                this.homeScreen.style.display = 'none';
                document.getElementById('screen-contacts').style.display = 'flex';
                document.getElementById('screen-contact-detail').style.display = 'none';
                
                this.contactsList.innerHTML = '';
                
                const defaultContacts = [
                    { name: 'Mirabel', role: 'Contractor', avatar: '🤖', messages: ['949. I hope you\'re awake. I\'ve found him.', 'The Dark Maker was spotted leaving the sector.'] },
                    { name: 'Dr. Yin', role: 'Medic', avatar: '⚕️', messages: ['Visit my clinic for supplies!', 'Stim refills available.'] },
                    { name: '747', role: 'Freelancer', avatar: '🎭', messages: ['Stay sharp, Nine.', 'I\'ve got your six. Always.'] },
                    { name: 'Victoria', role: 'Freelancer', avatar: '💜', messages: ['Save me from these sad motherfuckers.', 'Ready to roll out whenever you are.'] },
                    { name: 'Yenna', role: 'Freelancer', avatar: '🎯', messages: ['Eyes on the perimeter. All clear.', 'Say the word and the SR-86 speaks.'] },
                    { name: 'Sabrina', role: 'Freelancer', avatar: '🌙', messages: ['You know where to find me.', 'Sarcasm is free. Bullets cost extra.'] },
                    { name: 'Max', role: 'Freelancer', avatar: '⚡', messages: ['This is bullshit.', 'I swear if one more thing goes sideways...'] },
                    { name: 'Josh', role: 'Freelancer', avatar: '📋', messages: ['Intel updated. Standing by.', 'Of course. You\'re welcome.'] },
                    { name: 'Larissa', role: 'Handler', avatar: '🗂️', messages: ['Your assignment particulars are with Mirabel. Please coordinate with her directly.', 'The Empereal Lord remains pleased with your work.'] }
                ];
                
                this.metNPCs.forEach(name => {
                    if (!defaultContacts.find(c => c.name === name)) defaultContacts.push({ name, role: 'Contact', avatar: '👤', messages: ['No new messages.'] });
                });

                this._contactDefs = defaultContacts;
                this.renderContacts();
            },

            /**
             * Paint the contact list from `_contactDefs`. Split out of
             * showContacts() so refreshNotifications() can repaint a list that's
             * already on screen when a message lands mid-view.
             *
             * ORDERING (stable sort, so ties keep authored order):
             *   1. Unread — most recently received first
             *   2. Read, but has message history — most recent first
             *   3. Never messaged — authored order
             * Recency comes from `lastMessageAt`, written by _deliverMessage,
             * rather than from messageHistory timestamps: addMessage dedupes on
             * text, so a repeated line never updates its history timestamp and
             * would sort as though it had never arrived.
             */
            renderContacts() {
                const defaultContacts = this._contactDefs;
                if (!defaultContacts || !this.contactsList) return;

                this.contactsList.innerHTML = '';

                const recencyOf = (name) => {
                    if (this.lastMessageAt && this.lastMessageAt[name] != null) return this.lastMessageAt[name];
                    const hist = this.messageHistory[name];
                    if (hist && hist.length) return hist[hist.length - 1].timestamp || 0;
                    return null; // never messaged
                };
                const rankOf = (name) => {
                    if (this.unread[name]) return 0;
                    return recencyOf(name) != null ? 1 : 2;
                };

                const ordered = defaultContacts.slice().sort((a, b) => {
                    const ra = rankOf(a.name), rb = rankOf(b.name);
                    if (ra !== rb) return ra - rb;
                    if (ra === 2) return 0;                    // stable: authored order
                    return (recencyOf(b.name) || 0) - (recencyOf(a.name) || 0);
                });

                ordered.forEach(contact => {
                    const item = document.createElement('div');
                    item.className = 'contact-item';
                    
                    // Get all messages including history
                    const allMessages = this.getMessages(contact.name, contact.messages);
                    contact.allMessages = allMessages; // Store for detail view
                    
                    // Preview shows most recent message or override
                    let previewText = allMessages[allMessages.length - 1] || contact.messages[0];
                    let hasNewMessage = false;
                    
                    if (this.contactOverrides[contact.name]) {
                        previewText = this.contactOverrides[contact.name];
                        hasNewMessage = true;
                    }
                    const unreadCount = this.unread[contact.name] || 0;
                    
                    // Truncate preview if too long
                    if (previewText.length > 35) {
                        previewText = previewText.substring(0, 35) + '...';
                    }
                    
                    const previewClass = hasNewMessage ? 'contact-role typing-anim' : 'contact-role';
                    // Drive the bold state off the ledger, not off hasNewMessage:
                    // contactOverrides is also set by seeding/restore paths, whereas
                    // `unread` is only ever incremented by an actual delivery.
                    if (unreadCount > 0) item.classList.add('unread');
                    
                    item.innerHTML = `
                        ${this._avatarMarkup(contact, unreadCount > 0)}
                        <div class="contact-info">
                            <div class="contact-name">${contact.name}</div>
                            <div class="${previewClass}">${previewText}</div>
                        </div>
                        ${unreadCount > 0 ? `<div class="contact-unread-count">${unreadCount > 99 ? '99+' : unreadCount}</div>` : ''}`;
                        
                    item.addEventListener('click', () => this.showContactDetail(contact));
                    this.contactsList.appendChild(item);
                });
            },
            
            /**
             * Build the avatar cell for one contact row.
             *
             * Layers, outermost in:
             *   ring    — relationship tier colour (teammates only), or unread pulse
             *   portrait— drawn bust via game.getPortraitDataURL, transparent bg so
             *             the existing .contact-avatar gradient shows through
             *   glyph   — the original emoji, demoted to a corner badge
             *
             * Falls back to the plain emoji avatar whenever a portrait would be the
             * grey silhouette (`isFallback`), which covers unknown/never-met contacts.
             * Rendered at 2x display size so faces stay crisp on high-DPR screens.
             */
            _avatarMarkup(contact, isUnread) {
                const DISPLAY = 40;
                let portraitURL = null;
                let ring = null;
                let downed = false;

                if (typeof game !== 'undefined' && game && game.getPortraitDataURL) {
                    try {
                        const entry = game.getPortraitCanvas(contact.name, DISPLAY * 2, null);
                        // Transparent backdrop — the CSS gradient behind is the app's look.
                        if (entry && entry.config && !entry.config.isFallback) {
                            portraitURL = game.getPortraitDataURL(contact.name, DISPLAY * 2, null);
                        }
                    } catch (e) { portraitURL = null; }

                    // Tier ring + downed state, teammates only.
                    const tm = (game.teammates || []).find(t => t.name === contact.name);
                    if (tm) {
                        downed = !!tm.downed;
                        if (game.bonding && typeof tm.relationship === 'number') {
                            const tier = BONDING_TIERS[game.bonding.getTier(tm.relationship)];
                            if (tier && tier.ring) ring = tier.ring;
                        }
                    }
                }

                const cls = ['contact-avatar'];
                if (portraitURL) cls.push('has-portrait');
                if (isUnread) cls.push('avatar-unread');
                if (downed) cls.push('avatar-downed');

                const style = ring && !isUnread ? ` style="border-color:${ring}"` : '';
                const inner = portraitURL
                    ? `<img class="avatar-portrait" src="${portraitURL}" alt="">
                       <span class="avatar-glyph">${contact.avatar}</span>`
                    : contact.avatar;

                return `<div class="${cls.join(' ')}"${style}>${inner}</div>`;
            },

            /* =================================================================
               REPLY OPTIONS
               -----------------------------------------------------------------
               Keyed by the incoming message they answer. Lookup normalises both
               sides, so punctuation edits to a story line won't silently orphan
               its replies. Resolution order:
                   byMessage[<that exact line>]  ->  byContact[<name>]  ->  generic
               `response` is optional: when present the contact writes back after
               a short typing beat, which is what makes it feel like a phone
               rather than a form.
               ================================================================= */
            _replyTable: {
                byMessage: {
                    "949, I need your expertise. Meet me at the Moon City Nightclub. Come quickly, this is urgent.": [
                        { text: "On my way now.",        response: "Good. Don't keep me waiting." },
                        { text: "Urgent how?",           response: "The kind that stops being urgent if you're slow." },
                        { text: "Give me twenty minutes.", response: "You have ten. I'm counting." }
                    ],
                    "949. I hope you're awake. I've found him.": [
                        { text: "Found who?",            response: "Don't make me say the name over an open line." },
                        { text: "I'm awake. Talk.",      response: "Not here. Come see me." },
                        { text: "It's the middle of the night, Mirabel." }
                    ],
                    "The Dark Maker was spotted leaving the sector.": [
                        { text: "Leaving, or running?", response: "With him there's never been a difference." },
                        { text: "Who spotted him?",     response: "Someone who isn't answering their phone anymore." },
                        { text: "Noted." }
                    ],
                    "Meet me outside when you have a moment, I want to see your face.": [
                        { text: "Give me a minute.",
                          response: "Take two. I'm not going anywhere — that's rather the point." },
                        { text: "Everything okay?",
                          response: "Everything is fine, darling. Must something be wrong for me to want you?" },
                        { text: "You could come up here, you know.",
                          response: "I could. But I don't come to anyone. You know that by now." }
                    ],
                    "Your assignment particulars are with Mirabel. Please coordinate with her directly.": [
                        { text: "Understood." },
                        { text: "You couldn't tell me yourself?",
                          response: "I could have. I delegated. That is what delegation is." },
                        { text: "Is this another Darklands job?",
                          response: "It is not. I did hear you the first time." }
                    ],
                    "The Empereal Lord remains pleased with your work.": [
                        { text: "And you?",
                          response: "A job is a job, 949." },
                        { text: "Pass along my thanks.",
                          response: "I'll see that he hears it. Word for word." },
                        { text: "He can be pleased from a distance." ,
                          response: "Noted. I'll file that under things I did not hear." }
                    ],
                    "Visit my clinic for supplies!": [
                        { text: "What have you got?",   response: "Stims, patches, and questions I won't ask." },
                        { text: "I'm low on stims.",    response: "Then stop bleeding on my floor and come by." },
                        { text: "Later, doc." }
                    ]
                },
                byContact: {
                    'Dr. Yin':  [ { text: "How's the clinic?" }, { text: "I'll stop by soon." } ],
                    'Mirabel':  [ { text: "Copy that." }, { text: "We'll talk in person." } ],
                    'Anavia':   [ { text: "Thinking about you." }, { text: "Soon. I promise." }, { text: "You're impossible." } ],
                    'Larissa':  [ { text: "Understood." }, { text: "We'll discuss it in person." } ],
                    'Victoria': [ { text: "Stay ready." }, { text: "Not yet. Sit tight." } ],
                    '747':      [ { text: "Always have." }, { text: "Watch yourself out there." } ]
                },
                generic: [
                    { text: "Copy that." },
                    { text: "Understood." },
                    { text: "Not right now." }
                ]
            },

            /** Strip case and punctuation so reworded lines still match. */
            _normalizeMsg(t) {
                return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
            },

            /** Lazily build the normalised lookup for _replyTable.byMessage. */
            _replyIndex() {
                if (!this._replyIndexCache) {
                    this._replyIndexCache = {};
                    for (const raw in this._replyTable.byMessage) {
                        this._replyIndexCache[this._normalizeMsg(raw)] = this._replyTable.byMessage[raw];
                    }
                }
                return this._replyIndexCache;
            },

            /**
             * Two lines are near-duplicates when one is a prefix of the other —
             * which is exactly the "949. I hope you're awake." / "...I've found
             * him." pair. The 12-char floor stops short acknowledgements like
             * "Copy that." from swallowing everything that starts the same way.
             */
            _isNearDup(a, b) {
                const x = this._normalizeMsg(a), y = this._normalizeMsg(b);
                if (!x || !y) return false;
                if (x === y) return true;
                const short = x.length < y.length ? x : y;
                const long  = x.length < y.length ? y : x;
                return short.length >= 12 && long.startsWith(short);
            },

            /**
             * Relative timestamp from world time. Authored/seeded lines carry no
             * real timestamp (0), so they read as EARLIER rather than pretending
             * to a precision they don't have.
             */
            _relTime(ts, isNow) {
                if (isNow) return 'NOW';
                if (!ts) return 'EARLIER';
                const d = Math.max(0, (game?.worldMinutes || 0) - ts);
                if (d < 2)    return 'JUST NOW';
                if (d < 60)   return `${Math.round(d)}M AGO`;
                if (d < 1440) return `${Math.round(d / 60)}H AGO`;
                return `${Math.round(d / 1440)}D AGO`;
            },

            /** Small circular avatar for one message row. */
            _msgAvatar(contact, mine) {
                if (mine) {
                    let url = null;
                    try {
                        if (game && game.getPortraitDataURL) {
                            const e = game.getPortraitCanvas('949', 52, null);
                            if (e && e.config && !e.config.isFallback) url = game.getPortraitDataURL('949', 52, null);
                        }
                    } catch (err) { url = null; }
                    return `<div class="msg-avatar is-me">${url ? `<img src="${url}" alt="">` : '🎧'}</div>`;
                }
                let url = null;
                try {
                    if (game && game.getPortraitDataURL) {
                        const e = game.getPortraitCanvas(contact.name, 52, null);
                        if (e && e.config && !e.config.isFallback) url = game.getPortraitDataURL(contact.name, 52, null);
                    }
                } catch (err) { url = null; }
                return `<div class="msg-avatar">${url ? `<img src="${url}" alt="">` : (contact.avatar || '👤')}</div>`;
            },

            showContactDetail(contact) {
                this.currentApp = 'details';
                this.currentContact = contact.name;
                this._activeContact = contact;

                // BROADCAST: Explicitly tell NSM which contact is being viewed
                this.broadcast('CONTACT_VIEWED', { name: contact.name });

                document.getElementById('screen-contacts').style.display = 'none';
                document.getElementById('screen-contact-detail').style.display = 'flex';
                document.getElementById('contact-detail-name').textContent = contact.name;

                // Carry the face through from the list — the thread used to drop it.
                const slot = document.getElementById('contact-detail-avatar');
                if (slot) slot.innerHTML = this._avatarMarkup(contact, false);

                // The unread line renders as NOW, then persists and clears.
                const nowText = this.contactOverrides[contact.name] || null;
                this.renderThread(contact, nowText);
                if (nowText) this.addMessage(contact.name, nowText, false, 'them');
                this.markRead(contact.name);
            },

            /**
             * Paint the whole conversation. Rebuilt on every reply, so it is the
             * single place that decides ordering, dedupe and labelling.
             */
            renderThread(contact, nowText = null) {
                const content = document.getElementById('contact-detail-content');
                if (!content) return;
                content.innerHTML = '';

                const rendered = [];   // normalised texts already on screen
                const rows = [];

                const consider = (text, ts, from, isNow) => {
                    if (!text) return;
                    // Player replies always render; only incoming lines dedupe.
                    if (from === 'them' && rendered.some(r => this._isNearDup(r, text))) return;
                    if (from === 'them') rendered.push(text);
                    rows.push({ text, ts, from, isNow });
                };

                // 1. Authored defaults — no real timestamp, so they read as EARLIER.
                //    Skip any that the unread line duplicates, or it would appear
                //    twice: once as EARLIER here and again as NOW at the bottom.
                (contact.messages || []).forEach(msg => {
                    if (nowText && this._isNearDup(msg, nowText)) return;
                    consider(msg, 0, 'them', false);
                });

                // 2. Everything exchanged in play, in the order it happened.
                (this.messageHistory[contact.name] || []).forEach(m => {
                    if (nowText && m.text === nowText && (m.from || 'them') === 'them') return; // shown as NOW below
                    consider(m.text, m.timestamp, m.from || 'them', false);
                });

                // 3. The unread line last, flagged NOW.
                if (nowText) rows.push({ text: nowText, ts: game?.worldMinutes || 0, from: 'them', isNow: true });

                rows.forEach(r => {
                    const mine = r.from === 'me';
                    const row = document.createElement('div');
                    row.className = 'msg-row ' + (mine ? 'from-me' : 'from-them');

                    const msg = document.createElement('div');
                    msg.className = 'contact-message';
                    if (r.isNow) msg.style.borderLeftColor = '#ff0055';
                    else if (!mine && r.ts) msg.style.borderLeftColor = '#a469ff';

                    const labelColor = r.isNow ? '#ff0055' : (!mine && r.ts ? '#a469ff' : '');
                    msg.innerHTML =
                        `<div class="contact-message-label"${labelColor ? ` style="color:${labelColor}"` : ''}>${this._relTime(r.ts, r.isNow)}</div>` +
                        `<div class="contact-message-text"></div>`;
                    msg.querySelector('.contact-message-text').textContent = r.text;

                    row.innerHTML = this._msgAvatar(contact, mine);
                    row.appendChild(msg);
                    content.appendChild(row);
                });

                this._lastIncoming = rows.filter(r => r.from === 'them').pop() || null;
                // If her reply is the last thing in the thread, the ball is in their
                // court — otherwise she could fire all three answers at one message.
                this._awaitingThem = rows.length > 0 && rows[rows.length - 1].from === 'me';
                this.renderReplyOptions(contact);
                setTimeout(() => { content.scrollTop = content.scrollHeight; }, 10);
            },

            /** Periwinkle chips answering whatever they said last. */
            renderReplyOptions(contact) {
                const box  = document.getElementById('contact-reply-options');
                const bar  = document.getElementById('contact-reply-input');
                const hint = document.getElementById('contact-reply-hint');
                if (!box) return;
                box.innerHTML = '';

                const opts = this._awaitingThem
                    ? null
                    : this.getReplyOptions(contact, this._lastIncoming ? this._lastIncoming.text : null);
                if (!opts || opts.length === 0) {
                    if (bar)  bar.classList.remove('armed');
                    if (hint) hint.textContent = this._awaitingThem ? 'Sent' : 'No reply needed';
                    return;
                }
                if (bar)  bar.classList.add('armed');
                if (hint) hint.textContent = `Reply to ${contact.name}…`;

                opts.forEach(opt => {
                    const chip = document.createElement('div');
                    chip.className = 'reply-chip';
                    chip.textContent = opt.text;
                    chip.addEventListener('click', () => this.sendReply(contact, opt));
                    box.appendChild(chip);
                });
            },

            getReplyOptions(contact, lastIncoming) {
                if (lastIncoming) {
                    const hit = this._replyIndex()[this._normalizeMsg(lastIncoming)];
                    if (hit) return hit;
                }
                return this._replyTable.byContact[contact.name] || this._replyTable.generic;
            },

            /**
             * Post 949's reply, then let them write back if the option carries a
             * response. The follow-up is appended straight into the open thread
             * rather than going through _deliverMessage, so reading a conversation
             * you're already looking at can't raise an unread badge for itself.
             */
            sendReply(contact, opt) {
                this.addMessage(contact.name, opt.text, false, 'me');
                audioSys.sfx('ui');
                this.renderThread(contact);

                if (!opt.response) return;

                this.setTyping(contact.name, true);
                setTimeout(() => {
                    this.setTyping(contact.name, false);
                    this.addMessage(contact.name, opt.response, false, 'them');
                    this.lastMessageAt[contact.name] = game?.worldMinutes || 0;
                    if (this.currentApp === 'details' && this.currentContact === contact.name) {
                        this.renderThread(contact);
                    } else {
                        // They answered after she closed the thread — treat it as
                        // a normal arrival so it badges like any other message.
                        this.contactOverrides[contact.name] = opt.response;
                        this.unread[contact.name] = (this.unread[contact.name] || 0) + 1;
                        this.refreshNotifications();
                    }
                }, 1400 + Math.random() * 900);
            },

            showMaps() {
                this.currentApp = 'maps';
                this.broadcast('APP_OPENED', { app: 'maps' }); // Report Event
                this.homeScreen.style.display = 'none';
                document.getElementById('screen-maps').style.display = 'flex';
                this.mapView.zoom = 1.2; this.mapView.offsetX = 0; this.mapView.offsetY = 0;
                this.drawMap(true); 
            },
            
            drawMap(recenter = false) {
                // The same city of light and icons as the golden map (ui/map-icons.js), sized to how the canvas is
                // shown (it was a fixed 280×350 stretched to fit) at the screen's pixel ratio. Pan offsets are CSS px.
                const canvas = this.mapCanvas, ctx = canvas.getContext('2d'), M = game.activeMap;
                const D = Math.min(3, Math.max(1, window.devicePixelRatio || 1)), cw = canvas.clientWidth || 280, ch = canvas.clientHeight || 300;
                if (canvas.width !== Math.round(cw * D) || canvas.height !== Math.round(ch * D)) { canvas.width = Math.round(cw * D); canvas.height = Math.round(ch * D); }
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.fillStyle = MAP_PAL.base; ctx.fillRect(0, 0, canvas.width, canvas.height);
                if (!M) return;
                this.mapView.baseScale = Math.min(cw / M.width, ch / M.height);
                const fs = this.mapView.baseScale * this.mapView.zoom;
                if (recenter) { this.mapView.offsetX = cw / 2 - game.player.x * fs; this.mapView.offsetY = ch / 2 - game.player.y * fs; }
                const ox = this.mapView.offsetX, oy = this.mapView.offsetY;
                ctx.setTransform(D * fs, 0, 0, D * fs, D * ox, D * oy);
                MapArt.paintCity(ctx, M, { px: D * fs, dpr: D, bounds: { x: -ox / fs, y: -oy / fs, w: cw / fs, h: ch / fs },
                    network: M.type !== 'indoor' && game.traffic ? game.traffic.network : null, lamps: M.type !== 'indoor' ? game.lamps : null });
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                MapArt.bloom(canvas);
                const S = (mx, my) => ({ x: D * (ox + mx * fs), y: D * (oy + my * fs) }), k = MapIcons.zoomK(this.mapView.zoom) * 0.85;
                const on = (p) => p.x > -30 * D && p.x < canvas.width + 30 * D && p.y > -30 * D && p.y < canvas.height + 30 * D;
                if (M.transitions) for (const t of M.transitions) { const p = S(t.x + t.w / 2, t.y + t.h / 2); if (on(p)) MapIcons.draw(ctx, 'transition', p.x, p.y, { dpr: D, css: MapIcons.SIZE.transition * k }); }
                if (M.buildings) for (const b of M.buildings) {
                    if (b.mapCategory !== 'restaurant' && b.mapCategory !== 'medical') continue;
                    const p = S(b.x + (b.w || 100) / 2, b.y + (b.h || 100) / 2);
                    if (on(p)) MapIcons.draw(ctx, b.mapCategory === 'restaurant' ? 'pin:cup' : 'pin:cross', p.x, p.y, { dpr: D, css: MapIcons.SIZE.pin * k });
                }
                if (game.ownedCar && game.ownedCar.visible) { const p = S(game.ownedCar.x, game.ownedCar.y); if (on(p)) MapIcons.draw(ctx, 'car', p.x, p.y, { dpr: D, css: MapIcons.SIZE.car * k, rot: game.ownedCar.angle }); }
                const pp = S(game.player.x, game.player.y);
                MapIcons.draw(ctx, 'player', pp.x, pp.y, { dpr: D, css: MapIcons.SIZE.player * k, rot: game.player.angle });
                MapIcons.draw(ctx, 'search', 16 * D, canvas.height - 14 * D, { dpr: D, css: 12 });
                ctx.fillStyle = '#ffd76a'; ctx.font = `600 ${10 * D}px Montserrat, sans-serif`; ctx.textBaseline = 'middle';
                ctx.fillText(`${this.mapView.zoom.toFixed(1)}×`, 28 * D, canvas.height - 14 * D);
            },
            
            showHelp() { this.currentApp = 'help'; this.homeScreen.style.display = 'none'; document.querySelectorAll('.phone-app-screen').forEach(s => s.style.display = 'none'); document.getElementById('screen-help').style.display = 'flex'; },

            showSkyMe() {
                this.currentApp = 'skyme';
                this.homeScreen.style.display = 'none';
                document.querySelectorAll('.phone-app-screen').forEach(s => s.style.display = 'none');
                document.getElementById('screen-skyme').style.display = 'flex';
                this._renderSkyMe();
            },

            /**
             * Sky.ME — reads the precomputed forecast queue off WeatherSystem.
             *
             * Everything shown here is the ACTUAL schedule, not an estimate: the
             * scheduler rolls its conditions ahead of time and consumes them in
             * order, so "rain stops in 12 min" is a promise the world keeps.
             *
             * Two clocks are in play and both are shown, because they answer
             * different questions. World minutes match the phone's own clock and
             * the in-fiction forecast; real seconds are what you actually sit
             * through while watching (1 world min = 2 real sec, see updateTime).
             */
            _renderSkyMe() {
                const el = document.getElementById('skyme-content');
                if (!el) return;
                const w = (typeof game !== 'undefined') ? game.weather : null;
                if (!w || !w.getForecastSummary) {
                    el.innerHTML = '<div class="sky-note">WEATHER SERVICE UNAVAILABLE.</div>';
                    return;
                }

                const now = game.worldMinutes;
                const f = w.getForecastSummary(now);

                // --- formatting helpers ---
                const clockAt = (wm) => {
                    const h = Math.floor(wm / 60) % 24;
                    const m = Math.floor(wm % 60);
                    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
                };
                const dur = (mins) => {
                    const m = Math.max(0, Math.round(mins));
                    if (m < 60) return `${m} min`;
                    const h = Math.floor(m / 60);
                    return `${h}h ${m % 60}m`;
                };
                // World minutes tick every 2 real seconds
                const realTime = (mins) => {
                    const secs = Math.max(0, Math.round(mins * 2));
                    if (secs < 90) return `~${secs}s real`;
                    return `~${Math.round(secs / 60)} min real`;
                };
                const esc = (t) => String(t).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));

                const climateName = {
                    city: 'Southern Dimensions City', outskirt: 'Outer Roads',
                    plaza: 'OllO Plaza', tempest: 'The Spire', _default: 'Unknown Region'
                }[f.climate] || 'Unknown Region';

                const html = [];

                // --- HERO: what's happening right now ---
                html.push(`
                    <div class="sky-hero">
                        <div class="sky-hero-icon">${f.icon}</div>
                        <div class="sky-hero-label">${esc(f.label)}</div>
                        <div class="sky-hero-sub">${esc(climateName)} · ${f.temp}°C · INTENSITY ${(f.intensity * 100).toFixed(0)}%</div>
                        ${f.locked ? '<div style="margin-top:6px;"><span class="sky-badge locked">Manual Override</span></div>' : ''}
                        ${f.indoors ? '<div style="margin-top:6px;"><span class="sky-badge indoor">Sheltered — reading from outside</span></div>' : ''}
                    </div>`);

                // --- HEADLINE: the number the player actually opened this for ---
                if (f.locked) {
                    html.push(`
                        <div class="sky-headline none">
                            <div class="sky-headline-main">FORECAST SUSPENDED</div>
                            <div class="sky-headline-sub">Conditions pinned manually. Set weather to AUTO to resume scheduling.</div>
                        </div>`);
                } else if (f.flipAt !== null) {
                    const inMins = f.flipAt - now;
                    const starting = (f.flipTo !== 'clear');
                    html.push(`
                        <div class="sky-headline ${starting ? '' : 'dry'}">
                            <div class="sky-headline-main">
                                ${starting ? 'RAIN BEGINS IN' : 'RAIN STOPS IN'} ${dur(inMins).toUpperCase()}
                            </div>
                            <div class="sky-headline-sub">
                                ${starting ? 'Expect' : 'Clearing to'} ${esc((WEATHER_CONDITIONS[f.flipTo] || {}).label || f.flipTo)}
                                at ${clockAt(f.flipAt)} · ${realTime(inMins)}
                            </div>
                            <div class="sky-bar-track"><div class="sky-bar-fill" style="width:${(f.progress * 100).toFixed(1)}%"></div></div>
                        </div>`);
                } else {
                    // No state change within the outlook. In the main city this is
                    // the normal case, and saying so plainly is better flavour
                    // than an empty panel.
                    html.push(`
                        <div class="sky-headline none">
                            <div class="sky-headline-main">
                                ${f.wet ? 'NO CLEAR SKIES FORECAST' : 'NO RAIN FORECAST'}
                            </div>
                            <div class="sky-headline-sub">
                                ${f.wet ? 'Continuous precipitation' : 'Dry conditions'} through the next ${dur(f.horizon)}.
                                Next shift: ${esc((WEATHER_CONDITIONS[(f.upcoming[0]||{}).id] || {}).label || '—')} in ${dur(f.minsLeft)}.
                            </div>
                            <div class="sky-bar-track"><div class="sky-bar-fill" style="width:${(f.progress * 100).toFixed(1)}%"></div></div>
                        </div>`);
                }

                // --- WIND ---
                // The arrow points INTO the wind — at the direction the air is
                // coming from — so it agrees with the label beside it rather
                // than opposing it. This matches the wind-barb convention, where
                // the staff points upwind toward the source.
                const arrowDeg = f.windBearing % 360;
                const prevailing = (typeof f.windPrevailing === 'number')
                    ? ['N','NE','E','SE','S','SW','W','NW'][Math.round(f.windPrevailing / 45) % 8]
                    : null;
                const offPrevailing = prevailing
                    ? Math.abs(((f.windBearing - f.windPrevailing + 540) % 360) - 180)
                    : 0;
                html.push(`
                    <div class="sky-wind">
                        <svg class="sky-compass" viewBox="0 0 62 62" width="62" height="62" aria-hidden="true">
                            <circle cx="31" cy="31" r="26" fill="rgba(255,255,255,0.02)" stroke="rgba(120,160,200,0.25)" stroke-width="1"/>
                            <circle cx="31" cy="31" r="19" fill="none" stroke="rgba(120,160,200,0.1)" stroke-width="1"/>
                            <text x="31" y="11"   text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.45)" font-family="Montserrat, sans-serif">N</text>
                            <text x="31" y="57"   text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.25)" font-family="Montserrat, sans-serif">S</text>
                            <text x="55" y="34"   text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.25)" font-family="Montserrat, sans-serif">E</text>
                            <text x="7"  y="34"   text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.25)" font-family="Montserrat, sans-serif">W</text>
                            <g transform="rotate(${arrowDeg.toFixed(1)} 31 31)">
                                <line x1="31" y1="44" x2="31" y2="18" stroke="#6aa9ff" stroke-width="2.5" stroke-linecap="round"/>
                                <path d="M31 14 L26 23 L31 20.5 L36 23 Z" fill="#6aa9ff"/>
                            </g>
                            <circle cx="31" cy="31" r="2" fill="rgba(255,255,255,0.5)"/>
                        </svg>
                        <div class="sky-wind-body">
                            <div class="sky-wind-dir">${f.windCompass} ${f.windBearing.toFixed(0)}°</div>
                            <div class="sky-wind-desc">${esc(f.windLabel)} · blowing from the ${esc(COMPASS_WORDS[f.windCompass] || f.windCompass)}</div>
                            <div class="sky-wind-meta">
                                ${prevailing ? `PREVAILING ${prevailing} · ${offPrevailing < 12 ? 'ON TREND' : offPrevailing.toFixed(0) + '° OFF TREND'}` : ''}
                            </div>
                        </div>
                    </div>`);

                // --- CURRENT SPELL ---
                if (!f.locked) {
                    html.push(`<div class="sky-section-title">Now</div>`);
                    html.push(`
                        <div class="sky-row ${f.wet ? '' : 'is-dry'}">
                            <div class="sky-row-icon">${f.icon}</div>
                            <div class="sky-row-body">
                                <div class="sky-row-label">${esc(f.label)}</div>
                                <div class="sky-row-meta">ENDS ${clockAt(f.endsAt)} · ${realTime(f.minsLeft)}</div>
                            </div>
                            <div class="sky-row-dur">${dur(f.minsLeft)} left</div>
                        </div>`);

                    // --- OUTLOOK ---
                    const show = f.upcoming.slice(0, CONFIG.WEATHER.SCHED_FORECAST_SHOW);
                    if (show.length) {
                        html.push(`<div class="sky-section-title">Outlook</div>`);
                        show.forEach(u => {
                            const isDry = (u.id === 'clear');
                            html.push(`
                                <div class="sky-row ${isDry ? 'is-dry' : ''}">
                                    <div class="sky-row-icon">${u.icon}</div>
                                    <div class="sky-row-body">
                                        <div class="sky-row-label">${esc(u.label)}</div>
                                        <div class="sky-row-meta">FROM ${clockAt(u.startsAt)} · IN ${dur(u.startsAt - now)}</div>
                                    </div>
                                    <div class="sky-row-dur">${dur(u.mins)}</div>
                                </div>`);
                        });
                    }
                }

                html.push(`<div class="sky-note">
                    SKY.ME · SOUTHERN DIMENSIONS METEOROLOGICAL<br>
                    Times shown on the city clock. World time runs 30× real time.
                </div>`);

                el.innerHTML = html.join('');
            },

            showLog() {
                this.currentApp = 'log';
                this.homeScreen.style.display = 'none';
                document.querySelectorAll('.phone-app-screen').forEach(s => s.style.display = 'none');
                document.getElementById('screen-log').style.display = 'flex';
                this._renderLog();
            },

            _renderLog() {
                const container = document.getElementById('log-content');
                if (!container) return;
                const t = (typeof game !== 'undefined') ? game.transcript : null;
                if (!t || t.entries.length === 0) {
                    container.innerHTML = '<div class="log-empty">NO DIALOGUE LOGGED YET.<br><br>Conversations you have will appear here so you can re-read anything you missed.</div>';
                    return;
                }

                // Show newest at the top, grouped by day
                const html = [];
                let lastDay = null;
                for (let i = t.entries.length - 1; i >= 0; i--) {
                    const e = t.entries[i];
                    const f = t.formatTime(e.ts);
                    if (f.day !== lastDay) {
                        html.push(`<div class="log-day-header">— Day ${f.day} —</div>`);
                        lastDay = f.day;
                    }
                    const speakerColor = (typeof SPEAKER_COLORS !== 'undefined' && SPEAKER_COLORS[e.speaker]) || '#ff0055';
                    // Escape HTML in user-facing text
                    const safeSpeaker = String(e.speaker).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
                    const safeText = String(e.text).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
                    html.push(`
                        <div class="log-entry">
                            <div class="log-entry-head">
                                <span class="log-entry-speaker" style="color:${speakerColor};">${safeSpeaker}</span>
                                <span class="log-entry-time">${f.time}</span>
                            </div>
                            <div class="log-entry-text">${safeText}</div>
                        </div>
                    `);
                }
                container.innerHTML = html.join('');
                container.scrollTop = 0;
            },
            stickyMe() { 
                this.close();
                
                const margin = 20;
                const isInWall = (x, y) => {
                    for (let w of game.activeMap.walls) {
                        if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
                    }
                    const colliders = getColliders(game.activeMap);
                    if (colliders) {
                        for (let b of colliders) {
                            if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
                        }
                    }
                    return false;
                };
                
                // Search from where the player actually IS — the car if driving,
                // otherwise the player on foot. This gives a local rescue rather
                // than a long teleport back to spawn.
                const inVehicle = !!(game.isDriving && game.car);
                let startX = inVehicle ? game.car.x : game.player.x;
                let startY = inVehicle ? game.car.y : game.player.y;
                
                // Clamp starting position to map bounds
                startX = Math.max(margin, Math.min(game.activeMap.width - margin, startX));
                startY = Math.max(margin, Math.min(game.activeMap.height - margin, startY));
                
                // If we're already on walkable ground, no relocation needed.
                if (!isInWall(startX, startY)) {
                    showMessage("NO RELOCATION NEEDED");
                    audioSys.sfx('ui');
                    return;
                }
                
                // Spiral outward from current position to find nearest walkable spot.
                // 20px radius step × π/12 angle step = 24 samples per ring, dense enough
                // to catch narrow gaps without burning frame time on a click event.
                let targetX = startX, targetY = startY;
                let found = false;
                const maxRadius = 600;   // big enough for SDC-scale interiors
                const radiusStep = 20;
                const angleStep = Math.PI / 12;
                
                for (let radius = radiusStep; radius <= maxRadius && !found; radius += radiusStep) {
                    for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
                        const testX = startX + Math.cos(angle) * radius;
                        const testY = startY + Math.sin(angle) * radius;
                        if (testX < margin || testX > game.activeMap.width - margin) continue;
                        if (testY < margin || testY > game.activeMap.height - margin) continue;
                        if (!isInWall(testX, testY)) {
                            targetX = testX;
                            targetY = testY;
                            found = true;
                            break;
                        }
                    }
                }
                
                // Last-resort fallback: spawn point (preserves old behavior for
                // pathological cases where the entire 600px neighborhood is walled in).
                if (!found) {
                    targetX = game.activeMap.spawn.x;
                    targetY = game.activeMap.spawn.y;
                }
                
                // Apply the relocation. When driving, move the vehicle and zero its
                // velocity so it doesn't keep ploughing forward post-teleport.
                if (inVehicle) {
                    game.car.x = targetX;
                    game.car.y = targetY;
                    if (game.car.vx !== undefined) { game.car.vx = 0; game.car.vy = 0; }
                    if (game.car.speed !== undefined) game.car.speed = 0;
                    game.player.x = targetX;
                    game.player.y = targetY;
                } else {
                    game.player.x = targetX;
                    game.player.y = targetY;
                }
                
                showMessage(found ? "RELOCATED TO NEAREST SAFE SPOT" : "NO SAFE SPOT FOUND — RETURNED TO SPAWN");
                audioSys.sfx('ui'); 
            },
            carMe() {
                if (game.activeMap.type === 'indoor') {
                    showMessage("CANNOT SUMMON VEHICLE INDOORS");
                    audioSys.sfx('ui');
                    return;
                }
                this.showCarMe();
            },
            zibMe() {
                if (game.activeMap.type === 'indoor') {
                    showMessage("ZIB SERVICE UNAVAILABLE INDOORS");
                    audioSys.sfx('ui');
                    return;
                }
                if (game.isDriving) {
                    showMessage("EXIT YOUR VEHICLE FIRST");
                    audioSys.sfx('ui');
                    return;
                }
                if (!game.zibSystem || !game.traffic || !game.traffic.network) {
                    showMessage("ZIB SERVICE OFFLINE");
                    audioSys.sfx('ui');
                    return;
                }
                
                // Find nearest lane to spawn a Zib on
                const px = game.player.x, py = game.player.y;
                const allLanes = game.traffic.network.allLanes;
                if (!allLanes || allLanes.length === 0) {
                    showMessage("NO ROADS AVAILABLE");
                    audioSys.sfx('ui');
                    return;
                }
                
                let bestLane = null, bestDist = Infinity;
                for (const lane of allLanes) {
                    if (!lane.start) continue;
                    // Project player onto lane to find closest point
                    const lx = px - lane.start.x;
                    const ly = py - lane.start.y;
                    const dot = lx * lane.ux + ly * lane.uy;
                    const t = Math.max(0, Math.min(dot, lane.length));
                    const cx = lane.start.x + lane.ux * t;
                    const cy = lane.start.y + lane.uy * t;
                    const dist = Math.hypot(px - cx, py - cy);
                    // Must be within reasonable range and not a dead-end
                    const hasExit = (lane.connections && lane.connections.length > 0) || 
                                   (lane.turnPaths && lane.turnPaths.length > 0);
                    if (dist < bestDist && hasExit) {
                        bestDist = dist;
                        bestLane = lane;
                    }
                }
                
                if (!bestLane || bestDist > 500) {
                    showMessage("NO ROADS NEARBY FOR ZIB PICKUP");
                    audioSys.sfx('ui');
                    return;
                }
                
                // Spawn Zib on the nearest lane
                const zib = new TrafficVehicle(bestLane, ZIB_CONFIG.brand, ZIB_CONFIG.model, 'AI');
                zib.color = ZIB_CONFIG.paintColor;
                zib.glowColor = ZIB_CONFIG.underglowColor;
                zib.headlightColor = ZIB_CONFIG.headlightColor;
                zib.isZib = true;
                zib.driverType = 'zib';
                
                // Position Zib on the lane near the player
                const lx = px - bestLane.start.x;
                const ly = py - bestLane.start.y;
                const dot = lx * bestLane.ux + ly * bestLane.uy;
                const t = Math.max(50, Math.min(dot, bestLane.length - 50));
                zib.x = bestLane.start.x + bestLane.ux * t;
                zib.y = bestLane.start.y + bestLane.uy * t;
                zib.angle = bestLane.angle;
                
                game.traffic.vehicles.push(zib);
                game.zibSystem.activeZibs.push(zib);
                
                // Close phone and open destination menu
                this.close();
                game.openZibMenu(zib);
            },

            showCarMe() {
                this.currentApp = 'carme';
                this.homeScreen.style.display = 'none';
                document.querySelectorAll('.phone-app-screen').forEach(s => s.style.display = 'none');
                document.getElementById('screen-carme').style.display = 'flex';

                const container = document.getElementById('carme-content');
                const isIndoor = game.activeMap.type === 'indoor';
                let html = '';

                // Current active car indicator
                const activeName = game.garage.getDisplayName(game.garage.activeIndex);
                html += `<div style="font-family:Orbitron,sans-serif; font-size:0.6rem; color:#ff8800; letter-spacing:2px; margin-bottom:4px;">MY GARAGE</div>`;
                html += `<div style="font-size:0.65rem; color:#888; margin-bottom:12px;">Active: <span style="color:#ddd;">${activeName}</span></div>`;

                for (let i = 0; i < game.garage.count; i++) {
                    const car = game.garage.get(i);
                    const isActive = i === game.garage.activeIndex;
                    const name = game.garage.getDisplayName(i);
                    const borderCol = isActive ? 'rgba(255,136,0,0.3)' : 'rgba(255,255,255,0.08)';

                    html += `<div style="background:rgba(255,255,255,0.03); border:1px solid ${borderCol}; border-radius:8px; padding:10px; margin-bottom:8px;">`;

                    // Name + color swatch + status
                    html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">`;
                    html += `<div style="display:flex; align-items:center; gap:6px;">`;
                    html += `<div style="width:14px; height:9px; border-radius:2px; background:${car.paintColor}; border:1px solid rgba(255,255,255,0.15);"></div>`;
                    html += `<span style="font-family:Orbitron,sans-serif; font-size:0.7rem; color:#ddd; letter-spacing:1px;">${name}</span>`;
                    if (car.isDefault) html += `<span style="font-size:0.4rem; color:#d4af37; letter-spacing:1px; border:1px solid rgba(212,175,55,0.3); padding:1px 4px; border-radius:2px;">DEFAULT</span>`;
                    html += `</div>`;
                    html += `<span style="font-size:0.45rem; color:${isActive ? '#00ff88' : '#555'};">${isActive ? '● ACTIVE' : ''}</span>`;
                    html += `</div>`;

                    // Action buttons
                    html += `<div style="display:flex; gap:5px;">`;
                    if (!isActive) {
                        html += `<button class="carme-activate" data-index="${i}" style="flex:1; font-family:Orbitron,sans-serif; font-size:0.5rem; letter-spacing:1px; padding:6px; background:rgba(0,255,136,0.08); border:1px solid rgba(0,255,136,0.25); color:#00ff88; border-radius:4px; cursor:pointer;">SET ACTIVE</button>`;
                    }
                    html += `<button class="carme-summon" data-index="${i}" style="flex:1; font-family:Orbitron,sans-serif; font-size:0.5rem; letter-spacing:1px; padding:6px; background:rgba(255,136,0,0.1); border:1px solid rgba(255,136,0,0.3); color:#ff8800; border-radius:4px; cursor:pointer;${isIndoor ? ' opacity:0.3; pointer-events:none;' : ''}">SUMMON</button>`;
                    html += `</div>`;

                    html += `</div>`;
                }

                if (isIndoor) {
                    html += `<div style="font-size:0.6rem; color:#555; text-align:center; margin-top:8px; font-style:italic;">Cannot summon vehicles indoors.</div>`;
                }

                container.innerHTML = html;

                // Wire buttons
                container.querySelectorAll('.carme-activate').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const idx = parseInt(btn.dataset.index);
                        game.switchGarageCar(idx);
                        this.showCarMe(); // Re-render
                    });
                });

                container.querySelectorAll('.carme-summon').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const idx = parseInt(btn.dataset.index);
                        // Switch to this car if not already active
                        if (idx !== game.garage.activeIndex) {
                            game.switchGarageCar(idx);
                        }
                        // Summon to player position
                        game.ownedCar.x = game.player.x + 50;
                        game.ownedCar.y = game.player.y;
                        game.ownedCar.visible = true;
                        const name = game.garage.getDisplayName(idx);
                        showMessage(`${name.toUpperCase()} DELIVERED`);
                        audioSys.sfx('ui');
                        this.close();
                    });
                });
            }
        };
       
        // Initialize Phone Logic
        phoneSystem.initMapControls();
        
        // Phone button event
        document.getElementById('btn-phone').addEventListener('click', () => phoneSystem.open());
        document.getElementById('phone-close').addEventListener('click', () => phoneSystem.close());
        
        // App buttons
        document.getElementById('app-contacts').addEventListener('click', () => phoneSystem.showContacts());
        document.getElementById('app-maps').addEventListener('click', () => phoneSystem.showMaps());
        document.getElementById('app-help').addEventListener('click', () => phoneSystem.showHelp());
        document.getElementById('app-log').addEventListener('click', () => phoneSystem.showLog());
        document.getElementById('app-sticky').addEventListener('click', () => phoneSystem.stickyMe());
        document.getElementById('app-carme').addEventListener('click', () => phoneSystem.carMe());
        document.getElementById('app-skyme').addEventListener('click', () => phoneSystem.showSkyMe());
        document.getElementById('app-zibme').addEventListener('click', () => phoneSystem.zibMe());
        
        // Back buttons
        document.getElementById('contacts-back').addEventListener('click', () => phoneSystem.showHome());
        document.getElementById('contact-detail-back').addEventListener('click', () => phoneSystem.showContacts());
        document.getElementById('maps-back').addEventListener('click', () => phoneSystem.showHome());
        document.getElementById('help-back').addEventListener('click', () => phoneSystem.showHome());
        document.getElementById('log-back').addEventListener('click', () => phoneSystem.showHome());
        document.getElementById('carme-back').addEventListener('click', () => phoneSystem.showHome());
        document.getElementById('skyme-back').addEventListener('click', () => phoneSystem.showHome());

        // Log.ME clear button — confirm before wiping
        document.getElementById('log-clear-btn').addEventListener('click', () => {
            if (typeof game !== 'undefined' && game.transcript && game.transcript.entries.length > 0) {
                if (confirm('Clear all logged dialogue? This cannot be undone.')) {
                    game.transcript.clear();
                    phoneSystem._renderLog();
                }
            }
        });

        // Dialogue sequence nav buttons (peek prev / forward through review)
        document.getElementById('btn-dialogue-prev').addEventListener('click', () => {
            if (typeof game !== 'undefined' && game.dialogueSeq && game.dialogueSeq.isActive()) {
                game.dialogueSeq.peekBack();
            }
        });
        document.getElementById('btn-dialogue-next').addEventListener('click', () => {
            if (typeof game !== 'undefined' && game.dialogueSeq && game.dialogueSeq.isActive()) {
                game.dialogueSeq.peekForward();
            }
        });
        
        // --- NEU.ME APP LOGIC ---
        document.getElementById('app-neume').addEventListener('click', () => {
            phoneSystem.homeScreen.style.display = 'none';
            document.getElementById('screen-neume').style.display = 'flex';
            updateNeumeUI();
        });
        
        document.getElementById('neume-back').addEventListener('click', () => {
            phoneSystem.showHome();
        });
        
        const statusText = document.getElementById('neume-status');
        
        function updateNeumeUI() {
            // Cosmetics loadout slots (one row per category)
            const loadout = document.getElementById('neume-loadout');
            let html = '';
            
            const slots = [
                { label: 'O.U.T.F.I.T', category: 'outfit', equipped: game.cosmetics.equippedOutfit },
                { label: 'W.I.G', category: 'wig', equipped: game.cosmetics.equippedWig },
                { label: 'S.K.I.N', category: 'skin', equipped: game.cosmetics.equippedSkin },
                { label: 'V.O.C.A.L', category: 'vocal', equipped: game.cosmetics.equippedVocal },
                { label: 'H.A.T', category: 'hat', equipped: game.cosmetics.equippedHat },
                { label: 'J.E.W.E.L.R.Y', category: 'jewelry', equipped: null },
                { label: 'A.C.C.E.S.S.O.R.Y', category: 'accessory', equipped: game.cosmetics.equippedAccessory }
            ];

            for (const slot of slots) {
                const owned = Object.values(COSMETICS_REGISTRY).filter(e => e.category === slot.category && game.cosmetics.isOwned(e.id));
                const current = COSMETICS_REGISTRY[slot.equipped];
                
                html += `<div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,0,255,0.15); border-radius:6px; padding:8px 10px;">`;
                html += `<div style="font-family:Orbitron,sans-serif; font-size:0.5rem; color:#ff00ff; letter-spacing:2px; margin-bottom:4px;">${slot.label}</div>`;
                html += `<div style="display:flex; gap:4px; flex-wrap:wrap;">`;
                
                for (const item of owned) {
                    const isEquipped = game.cosmetics.isEquipped(item.id);
                    let chipColor = '#555';
                    if (slot.category === 'wig') chipColor = item.data.color;
                    else if (slot.category === 'skin') chipColor = item.data.skinColor;
                    else if (slot.category === 'vocal') chipColor = item.data.captionColor;
                    else if (slot.category === 'outfit') chipColor = item.data.top.color;
                    else if (slot.category === 'hat' || slot.category === 'jewelry') chipColor = item.data.color;
                    else if (slot.category === 'accessory' && item.data.held === 'umbrella') chipColor = item.data.color;
                    else if (slot.category === 'accessory') chipColor = (GLASS_DRINKS[game.cosmetics.getAccessoryOption(item.id, 'drink')] || GLASS_DRINKS.champagne).liquid;
                    
                    const borderStyle = isEquipped ? '2px solid #ff00ff' : '1px solid rgba(255,255,255,0.15)';
                    html += `<div class="neume-chip" data-id="${item.id}" data-cat="${slot.category}" style="display:flex; align-items:center; gap:4px; padding:4px 8px; border-radius:12px; border:${borderStyle}; cursor:pointer; background:${isEquipped ? 'rgba(255,0,255,0.1)' : 'rgba(255,255,255,0.03)'}; transition:border 0.2s;">`;
                    html += `<div style="width:10px;height:10px;border-radius:50%;background:${chipColor};flex-shrink:0;"></div>`;
                    html += `<span style="font-size:0.5rem; color:${isEquipped ? '#fff' : '#999'}; white-space:nowrap;">${item.name}</span>`;
                    html += `</div>`;
                }
                
                if (slot.category === 'accessory') {
                    // "None" chip, then the drink row when the glass is in hand
                    const none = !slot.equipped;
                    html += `<div class="neume-chip" data-id="" data-cat="accessory" style="display:flex; align-items:center; padding:4px 8px; border-radius:12px; border:${none ? '2px solid #ff00ff' : '1px solid rgba(255,255,255,0.15)'}; cursor:pointer; background:${none ? 'rgba(255,0,255,0.1)' : 'rgba(255,255,255,0.03)'};"><span style="font-size:0.5rem; color:${none ? '#fff' : '#999'};">None</span></div>`;
                    html += `</div>`;
                    const accEntry = COSMETICS_REGISTRY[slot.equipped];
                    if (accEntry && accEntry.data.held === 'glass') {
                        const cur = game.cosmetics.getAccessoryOption(accEntry.id, 'drink');
                        html += `<div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:6px;">`;
                        for (const [key, d] of Object.entries(GLASS_DRINKS)) {
                            const on = key === cur;
                            html += `<div class="neume-drink" data-acc="${accEntry.id}" data-drink="${key}" style="display:flex; align-items:center; gap:3px; padding:3px 6px; border-radius:10px; border:${on ? '2px solid #ff00ff' : '1px solid rgba(255,255,255,0.12)'}; cursor:pointer;"><div style="width:8px;height:8px;border-radius:50%;background:${d.liquid};"></div><span style="font-size:0.45rem; color:${on ? '#fff' : '#999'};">${d.name}</span></div>`;
                        }
                        html += `</div>`;
                    }
                    html += `</div>`;
                    continue;
                }
                if (slot.category === 'hat') {
                    const none = !slot.equipped;
                    html += `<div class="neume-chip" data-id="" data-cat="hat" style="display:flex; align-items:center; padding:4px 8px; border-radius:12px; border:${none ? '2px solid #ff00ff' : '1px solid rgba(255,255,255,0.15)'}; cursor:pointer; background:${none ? 'rgba(255,0,255,0.1)' : 'rgba(255,255,255,0.03)'};"><span style="font-size:0.5rem; color:${none ? '#fff' : '#999'};">None</span></div>`;
                }
                if (slot.category === 'jewelry' && !owned.length) {
                    html += `<span style="font-size:0.45rem; color:#777;">None owned yet. Find jewelry at Neural Systems.</span>`;
                }
                html += `</div></div>`;
            }
            // M.A.S.K: her field mask: Auto (on in the field, off at home), always On, or Off
            const mm = game.cosmetics.maskMode || 'auto';
            html += `<div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,0,255,0.15); border-radius:6px; padding:8px 10px;">`;
            html += `<div style="font-family:Orbitron,sans-serif; font-size:0.5rem; color:#ff00ff; letter-spacing:2px; margin-bottom:4px;">M.A.S.K</div><div style="display:flex; gap:4px; flex-wrap:wrap;">`;
            for (const [mode, label, dot] of [['auto', 'Auto', 'linear-gradient(90deg,#6a2a7a 50%,#888 50%)'], ['on', 'On', '#6a2a7a'], ['off', 'Off', '#555']]) {
                const on = mm === mode;
                html += `<div class="neume-mask" data-mode="${mode}" style="display:flex; align-items:center; gap:4px; padding:4px 8px; border-radius:12px; border:${on ? '2px solid #ff00ff' : '1px solid rgba(255,255,255,0.15)'}; cursor:pointer; background:${on ? 'rgba(255,0,255,0.1)' : 'rgba(255,255,255,0.03)'};"><div style="width:10px;height:10px;border-radius:50%;background:${dot};flex-shrink:0;"></div><span style="font-size:0.5rem; color:${on ? '#fff' : '#999'};">${label}</span></div>`;
            }
            html += `</div></div>`;
            loadout.innerHTML = html;

            loadout.querySelectorAll('.neume-mask').forEach(chip => {
                chip.addEventListener('click', () => { game.cosmetics.maskMode = chip.dataset.mode; triggerSequencingEffect(); });
            });

            // Bind chip clicks
            loadout.querySelectorAll('.neume-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    const id = chip.dataset.id, cat = chip.dataset.cat;
                    if (cat === 'accessory' && !id) game.cosmetics.unequipAccessory();
                    else if (cat === 'hat' && !id) game.cosmetics.unequipHat();
                    else if (cat === 'jewelry' && game.cosmetics.isEquipped(id)) game.cosmetics.unequipJewelry(id);   // jewelry toggles
                    else game.cosmetics.equip(id);
                    triggerSequencingEffect();
                });
            });
            loadout.querySelectorAll('.neume-drink').forEach(chip => {
                chip.addEventListener('click', () => {
                    game.cosmetics.setAccessoryOption(chip.dataset.acc, 'drink', chip.dataset.drink);
                    triggerSequencingEffect();
                });
            });
        }
        
        function triggerSequencingEffect() {
            updateNeumeUI();
            statusText.style.opacity = '1';
            audioSys.sfx('ui');
            setTimeout(() => { statusText.style.opacity = '0'; }, 1500);
        }

        
        // Close phone with Escape key
        // Close phone OR Map with Escape key
        document.addEventListener('keydown', (e) => {
            // 1. Handle ESCAPE - Pause Menu Priority
            if (e.key === 'Escape') {
                // If pause menu is open, close it
                if (pauseMenu && pauseMenu.isOpen) {
                    pauseMenu.close();
                    return;
                }
                
                // Close Phone if open
                if (phoneSystem.overlay.style.display === 'flex') {
                    phoneSystem.close();
                    return;
                }
                
                // Close Golden Map if open
                const mapUI = document.getElementById('map-interface');
                if (mapUI.style.display === 'block') {
                    game.ui.toggleMap(false);
                    return;
                }
                
                // Close Inventory if open
                const inventoryMenu = document.getElementById('freelancer-menu');
                if (inventoryMenu.style.display !== 'none' && inventoryMenu.style.display !== '') {
                    game.inventory.toggleMenu();
                    return;
                }
                
                // Close whichever shop or menu is open (each through its own close, so pauses are released)
                const SHOPS = [
                    ['cosmetics-shop-overlay', () => document.getElementById('cosmetics-shop-close').click()],
                    ['auto-shop-overlay', () => game.closeAutoShop()],
                    ['augment-shop', () => document.getElementById('aug-shop-close').click()],
                    ['zib-menu', () => game.closeZibMenu()],
                    ['gauntlet-menu', () => game.closeGauntletMenu()],
                    ['tuning-overlay', () => game.closeTuning()],
                    ['vending-menu', () => game.closeVendingMenu()]
                ];
                for (const [id, close] of SHOPS) {
                    const el = document.getElementById(id);
                    if (el && getComputedStyle(el).display !== 'none') { close(); return; }
                }
                
                // Otherwise, toggle pause menu (if game is running)
                if (game.running && pauseMenu) {
                    pauseMenu.toggle();
                }
            }
            
            // Pause Menu Navigation (when pause menu is open)
            if (pauseMenu && pauseMenu.isOpen) {
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    pauseMenu.navigateUp();
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    pauseMenu.navigateDown();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    pauseMenu.selectCurrent();
                }
                return; // Don't process other keys when pause menu is open
            }
        
            // 2. Handle 'M' Key (Smart Toggle)
            if (e.key === 'm' || e.key === 'M') {
                if (game.running && !game.paused) {
                    const mapUI = document.getElementById('map-interface');
                    const isClosed = mapUI.style.display === 'none' || mapUI.style.display === '';
                    
                    if (isClosed) {
                        game.ui.toggleMap(true);
                    } else {
                        game.ui.toggleMap(false);
                    }
                }
            }
        
            // 3. Handle 'P' Key (Phone)
            if (e.key === 'p' || e.key === 'P') {
                if (phoneSystem.overlay.style.display === 'flex') {
                    phoneSystem.close();
                } else if (!game.paused) {
                    phoneSystem.open();
                }
            }
            
            // 4. Handle 'B' Key (Back - closes map/inventory)
            if (e.key === 'b' || e.key === 'B') {
                // Close Golden Map if open
                const mapUI = document.getElementById('map-interface');
                if (mapUI.style.display === 'block') {
                    game.ui.toggleMap(false);
                    return;
                }
                // Close Inventory if open
                const inventoryMenu = document.getElementById('freelancer-menu');
                if (inventoryMenu.style.display !== 'none' && inventoryMenu.style.display !== '') {
                    game.inventory.toggleMenu();
                    return;
                }
            }
            
            // 5. Handle 'E' Key (Interact - talk, enter car, etc.)
            if ((e.key === 'e' || e.key === 'E') && game.running && !game.paused) game.interact();   // the same action as the pill (engine/events.js)
            
            // 6. Handle 'F' Key (Use Transition Point)
            if ((e.key === 'f' || e.key === 'F') && game.running && !game.paused) {
                // Check if player is in a transition zone
                if (game.activeMap.transitions && !game.isDriving) {
                    const t = game._transitionGrid.query(game.player.x, game.player.y);
                    if (t) {
                        game.triggerTransition();
                    }
                }
            }

            // 7. Handle 'T' Key (Zib Teleport to Destination)
            if ((e.key === 't' || e.key === 'T') && game.running && !game.paused) {
                if (game.zibSystem && game.zibSystem.isPassenger) {
                    game.zibSystem.teleportToDestination(game);
                    if (game.zibSkipBtn) game.zibSkipBtn.style.display = 'none';
                }
            }
        });
        
