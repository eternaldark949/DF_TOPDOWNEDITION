        // --- SCREENS: the one way the sidebar-nav screens open and close ---
        // Two panels: #map-interface (the golden map) and #freelancer-menu (every other
        // screen, as a sub-screen of #inv-main-content). Screens.open(name) closes the other
        // panel, hides every sub-screen, shows the one asked for, sets the title, the right
        // sidebar (the item filter only where it filters) and both nav highlights.
        // toggleMap / toggleMenu, the dock, pause menu, armory and the Esc / B / M keys all
        // come through here, so two screens can never stack.

        const Screens = {
            current: null,      // the open screen's name, or null when both panels are shut

            // name → [sub-screen id, title, render]
            SUBS: {
                inventory:  ['inventory-list-container', 'Inventory',  () => game.inventory.render()],
                equipped:   ['inventory-list-container', 'Equipped',   () => game.inventory.render()],
                story:      ['story-screen',      'Story',      () => game.renderStoryScreen()],
                augments:   ['augments-screen',   'Augments',   () => game.renderAugmentManagement()],
                character:  ['character-screen',  'Character',  () => game.renderCharacterScreen()],
                team:       ['team-screen',       'Team',       () => game.renderTeamScreen()],
                contacts:   ['contacts-screen',   'Contacts',   () => game.renderContactsScreen()],
                skills:     ['skills-screen',     'Skills',     () => game.renderSkillsScreen()],
                collection: ['collection-screen', 'Collection', () => game.renderCollectionScreen()]
            },
            FILTERED: { inventory: true, equipped: true },   // screens the item filter applies to

            _menu() { return document.getElementById('freelancer-menu'); },
            menuOpen() { const m = this._menu(); return !!m && m.style.display !== 'none' && m.style.display !== ''; },
            mapOpen() { return document.getElementById('map-interface')?.style.display === 'block'; },

            open(name) {
                if (name === 'map') {
                    this._showMenu(false);
                    if (!this.mapOpen()) game.ui._showMap(true);
                } else {
                    const sub = this.SUBS[name];
                    if (!sub) return;
                    if (this.mapOpen()) game.ui._showMap(false);
                    this._showMenu(true);
                    const ids = new Set(Object.values(this.SUBS).map(s => s[0]));
                    ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
                    document.getElementById(sub[0]).style.display = sub[0] === 'inventory-list-container' ? '' : 'block';
                    document.getElementById('screen-title-text').textContent = sub[1];
                    this.current = name;    // set before render: the inventory list reads it for EQUIPPED
                    this._menu().classList.toggle('no-filter', !this.FILTERED[name]);
                    sub[2]();
                }
                this.current = name;
                if (typeof invSidebar !== 'undefined') invSidebar.setActiveNav(name);
                if (typeof mapSidebar !== 'undefined') mapSidebar.setActiveNav(name);
            },

            close() {
                if (this.mapOpen()) game.ui._showMap(false);
                this._showMenu(false);
                this.current = null;
            },

            // open `name`, or close it when it's the screen already showing
            toggle(name) { if (this.current === name && (this.menuOpen() || this.mapOpen())) this.close(); else this.open(name); },

            _showMenu(show) {
                const m = this._menu();
                if (!m || show === this.menuOpen()) return;
                if (show) {
                    m.style.display = 'flex';
                    game.pauseSystem.acquire('inventory_menu');
                    game.renderSidebarPortrait();
                } else {
                    m.style.display = 'none';
                    game.pauseSystem.release('inventory_menu');
                    document.querySelectorAll('#inventory-list .ui-pill.expanded').forEach(p => p.classList.remove('expanded'));
                }
            }
        };
