        /* --- DIALOGUE CAPTION SYSTEM --- */
        const captionSystem = {
            element: document.getElementById('dialogue-caption'),
            speakerEl: null,
            textEl: null,
            isShowing: false,
            queue: [],
            cooldowns: {}, // Per-character cooldowns to prevent spam
            // Stable name classifications; current NPC names and dancer flags are read on every call.
            _greetingNames: new Map([
                ['Ms. Jean', ['msJean', true]], ['Dr. Yin', ['drYin', true]],
                ['Contractor', ['contractor', true]], ['Barista Ren', ['baristaRen', true]],
                ['LUVSH4D3', ['luvsh4d3', true]],
                ['Starlight', ['dancers', false]], ['Nova', ['dancers', false]],
                ['Cherry', ['dancers', false]], ['Blade', ['dancers', false]], ['Velvet', ['dancers', false]],
                ['Victoria', ['victoria', false]], ['Yenna', ['yenna', false]],
                ['Sabrina', ['sabrina', false]], ['Max', ['max', false]], ['Josh', ['josh', false]]
            ]),
            
            // Character-specific dialogue lines
            dialogues: {
                victoria: {
                    combat: [
                        "Eat lead, scumbag!",
                        "Too slow!",
                        "Is that all you've got?",
                        "Should've stayed home today.",
                        "Dance for me!",
                        "Another one bites the dust.",
                        "You picked the wrong fight.",
                        "Pathetic.",
                        "Keep 'em coming!",
                        "I could do this all day.",
                        "Hah! Amateur hour.",
                        "Next!",
                        "That the best this city's got?",
                        "Don't blink.",
                        "Boom. Headshot material."
                    ],
                    bumperHit: [
                        "GET WRECKED!",
                        "That's what a real driver looks like!",
                        "Outta my way!",
                        "Too slow, baby!",
                        "Bumper? More like DESTROYER.",
                        "Victoria: 1, You: hospital.",
                        "Did that hurt? Good.",
                        "Learn to drive!"
                    ],
                    bumperGotHit: [
                        "Oh HELL no!",
                        "You're gonna pay for that!",
                        "Lucky shot!",
                        "My car! You scratched my car!",
                        "That's it. It's personal now."
                    ],
                    idle: [
                        "Quiet... too quiet.",
                        "Where's the action?",
                        "Getting bored here, Freelancer.",
                        "These streets used to mean something.",
                        "Stay sharp.",
                        "I oughta go check on Ms. Plundt.",
                        "Could use a cold glass of Ms. Jean right about now."
                    ],
                    greeting: [
                        "Ready when you are.",
                        "Let's cause some chaos.",
                        "About time. Let's move."
                    ]
                },
                yenna: {
                    combat: [
                        "Target down.",
                        "Clean shot.",
                        "Next.",
                        "Scope's clear.",
                        "They never see it coming.",
                        "Patience pays.",
                        "One round. One kill.",
                        "Sighted."
                    ],
                    bumperHit: [
                        "Calculated.",
                        "Predictable trajectory.",
                        "You drove right into that.",
                        "Precision, even in bumper cars.",
                        "Lined up. Executed."
                    ],
                    bumperGotHit: [
                        "Noted.",
                        "Adjusting approach.",
                        "Won't happen again.",
                        "...Acceptable trade."
                    ],
                    idle: [
                        "Eyes on the perimeter.",
                        "I see movement... no. Just wind.",
                        "Stay low, move quiet.",
                        "Patience. Always patience."
                    ],
                    greeting: [
                        "Freelancer.",
                        "I've got overwatch.",
                        "Say the word."
                    ]
                },
                sabrina: {
                    combat: [
                        "Oh, that looked painful. Good.",
                        "You're welcome for that.",
                        "Sarcasm and bullets — full service.",
                        "Was that supposed to be a threat?",
                        "I've seen scarier things in my coffee.",
                        "Don't thank me. Actually, do.",
                        "That's what you get.",
                        "Another day, another body."
                    ],
                    bumperHit: [
                        "Oops. Was that you? My bad. Not really.",
                        "Consider that a love tap.",
                        "I'm not even trying yet.",
                        "That's for existing in my lane.",
                        "Darkmancer express, no stops.",
                        "Physics says you lose."
                    ],
                    bumperGotHit: [
                        "Wow. Rude.",
                        "I will remember that.",
                        "Do you know how much this paint costs?",
                        "Oh, so we're doing this? Fine.",
                        "That's cute. Watch what happens next."
                    ],
                    idle: [
                        "This city smells like bad decisions.",
                        "I could be sleeping right now.",
                        "The things I do for personics...",
                        "Someone better be paying for this."
                    ],
                    greeting: [
                        "Oh, you again.",
                        "Let me guess. Trouble.",
                        "Fine. But I'm billing overtime."
                    ]
                },
                max: {
                    combat: [
                        "Fuck yeah!",
                        "That's what I'm talking about!",
                        "More! Send more!",
                        "Who's next?!",
                        "You pissed off the wrong one!",
                        "Lightning doesn't miss!",
                        "Come on! COME ON!",
                        "This is bullshit but I love it!"
                    ],
                    bumperHit: [
                        "YEAH! EAT BUMPER!",
                        "THAT'S WHAT HAPPENS!",
                        "MAX MOON DOES NOT BRAKE!",
                        "GET OUTTA MY FACE!",
                        "FULL SPEED BABY!",
                        "I AM THE CRASH!",
                        "BEEP BEEP MOTHERFUCKER!"
                    ],
                    bumperGotHit: [
                        "OH COME ON!",
                        "WHO DID THAT?! WHO?!",
                        "I'M GONNA FLIP THIS CAR!",
                        "THAT'S IT! NO MORE MISTER NICE MAX!",
                        "YOU JUST MADE A HUGE MISTAKE!"
                    ],
                    idle: [
                        "I swear this city gets worse.",
                        "Somebody give me something to shoot.",
                        "I'm about to lose it.",
                        "The hell are we waiting for?"
                    ],
                    greeting: [
                        "About damn time.",
                        "Finally. Action.",
                        "Let's break something."
                    ]
                },
                josh: {
                    combat: [
                        "Threat eliminated.",
                        "Confirmed.",
                        "As expected.",
                        "Predictable.",
                        "Target neutralized.",
                        "Intel was accurate.",
                        "Of course.",
                        "Efficient."
                    ],
                    bumperHit: [
                        "Collision vector optimal.",
                        "Impact registered.",
                        "As anticipated.",
                        "Angle of approach: correct.",
                        "Efficient use of momentum."
                    ],
                    bumperGotHit: [
                        "Recalculating.",
                        "Suboptimal outcome.",
                        "Data point collected.",
                        "I'll factor that in.",
                        "Interesting technique. Noted."
                    ],
                    idle: [
                        "Reviewing tactical data.",
                        "Perimeter secure. For now.",
                        "I have observations, if you're interested.",
                        "Standing by."
                    ],
                    greeting: [
                        "Reporting in.",
                        "Data is current.",
                        "Awaiting directives."
                    ]
                },
                msJean: {
                    greeting: [
                        "Ah, Freelancer... the spirits speak of you.",
                        "Welcome, wanderer.",
                        "The veil is thin tonight...",
                        "I sense great potential in you.",
                        "The ghosts remember your kindness.",
                        "Have you ever wondered what lies beyond?"
                    ],
                    nearCemetery: [
                        "So many stories here... so many regrets.",
                        "Can you hear them? The whispers?",
                        "This place holds such sorrow.",
                        "They're watching, you know."
                    ]
                },
                drYin: {
                    greeting: [
                        "Back for more augments?",
                        "Your vitals look acceptable.",
                        "Medicine or metal? Both available.",
                        "Try not to get shot out there."
                    ]
                },
                baristaRen: {
                    greeting: [
                        "Need a delivery run? Good PP in it.",
                        "Coffee's fresh. So are the bounties.",
                        "The Amber van's out front if you need work.",
                        "Freelancer! Got a package that needs moving."
                    ]
                },
                dancers: {
                    follow: [
                        "Lead the way, gorgeous!",
                        "Where to next?",
                        "This is so much better than the club!",
                        "Adventure time!",
                        "I've got your back... sort of.",
                        "Don't worry, I can keep up!",
                        "Ooh, this is exciting!",
                        "I hope we don't run into trouble..."
                    ],
                    combat: [
                        "Eek! Watch out!",
                        "Oh no oh no oh no!",
                        "Please don't let them hurt my face!",
                        "This wasn't in the job description!",
                        "Get them! Get them!",
                        "I believe in you!"
                    ]
                },
                gangers: {
                    aggro: [
                        "Fresh meat!",
                        "You're in the wrong neighborhood!",
                        "Get 'em!",
                        "Nobody walks through here free!",
                        "Time to pay the toll!",
                        "End of the line, Freelancer!"
                    ],
                    death: [
                        "Urgh... worth it...",
                        "You'll... pay for this...",
                        "Boss... avenge me..."
                    ]
                },
                contractor: {
                    greeting: [
                        "Got another job for you.",
                        "Business is business, Freelancer.",
                        "The shadows have eyes. Remember that."
                    ]
                },
                luvsh4d3: {
                    greeting: [
                        "WELCOME TO DOUBLE NIGHTS.",
                        "SCANNING... THREAT LEVEL: MINIMAL.",
                        "ENJOY YOUR STAY. COMPLIANCE IS APPRECIATED.",
                        "VIP AREA REQUIRES AUTHORIZATION."
                    ]
                }
            },
            
            init() {
                this.speakerEl = this.element.querySelector('.caption-speaker');
                this.textEl = this.element.querySelector('.caption-text');
            },
            
            getStyleClass(speaker) {
                const name = speaker.toLowerCase();
                if (name.includes('victoria')) return 'victoria';
                if (name.includes('jean')) return 'ms-jean';
                if (name.includes('ganger') || name.includes('drone')) return 'enemy';
                if (['starlight', 'nova', 'cherry', 'blade', 'velvet'].some(d => name.includes(d.toLowerCase()))) return 'dancer';
                return 'npc';
            },
            
            show(speaker, text, duration = 3000) {
                // Check cooldown for this speaker
                const now = Date.now();
                const cooldownKey = speaker.toLowerCase();
                if (this.cooldowns[cooldownKey] && now < this.cooldowns[cooldownKey]) {
                    return; // Still on cooldown
                }
                
                // Set cooldown (5-8 seconds between same character's lines)
                this.cooldowns[cooldownKey] = now + 5000 + Math.random() * 3000;
                
                // Queue the caption
                this.queue.push({ speaker, text, duration });
                
                // If not currently showing, start displaying
                if (!this.isShowing) {
                    this.displayNext();
                }
            },
            
            displayNext() {
                if (this.queue.length === 0) {
                    this.isShowing = false;
                    return;
                }
                
                this.isShowing = true;
                const { speaker, text, duration } = this.queue.shift();
                
                // Remove old style classes (kept for any rules that may exist)
                this.element.classList.remove('victoria', 'ms-jean', 'npc', 'dancer', 'enemy');
                
                // Add appropriate style class
                this.element.classList.add(this.getStyleClass(speaker));
                
                // Apply per-speaker color from SPEAKER_COLORS. The original
                // class-based color system was incomplete (only victoria/ms-jean
                // had matching CSS), so every other speaker fell through to the
                // base #ff0055 crimson — making all NPCs look the same. Looking
                // up SPEAKER_COLORS inline covers every named character that has
                // an entry, with a sane neutral fallback for the rest.
                const color = (typeof SPEAKER_COLORS !== 'undefined' && SPEAKER_COLORS[speaker]) || '#ff0055';
                this.speakerEl.style.color = color;
                this.speakerEl.style.textShadow = `0 0 10px ${color}`;
                this.textEl.style.borderLeftColor = color;
                
                // Set content
                this.speakerEl.textContent = speaker;
                this.textEl.textContent = `"${text}"`;
                
                // Show
                this.element.classList.add('show');
                
                // Hide after duration and show next
                setTimeout(() => {
                    this.element.classList.remove('show');
                    setTimeout(() => this.displayNext(), 300); // Wait for fade out
                }, duration);
            },
            
            // Helper to get random dialogue
            getRandomLine(character, category) {
                const charDialogues = this.dialogues[character];
                if (!charDialogues || !charDialogues[category]) return null;
                const lines = charDialogues[category];
                return lines[Math.floor(Math.random() * lines.length)];
            },
            
            // Trigger combat quip from any teammate
            teammateCombatQuip(name) {
                if (Math.random() < 0.15) { // 15% chance per shot burst
                    const key = name.toLowerCase();
                    const line = this.getRandomLine(key, 'combat');
                    if (line) this.show(name, line, 2500);
                }
            },
            
            // Trigger bumper car quip on collision
            bumperCarQuip(name, type) {
                if (Math.random() < 0.3) { // 30% chance per scoring hit
                    const key = name.toLowerCase();
                    const category = type === 'hit' ? 'bumperHit' : 'bumperGotHit';
                    const line = this.getRandomLine(key, category);
                    if (line) this.show(name, line, 2200);
                }
            },
            
            
            
            // Check for NPC proximity greetings
            checkProximityGreetings(player, npcs, teammates) {
                const greetingDistance = 150;
                
                // Check NPCs
                for (let npc of npcs) {
                    const dist = Math.hypot(player.x - npc.x, player.y - npc.y);
                    if (dist < greetingDistance) {
                        // Special: Ms. Jean near cemetery (the southern graveyard, HUB_GRAVEYARD)
                        if (npc.name === 'Ms. Jean' && player.y > HUB_GRAVEYARD.y) {
                            if (Math.random() < 0.015) {
                                const line = this.getRandomLine('msJean', 'nearCemetery');
                                if (line) this.show(npc.name, line, 4000);
                            }
                        } else {
                            this.triggerNPCGreeting(npc);
                        }
                    }
                }
                
                // Check recruited teammates for idle chatter
                for (let tm of teammates) {
                    if (tm.recruited && !tm.inCar) {
                        const dist = Math.hypot(player.x - tm.x, player.y - tm.y);
                        if (dist < 100 && Math.random() < 0.001) { // Very rare idle chatter
                            const key = tm.name.toLowerCase();
                            const line = this.getRandomLine(key, 'idle');
                            if (line) this.show(tm.name, line, 3000);
                        }
                    }
                }
            },
            
            triggerNPCGreeting(npc) {
                const name = npc.name;
                let category = 'greeting';
                let dialogueKey = null;
                
                // Fixed named greetings win; dancer status can override teammate greetings.
                const entry = this._greetingNames.get(name);
                if (entry && entry[1]) {
                    dialogueKey = entry[0];
                } else if (npc.isDancer || (entry && entry[0] === 'dancers')) {
                    dialogueKey = 'dancers';
                    category = 'follow';
                } else if (entry) {
                    dialogueKey = name.toLowerCase();
                }
                
                if (dialogueKey) {
                    if (Math.random() < 0.02) { // 2% chance per frame when nearby
                        const line = this.getRandomLine(dialogueKey, category);
                        if (line) this.show(name, line, 3500);
                    }
                }
            },
            
            // Ganger aggro callout
            gangerAggro() {
                if (Math.random() < 0.05) { // 5% chance when spawned or attacking
                    const line = this.getRandomLine('gangers', 'aggro');
                    if (line) this.show('Ganger', line, 2000);
                }
            },
            
            // Hired dancer following quip
            dancerFollowQuip(dancerName) {
                if (Math.random() < 0.003) { // Very rare while following
                    const line = this.getRandomLine('dancers', 'follow');
                    if (line) this.show(dancerName, line, 3000);
                }
            }
        };
        
        // Initialize caption system
        captionSystem.init();

