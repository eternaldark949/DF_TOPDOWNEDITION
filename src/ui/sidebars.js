        // --- SIDEBAR SYSTEM (Phase 2) ---
        // Manages collapsible sidebars for map and inventory screens
        
        class SidebarController {
            constructor(config) {
                this.leftSidebar = document.getElementById(config.leftId);
                this.rightSidebar = document.getElementById(config.rightId);
                this.leftHandle = document.getElementById(config.leftHandleId);
                this.rightHandle = document.getElementById(config.rightHandleId);
                this.mainContent = document.getElementById(config.mainContentId);
                this.canvas = config.canvasId ? document.getElementById(config.canvasId) : null;
                
                this.leftCollapsed = false;
                this.rightCollapsed = false;
                this.mobileBreakpoint = 700;
                
                // Filter state
                this.filterEnabled = true; // ON by default (toggle starts "on")
                this.activeFilter = null;  // Will be set from first active filter-item
                this.onFilterChange = config.onFilterChange || null; // Callback when filter changes
                
                this.init();
            }
            
            init() {
                // Handle clicks
                if (this.leftHandle) {
                    this.leftHandle.addEventListener('click', () => this.toggleLeft());
                }
                if (this.rightHandle) {
                    this.rightHandle.addEventListener('click', () => this.toggleRight());
                }
                
                // Check initial screen size
                this.checkMobile();
                window.addEventListener('resize', () => this.checkMobile());
                
                // Filter item clicks
                const filterItems = this.rightSidebar?.querySelectorAll('.filter-item');
                filterItems?.forEach(item => {
                    // Set initial active filter
                    if (item.classList.contains('active')) {
                        this.activeFilter = item.dataset.filter;
                    }
                    
                    item.addEventListener('click', () => {
                        filterItems.forEach(i => i.classList.remove('active'));
                        item.classList.add('active');
                        this.activeFilter = item.dataset.filter;
                        
                        // Trigger callback
                        if (this.onFilterChange) {
                            this.onFilterChange(this.filterEnabled, this.activeFilter);
                        }
                    });
                });
                
                // Filter toggle
                const filterToggle = this.rightSidebar?.querySelector('.filter-toggle-track');
                if (filterToggle) {
                    filterToggle.addEventListener('click', () => {
                        filterToggle.classList.toggle('on');
                        this.filterEnabled = filterToggle.classList.contains('on');
                        const labels = this.rightSidebar.querySelectorAll('.filter-toggle-labels span');
                        labels.forEach(l => l.classList.toggle('active'));
                        
                        // Trigger callback
                        if (this.onFilterChange) {
                            this.onFilterChange(this.filterEnabled, this.activeFilter);
                        }
                    });
                }
                
                // Nav item clicks (for future screen switching)
                const navItems = this.leftSidebar?.querySelectorAll('.sidebar-nav-item');
                navItems?.forEach(item => {
                    item.addEventListener('click', () => {
                        const screen = item.dataset.screen;
                        // For now, just highlight - future: switch screens
                        navItems.forEach(i => i.classList.remove('active'));
                        item.classList.add('active');
                        
                        // Handle special navigation
                        // Helper: hide all sub-screens
                        const hideSubScreens = () => {
                            document.getElementById('augments-screen').style.display = 'none';
                            document.getElementById('skills-screen').style.display = 'none';
                            document.getElementById('contacts-screen').style.display = 'none';
                            document.getElementById('team-screen').style.display = 'none';
                            document.getElementById('character-screen').style.display = 'none';
                            document.getElementById('story-screen').style.display = 'none';
                            document.getElementById('collection-screen').style.display = 'none';
                        };
                        
                        if (screen === 'map' && this.canvas) {
                            // Already on map
                        } else if (screen === 'inventory' && !this.canvas) {
                            // Already on inventory - make sure inventory content is visible
                            document.getElementById('inventory-list-container').style.display = '';
                            hideSubScreens();
                            document.getElementById('screen-title-text').textContent = 'Inventory';
                        } else if (screen === 'map') {
                            // Switch to map from inventory
                            game.inventory.toggleMenu();
                            game.ui.toggleMap(true);
                        } else if (screen === 'inventory') {
                            // Switch to inventory from map
                            game.ui.toggleMap(false);
                            game.inventory.toggleMenu();
                        } else if (screen === 'augments') {
                            // Show augments management inline (not shop popup)
                            if (this.canvas) {
                                // From map: switch to inventory screen first
                                game.ui.toggleMap(false);
                                game.inventory.toggleMenu();
                            }
                            document.getElementById('inventory-list-container').style.display = 'none';
                            hideSubScreens();
                            document.getElementById('augments-screen').style.display = 'block';
                            document.getElementById('screen-title-text').textContent = 'Augments';
                            game.renderAugmentManagement();
                        } else if (screen === 'skills') {
                            // Resonance: level, unsettled, the trees (Dr. Yin is where you spend)
                            if (this.canvas) { game.ui.toggleMap(false); game.inventory.toggleMenu(); }
                            document.getElementById('inventory-list-container').style.display = 'none';
                            hideSubScreens();
                            document.getElementById('skills-screen').style.display = 'block';
                            document.getElementById('screen-title-text').textContent = 'Skills';
                            game.renderSkillsScreen();
                        } else if (screen === 'contacts') {
                            // Show contacts screen
                            if (this.canvas) {
                                game.ui.toggleMap(false);
                                game.inventory.toggleMenu();
                            }
                            document.getElementById('inventory-list-container').style.display = 'none';
                            hideSubScreens();
                            document.getElementById('contacts-screen').style.display = 'block';
                            document.getElementById('screen-title-text').textContent = 'Contacts';
                            game.renderContactsScreen();
                        } else if (screen === 'team') {
                            // Show team management screen
                            if (this.canvas) {
                                game.ui.toggleMap(false);
                                game.inventory.toggleMenu();
                            }
                            document.getElementById('inventory-list-container').style.display = 'none';
                            hideSubScreens();
                            document.getElementById('team-screen').style.display = 'block';
                            document.getElementById('screen-title-text').textContent = 'Team';
                            game.renderTeamScreen();
                        } else if (screen === 'character') {
                            // Show character screen
                            if (this.canvas) {
                                game.ui.toggleMap(false);
                                game.inventory.toggleMenu();
                            }
                            document.getElementById('inventory-list-container').style.display = 'none';
                            hideSubScreens();
                            document.getElementById('character-screen').style.display = 'block';
                            document.getElementById('screen-title-text').textContent = 'Character';
                            game.renderCharacterScreen();
                        } else if (screen === 'story') {
                            // Show story/missions screen
                            if (this.canvas) {
                                game.ui.toggleMap(false);
                                game.inventory.toggleMenu();
                            }
                            document.getElementById('inventory-list-container').style.display = 'none';
                            hideSubScreens();
                            document.getElementById('story-screen').style.display = 'block';
                            document.getElementById('screen-title-text').textContent = 'Story';
                            game.renderStoryScreen();
                        } else if (screen === 'collection') {
                            // Show collection screen
                            if (this.canvas) {
                                game.ui.toggleMap(false);
                                game.inventory.toggleMenu();
                            }
                            document.getElementById('inventory-list-container').style.display = 'none';
                            hideSubScreens();
                            document.getElementById('collection-screen').style.display = 'block';
                            document.getElementById('screen-title-text').textContent = 'Collection';
                            game.renderCollectionScreen();
                        }
                        
                        // Sync inventory sidebar highlight when switching from map
                        if (typeof invSidebar !== 'undefined') invSidebar.setActiveNav(screen);
                        // Sync map sidebar when switching from inventory
                        if (typeof mapSidebar !== 'undefined') mapSidebar.setActiveNav(screen);
                    });
                });
            }
            
            checkMobile() {
                const isMobile = window.innerWidth <= this.mobileBreakpoint || (window.innerWidth > window.innerHeight && window.innerHeight <= 540);   // or a phone on its side
                
                if (isMobile) {
                    // Auto-collapse on mobile
                    this.leftSidebar?.classList.add('auto-collapse');
                    this.rightSidebar?.classList.add('auto-collapse');
                    this.leftHandle?.classList.add('mobile-visible', 'visible');
                    this.rightHandle?.classList.add('mobile-visible', 'visible');
                    
                    // Update content margins
                    this.mainContent?.classList.add('sidebar-left-collapsed', 'sidebar-right-collapsed');
                    
                    this.leftCollapsed = true;
                    this.rightCollapsed = true;
                } else {
                    // Expand on desktop
                    this.leftSidebar?.classList.remove('auto-collapse', 'collapsed');
                    this.rightSidebar?.classList.remove('auto-collapse', 'collapsed');
                    this.leftHandle?.classList.remove('mobile-visible', 'visible');
                    this.rightHandle?.classList.remove('mobile-visible', 'visible');
                    
                    this.mainContent?.classList.remove('sidebar-left-collapsed', 'sidebar-right-collapsed');
                    
                    this.leftCollapsed = false;
                    this.rightCollapsed = false;
                }
            }
            
            toggleLeft() {
                this.leftCollapsed = !this.leftCollapsed;
                
                if (this.leftCollapsed) {
                    this.leftSidebar?.classList.add('collapsed');
                    this.mainContent?.classList.add('sidebar-left-collapsed');
                } else {
                    this.leftSidebar?.classList.remove('collapsed', 'auto-collapse');
                    this.mainContent?.classList.remove('sidebar-left-collapsed');
                }
            }
            
            toggleRight() {
                this.rightCollapsed = !this.rightCollapsed;
                
                if (this.rightCollapsed) {
                    this.rightSidebar?.classList.add('collapsed');
                    this.mainContent?.classList.add('sidebar-right-collapsed');
                } else {
                    this.rightSidebar?.classList.remove('collapsed', 'auto-collapse');
                    this.mainContent?.classList.remove('sidebar-right-collapsed');
                }
            }
            
            // Update the active navigation item
            setActiveNav(screenName) {
                const navItems = this.leftSidebar?.querySelectorAll('.sidebar-nav-item');
                navItems?.forEach(item => {
                    if (item.dataset.screen === screenName) {
                        item.classList.add('active');
                    } else {
                        item.classList.remove('active');
                    }
                });
            }
        }
        
        // Initialize sidebars when document is ready
        const invSidebar = new SidebarController({
            leftId: 'inv-sidebar-left',
            rightId: 'inv-sidebar-right',
            leftHandleId: 'inv-handle-left',
            rightHandleId: 'inv-handle-right',
            mainContentId: 'inv-main-content',
            onFilterChange: (enabled, filter) => {
                // Re-render inventory when filter changes
                if (game && game.inventory) {
                    game.inventory.render();
                }
            }
        });
        
        const mapSidebar = new SidebarController({
            leftId: 'map-sidebar-left',
            rightId: 'map-sidebar-right',
            leftHandleId: 'map-handle-left',
            rightHandleId: 'map-handle-right',
            canvasId: 'golden-map-canvas',
            onFilterChange: (enabled, filter) => {
                // Map re-renders automatically via animateIcons loop
                // No action needed here, but could force a cache update if needed
            }
        });
        
