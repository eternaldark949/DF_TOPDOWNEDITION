        class MusicWidgetSystem {
            constructor(gameEngine) {
                this.game = gameEngine;
                this.widget = document.getElementById('music-widget');
                this.stationCapsule = document.getElementById('mw-station-capsule');
                this.brandText = document.getElementById('mw-brand-text');
                this.playBtn = document.getElementById('mw-play-btn');
                this.trackText = document.getElementById('mw-track-text');
                this.node = document.getElementById('mw-node');
                this.recallNode = document.getElementById('music-recall-node'); // NEW
                this.uploadInput = document.getElementById('music-upload-widget');
                
                // Audio Setup - share AudioContext with AudioSystem (saves ~2-4MB)
                this.audioCtx = audioSys.ctx;
                this.audioElement = new Audio();
                this.audioElement.loop = true;
                this.trackSource = this.audioCtx.createMediaElementSource(this.audioElement);
                this.trackSource.connect(audioSys.masterGain); // Route through master mute bus
                this._currentBlobUrl = null; // Track ObjectURL for cleanup
                
                // Stations
                this.stations = [
                    { name: 'Wave Radio', class: 'theme-wave' },
                    { name: 'MUNE', class: 'theme-mune' },
                    { name: 'Sweet Fruit', class: 'theme-sweet' },
                    { name: 'LUXE', class: 'theme-luxe' },
                    { name: 'LADY', class: 'theme-lady' },
                    { name: 'GENT', class: 'theme-gent' },
                    { name: 'Love Chem', class: 'theme-love' }
                ];
                this.currentStationIdx = 0;
                this.isPlaying = false;
                
                // State
                this.isDragging = false;
                this.isStashed = true;
                this.lastTapTime = 0; 
                
                this.initEvents();
            }
            
            initEvents() {
                // ... (Keep existing Play/Station/Upload listeners) ...
                // 1. Cycle Station
                this.stationCapsule.addEventListener('mousedown', (e) => { e.stopPropagation(); this.cycleStation(); });
                this.stationCapsule.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.cycleStation(); }, { passive: false });
                
                // 2. Play/Pause
                this.playBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); this.handlePlayClick(); });
                this.playBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.handlePlayClick(); }, { passive: false });
                
                // 3. File Upload
                this.uploadInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        // Revoke previous blob URL to free memory
                        if (this._currentBlobUrl) {
                            URL.revokeObjectURL(this._currentBlobUrl);
                        }
                        this._currentBlobUrl = URL.createObjectURL(file);
                        this.audioElement.src = this._currentBlobUrl;
                        this.trackText.textContent = file.name.replace(/\.[^/.]+$/, "");
                        this.togglePlay(true);
                    }
                });
        
                // --- DRAG & STASH LOGIC ---
                
                // A. Widget Node (Drag/Stash)
                const handleNodeInput = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    // Pass touch object if available, else mouse event
                    const input = e.touches ? e.touches[0] : e;
                    this.handleNodeInteraction(input);
                };
        
                this.node.addEventListener('mousedown', handleNodeInput);
                this.node.addEventListener('touchstart', handleNodeInput, {passive: false});
                
                // B. Recall Node (Unstash) - NEW
                const handleRecall = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    this.toggleStash(); // Bring it back
                };
                this.recallNode.addEventListener('mousedown', handleRecall);
                this.recallNode.addEventListener('touchstart', handleRecall, {passive: false});
        
                // C. Global Drag Movement
                window.addEventListener('mousemove', (e) => { if(this.isDragging) this.moveDrag(e.clientX, e.clientY); });
                window.addEventListener('touchmove', (e) => { if(this.isDragging) this.moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, {passive: false});
                window.addEventListener('mouseup', () => { this.stopDrag(); });
                window.addEventListener('touchend', () => { this.stopDrag(); });
                
                // D. Unlock Audio
                window.addEventListener('click', () => { if (this.audioCtx.state === 'suspended') this.audioCtx.resume(); }, { once: true });
                window.addEventListener('touchstart', () => { if (this.audioCtx.state === 'suspended') this.audioCtx.resume(); }, { once: true });
            }
            
            handleNodeInteraction(input) {
                const now = _frameTime;
                const timeDiff = now - this.lastTapTime;
                
                // DOUBLE TAP -> STASH
                if (timeDiff < 300 && timeDiff > 0) {
                    this.toggleStash();
                    this.isDragging = false; 
                } else {
                    // SINGLE TAP -> DRAG START
                    this.startDrag(input.clientX, input.clientY);
                }
                
                this.lastTapTime = now;
            }
            
            toggleStash() {
                this.isStashed = !this.isStashed;
                
                if (this.isStashed) {
                    // Hide Widget, Show Recall Node
                    this.widget.classList.add('stashed');
                    this.recallNode.classList.add('visible');
                    
                    // Reset position to center so it slides down cleanly from the middle
                    // (Optional: remove this if you want it to drop down from wherever it was dragged)
                    this.widget.style.left = '50%';
                    this.widget.style.top = 'auto';
                    this.widget.style.bottom = '30px'; 
                    this.widget.style.transform = ''; 
                    
                } else {
                    // Show Widget, Hide Recall Node
                    this.widget.classList.remove('stashed');
                    this.recallNode.classList.remove('visible');
                    
                    // Ensure it pops back to center-bottom
                    this.widget.style.left = '50%';
                    this.widget.style.bottom = '30px';
                    this.widget.style.top = 'auto';
                    this.widget.style.transform = 'translateX(-50%)';
                }
            }
        
            // ... (Keep existing startDrag, moveDrag, stopDrag, cycleStation, togglePlay methods) ...
            startDrag(clientX, clientY) {
                this.isDragging = true;
                const rect = this.widget.getBoundingClientRect();
                this.dragOffsetX = clientX - rect.left;
                this.dragOffsetY = clientY - rect.top;
                this.widget.style.cursor = 'grabbing';
            }
            
            moveDrag(clientX, clientY) {
                this.widget.style.transform = 'none'; 
                this.widget.style.bottom = 'auto'; 
                this.widget.style.left = `${clientX - this.dragOffsetX}px`;
                this.widget.style.top = `${clientY - this.dragOffsetY}px`;
            }
            
            stopDrag() {
                this.isDragging = false;
                this.widget.style.cursor = 'grab';
            }
            
            handlePlayClick() {
                if (!this.audioElement.src || this.audioElement.src === '') {
                    this.uploadInput.click();
                } else {
                    this.togglePlay();
                }
            }
            
            cycleStation() {
                this.currentStationIdx = (this.currentStationIdx + 1) % this.stations.length;
                const station = this.stations[this.currentStationIdx];
                this.brandText.textContent = station.name;
                this.widget.className = ''; 
                this.widget.classList.add(station.class);
                
                if (station.name === 'GENT' || station.name === 'Love Chem' || station.name === 'LUXE') {
                    this.brandText.style.color = '#333';
                    this.playBtn.style.color = '#333';
                } else {
                    this.brandText.style.color = '#fff';
                    this.playBtn.style.color = '#fff';
                }
            }
            
            togglePlay(forcePlay = null) {
                const shouldPlay = forcePlay !== null ? forcePlay : !this.isPlaying;
                if (shouldPlay) {
                    this.audioCtx.resume().then(() => {
                        this.audioElement.play();
                        this.isPlaying = true;
                        this.playBtn.textContent = '❚❚';
                    });
                } else {
                    this.audioElement.pause();
                    this.isPlaying = false;
                    this.playBtn.textContent = '▶';
                }
            }
        }
        
