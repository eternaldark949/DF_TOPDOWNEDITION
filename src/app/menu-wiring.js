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

        // Tap to begin: the one gesture the browser needs — fullscreen, the landscape lock, the sound — then the menu
        (() => {
            const ttb = document.getElementById('tap-to-begin');
            if (!ttb) return;
            const evs = ['pointerup', 'touchend', 'keydown'];
            const begin = (e) => {
                evs.forEach(ev => ttb.removeEventListener(ev, begin));
                document.removeEventListener('keydown', begin);
                FullscreenManager.requestIfEnabled();
                OrientationManager.apply();
                try { audioSys.init(); } catch (err) { /* sound can wait for the next tap */ }
                if (typeof game !== 'undefined' && game && game.resize) game.resize();
                ttb.classList.add('gone');
                setTimeout(() => ttb.remove(), 650);
            };
            evs.forEach(ev => ttb.addEventListener(ev, begin));
            document.addEventListener('keydown', begin);
        })();

        document.getElementById('btn-new-game').addEventListener('click', () => { FullscreenManager.requestIfEnabled(); mainMenuList.classList.add('hidden'); storyModeList.classList.remove('hidden'); });
        let _starting = false;   // a second tap during the half-second fade would start a second prologue and loop
        document.getElementById('btn-story-949').addEventListener('click', () => { 
            if (_starting || game.running) return;
            _starting = true;
            // 1. Initialize Audio Context (Browser requirement)
            audioSys.init(); 
            audioSys.sfx('ui'); 
            
            // 2. Reset all game state to new-game defaults
            game.resetGameState();
            
            // 3. The menu fades as the loading screen comes up over it; under it, paint the Keeper's places a job
            //    a frame and decode her music, then start the prologue (story/scenes/prologue.js, then chapter 1)
            //    and let its first frames draw before the loading screen fades into its black
            mainMenuDiv.style.opacity = '0';
            const paint = game.keeperPreloadJobs();
            game.loadIntoWorld([
                { label: 'Opening the way', weight: 1, run: () => {} },
                ...paint.map((job, i) => ({ label: i < 2 ? 'Painting the Keeper\u2019s hill' : 'Lighting the parlour fire', weight: 2, run: job })),
                { label: 'Crossing over', weight: 3, run: (progress) => {
                    game.scenes.play('prologue').then(() => game.story.startPrologue());
                    game.enterWorld();
                    return game._settleUnderLoader(progress, { frames: 8, maxMs: 900 });
                } }
            ]).finally(() => { _starting = false; });
        });
        document.getElementById('btn-story-747').addEventListener('click', () => { showMessage("TIMELINE 747 LOCKED."); });
        document.getElementById('btn-story-back').addEventListener('click', () => { storyModeList.classList.add('hidden'); mainMenuList.classList.remove('hidden'); });
        document.getElementById('btn-exit').addEventListener('click', () => showMessage("TERMINATING SESSION"));
        
