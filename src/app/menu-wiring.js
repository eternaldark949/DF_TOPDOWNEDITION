        const game = new GameEngine();

        // ──────────────────────────────────────────────────────────────────────
        // FREELANCER MENU NAV — single source of truth for the sidebar items.
        // Both #map-interface and #freelancer-menu have a <nav class="sidebar-nav">
        // with a `data-nav-screen` attribute marking which screen owns it. We
        // populate both from this list so adding/renaming/reordering a screen
        // happens in exactly one place.
        // ──────────────────────────────────────────────────────────────────────
        const FREELANCER_NAV_ITEMS = [
            { screen: 'story',      label: 'STORY/MISSIONS' },
            { screen: 'augments',   label: 'AUGMENTS' },
            { screen: 'character',  label: 'CHARACTER' },
            { screen: 'team',       label: 'TEAM' },
            { screen: 'contacts',   label: 'CONTACTS' },
            { screen: 'inventory',  label: 'INVENTORY' },
            { screen: 'map',        label: 'MAP' },
            { screen: 'equipped',   label: 'EQUIPPED' },
            { screen: 'skills',     label: 'SKILLS' },
            { screen: 'collection', label: 'COLLECTION' },
        ];
        function populateFreelancerNavs() {
            document.querySelectorAll('nav.sidebar-nav[data-nav-screen]').forEach(navEl => {
                const ownerScreen = navEl.dataset.navScreen; // 'map' or 'inventory'
                navEl.innerHTML = FREELANCER_NAV_ITEMS.map(item => {
                    const activeClass = item.screen === ownerScreen ? ' active' : '';
                    return `<div class="sidebar-nav-item${activeClass}" data-screen="${item.screen}">${item.label}</div>`;
                }).join('');
            });
        }
        populateFreelancerNavs();

        const mainMenuList = document.getElementById('main-menu-list');
        const storyModeList = document.getElementById('story-mode-list');
        const mainMenuDiv = document.getElementById('main-menu');

        document.getElementById('btn-new-game').addEventListener('click', () => { FullscreenManager.requestIfEnabled(); mainMenuList.classList.add('hidden'); storyModeList.classList.remove('hidden'); });
        document.getElementById('btn-story-949').addEventListener('click', () => { 
            // 1. Initialize Audio Context (Browser requirement)
            audioSys.init(); 
            audioSys.sfx('ui'); 
            
            // 2. Reset all game state to new-game defaults
            game.resetGameState();
            
            // 3. Fade out the Menu Text
            mainMenuDiv.style.opacity = '0'; 
            
            // 4. Wait for fade (500ms), then Swap Layers & Start
            setTimeout(() => { 
                // HIDE the Menu Layer completely
                document.getElementById('ui-layer').style.display = 'none';
                
                // SHOW the Game Canvas
                document.getElementById('game-container').style.display = 'block';
                
                // Start the Engine & Story
                game.story.startPrologue(); 
                game.running = true;
                game.loop();
            }, 500); 
        });
        document.getElementById('btn-story-747').addEventListener('click', () => { showMessage("TIMELINE 747 LOCKED."); });
        document.getElementById('btn-story-back').addEventListener('click', () => { storyModeList.classList.add('hidden'); mainMenuList.classList.remove('hidden'); });
        document.getElementById('btn-game-exit').addEventListener('click', () => { game.stop(); });
        document.getElementById('btn-exit').addEventListener('click', () => showMessage("TERMINATING SESSION"));
        
