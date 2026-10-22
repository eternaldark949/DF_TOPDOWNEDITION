        /* =====================================================================
           TALKS — sitting down with someone and actually talking.

           The dialogue box of anyone in TALKS gets a TALK button. It plays the
           `talk` scene where they stand: a hello by how close they are, then the
           things she can bring up (new topics marked ◆ when they matter), a bit
           of small talk, goodbye. Each topic is a short branching exchange; what
           she answers is remembered (T.mem) and later lines read it back.

           Rapport (0–100, the bonding tiers: 25 / 50 / 75) opens deeper topics
           and each person's perk (TALK_PERKS). Two new topics a day each, so the
           story comes out over nights, not in one sitting.

             topic = { id, label, tier, needs(g, T), key, gain, text, beats }
             beat  = ['@' | '949', text | (T, g) => text, mood?]      a line ('@' is whoever she's talking to)
                   | { choose: [...], gain: [..], mem: 'key', vals: [..], then: [beats, beats, …] }
                   | { act(g, T) }                                    something happens (a gift)
                   | (T, g) => beat | beats                           branch on what she said before
           Saved in questState.talks[name]: { r, seen, mem, day, today, small, met }.
           ===================================================================== */
        const TALK_IDS = { Anavia: 'anavia', Mirabel: 'mirabel', 'Barista Ren': 'ren', Bartender: 'bartender', 'Dr. Yin': 'yin' };
        const _ch = (choose, gain, then, more = {}) => Object.assign({ choose, gain, then }, more);

        const TALKS = {
            /* ─────────────────────────── Anavia ─────────────────────────── */
            Anavia: {
                hello: (T, g, t) => !T.met ? [['@', 'Oh? A visit with no job attached. Now I\'m intrigued.', 'sultry']]
                    : t >= 3 ? [['@', T.mem.name === 'lena' ? 'Hi, Stella.' : 'My favourite noise.', 'smile']]
                    : t === 2 ? [['@', 'I was hoping it would be you.', 'smile']]
                    : t === 1 ? [['@', 'There she is.', 'sultry']]
                    : [['@', 'Back again. Careful, 949. I\'ll start expecting you.', 'sultry']],
                enough: [['@', 'That\'s enough of my secrets for one night. Come back tomorrow.', 'sultry']],
                bye: ['Don\'t be a stranger.', 'Go on. Make some noise.', 'Be careful out there. I mean it.', 'Come back to me in one piece.'],
                small: [
                    [[['@', 'The night\'s slow. Tell me one thing that went right today.'], ['949', 'Nobody shot me in the face.'], ['@', 'Low bar. I\'ll take it.', 'smile']],
                     [['@', 'You\'re staring at the traffic.'], ['949', 'Habit. Exits, cars, angles.'], ['@', 'Mm. Mine is faces. Yours is more interesting tonight.', 'sultry']]],
                    [[['@', 'Moon City changed DJs. Worse taste, better volume.'], ['949', 'You can hear it from here?'], ['@', 'I can hear everything from here. It\'s why I stand here.']],
                     [['@', 'Your crew walked past earlier. The tall one waved. Victoria?'], ['949', 'She waves at everyone.'], ['@', 'She didn\'t wave at the man next to me.', 'smile']]],
                    [[['@', 'I bought a coat today and thought, 949 would laugh at this.'], ['949', 'Would I?'], ['@', 'Yes. So I kept it.', 'smile']],
                     [['@', 'Sit with me a minute. Don\'t say anything.'], ['949', '…'], ['@', 'Thank you.', 'smile']]],
                    [[['@', 'I counted. You\'ve come to see me more than anyone else in this city.'], ['949', 'Is that a complaint?'], ['@', 'It\'s a confession.', 'sultry']]]
                ],
                topics: [
                    { id: 'who', label: 'Ask who she really is', tier: 0, beats: [
                        ['@', 'Who am I. You walked all the way over here to ask a woman standing outside a department store who she is.', 'smile'],
                        ['949', 'You\'re not shopping.'],
                        ['@', 'No. Inside, everyone wants something from me. Out here, the wind doesn\'t know my name.'],
                        _ch(['And what do you want from me?', 'The wind and I have that in common.', 'Then I\'ll stop asking.'], [2, 4, 1], [
                            [['@', 'Straight to it. Good.'], ['@', 'I want to know if you\'re as good as the noise you make. So far you\'re louder than you are good.']],
                            [['@', 'Oh. She flirts.', 'sultry'], ['@', 'Careful, 949. I collect things I like.', 'sultry']],
                            [['@', 'Don\'t. People who stop asking stop being interesting.'], ['@', 'Ask me again some other night. I might answer.']]
                        ], { mem: 'style', vals: ['straight', 'tease', 'quiet'] }),
                        ['@', 'You know my name. That\'s more than most people get.']
                    ] },
                    { id: 'gun', label: 'Ask about the pistol with her name', tier: 0, needs: g => g.inventory && g.inventory.items.some(i => i.id === 'pistol_anavia'), beats: [
                        ['@', 'That pistol on your hip. Periwinkle bolts. A crackle on the trail.'],
                        ['@', 'You\'re carrying my name around this city, 949. Did you know that?'],
                        _ch(['I thought it was a model number.', 'It\'s never jammed on me once.', 'Do you want it back?'], [0, 3, 4], [
                            [['@', 'A model number.', 'smile'], ['@', 'My mother would have hated that. Then she\'d have sold you a second one.']],
                            [['@', 'It wouldn\'t dare. She built them not to.'], ['@', 'The Anavia line was my mother\'s.']],
                            [['@', 'No. Keep it.', 'sad'], ['@', 'It looks right in your hand. Better than it ever looked in mine.'], ['@', 'The line was my mother\'s. She named it after me the year I was born.']]
                        ], { mem: 'gun', vals: ['model', 'proud', 'offered'] }),
                        ['@', 'Someday I\'ll tell you the rest. Not on a sidewalk.']
                    ], text: 'Clean that pistol tonight. She\'d want it shining.' },
                    { id: 'cole', label: 'Ask why she stands outside Enni Cole', tier: 0, beats: [
                        ['949', 'Every night, the same spot. Why here?'],
                        ['@', 'Valentina won\'t let me past the doors since last season.'],
                        _ch(['What did you do?', 'Want me to talk to her?', 'Her loss.'], [2, 1, 3], [
                            [['@', 'I bought the entire spring couture rack. Then I returned it. Wearing all of it.', 'grin'], ['@', 'Valentina called it theatre. I called it a review.']],
                            [['@', 'You? Walk in there and plead my case?', 'smile'], ['@', 'Sweet. No. I like being the most interesting thing on this street.']],
                            [['@', 'Mm. Everything is, eventually.', 'sultry']]
                        ]),
                        ['@', 'Besides. From here I can see Moon City\'s door. You\'d be surprised who comes and goes.']
                    ] },
                    { id: 'scrap', label: 'Ask why she pays so well for scrap', tier: 0, needs: g => g.missions.completedBounties >= 5, beats: [
                        ['949', 'You pay well for scrap. Nobody pays well for scrap.'],
                        ['@', 'Everything this city throws away, someone paid for once. I\'m collecting what they forgot.'],
                        _ch(['That\'s not an answer.', 'Collecting for what?', 'As long as the pay clears.'], [3, 2, 0], [
                            [['@', 'No. It\'s a door.'], ['@', 'You\'ll find the handle if you keep coming back.', 'sultry']],
                            [['@', 'A collection. Some of it belonged to people I loved.'], ['@', 'Bring me the crates. Don\'t open them.']],
                            [['@', 'It clears. It always clears with me.'], ['@', 'I hoped you\'d be curious. Pity.']]
                        ], { mem: 'scrap', vals: ['pushed', 'curious', 'paid'] })
                    ] },
                    { id: 'mother', label: 'Ask about her mother', tier: 1, needs: (g, T) => T.seen.includes('gun'), beats: [
                        (T) => ['@', T.mem.gun === 'offered' ? 'You offered me the pistol back, that first time. Nobody has ever done that.' : 'You never asked about my mother. I noticed. It was kind.'],
                        ['@', 'The Anavia house. Pistols like art. Every one tuned by hand, every bolt the colour of the evening I was born.'],
                        ['@', 'Then the debts came. A company bought the house, the designs, the name. Everything but me.'],
                        ['949', 'Which company?'],
                        ['@', 'W. MINDUSTRIAL.'],
                        ['@', 'Your Mirabel.'],
                        _ch(['She\'s not my Mirabel.', 'I just take her jobs.', 'Tell me what she did.'], [2, 0, 4], [
                            [['@', 'Isn\'t she? She calls, you come.'], ['@', 'Don\'t look at me like that. I\'m not asking you to choose. Yet.']],
                            [['@', 'Of course you do. Everyone does. She pays like a storm.'], ['@', 'Just remember who\'s standing under it.']],
                            [['@', 'She bought the house for the patents and shut the workshop within a week. Mother didn\'t last the year.', 'sad'], ['@', 'I don\'t hate her. Hate is a luxury. I just don\'t forget.']]
                        ], { mem: 'mirabel', vals: ['distance', 'job', 'listened'] }),
                        ['@', 'That\'s the most I\'ve said about it to anyone. Don\'t make me regret it.']
                    ], text: 'Thank you for listening tonight. I don\'t say that.' },
                    { id: 'caches', label: 'Ask what\'s really in the crates', tier: 1, needs: (g, T) => T.seen.includes('scrap'), beats: [
                        ['949', 'The crates I clear for you. They\'re not random freight.'],
                        ['@', '…No.'],
                        ['@', 'When the house was sold, Mother hid her last designs. Shipped in pieces, under false manifests, all over the city.'],
                        ['@', 'Every crate you bring me is one more piece of her.'],
                        _ch(['Why not just tell me?', 'I\'ll find every one.', 'What\'s my cut of a dead woman\'s legacy?'], [2, 5, -3], [
                            [['@', 'Because people treat things differently when they know they matter.'], ['@', 'You\'d have slowed down. Gotten careful. Gotten killed.']],
                            [['@', 'Don\'t promise. Promises are how she lost everything.', 'sad'], ['@', '…But thank you.', 'smile']],
                            [['@', 'Same as always. Scrap and personics.', 'annoyed'], ['@', 'Ask me that again and you can go dig up someone else\'s mother.', 'angry']]
                        ], { mem: 'caches', vals: ['why', 'promised', 'cold'] })
                    ], text: T => T.mem.caches === 'promised' ? 'I opened the last crate you brought. Her handwriting was on the lid.' : null },
                    { id: 'dance', label: 'Listen to the music with her', tier: 1, needs: g => { const h = Math.floor(((g.worldMinutes % 1440) + 1440) % 1440 / 60); return h >= 20 || h < 5; }, beats: [
                        ['@', 'Listen. Moon City\'s bass carries all the way here at this hour.'],
                        ['@', 'Do you dance, 949?'],
                        _ch(['Only when someone\'s shooting at me.', 'Badly.', 'Ask me properly.'], [2, 3, 4], [
                            [['@', 'That\'s not dancing. That\'s survival with rhythm.', 'grin'], ['@', 'Though I\'ve seen you work. It\'s close.']],
                            [['@', 'Good. People who dance well never look at you.', 'smile']],
                            [['@', 'Hm.', 'sultry'], ['@', 'Stella. Would you give me one dance, some night when nobody\'s paying either of us?'],
                             _ch(['Yes.', 'Maybe.'], [3, 1], [[['@', 'Then I\'ll hold you to it.', 'smile']], [['@', 'Maybe is a door too.', 'sultry']]], { mem: 'dance', vals: ['yes', 'maybe'] })]
                        ])
                    ] },
                    { id: 'afraid', label: 'Ask what scares her', tier: 2, beats: [
                        ['@', 'You want to know what I\'m afraid of.'],
                        ['949', 'I didn\'t ask.'],
                        ['@', 'You were about to. You have the face for it.'],
                        ['@', 'Being wanted for what I have. The money, the caches, the name. Never for the woman standing here in the cold.', 'sad'],
                        _ch(['I came back for the woman.', 'Everyone wants something. I want you to be okay.', 'You\'re not cold. You\'re stubborn.'], [4, 3, 3], [
                            [['@', '…You did. Every time. I counted.', 'smile']],
                            [['@', 'Bold. Honest. A terrible combination.', 'smile']],
                            [['@', 'Ha. Both. Fine. Both.', 'grin']]
                        ]),
                        (T) => ['@', T.mem.style === 'tease' ? 'You flirted with me the first night. I pretended not to like it.'
                                   : T.mem.style === 'quiet' ? 'The first night you said you\'d stop asking. You never did. I\'m glad.'
                                   : 'The first night you asked what I wanted from you. I think I know now.', 'smile']
                    ], text: 'Still cold out here. Less, though.' },
                    { id: 'last', label: 'Ask about the last crate', tier: 2, key: true, needs: (g, T) => T.seen.includes('caches') && T.seen.includes('mother'), beats: [
                        ['@', 'The last piece came in. Your crate.'],
                        ['@', 'It wasn\'t a pistol. It was a pattern. She designed clothes before she ever built a gun.'],
                        ['@', 'A periwinkle crop top, a long skirt, gold heels. She made it for me, for a gala that never happened.'],
                        ['@', 'I want you to have it.'],
                        _ch(['I can\'t take that.', 'I\'ll wear it on a night that matters.', 'It\'s yours. Wear it for her.'], [2, 4, 1], [
                            [['@', 'You can. You will. I\'m not asking.', 'smile']],
                            [['@', 'Then I\'ll be there to see it.', 'smile']],
                            [['@', 'I tried. It fits you better. It always did.', 'sad']]
                        ]),
                        { act(g) {
                            const c = g.cosmetics;
                            if (c && !c.isOwned('outfit_anavia')) { c.owned.push('outfit_anavia'); return 'ANAVIA\'S OUTFIT ADDED TO YOUR WARDROBE'; }
                            g.currency += 400; g.updateUI(); return 'ANAVIA PRESSES 400 PERSONICS INTO YOUR HAND';
                        } }
                    ], text: 'Send me a picture when you wear it. Don\'t argue.' },
                    { id: 'name', label: 'Stay with her a while', tier: 3, key: true, needs: (g, T) => T.seen.includes('afraid'), beats: [
                        ['@', 'Can I tell you something nobody in this city knows?'],
                        ['@', 'Anavia isn\'t my name. It was the line\'s. When Mother died I took it, so it would still mean something, walking around.'],
                        ['949', 'What\'s your real name?'],
                        ['@', 'Lena.'],
                        ['@', 'Nobody has called me that in eleven years.', 'sad'],
                        _ch(['Lena.', 'Anavia suits you.', 'I\'ll keep it safe.'], [5, 3, 4], [
                            [['@', '…Again. Slower.', 'sad'], ['949', 'Lena.'], ['@', 'There. Now someone in this city knows me.', 'smile']],
                            [['@', 'It does now. Because you say it like it\'s mine.', 'smile']],
                            [['@', 'I know you will. That\'s why you got it.', 'smile']]
                        ], { mem: 'name', vals: ['lena', 'anavia', 'safe'] }),
                        ['@', 'Stay a while, 949. Not for a job. Just stay.'],
                        _ch(['I\'m not going anywhere.', 'One more minute.', 'The crew\'s waiting. Soon.'], [3, 2, 0], [
                            [['@', 'Good.', 'smile']],
                            [['@', 'I\'ll take it. I\'ll take all of them.', 'smile']],
                            [['@', 'Soon. You keep saying that, and I keep believing you.', 'sad']]
                        ], { mem: 'stay', vals: ['stay', 'minute', 'soon'] })
                    ], text: T => T.mem.name === 'lena' ? 'Goodnight, Stella. — L.' : 'Goodnight, 949.' }
                ]
            },

            /* ─────────────────────────── Mirabel ─────────────────────────── */
            Mirabel: {
                needs: g => !!g.questState.ambushCleared,
                hello: (T, g, t) => !T.met ? [['@', 'Sit, 949. Not that chair. That one.']]
                    : t >= 3 ? [['@', 'Starry heavens. It\'s good to see you.', 'smile']]
                    : t === 2 ? [['@', 'Ah. The one person in this city who hasn\'t disappointed me.', 'smile']]
                    : t === 1 ? [['@', '949. Pour yourself something.']]
                    : [['@', 'You came without being called. How novel.']],
                enough: [['@', 'I have a board meeting in my head. Tomorrow, 949.']],
                bye: ['Don\'t keep me waiting next time.', 'Go. W. MINDUSTRIAL remembers.', 'Mind yourself out there.', 'Come back soon. That is an order, and also a request.'],
                small: [
                    [[['@', 'The champagne here is dreadful. I keep ordering it.'], ['949', 'Why?'], ['@', 'Because I own the vineyard. It\'s penance.']]],
                    [[['@', 'My board wants quarterly projections. I want a nap.'], ['949', 'Take the nap.'], ['@', 'Insubordination. I like it.', 'smile']]],
                    [[['@', 'Sit. Tell me about your crew. The loud one, Max. Is he as tiresome as he looks?'], ['949', 'Worse. He\'d take a bullet for any of us.'], ['@', 'Hm. Then he\'s worth the noise.']]],
                    [[['@', 'I cleared an hour on my calendar and labelled it "949." My assistant asked if you were a project.'], ['949', 'Am I?'], ['@', 'You\'re the only one I enjoy.', 'smile']]]
                ],
                topics: [
                    { id: 'maker', label: 'Ask what the Dark Maker took from her', tier: 0, beats: [
                        ['949', 'The Dark Maker. What did he do to you?'],
                        ['@', 'He took something from me that can\'t be insured.'],
                        _ch(['What did he take?', 'I\'ll find him.', 'So you hired me for revenge.'], [1, 4, 2], [
                            [['@', 'A face. Someone I would have burned this city down for.', 'sad'], ['@', 'Don\'t ask whose. Not yet.']],
                            [['@', 'I know you will. That\'s why the others aren\'t sitting in this room.']],
                            [['@', 'Revenge is for people without a legal department.'], ['@', 'This is housekeeping.']]
                        ])
                    ] },
                    { id: 'mind', label: 'Ask what W. MINDUSTRIAL makes', tier: 0, beats: [
                        ['949', 'What does your company actually make?'],
                        ['@', 'Minds, darling. Not the thinking kind. The kind you install.'],
                        ['@', 'Half the augments under this city\'s skin passed through one of my labs first.'],
                        _ch(['That\'s unsettling.', 'Then I owe you for my reflexes.', 'Does Dr. Yin buy from you?'], [1, 3, 2], [
                            [['@', 'Everything worth having is.']],
                            [['@', 'You owe me for a great deal more than that. We\'ll settle up some day.', 'smile']],
                            [['@', 'Dr. Yin buys from whoever is best. Today, that\'s me. Tomorrow I intend it to be me as well.']]
                        ])
                    ] },
                    { id: 'stars', label: 'Ask about "starry heavens"', tier: 0, beats: [
                        ['949', 'Starry heavens. You say it a lot.'],
                        ['@', 'My father was an astronomer. He said it whenever the telescope showed him something he couldn\'t afford to understand.'],
                        ['@', 'Vanoga, mostly. He spent his life looking at one star.'],
                        _ch(['Do you still look up?', 'He sounds like a good man.', 'Cute.'], [3, 2, -1], [
                            [['@', 'Every night. From the roof of my tower, where nobody can see me do it.', 'smile']],
                            [['@', 'He was a poor one. Those two things are connected, I\'ve found.']],
                            [['@', 'Careful. I\'ve had people dismissed for less.', 'annoyed']]
                        ])
                    ] },
                    { id: 'anavia', label: 'Ask about Anavia\'s mother', tier: 1, needs: g => !!Talks.state(g, 'Anavia').mem.mirabel, beats: [
                        ['949', 'Anavia told me about her mother\'s house.'],
                        ['@', 'Did she.'],
                        ['@', 'Then she told you I bought it. Did she tell you it was already sinking? That I paid three times what anyone else offered?'],
                        _ch(['She said you shut the workshop.', 'Why pay three times?', 'I\'m not taking sides.'], [1, 3, 2], [
                            [['@', 'I did. The workshop was killing her mother faster than the debt was.', 'sad'], ['@', 'Nobody remembers that part. I don\'t need them to.']],
                            [['@', 'Because that woman made beautiful things, and I wanted them to exist after her.'], ['@', 'Sentiment. Don\'t spread it around.']],
                            [['@', 'Wise. Stay that way, and you\'ll keep both of us.']]
                        ], { mem: 'anavia', vals: ['workshop', 'why', 'neutral'] })
                    ] },
                    { id: 'why', label: 'Ask "Why me?" again', tier: 2, key: true, beats: [
                        ['949', 'In the van you said nobody had ever disappointed you less. Why does that matter so much?'],
                        ['@', 'Because everyone disappoints, 949. My father. My board. The man I hired before you.'],
                        ['@', 'I built my whole life around expecting it.'],
                        ['@', 'You\'re the only line in my ledger that keeps coming out even.'],
                        _ch(['I\'m not perfect.', 'Then don\'t stop trusting me.', 'Maybe expect more from people.'], [2, 4, 3], [
                            [['@', 'I didn\'t say perfect. I said even. It\'s rarer.']],
                            [['@', 'I won\'t. That frightens me more than the Dark Maker does.', 'smile']],
                            [['@', 'Perhaps. Start with yourself, and I\'ll watch.', 'smile']]
                        ]),
                        ['@', 'Here. A retainer. Don\'t argue. It\'s tax-deductible.'],
                        { act(g) { g.currency += 400; g.updateUI(); return 'MIRABEL\'S RETAINER: 400 PERSONICS'; } }
                    ], text: 'W. MINDUSTRIAL remembers its friends. So do I.' }
                ]
            },

            /* ─────────────────────────── Barista Ren ─────────────────────────── */
            'Barista Ren': {
                hello: (T, g, t) => !T.met ? [['@', 'Oh! You want to just… talk? Hang on, let me wipe this. Okay. Hi.', 'smile']]
                    : t >= 3 ? [['@', 'Sit. Coffee\'s on me. Always.', 'smile']]
                    : t === 2 ? [['@', 'I saved you the burnt one. Kidding. Mostly.', 'grin']]
                    : t === 1 ? [['@', 'There\'s my favourite courier.', 'smile']]
                    : [['@', 'Stella! Your table\'s free.']],
                enough: [['@', 'Rush hour\'s coming. Tomorrow? I\'ll save the good beans.']],
                bye: ['Drive safe!', 'Don\'t let Koda see you leave without a pastry.', 'Text me when you get home, okay?', 'Love you. Go. I mean, go.'],
                small: [
                    [[['@', 'Someone ordered a decaf with three extra shots. I think they\'re confused about life.'], ['949', 'Aren\'t we all.'], ['@', 'Not about coffee.', 'grin']]],
                    [[['@', 'Koda burned his hand on the steamer and blamed the steamer. Out loud. For ten minutes.'], ['949', 'Did the steamer apologise?'], ['@', 'It\'s considering it.', 'grin']]],
                    [[['@', 'You look tired. Do you ever sleep?'], ['949', 'Sometimes.'], ['@', 'Sometimes isn\'t a schedule, Stella.', 'annoyed']]],
                    [[['@', 'I named the new blend after you. Don\'t laugh.'], ['949', 'What\'s it called?'], ['@', 'Nine Lives. It\'s very strong and nobody can kill it.', 'grin']]]
                ],
                topics: [
                    { id: 'amber', label: 'Ask how Amber started', tier: 0, beats: [
                        ['@', 'Amber? Koda, me, one scooter, and a lot of cold soup.'],
                        _ch(['You built that from a scooter?', 'Cold soup?', 'And now I\'m your courier.'], [2, 2, 1], [
                            [['@', 'One scooter, one map, and a lot of yelling.', 'grin'], ['@', 'Now the app does the yelling.']],
                            [['@', 'The scooter was slow. The soup was not a soup by the end.', 'grin'], ['@', 'We put lids on everything after that. Hence the boxes.']],
                            [['@', 'You\'re our best one. The ratings don\'t lie.', 'smile'], ['@', 'Okay, they lie a little. But not about you.']]
                        ])
                    ] },
                    { id: 'koda', label: 'Ask about Chef Koda', tier: 0, beats: [
                        ['949', 'Is Koda always that grumpy?'],
                        ['@', 'Koda isn\'t grumpy. Koda is a perfectionist with a bad back.'],
                        ['@', 'He took me in when I was fourteen. I stole a croissant from this exact counter.'],
                        _ch(['He took in a thief?', 'Sounds like family.', 'Was it a good croissant?'], [1, 3, 3], [
                            [['@', 'He said a thief who picks the best croissant has a palate. Then he made me wash dishes for a year.']],
                            [['@', 'It is. Don\'t tell him I said that. He\'ll cry and blame the onions.', 'smile']],
                            [['@', 'The best I\'ve ever had. I\'ve been trying to make one that good for nine years.', 'grin']]
                        ])
                    ] },
                    { id: 'regulars', label: 'Ask about the regulars', tier: 0, beats: [
                        ['@', 'See the man by the window? Same tea, every day, for six years. He has never drunk it.'],
                        _ch(['Ever asked him why?', 'Some people need a reason to sit somewhere.', 'Maybe he\'s waiting for someone.'], [1, 3, 2], [
                            [['@', 'Once. He said "not yet" and tipped me double.']],
                            [['@', '…That\'s actually beautiful. I\'m giving him a fresh one tomorrow.', 'smile']],
                            [['@', 'Oh no. Now I\'m going to cry into the milk.', 'sad']]
                        ], { mem: 'tea', vals: ['asked', 'reason', 'waiting'] })
                    ] },
                    { id: 'dream', label: 'Ask what she really wants', tier: 1, beats: [
                        ['949', 'What do you want, Ren? Not for the café. For you.'],
                        ['@', 'A roastery. Up in the hills where the beans grow. Somewhere the city\'s noise doesn\'t reach.'],
                        _ch(['You\'d hate the quiet.', 'Take me with you.', 'I\'ll help you get there.'], [2, 3, 4], [
                            [['@', 'Probably. I\'d bring a radio. And Koda. Same thing.', 'grin']],
                            [['@', 'Deal. You\'d have to learn to sleep, though.', 'smile']],
                            [['@', 'You would, wouldn\'t you. You\'d just show up with a truck.', 'smile'], ['@', 'Okay. Don\'t look at me, I\'m fine. It\'s the steam.', 'sad']]
                        ], { mem: 'dream', vals: ['quiet', 'with', 'help'] })
                    ], text: 'Looked at a map of the hills tonight. Just looking.' },
                    { id: 'worry', label: 'Talk about last week', tier: 2, key: true, beats: [
                        ['@', 'Can I say something? Last week you came in bleeding, and you smiled at me like nothing happened.'],
                        ['@', 'Don\'t do that. Not with me.', 'sad'],
                        _ch(['It\'s the job.', 'I didn\'t want to scare you.', 'I\'ll tell you next time.'], [1, 3, 5], [
                            [['@', 'I know it\'s the job. I\'m not asking you to quit. I\'m asking you to let me worry.']],
                            [['@', 'You scared me more by pretending.', 'sad']],
                            [['@', 'Okay.', 'smile'], ['@', 'Okay. That\'s all I wanted.', 'smile']]
                        ])
                    ], text: 'Your mug is clean and waiting. Come home in one piece.' }
                ]
            },

            /* ─────────────────────────── The Bartender ─────────────────────────── */
            Bartender: {
                hello: (T, g, t) => !T.met ? [['@', 'You want to talk? Bar\'s slow. Pull up a stool.']]
                    : t >= 2 ? [['@', 'Good to see you breathing, Freelancer.', 'smile']]
                    : t === 1 ? [['@', 'Your usual\'s already poured.']]
                    : [['@', 'Freelancer. What\'ll it be?']],
                enough: [['@', 'I\'ve got a bar to run. Tomorrow.']],
                bye: ['Watch the door on your way out.', 'Drinks are on the house next time.', 'Stay alive. Bad for business otherwise.', 'Go on. Your seat stays yours.'],
                small: [
                    [[(T) => T.mem.name === 'guess' ? ['949', ['Is it Marcus?', 'Is it Dmitri?', 'Is it Theo?', 'Is it Ola?'][Math.floor(Math.random() * 4)]] : ['949', 'Busy night?'],
                      (T) => T.mem.name === 'guess' ? ['@', 'No.', 'smile'] : ['@', 'Every night is busy if you count the people who don\'t order.']]],
                    [[['@', 'Some kid tried to pay with a cracked personics chip. I gave him water and a lecture.'], ['949', 'Which did he need more?'], ['@', 'The lecture. He drank the water anyway.']]],
                    [[['@', 'Your sniper friend sat at the end of the bar for an hour. Didn\'t drink. Just watched the door.'], ['949', 'Yenna.'], ['@', 'Good customer. Never breaks a glass.']]]
                ],
                topics: [
                    { id: 'name', label: 'Ask his name', tier: 0, beats: [
                        ['949', 'I don\'t even know your name.'],
                        ['@', 'Bartender\'s fine. In this business, names get people killed.'],
                        _ch(['Everyone has a name.', 'Fine. Bartender it is.', 'I\'ll guess it eventually.'], [1, 2, 3], [
                            [['@', 'Sure. Mine\'s in a drawer somewhere, with my old life.']],
                            [['@', 'Smart. You\'d be surprised how few people let it go.']],
                            [['@', 'Ha. Many have tried.', 'grin'], ['@', 'Go on, then. One guess a visit.']]
                        ], { mem: 'name', vals: ['asked', 'fine', 'guess'] })
                    ] },
                    { id: 'bounties', label: 'Ask where the bounties come from', tier: 0, beats: [
                        ['@', 'People leave names on napkins. Under glasses. Folded into tips.'],
                        ['@', 'I just read the napkins.'],
                        _ch(['Who pays for them?', 'That\'s grim.', 'Keep the napkins coming.'], [2, 1, 3], [
                            [['@', 'People who lost something. People who want something. Same people, mostly, a week apart.']],
                            [['@', 'It\'s a bar in a city like this. Grim is the house special.']],
                            [['@', 'For you? I\'ll start reading the floor too.', 'grin']]
                        ])
                    ] },
                    { id: 'booth', label: 'Ask about the crew\'s booth', tier: 0, needs: g => typeof CrewNights !== 'undefined' && CrewNights.state().nights > 0, beats: [
                        ['@', 'You and your crew. The back booth. You know you\'re the only table that tips the band?'],
                        ['@', 'Victoria, mostly. She tips like she\'s apologising for something.'],
                        _ch(['She probably is.', 'Keep that booth for us.', 'What else have you noticed?'], [1, 3, 2], [
                            [['@', 'Most people are. She\'s just honest about it.']],
                            [['@', 'It\'s yours. I put a reserved sign on it. Nobody reads it, but it\'s there.', 'smile']],
                            [['@', 'Your hacker counts the exits. Your sniper counts the people. The loud one counts the drinks.'], ['@', 'You count them. All of them. Every time.']]
                        ])
                    ] },
                    { id: 'upstairs', label: 'Ask about Mirabel\'s lounge', tier: 1, needs: g => !!g.questState.ambushCleared, beats: [
                        ['@', 'I pour for her too. One glass of Vanoga red a night. She never finishes it.'],
                        _ch(['Why not?', 'You notice everything.', 'Don\'t tell her I asked.'], [2, 2, 3], [
                            [['@', 'My guess? She orders it for someone who isn\'t here any more.']],
                            [['@', 'It\'s the job. The drinks are the easy part.']],
                            [['@', 'I don\'t tell anybody anything. It\'s why everyone tells me everything.', 'grin']]
                        ])
                    ] }
                ]
            },

            /* ─────────────────────────── Dr. Yin ─────────────────────────── */
            'Dr. Yin': {
                hello: (T, g, t) => !T.met ? [['@', 'A conversation? Not a wound? Sit down before I change my mind.']]
                    : t >= 2 ? [['@', 'My favourite patient. Don\'t tell the others.', 'smile']]
                    : t === 1 ? [['@', 'Let me look at you. …Fine. Talk.']]
                    : [['@', '949. You\'re not bleeding. Progress.']],
                enough: [['@', 'I have three patients waiting and one of them is on fire. Tomorrow.']],
                bye: ['Hydrate.', 'Come back before something breaks, not after.', 'Take care of what I built.', 'Stay whole, 949.'],
                small: [
                    [[['@', 'Your left shoulder is two degrees higher than your right.'], ['949', 'Is that bad?'], ['@', 'It means you carry something heavy. Pick a side.']]],
                    [[['@', 'I ate lunch today. Sitting down. Write that in the history books.'], ['949', 'Proud of you.'], ['@', 'Don\'t be. It was cold noodles.', 'smile']]],
                    [[['@', 'You haven\'t been back with a wound in a while.'], ['949', 'Trying something new.'], ['@', 'Keep trying it.', 'smile']]]
                ],
                topics: [
                    { id: 'res', label: 'Ask what Resonance is', tier: 0, beats: [
                        ['@', 'Every augment hums at a frequency. Resonance is how well yours hum together.'],
                        ['@', 'Yours hum… loudly.'],
                        _ch(['Is that bad?', 'Can you turn it down?', 'Loud is good.'], [2, 1, 2], [
                            [['@', 'Loud is powerful. Powerful is dangerous. Dangerous is my business.']],
                            [['@', 'I could. You\'d be slower. I don\'t think you want slower.']],
                            [['@', 'Loud is good until it isn\'t. I\'ll tell you when.']]
                        ])
                    ] },
                    { id: 'why', label: 'Ask why she patches up freelancers', tier: 0, beats: [
                        ['949', 'Why freelancers? The hospitals pay better.'],
                        ['@', 'The hospitals ask for papers. Blood doesn\'t carry papers.'],
                        _ch(['That\'s a good answer.', 'Is that the whole answer?', 'I\'m glad it\'s you.'], [1, 3, 3], [
                            [['@', 'I\'ve practised it.', 'smile']],
                            [['@', 'No.'], ['@', 'The rest is that someone patched me up once, with no questions, on a night I couldn\'t have answered any.']],
                            [['@', 'So am I. Don\'t make me regret it on the table.', 'smile']]
                        ])
                    ] },
                    { id: 'wrong', label: 'Ask if an augment ever went wrong', tier: 1, beats: [
                        ['@', 'Once. A boy, nineteen. He wanted reflexes faster than his nerves could carry.'],
                        ['@', 'I said no. Someone else said yes.', 'sad'],
                        _ch(['It wasn\'t your fault.', 'What happened to him?', 'Is that why you check me so often?'], [2, 1, 4], [
                            [['@', 'I know. Knowing doesn\'t help as much as people think.', 'sad']],
                            [['@', 'He moved faster than anyone I\'ve ever seen. For eleven days.']],
                            [['@', 'Yes.'], ['@', 'Every time you come in, I count your heartbeats twice.']]
                        ])
                    ] },
                    { id: 'you', label: 'Ask what she sees in your scans', tier: 2, key: true, beats: [
                        ['@', 'You heal faster than you should, 949.'],
                        ['@', 'Your scans don\'t match anything in my library. Not human baseline. Not any augment I\'ve installed.'],
                        _ch(['What does that mean?', 'Keep it between us.', 'I don\'t want to know.'], [2, 4, 1], [
                            [['@', 'I don\'t know yet. That\'s the honest answer, and I don\'t like giving it.']],
                            [['@', 'It\'s in no file but my own head. It stays there.', 'smile']],
                            [['@', 'Then I\'ll know it for you, until you do.']]
                        ], { mem: 'scans', vals: ['ask', 'secret', 'not'] })
                    ], text: 'Ran your numbers again. Still impossible. Still you. Sleep.' }
                ]
            }
        };

        /** What closeness gets you, crossed in a talk (or anywhere rapport moves) */
        const TALK_PERKS = {
            Anavia:        { 1: 'HER SALVAGE JOBS PAY 20% MORE' },
            'Barista Ren': { 1: 'AMBER DELIVERIES PAY 10% MORE' },
            Bartender:     { 1: 'BOUNTIES PAY 10% MORE' },
            'Dr. Yin':     { 1: 'A FREE STIM WHEN YOU STOP BY (ONCE A DAY)' }
        };

        const Talks = {
            _run: null,
            state(g, name) {
                const q = g.questState || (g.questState = {}), all = q.talks || (q.talks = {});
                return all[name] || (all[name] = { r: 0, seen: [], mem: {}, day: -1, today: 0, small: -1, met: false });
            },
            tier(g, name) { const r = this.state(g, name).r; return r >= 75 ? 3 : r >= 50 ? 2 : r >= 25 ? 1 : 0; },
            _day(g) { return Math.floor((g.worldMinutes || 0) / 1440); },
            /** Can she talk with them here and now */
            can(g, name) { const P = TALKS[name]; return !!P && (!P.needs || P.needs(g)); },
            /** The topics she can bring up today (tier, needs, not yet talked about) */
            topics(g, name) {
                const P = TALKS[name], T = this.state(g, name), t = this.tier(g, name);
                return P.topics.filter(x => !T.seen.includes(x.id) && x.tier <= t && (!x.needs || x.needs(g, T)));
            },
            fresh(g, name) { const T = this.state(g, name); return this.can(g, name) && (T.day !== this._day(g) || T.today < 2) && this.topics(g, name).length > 0; },
            /** Rapport; a tier crossed is announced with what it brings */
            bond(g, name, n) {
                const T = this.state(g, name), before = this.tier(g, name);
                T.r = Math.max(0, Math.min(100, T.r + n));
                const after = this.tier(g, name);
                if (after > before && BONDING_TIERS[after].message) {
                    const perk = TALK_PERKS[name] && TALK_PERKS[name][after];
                    g.addPausableTimeout(() => showMessage(`${name.toUpperCase()}: ${BONDING_TIERS[after].message}${perk ? ' · ' + perk : ''}`), 2600);
                }
                return n;
            },

            /** The TALK button on the dialogue box */
            button(g, npc) {
                let b = g._talkDialogueBtn;
                if (!this.can(g, npc.name)) { if (b) b.style.display = 'none'; return; }
                if (!b) {
                    b = g._talkDialogueBtn = document.createElement('button');
                    b.className = 'dialogue-btn talk-btn';
                    g.btnDecline.parentElement.insertBefore(b, g.btnDecline);
                    b.addEventListener('click', () => { const n = g.activeInteraction; b.style.display = 'none'; g.endDialogue(); if (n) this.open(g, n); });
                }
                b.textContent = 'Talk';
                b.classList.toggle('fresh', this.fresh(g, npc.name));                   // something new to talk about
                b.style.display = '';
            },

            open(g, npc) {
                if (!TALKS[npc.name] || (g.scenes && g.scenes.running)) return;
                const T = this.state(g, npc.name), day = this._day(g);
                if (T.day !== day) { T.day = day; T.today = 0; }
                this._run = { name: npc.name, npc, gain: 0, facing: npc.facePlayer, notes: [] };
                npc.facePlayer = true;
                if (typeof captionSystem !== 'undefined' && captionSystem.element) { captionSystem.queue.length = 0; captionSystem.element.classList.remove('show'); }
                g.scenes.play('talk').then(() => this._wrap(g));
            },
            _wrap(g) {
                const R = this._run;
                this._run = null;
                if (!R) return;
                R.npc.facePlayer = R.facing;
                const T = this.state(g, R.name);
                T.met = true;
                const notes = [];
                if (R.gain > 0) notes.push(`♡ ${R.name.toUpperCase()} +${R.gain}`);
                notes.push(...R.notes);
                notes.forEach((n, i) => g.addPausableTimeout(() => { showMessage(n); audioSys.sfx('ui'); }, 500 + i * 2200));
                for (const [text, delay] of R.texts || []) g.addPausableTimeout(() => phoneSystem.sendText(R.name, text, true, 1800), delay);
            },
            _gain(g, n) { const R = this._run; if (!R || !n) return; this.bond(g, R.name, n); R.gain += n; },

            /** Yin's stim: once a day, from Companion on */
            _yinStim(g) {
                const T = this.state(g, 'Dr. Yin'), day = this._day(g);
                if (this.tier(g, 'Dr. Yin') < 1 || T.stimDay === day || !g.getEffectiveMaxBoosters || g.boosterCount >= g.getEffectiveMaxBoosters()) return false;
                T.stimDay = day; g.boosterCount++; g.updateUI();
                return true;
            }
        };

        /** Play a list of beats (lines, choices, branches on memory, gifts) */
        function* talkBeats(s, beats, ctx) {
            for (const b0 of beats) {
                const x = typeof b0 === 'function' ? b0(ctx.T, ctx.g) : b0;
                if (!x) continue;
                if (Array.isArray(x) && Array.isArray(x[0])) { yield* talkBeats(s, x, ctx); continue; }
                if (Array.isArray(x)) {
                    const [who, t, mood] = x, text = typeof t === 'function' ? t(ctx.T, ctx.g) : t;
                    yield s.say(who === '@' ? ctx.id : who, text, mood ? { mood } : {});
                    continue;
                }
                if (x.choose) {
                    s.clearLine();
                    const i = yield s.choose(x.choose);
                    yield s.say('949', x.choose[i]);
                    if (x.gain) Talks._gain(ctx.g, x.gain[i] || 0);
                    if (x.mem) ctx.T.mem[x.mem] = x.vals ? x.vals[i] : i;
                    yield* talkBeats(s, (x.then && x.then[i]) || [], ctx);
                    continue;
                }
                if (x.act) { const note = x.act(ctx.g, ctx.T); if (note) Talks._run.notes.push(note); }
            }
        }

        /* ── The scene: where they stand, the two of them ── */
        defineScene('talk', { hideCrew: true, releaseFrames: 30 }, function* (s) {
            const g = s.game, R = Talks._run;
            if (!R) return;
            const P = TALKS[R.name], T = Talks.state(g, R.name), npc = R.npc, p = g.player;
            const ctx = { g, T, id: TALK_IDS[R.name] || R.name };
            p.angle = Math.atan2(npc.y - p.y, npc.x - p.x);
            const zoom = Math.max(2.2, g.camera.zoom || 1), mid = { x: (p.x + npc.x) / 2 + 150 / zoom, y: (p.y + npc.y) / 2 };   // the two of them left of the choices
            s.cam.cut(mid, zoom * 0.9);
            yield s.fade('in', 24);
            s.cam.to(mid, { zoom, frames: 90, ease: 'smooth' });
            yield* talkBeats(s, P.hello(T, g, Talks.tier(g, R.name)), ctx);
            if (R.name === 'Dr. Yin' && Talks._yinStim(g)) { yield s.say(ctx.id, 'Here. A stim. Don\'t argue, and don\'t tell the others.', { mood: 'smile' }); R.notes.push('+1 STIM'); }
            R.texts = [];
            for (let round = 0; round < 8; round++) {
                const day = Talks._day(g), open = T.today < 2 ? Talks.topics(g, R.name) : [];
                const smallOk = T.small !== day && P.small;
                const opts = open.map(t => t.label);
                if (smallOk) opts.push('Just talk');
                opts.push('Goodbye');
                s.clearLine();
                const i = yield s.choose(opts, { weighty: open.map((t, k) => t.key ? k : -1).filter(k => k >= 0) });
                if (i < open.length) {
                    const t = open[i];
                    s.clearLine();
                    yield* talkBeats(s, t.beats, ctx);
                    T.seen.push(t.id); T.today++;
                    Talks._gain(g, t.gain ?? 4);
                    const tx = typeof t.text === 'function' ? t.text(T, g) : t.text;
                    if (tx) R.texts.push([tx, 9000 + R.texts.length * 6000]);
                    if (T.today >= 2 && Talks.topics(g, R.name).length) yield* talkBeats(s, P.enough, ctx);
                } else if (smallOk && i === open.length) {
                    T.small = day;
                    const band = P.small[Math.min(P.small.length - 1, Talks.tier(g, R.name))];
                    yield* talkBeats(s, band[Math.floor(Math.random() * band.length)], ctx);
                    Talks._gain(g, 1);
                } else break;
            }
            s.clearLine();
            yield s.say(ctx.id, P.bye[Math.min(P.bye.length - 1, Talks.tier(g, R.name))]);
            yield s.fade('out', 24);
        });

        /* ── What closeness pays: the jobs they give her ── */
        (function () {
            const MP = MissionSystem.prototype;
            const bump = (fn, who, k) => function (...a) {
                const m = fn.apply(this, a);
                if (m && typeof m.reward === 'number' && Talks.tier(a[0] || game, who) >= 1) m.reward = Math.round(m.reward * k);
                return m;
            };
            if (MP.generateSalvage) MP.generateSalvage = bump(MP.generateSalvage, 'Anavia', 1.2);
            if (MP.generateBounty) MP.generateBounty = bump(MP.generateBounty, 'Bartender', 1.1);
            if (MP.generateDelivery) MP.generateDelivery = bump(MP.generateDelivery, 'Barista Ren', 1.1);
        })();
