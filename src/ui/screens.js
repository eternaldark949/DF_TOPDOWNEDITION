        // --- SCREENS: the one way the sidebar-nav screens open and close ---
        // One menu, #freelancer-menu, with one left sidebar (portrait, nav, Back) for every screen.
        // The map (#map-interface) is a full-bleed layer inside it, under the sidebars, with its own
        // Filter sidebar in place of the item filter; every other screen is a sub-screen of
        // #inv-main-content. Screens.open(name) hides every sub-screen (and the map), shows the one
        // asked for, sets the title, the right sidebar and the nav highlight. Only the centre (and,
        // to or from the map, the filter list) changes: the left sidebar stays exactly where it is.
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
                const main = document.getElementById('inv-main-content');
                if (name === 'map') {
                    this._showMenu(true);
                    this._menu().classList.add('map-on');
                    this._menu().classList.remove('no-filter');
                    if (main) main.style.visibility = 'hidden';            // the map is the centre now (kept in layout: no reflow)
                    if (!this.mapOpen()) game.ui._showMap(true);
                } else {
                    const sub = this.SUBS[name];
                    if (!sub) return;
                    if (this.mapOpen()) game.ui._showMap(false);
                    this._showMenu(true);
                    this._menu().classList.remove('map-on');
                    if (main) main.style.visibility = '';
                    const ids = new Set(Object.values(this.SUBS).map(s => s[0]));
                    ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
                    document.getElementById(sub[0]).style.display = sub[0] === 'inventory-list-container' ? '' : 'block';
                    document.getElementById('screen-title-text').textContent = sub[1];
                    this.current = name;    // set before render: the inventory list reads it for EQUIPPED
                    this._menu().classList.toggle('no-filter', !this.FILTERED[name]);
                    sub[2]();
                }
                this.current = name;
                syncHudInput(game);
                if (typeof invSidebar !== 'undefined') invSidebar.setActiveNav(name);
            },

            close() {
                if (this.mapOpen()) game.ui._showMap(false);
                this._showMenu(false);
                this._menu()?.classList.remove('map-on');
                const main = document.getElementById('inv-main-content');
                if (main) main.style.visibility = '';
                this.current = null;
            },

            // open `name`, or close it when it's the screen already showing
            toggle(name) { if (this.current === name && (this.menuOpen() || this.mapOpen())) this.close(); else this.open(name); },

            _showMenu(show) {
                const m = this._menu();
                if (!m || show === this.menuOpen()) return;
                if (show) {
                    m.style.display = 'flex';
                    document.body.classList.add('screen-menu-open');      // the HUD steps out from behind it (styles/dossier.css)
                    game.pauseSystem.acquire('inventory_menu');
                    game.renderSidebarPortrait();
                } else {
                    m.style.display = 'none';
                    document.body.classList.remove('screen-menu-open');
                    game.pauseSystem.release('inventory_menu');
                    document.querySelectorAll('#inventory-list .ui-pill.expanded').forEach(p => p.classList.remove('expanded'));
                }
                syncHudInput(game);
            }
        };
