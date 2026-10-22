        /* =====================================================================
           CREW NIGHTS — time with the crew that isn't a job.

             The invite: a "plan" card in Messages (a place, a window of world
             time, who's coming; I'm in / Can't tonight / Set waypoint). The
             group chat asks her out for drinks at Moon City (after a job, or
             when she asks "Drinks tonight?"); one of the crew asks her out on
             their own, to their place (their old feed pins: 747 for coffee at
             Cozy Cafe, Victoria at Torque, Sabrina at the Moon City bar, Yenna
             at Biggs Park, Josh at Neural Systems, Max at Enni Cole), or when
             she asks "Want to hang out?".

             The night: turning up inside the window (the venue's map, or the
             park on foot) plays the scene `crew_night`: whoever came is there,
             seated. A group night: the host's hello, a toast she picks (each of
             them likes one), talk about the last job, then who she sits with,
             and a moment with them. A night with one of them: their hello, a
             thing to do together with a choice they care about, the moment, a
             goodbye. The moments are written per person and per how close they
             are (CREW_MOMENTS: acquaintance, trusted, inner circle), each with
             a reply that lands better than the other.

             What it's worth: relationship (BondingSystem's tiers) — the one she
             sat with most, everyone who came a little. Standing her friends up
             costs the host a point. Closer, they look out for her: a Companion
             texts what a bounty's mark is carrying; a Trusted friend leaves her
             a stim after a rough job.

           State: phoneSystem.feed.crew (saved and reset with the feed).
           ===================================================================== */
        const CREW_IDS = { '747': '747', Victoria: 'victoria', Yenna: 'yenna', Sabrina: 'sabrina', Max: 'max', Josh: 'josh' };

        /** Where a night can be: the map it plays on, where everyone is, and who asks her there on their own */
        const CREW_VENUES = {
            moon_city: {
                map: 'moon_city_nightclub', label: 'Moon City', what: 'Drinks at Moon City', host: 'Sabrina',
                // The booth by the foyer: a U of velvet round an oval table, open to the floor
                group: {
                    me: { x: 535, y: 950, a: -Math.PI / 2, pose: 'sit' }, cam: { x: 590, y: 898 }, zoom: 2.5,
                    // the two arms of the U, then standing at the open end and by the arms (leaning on the velvet)
                    seats: [{ x: 486, y: 916, a: 0 }, { x: 584, y: 916, a: Math.PI }, { x: 505, y: 866, a: Math.PI / 2, pose: 'lean' },
                            { x: 566, y: 866, a: Math.PI / 2, pose: 'arms_crossed' }, { x: 446, y: 912, a: 0, pose: 'lean' }, { x: 624, y: 912, a: Math.PI, pose: 'lean' }],
                    after: { x: 535, y: 860 }
                },
                // Sabrina alone: two stools at the bar
                solo: { me: { x: 510, y: 596, a: Math.PI, pose: 'sit' }, them: { x: 510, y: 659, a: Math.PI, pose: 'sit' }, cam: { x: 495, y: 628 }, zoom: 3.2, after: { x: 560, y: 628 } }
            },
            cozy_cafe: { map: 'cozy_cafe_interior', label: 'Cozy Cafe', what: 'Coffee at Cozy Cafe', host: '747',
                solo: { me: { x: 167, y: 433, a: Math.PI / 2, pose: 'sit' }, them: { x: 309, y: 540, a: Math.PI, pose: 'sit' }, cam: { x: 230, y: 500 }, zoom: 2.9, after: { x: 380, y: 520 } } },
            torque_auto: { map: 'auto_shop', label: 'Torque Auto', what: 'Wraps at Torque Auto', host: 'Victoria',
                solo: { me: { x: 560, y: 470, a: -0.6, pose: 'arms_crossed' }, them: { x: 640, y: 452, a: -2.4, pose: 'lean' }, cam: { x: 600, y: 440 }, zoom: 2.8, after: { x: 600, y: 520 } } },
            biggs_park: { map: 'sdc', label: 'Biggs Park', what: 'Cans at Biggs Park', host: 'Yenna', park: { x: 8680, y: 8080, r: 320 },
                solo: { me: { x: 8650, y: 8100, a: -Math.PI / 2 }, them: { x: 8700, y: 8100, a: -Math.PI / 2, pose: 'arms_crossed' }, cam: { x: 8675, y: 8070 }, zoom: 2.7, after: { x: 8650, y: 8110 } } },
            neural_sys: { map: 'neural_sys_interior', label: 'Neural Systems', what: 'Browsing at Neural Systems', host: 'Josh',
                solo: { me: { x: 470, y: 340, a: -Math.PI / 2 }, them: { x: 530, y: 340, a: -Math.PI / 2, pose: 'arms_crossed' }, cam: { x: 500, y: 310 }, zoom: 2.9, after: { x: 500, y: 400 } } },
            enni_cole: { map: 'enni_cole_interior', label: 'Enni Cole', what: 'Shopping at Enni Cole', host: 'Max',
                solo: { me: { x: 440, y: 985, a: Math.PI }, them: { x: 445, y: 1035, a: Math.PI, pose: 'arms_crossed' }, cam: { x: 415, y: 1000 }, zoom: 2.8, after: { x: 480, y: 1010 } } },
        };
        /** Each of the crew's own place (the pins they used to send) */
        const CREW_HOME_VENUE = { '747': 'cozy_cafe', Victoria: 'torque_auto', Sabrina: 'moon_city', Yenna: 'biggs_park', Josh: 'neural_sys', Max: 'enni_cole' };

        /* ── A group night ── */
        const CREW_OPENERS = {
            Victoria: ['Nine! Finally. I ordered for you. Don\'t ask what it is.'],
            Sabrina: ['Look who remembered she has friends.'],
            Max: ['You\'re late. Sit down before someone takes your seat.'],
            Josh: ['You arrived four minutes after the median. Acceptable.'],
            Yenna: ['Booth with a clear view of both exits. You\'re welcome.'],
            '747': ['There she is. Sit, Nine. Tonight we\'re off the clock.'],
        };
        const CREW_BOOTH = {
            Victoria: 'The DJ keeps looking at me. I\'m going to let him suffer.', Sabrina: 'The drinks here are terrible. I\'ve had four.',
            Max: 'Music\'s too loud. Drinks are too small. This is bullshit.', Josh: 'Fun fact: this booth has the best acoustics in the building. For eavesdropping.',
            Yenna: 'Bartender\'s been watering the gin. I can tell from here.', '747': 'Good to see everyone in one piece for once.',
        };
        const CREW_TOASTS = ['To the crew.', 'To getting paid.', 'To surviving Mirabel.'];
        /** Which toast each of them likes (and a word for it) */
        const CREW_TOAST_TASTE = { '747': 0, Yenna: 0, Victoria: 1, Josh: 1, Max: 2, Sabrina: 2 };
        const CREW_TOAST_LINES = [
            { '747': 'To the crew.', Yenna: 'To the crew. Every one of you.' },
            { Victoria: 'Now THAT I\'ll drink to.', Josh: 'Technically we get paid either way. But yes.' },
            { Max: 'Ha! Finally, someone says it.', Sabrina: 'We\'ll need more glasses.' },
        ];
        const CREW_JOB_TALK = {
            bounty: { Yenna: 'That last mark had a decent rifle. Had.', Josh: '{job}. Closed. I put a little star next to it.', Max: '{job} won\'t be bothering anyone.',
                      Victoria: 'Can we talk about how dramatic that last bounty was?', Sabrina: 'You\'ve been busy. {job}, was it?', '747': 'Good work on {job}, Nine.' },
            delivery: { Victoria: 'I hear we\'re couriers now. Do I get a cute hat?', Josh: 'Amber rated you five stars. I checked. Twice.', Max: 'Boxes. We fought gods and now we carry boxes.',
                        Sabrina: 'How\'s the delivery life? Tips any good?', Yenna: 'Delivery routes are good recon. Smart.', '747': 'Honest work. Nothing wrong with that.' },
            salvage: { Max: 'Anavia\'s scrap jobs pay. I\'ll give her that.', Josh: 'That salvage haul was worth more than this bar.', Victoria: 'You came back covered in rust. Iconic.',
                       Yenna: 'Salvage guards are getting smarter. Watch it.', Sabrina: 'Treasure hunting for Anavia. How romantic.', '747': 'Careful with Anavia, Nine. Her gifts have strings.' },
            none: { Victoria: 'Quiet week. I hate quiet weeks.', Max: 'Nothing\'s blown up in days. I\'m suspicious.', Josh: 'Statistically, something terrible is about to happen.',
                    Sabrina: 'No jobs, no drama. Boring.', Yenna: 'Quiet means someone\'s planning something.', '747': 'Enjoy the quiet while it lasts.' },
        };
        const CREW_CLOSERS = {
            '747': 'Same time next week. Nobody dies before then.', Victoria: 'Okay, I\'m drunk. Somebody walk me to a car.', Sabrina: 'Last round. Then I\'m going home. Alone. Probably.',
            Max: 'Fine. That wasn\'t terrible. Don\'t tell anyone I said that.', Josh: 'I\'ll put it on the group card. You\'re welcome.', Yenna: 'I\'ll take the back door. Old habits.',
        };

        /* ── A night with one of them ── */
        const CREW_SOLO = {
            '747': {
                open: [['747', 'Nine. I got you the usual. Black, too strong.'], ['747', 'Sit. No contracts tonight. Just coffee.']],
                ask: [['747', 'Settle something for me. What\'s the point of all this, after the jobs?']],
                opts: ['Keeping all of you alive.', 'Getting rich and disappearing.', 'Finding the Dark Maker.'], liked: 0,
                replies: [[['747', '…Yeah. Me too. Funny how that turns into the whole point.']],
                          [['747', 'Hm. Take me with you when you disappear. I\'ll carry the bags.']],
                          [['747', 'Don\'t let him become the only thing you are, Nine.']]],
                close: [['747', 'Same time next week? Coffee\'s on me.']],
            },
            Victoria: {
                open: [['victoria', 'Okay, look at this. LOOK at it. Torque got the new wraps in.'], ['victoria', 'I need a second opinion. A good one. Not Max\'s.']],
                ask: [['victoria', 'Which one? Be honest. Be very honest.']],
                opts: ['The chrome rose gold.', 'Matte black, obviously.', 'The holographic one.'], liked: 2,
                replies: [[['victoria', 'Classy. Bit safe. I love you anyway.']],
                          [['victoria', 'Matte black is what Max would pick. I\'m hurt.']],
                          [['victoria', 'YES. Finally, someone with taste. I\'m putting it on your car.'], ['949', 'You are not.'], ['victoria', 'I am absolutely going to.']]],
                close: [['victoria', 'This was fun. You\'re fun. Don\'t tell the others, they\'ll get jealous.']],
            },
            Sabrina: {
                open: [['sabrina', 'You came. I was starting to think I\'d have to drink alone. Again.'], ['sabrina', 'Sit. The bartender knows my order. He\'ll guess yours.']],
                ask: [['sabrina', 'Tell me something nobody else in the crew knows about you.']],
                opts: ['I hate the sound of rain.', 'I talk to my reflection.', 'Nice try.'], liked: 2,
                replies: [[['sabrina', 'Rain. In this city. You poor thing.']],
                          [['sabrina', 'Everyone does. You\'re just honest about it.']],
                          [['sabrina', 'Ha. Good. Keep your secrets, Nine. It suits you.']]],
                close: [['sabrina', 'Next round\'s yours. Next time.']],
            },
            Yenna: {
                open: [['yenna', 'Cans are set up on the rail. Fifty paces.'], ['yenna', 'Loser buys dinner. I\'ve never bought dinner.']],
                ask: [['yenna', 'Your shot. Take your time.']],
                opts: ['Take it slow. Breathe.', 'Quick draw. Don\'t think.', 'Shoot the can she\'s aiming at.'], liked: 0,
                replies: [[['yenna', '…Clean. You actually listened when I taught you.']],
                          [['yenna', 'Missed by a mile. But it looked cool.']],
                          [['yenna', 'Did you just— okay. That\'s funny. I hate that it\'s funny.']]],
                close: [['yenna', 'Same spot next time. I\'ll bring a harder target.']],
            },
            Josh: {
                open: [['josh', 'Prisma has a sale on V.O.C.A.L.s. I\'ve been here for two hours.'], ['josh', 'I need you to stop me from buying a voice that sounds like a cello.']],
                ask: [['josh', 'Be honest. Which one?']],
                opts: ['The cello. Obviously.', 'Keep your own voice.', 'The one that sounds like Max.'], liked: 1,
                replies: [[['josh', 'You\'re enabling me. I appreciate it. I\'m not buying it.']],
                          [['josh', '…That\'s the nicest thing anyone\'s said to me this month.']],
                          [['josh', 'This is bullshit. See? It works. Terrifying.']]],
                close: [['josh', 'Thanks for coming. I logged it as a team-building exercise.']],
            },
            Max: {
                open: [['max', 'Don\'t laugh.'], ['max', 'I need an opinion on a jacket. One opinion. Yours.']],
                ask: [['max', 'Leather or the long coat?']],
                opts: ['The leather. You look dangerous.', 'The long coat. Very detective.', 'Honestly? Neither.'], liked: 0,
                replies: [[['max', 'Dangerous. Yeah. Okay. Yeah.']],
                          [['max', 'I look like Josh in this. Never mind.']],
                          [['max', 'Of course. Of course you say that.'], ['max', '…Thanks for being straight with me.']]],
                close: [['max', 'This was… fine. Good. It was good. Don\'t make it weird.']],
            },
        };

        /**
         * The moments: a few lines, a question for her, and what each reply gets. `good` is the reply that lands.
         * Bands by how close they are: 0 acquaintance/companion, 1 trusted, 2 inner circle.
         */
        const CREW_MOMENTS = {
            '747': [
                [{ lines: [['747', 'You ever think about the first job? The one in the rain?'], ['747', 'You froze for half a second. I almost didn\'t see it.']],
                   opts: ['I didn\'t freeze.', 'You saw. Thanks for not saying anything.'], good: 1,
                   after: [[['747', 'Sure you didn\'t.']], [['747', 'That\'s what partners are for, Nine.']]] },
                 { lines: [['747', 'Mirabel asked me how you\'re holding up.'], ['747', 'I told her you\'re fine. Are you?']],
                   opts: ['I\'m fine.', 'Not really. But I will be.'], good: 1,
                   after: [[['747', 'Okay. The offer stands, whenever.']], [['747', 'That\'s a better answer. I\'ve got you.']]] }],
                [{ lines: [['747', 'If something happens to me out there, I want you to lead them.'], ['747', 'They listen to you more than you think.']],
                   opts: ['Nothing\'s going to happen to you.', 'I will. I promise.'], good: 1,
                   after: [[['747', 'You don\'t get to promise that. But thanks.']], [['747', 'Good. Then I can sleep tonight.']]] }],
                [{ lines: [['747', 'I don\'t say this enough.'], ['747', 'I\'d follow you anywhere, Nine. Into anything.']],
                   opts: ['Same. Always.', 'Don\'t get sentimental on me.'], good: 0,
                   after: [[['747', 'Always.']], [['747', 'Too late. It\'s out there now.']]] }],
            ],
            Victoria: [
                [{ lines: [['victoria', 'Can I tell you something embarrassing?'], ['victoria', 'I practise my one-liners in the mirror. Before jobs.']],
                   opts: ['I can tell. They\'re good.', 'That\'s so embarrassing.'], good: 0,
                   after: [[['victoria', 'Right?! Finally someone appreciates the craft.']], [['victoria', 'Wow. Okay. I\'m telling everyone you snore.']]] },
                 { lines: [['victoria', 'Max says I talk too much on comms.']],
                   opts: ['Max says that about breathing.', 'You do, a little.'], good: 0,
                   after: [[['victoria', 'HA. He does. I\'m keeping that one.']], [['victoria', 'Traitor. A cute traitor, but a traitor.']]] }],
                [{ lines: [['victoria', 'Real talk for one second.'], ['victoria', 'I\'m scared all the time out there. I just make it look fabulous.']],
                   opts: ['Me too. Every job.', 'You hide it well.'], good: 0,
                   after: [[['victoria', '…Okay. Okay, that helps more than you know.']], [['victoria', 'Thanks. I think. That\'s the whole trick.']]] }],
                [{ lines: [['victoria', 'You\'re my favourite. Out of everyone. Don\'t tell 747.']],
                   opts: ['You\'re mine too.', 'I\'m telling 747.'], good: 0,
                   after: [[['victoria', 'I KNEW it. Okay, I\'m crying. Ignore me.']], [['victoria', 'You wouldn\'t dare. …You would. I love that about you.']]] }],
            ],
            Yenna: [
                [{ lines: [['yenna', 'You check corners the way I taught you. I noticed.']],
                   opts: ['Best teacher in the crew.', 'I figured it out myself.'], good: 0,
                   after: [[['yenna', 'Don\'t let the others hear that. They\'ll sulk.']], [['yenna', 'Sure you did.']]] },
                 { lines: [['yenna', 'I keep a list. Every shot I didn\'t take.'], ['yenna', 'It\'s a short list. It still bothers me.']],
                   opts: ['Those are the ones that count.', 'You should burn it.'], good: 0,
                   after: [[['yenna', 'Yeah. You get it.']], [['yenna', 'Maybe. Not yet.']]] }],
                [{ lines: [['yenna', 'I trust you on my blind side. I don\'t say that to people.']],
                   opts: ['I\'ll always cover it.', 'Watch your own side.'], good: 0,
                   after: [[['yenna', 'I know. That\'s why I said it.']], [['yenna', '…Fair. Still trust you.']]] }],
                [{ lines: [['yenna', 'When this is all over, I\'m buying a place with a view of nothing. No rooftops. No angles.'], ['yenna', 'There\'s a room in it for you.']],
                   opts: ['I\'ll bring the coffee.', 'You\'d be bored in a week.'], good: 0,
                   after: [[['yenna', 'Good. Black. Too strong.']], [['yenna', 'Probably. Come anyway.']]] }],
            ],
            Sabrina: [
                [{ lines: [['sabrina', 'Everyone thinks I\'m mean. I\'m just accurate.']],
                   opts: ['Accurate and mean.', 'You\'re kinder than you let on.'], good: 0,
                   after: [[['sabrina', 'Exactly. See, you get me.']], [['sabrina', 'Shh. You\'ll ruin my reputation.']]] },
                 { lines: [['sabrina', 'Victoria tried to braid my hair on the last job. Mid-firefight.']],
                   opts: ['Did you let her?', 'That\'s Victoria.'], good: 0,
                   after: [[['sabrina', '…She did a good job. I hate it.']], [['sabrina', 'That\'s Victoria.']]] }],
                [{ lines: [['sabrina', 'I used to work alone. Liked it.'], ['sabrina', 'Then you lot happened.']],
                   opts: ['Sorry about that.', 'You\'re stuck with us now.'], good: 1,
                   after: [[['sabrina', 'Don\'t be. That\'s the point.']], [['sabrina', 'Yeah. Turns out I don\'t mind.']]] }],
                [{ lines: [['sabrina', 'If you ever leave the crew, I\'m coming with you. I\'m not asking.']],
                   opts: ['I\'d never go without you.', 'Bossy.'], good: 0,
                   after: [[['sabrina', 'Good answer. Correct answer.']], [['sabrina', 'You like it.']]] }],
            ],
            Max: [
                [{ lines: [['max', 'Everyone thinks I hate everything.'], ['max', 'I hate MOST things.']],
                   opts: ['What don\'t you hate?', 'That tracks.'], good: 0,
                   after: [[['max', 'Engines. Rain on a tin roof. This crew, mostly.']], [['max', 'Yeah. It does.']]] },
                 { lines: [['max', 'Josh fixed my rifle sight while I was asleep. Didn\'t say a word.'], ['max', 'I don\'t know what to do with that.']],
                   opts: ['Say thank you.', 'Fix something of his.'], good: 1,
                   after: [[['max', 'Out loud? Ugh. Fine.']], [['max', '…Yeah. Yeah, that\'s better. I like that.']]] }],
                [{ lines: [['max', 'I lose my temper. On jobs. You know that.'], ['max', 'You never hold it against me.']],
                   opts: ['You always come back.', 'I hold it a little.'], good: 0,
                   after: [[['max', 'I always will. For you lot.']], [['max', 'Fair. I\'ll work on it. Probably.']]] }],
                [{ lines: [['max', 'I had a sister. She\'d have liked you.'], ['max', 'That\'s all. I just wanted you to know.']],
                   opts: ['Tell me about her sometime.', 'I\'m sorry, Max.'], good: 0,
                   after: [[['max', '…Yeah. Sometime. Thanks, Nine.']], [['max', 'Don\'t be. Just… stick around.']]] }],
            ],
            Josh: [
                [{ lines: [['josh', 'I keep a file on everyone in the crew. For safety.'], ['josh', 'Yours is the thinnest. That bothers me.']],
                   opts: ['Good. Keep it thin.', 'Ask me anything.'], good: 1,
                   after: [[['josh', 'Noted. Suspicious, but noted.']], [['josh', 'Favourite colour? …I\'ll start small.']]] },
                 { lines: [['josh', 'Statistically, we should be dead four times over.']],
                   opts: ['We\'re just that good.', 'Stop counting.'], good: 0,
                   after: [[['josh', 'That\'s not how statistics work. But I\'ll allow it.']], [['josh', 'I can\'t. It\'s how I relax.']]] }],
                [{ lines: [['josh', 'Everyone says "you\'re welcome" is my thing.'], ['josh', 'It\'s because nobody ever said thank you first.']],
                   opts: ['Thank you, Josh. For everything.', 'It\'s a good thing.'], good: 0,
                   after: [[['josh', '…You\'re welcome. That one felt different.']], [['josh', 'It\'s grown on me.']]] }],
                [{ lines: [['josh', 'I rewrote my file on you. It\'s one line now.'], ['josh', '"Would die for her." Then I deleted it. Too dramatic.']],
                   opts: ['Put it back.', 'Same, Josh.'], good: 1,
                   after: [[['josh', 'Fine. Saved. Backed up twice.']], [['josh', '…Logged. Permanently.']]] }],
            ],
        };

        /* ── Invites and RSVPs ── */
        const CREW_GROUP_INVITE = [
            { who: 'Victoria', text: 'Drinks. Moon City. First round\'s on Josh.' },
            { who: 'Sabrina', text: 'Booth at Moon City tonight. Don\'t make me drink with Max alone.' },
            { who: 'Josh', text: 'Calendar invite: Moon City, tonight. Attendance is mandatory. Kind of.' },
        ];
        const CREW_YES = { '747': 'See you there, Nine.', Victoria: 'YAY. Wear something cute.', Sabrina: 'Don\'t be late.', Max: 'Fine. Good.', Josh: 'Logged.', Yenna: 'Copy that.' };
        const CREW_NO = { '747': 'Another time.', Victoria: 'Booo. Fine.', Sabrina: 'Your loss.', Max: 'Whatever.', Josh: 'Noted. Sadly.', Yenna: 'Understood.' };
        const CREW_STOOD_UP = { '747': 'We waited, Nine. Next time.', Victoria: 'We waited ALL night. Rude.', Sabrina: 'Stood up. Bold.', Max: 'Thanks for nothing.', Josh: 'Your seat was empty. I noticed.', Yenna: 'You didn\'t show. Everything okay?' };
        const CREW_ASK_BACK = { '747': 'Always. Coffee?', Victoria: 'Obviously. Torque. Now.', Sabrina: 'Mm. My bar, then.', Max: '…Sure. I need help with something anyway.', Josh: 'Yes. I mean, I\'m free. Yes.', Yenna: 'Park. Bring your aim.' };
        /** The perks of being close */
        const CREW_INTEL = { '747': 'Heads up. {mark}\'s carrying a {gun}. Stay behind cover.', Victoria: '{mark} has a {gun}. Rude. Be careful.', Yenna: '{mark}: {gun}. Watch their sightlines.',
                             Sabrina: 'Your mark\'s packing a {gun}. Try not to get shot.', Max: '{mark} has a {gun}. Don\'t do anything stupid.', Josh: 'Pulled {mark}\'s file. They carry a {gun}. You\'re welcome.' };
        const CREW_STIM = { '747': 'Left a stim in your bag. Don\'t argue.', Victoria: 'You looked rough. There\'s a stim in your pocket. You\'re welcome, darling.', Yenna: 'Stim in your kit. Use it.',
                            Sabrina: 'Slipped you a stim. Don\'t make it a habit.', Max: 'Stim. Your bag. Don\'t make me patch you up.', Josh: 'Restocked one stim. Logged as a gift.' };

        /** Asking her out again, after the first time (the feed's pins are the first) */
        const CREW_SOLO_ASK = {
            Victoria: ['Torque\'s open late. Come judge my paint choices.', 'I need you at the garage. It\'s urgent. It\'s about rims.', 'Bored. Garage. You. Now.'],
            Sabrina: ['Bar\'s quiet tonight. Come be quiet with me.', 'I\'m at Moon City. Drinking alone is a choice and I\'m un-choosing it.', 'Booth at the back. Bring your bad jokes.'],
            Yenna: ['Range is clear. Fifty paces. Loser buys.', 'Park, after dark. The cans miss you.', 'Need a spotter. Not for work.'],
            Josh: ['Neural Systems got a new shipment. I require supervision.', 'I\'ve booked thirty minutes for us. That came out wrong. Come to Neural Systems.', 'Prisma restocked. Please stop me.'],
            Max: ['Enni Cole. I need a second opinion. Again. Shut up.', 'Found a jacket. Need your eyes. Don\'t tell Victoria.', 'Come to Enni Cole. Don\'t make it weird.']
        };

        const CrewNights = {
            _run: null,          // the night playing right now

            state() {
                const f = phoneSystem.feed;
                return f.crew || (f.crew = { plan: null, seen: {}, nights: 0, lastAsk: {} });
            },
            _mate(g, name) { return (g.teammates || []).find(t => t.name === name) || null; },
            _crewHere(g) { return (g.teammates || []).filter(t => CREW_IDS[t.name] && t.recruited && !t.downed).map(t => t.name); },
            _tier(g, name) { const t = this._mate(g, name); return t && g.bonding ? g.bonding.getTier(t.relationship || 0) : 0; },
            _pick(a) { return a[Math.floor(Math.random() * a.length)]; },

            /** Bond with one of them; a tier crossed is announced (as a talk in the apartment does) */
            bond(g, name, n) {
                const t = this._mate(g, name);
                if (!t || !n) return 0;
                const before = g.bonding ? g.bonding.getTier(t.relationship || 0) : 0;
                t.relationship = Math.max(0, Math.min(100, (t.relationship || 0) + n));
                const after = g.bonding ? g.bonding.getTier(t.relationship) : 0;
                if (after > before && BONDING_TIERS[after].message) g.addPausableTimeout(() => showMessage(`${name.toUpperCase()}: ${BONDING_TIERS[after].message}`), 2600);
                return n;
            },

            /* ───────────────────────── the invite ───────────────────────── */
            /** The window: from the next half hour, for four hours of world time */
            _window(g) {
                const now = g.worldMinutes || 0, from = Math.ceil((now + 15) / 30) * 30;
                return { from, to: from + 240 };
            },
            /**
             * Ask her out. who: the one asking (in the group: the one who wrote); solo: just them and her.
             * Returns the plan, or null when one's already on.
             */
            invite(who, venue, text, opts = {}) {
                const g = game, S = this.state();
                if (S.plan && (S.plan.state === 'open' || S.plan.state === 'yes')) return null;
                const V = CREW_VENUES[venue];
                if (!V) return null;
                const crew = this._crewHere(g);
                let going;
                if (opts.solo) going = [who];
                else {
                    // Who says yes: three to five of them, the asker always
                    const rest = crew.filter(n => n !== who).sort(() => Math.random() - 0.5);
                    going = [who, ...rest.slice(0, Math.max(2, Math.min(rest.length, 2 + Math.floor(Math.random() * 3))))];
                }
                const w = this._window(g);
                const plan = S.plan = { id: `plan_${Date.now()}`, venue, who: going, host: who, solo: !!opts.solo, from: w.from, to: w.to, state: opts.mine ? 'yes' : 'open', chat: opts.solo ? who : MSG_GROUP };
                phoneSystem.sendText(plan.chat, text, true, opts.delay || 2200, { kind: 'plan', id: plan.id, who: opts.solo ? undefined : who, data: { plan: plan.id, venue, state: plan.state } });
                return plan;
            },
            _planRec(plan) {
                const h = plan && phoneSystem.messageHistory[plan.chat];
                return h ? h.find(r => r.kind === 'plan' && r.data && r.data.plan === plan.id) : null;
            },
            _setState(plan, st) {
                plan.state = st;
                const rec = this._planRec(plan);
                if (rec) rec.data.state = st;
                if (phoneSystem._activeContact && phoneSystem._activeContact.name === plan.chat) phoneSystem.renderThread(phoneSystem._activeContact);
            },
            rsvp(yes) {
                const plan = this.state().plan;
                if (!plan || plan.state !== 'open') return;
                this._setState(plan, yes ? 'yes' : 'no');
                const voice = plan.solo ? plan.host : this._pick(plan.who);
                const text = (yes ? CREW_YES : CREW_NO)[voice] || (yes ? 'See you there.' : 'Another time.');
                phoneSystem.sendText(plan.chat, text, true, 1600, plan.solo ? null : { who: voice });
                if (yes && phoneSystem.setWaypoint) this._waypoint(plan);
                audioSys.sfx('ui');
            },
            _waypoint(plan) {
                const V = CREW_VENUES[plan.venue];
                return phoneSystem.setWaypoint(V.park ? { x: V.park.x, y: V.park.y, label: V.label, kind: V.what } : plan.venue);
            },

            /** The card in the thread: where, when, who, and her answer */
            card(rec) {
                const d = rec.data || {}, S = this.state(), plan = S.plan && S.plan.id === d.plan ? S.plan : null, V = CREW_VENUES[d.venue] || CREW_VENUES.moon_city;
                const st = plan ? plan.state : d.state === 'open' || d.state === 'yes' ? 'lapsed' : d.state;
                const card = document.createElement('div');
                card.className = 'mb-card mb-plan ' + st;
                const k = document.createElement('div'); k.className = 'k'; k.textContent = plan && plan.solo ? 'Plans · Just you two' : 'Plans · Crew night';
                const b = document.createElement('b'); b.textContent = V.what;
                const p = document.createElement('p');
                if (plan) p.textContent = `${phoneSystem._clock(plan.from)} – ${phoneSystem._clock(plan.to)}`;
                const faces = document.createElement('div'); faces.className = 'mb-plan-faces';
                for (const n of (plan ? plan.who : [])) faces.appendChild(phoneSystem._face(n, 'mav mb-plan-av', 48));
                const url = phoneSystem._pinMap(V.park ? { x: V.park.x, y: V.park.y } : d.venue);
                const map = document.createElement('div'); map.className = 'mb-map mb-brief-map';
                if (url) map.style.backgroundImage = `url(${url})`; else map.classList.add('sketch');
                map.appendChild(document.createElement('i'));
                const row = document.createElement('div'); row.className = 'row';
                const btn = (label, fn, cls = '') => { const x = document.createElement('button'); x.className = 'mb-btn ' + cls; x.textContent = label; x.addEventListener('click', e => { e.stopPropagation(); fn(); }); row.appendChild(x); };
                if (st === 'open') { btn('I\'m in', () => this.rsvp(true)); btn('Can\'t tonight', () => this.rsvp(false), 'ghost'); }
                else {
                    const em = document.createElement('em');
                    em.textContent = { yes: '✓ You\'re going', no: 'You passed', done: '♡ A good night', missed: 'You didn\'t make it', lapsed: 'That night\'s gone' }[st] || '';
                    row.appendChild(em);
                    if (st === 'yes') btn('Set waypoint', () => { if (this._waypoint(plan)) audioSys.sfx('ui'); }, 'ghost');
                }
                card.append(k, b, p, faces, map, row);
                return card;
            },

            /* ───────────────────────── turning up ───────────────────────── */
            /** Every second: is she there, in time? Has the night gone without her? */
            tick() {
                const g = typeof game !== 'undefined' && game;
                if (!g || !g.running || !g.player || !g.activeMap || !phoneSystem.feed) return;
                const plan = this.state().plan;
                if (!plan || (plan.state !== 'open' && plan.state !== 'yes')) return;
                const now = g.worldMinutes || 0;
                if (now > plan.to) {
                    this._setState(plan, plan.state === 'yes' ? 'missed' : 'lapsed');
                    if (plan.state === 'missed') {
                        phoneSystem.sendText(plan.chat, CREW_STOOD_UP[plan.host] || 'We waited.', true, 1800, plan.solo ? null : { who: plan.host });
                        this.bond(g, plan.host, -1);
                    }
                    return;
                }
                if (now < plan.from || (g.scenes && g.scenes.running) || (g.pauseSystem && g.pauseSystem.tokens && g.pauseSystem.tokens.size)) return;
                const V = CREW_VENUES[plan.venue];
                if (g.activeMap.id !== V.map) { this._arrived = 0; return; }
                if (V.park && (g.isDriving || Math.hypot(g.player.x - V.park.x, g.player.y - V.park.y) > V.park.r)) { this._arrived = 0; return; }
                if (g.missions && g.missions.activeMission && g.missions.activeMission.type !== 'delivery' && (g.enemies || []).some(e => !e.dead && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 500)) return;
                if (++this._arrived < 2) return;          // a beat inside the door first
                this._arrived = 0;
                this.play(plan);
            },

            play(plan) {
                const g = game;
                this._setState(plan, 'done');
                const S = this.state();
                S.nights++;
                this._run = { plan, gains: {}, sat: null };
                if (typeof captionSystem !== 'undefined' && captionSystem.element) { captionSystem.queue.length = 0; captionSystem.element.classList.remove('show'); }
                g.scenes.play('crew_night').then(r => this._wrap(g, r && r.skipped));
            },

            /** After the night (played or skipped): the bonds, and her back in the world by the table */
            _wrap(g, skipped) {
                const R = this._run;
                this._run = null;
                if (!R) return;
                const plan = R.plan, V = CREW_VENUES[plan.venue], at = (plan.solo ? V.solo : V.group || V.solo).after;
                if (skipped && !Object.keys(R.gains).length) for (const n of plan.who) R.gains[n] = plan.solo ? 6 : 3;
                const parts = [];
                for (const n of plan.who) { const v = this.bond(g, n, R.gains[n] || 0); if (v) parts.push(`${n.toUpperCase()} +${v}`); }
                if (at && g.activeMap.id === V.map) { g.player.x = at.x; g.player.y = at.y; }
                g.player.visible = true;
                g.camera.x = g.player.x; g.camera.y = g.player.y;
                if (parts.length) g.addPausableTimeout(() => { showMessage(`♡ ${parts.join(' · ')}`); audioSys.sfx('ui'); }, 600);
                // The thread remembers it
                g.addPausableTimeout(() => phoneSystem.sendText(plan.chat, plan.solo ? CREW_SOLO[plan.host].close[0][1] : 'Best night in a while. Same time next week?', true, 2000,
                    plan.solo ? null : { who: this._pick(plan.who) }), 4000);
            },

            /** The moment she gets with one of them, by how close they are (unseen ones first) */
            moment(g, name) {
                const all = CREW_MOMENTS[name];
                if (!all) return null;
                const band = Math.min(2, Math.max(0, this._tier(g, name) - 1));
                const pool = all[band], S = this.state(), key = `${name}:${band}`;
                const seen = S.seen[key] || (S.seen[key] = []);
                let i = pool.findIndex((m, k) => !seen.includes(k));
                if (i < 0) { i = Math.floor(Math.random() * pool.length); S.seen[key] = []; }
                S.seen[key].push(i);
                return pool[i];
            },

            /* ───────────────────────── being close ───────────────────────── */
            /** A Companion or closer tells her what the mark is carrying */
            onBounty(g, m) {
                if (!m || m.type !== 'bounty' || !m.weaponId || !this._freeOk()) return;
                const close = this._crewHere(g).filter(n => this._tier(g, n) >= 1);
                if (!close.length || Math.random() > 0.7) return;
                const who = this._pick(close), item = ITEM_REGISTRY[m.weaponId];
                const gun = item ? item.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'gun';
                phoneSystem.sendText(who, CREW_INTEL[who].replace('{mark}', m.targetName || 'Your mark').replace('{gun}', gun), true, 5200);
            },
            /** A Trusted friend leaves her a stim after a job that went badly */
            onJobDone(g) {
                if (!this._freeOk() || g.playerHealth > g.maxPlayerHealth * 0.35) return;
                if (!g.getEffectiveMaxBoosters || g.boosterCount >= g.getEffectiveMaxBoosters()) return;
                const close = this._crewHere(g).filter(n => this._tier(g, n) >= 2);
                if (!close.length) return;
                const who = this._pick(close);
                g.boosterCount++;
                g.updateUI();
                phoneSystem.sendText(who, CREW_STIM[who], true, 4200);
            },
            _freeOk() { return phoneSystem._freePlay ? phoneSystem._freePlay() : true; },
        };

        /* ── The scene: one night, group or one-on-one ── */
        defineScene('crew_night', { hideCrew: true, showPlayer: false, releaseFrames: 40 }, function* (s) {
            const g = s.game, R = CrewNights._run;
            if (!R) return;
            const plan = R.plan, V = CREW_VENUES[plan.venue], set = plan.solo ? V.solo : V.group;
            const id = n => CREW_IDS[n] || n;
            const me = s.actor('949', stellaSceneLook(g, false), set.me.x, set.me.y, set.me.a);
            if (set.me.pose) me.setPose(set.me.pose);
            const A = {};
            plan.who.forEach((n, i) => {
                const seat = plan.solo ? set.them : set.seats[i % set.seats.length];
                A[n] = s.actor(n, APPEARANCES[n], seat.x, seat.y, seat.a);
                const pose = seat.pose || (plan.solo ? null : 'sit');
                if (pose) A[n].setPose(pose);
            });
            s.cam.cut(set.cam, set.zoom * 0.85);
            yield s.fade('in', 50);
            s.marker(V.label, `${plan.solo ? plan.host : 'Crew night'} · ${phoneSystem._clock(g.worldMinutes)}`);
            s.cam.to(set.cam, { zoom: set.zoom, frames: 160, ease: 'smooth' });
            const gain = (n, v) => { R.gains[n] = (R.gains[n] || 0) + v; };
            const sayAll = function* (lines) { for (const [who, text] of lines) yield s.say(who, text); };

            if (plan.solo) {
                const C = CREW_SOLO[plan.host];
                gain(plan.host, 6);
                yield* sayAll(C.open);
                yield* sayAll(C.ask);
                const pick = yield s.choose(C.opts);
                yield s.say('949', C.opts[pick]);
                if (pick === C.liked) gain(plan.host, 2);
                yield* sayAll(C.replies[pick]);
            } else {
                for (const n of plan.who) gain(n, 3);
                const host = plan.who.includes('Victoria') ? 'Victoria' : plan.host;
                s.cam.to(A[host], { zoom: set.zoom * 1.1, frames: 70 });
                yield s.say(id(host), CrewNights._pick(CREW_OPENERS[host]));
                const second = plan.who.find(n => n !== host);
                if (second) { s.cam.to(A[second], { zoom: set.zoom * 1.1, frames: 60 }); yield s.say(id(second), CREW_BOOTH[second]); }
                // The toast
                s.cam.to(set.cam, { zoom: set.zoom, frames: 60 });
                yield s.narrate('Glasses go up round the table.');
                s.clearLine();
                const t = yield s.choose(CREW_TOASTS);
                yield s.say('949', CREW_TOASTS[t]);
                const likers = plan.who.filter(n => CREW_TOAST_TASTE[n] === t);
                for (const n of likers) gain(n, 1);
                const cheer = likers.find(n => CREW_TOAST_LINES[t][n]);
                if (cheer) yield s.say(id(cheer), CREW_TOAST_LINES[t][cheer]);
                else yield s.narrate('A clink of glasses. Someone laughs.');
                // The last job
                const last = g.missions && g.missions.missionLog[g.missions.missionLog.length - 1];
                const kind = last ? String(last.id).split('_')[0] : 'none';
                const talk = CREW_JOB_TALK[kind] || CREW_JOB_TALK.none;
                const talker = CrewNights._pick(plan.who.filter(n => talk[n]));
                if (talker) {
                    const job = last ? String(last.title || '').replace(/^(BOUNTY|SALVAGE): /, '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : '';
                    s.cam.to(A[talker], { zoom: set.zoom * 1.1, frames: 60 });
                    yield s.say(id(talker), talk[talker].replace('{job}', job || 'the last one'));
                }
                // Who she sits with
                s.cam.to(set.cam, { zoom: set.zoom, frames: 60 });
                yield s.narrate('The music swells. The table breaks into smaller conversations.');
                s.clearLine();
                const pick = yield s.choose(plan.who.map(n => `Sit with ${n}`));
                R.sat = plan.who[pick];
                gain(R.sat, 3);
            }
            // The moment
            const who = plan.solo ? plan.host : R.sat, M = CrewNights.moment(g, who);
            if (M) {
                s.cam.to(A[who], { zoom: set.zoom * 1.25, frames: 80, dx: (me.x - A[who].x) / 2, dy: (me.y - A[who].y) / 2 });
                yield* sayAll(M.lines);
                const r = yield s.choose(M.opts);
                yield s.say('949', M.opts[r]);
                if (r === M.good) gain(who, 2);
                yield* sayAll(M.after[r]);
            }
            // Goodnight
            s.cam.to(set.cam, { zoom: set.zoom * 0.9, frames: 90 });
            if (plan.solo) yield* sayAll(CREW_SOLO[plan.host].close);
            else {
                const closer = plan.who.includes('747') ? '747' : CrewNights._pick(plan.who);
                yield s.say(id(closer), CREW_CLOSERS[closer]);
            }
            yield s.fade('out', 50);
        });

        /* ── Hooks into Messages ── */
        const _crewBaseFeed = phoneSystem.feedNext, _crewBaseReplies = phoneSystem.getReplyOptions, _crewBaseSend = phoneSystem.sendReply, _crewBaseReset = phoneSystem.resetFeed;
        Object.assign(phoneSystem, {
            _planCard(rec) { return CrewNights.card(rec); },
            /** Her own asks: "Drinks tonight?" to the group, "Want to hang out?" to one of them, while no plan's on */
            getReplyOptions(contact, lastIncoming) {
                const base = _crewBaseReplies.call(this, contact, lastIncoming) || [];
                const S = CrewNights.state(), busy = S.plan && (S.plan.state === 'open' || S.plan.state === 'yes');
                if (busy || !CrewNights._freeOk() || typeof game === 'undefined') return base;
                const here = CrewNights._crewHere(game);
                if (contact.group && here.length >= 2) return [...base.slice(0, 2), { text: 'Drinks tonight?', crewAsk: 'group' }];
                if (CREW_IDS[contact.name] && here.includes(contact.name)) return [...base.slice(0, 2), { text: 'Want to hang out?', crewAsk: contact.name }];
                return base;
            },
            sendReply(contact, opt) {
                if (!opt.crewAsk) return _crewBaseSend.call(this, contact, opt);
                if (opt.crewAsk === 'group') {
                    const who = CrewNights._pick(CrewNights._crewHere(game));
                    _crewBaseSend.call(this, contact, { text: opt.text, response: { who, text: 'Moon City. Booth\'s ours.' } });
                    setTimeout(() => CrewNights.invite(who, 'moon_city', 'Here\'s the plan.', { mine: true, delay: 1400 }), 3200);
                } else {
                    const who = opt.crewAsk;
                    _crewBaseSend.call(this, contact, { text: opt.text, response: CREW_ASK_BACK[who] });
                    setTimeout(() => CrewNights.invite(who, CREW_HOME_VENUE[who], 'Here.', { solo: true, mine: true, delay: 1400 }), 3200);
                }
            },
            resetFeed() { _crewBaseReset.call(this); this.feed.crew = { plan: null, seen: {}, nights: 0, lastAsk: {} }; },
            /** Now and then one of them asks her out on their own: the closer, the more often (at most one a night) */
            feedNext() {
                const g = game, S = CrewNights.state(), busy = S.plan && (S.plan.state === 'open' || S.plan.state === 'yes');
                const now = g.worldMinutes || 0;
                if (!busy && now - (S.lastSolo || -1e9) > 720) {
                    const here = CrewNights._crewHere(g).filter(n => CREW_SOLO_ASK[n]);
                    const weights = here.map(n => 1 + CrewNights._tier(g, n)), sum = weights.reduce((a, b) => a + b, 0);
                    if (here.length && Math.random() < 0.15 + 0.06 * sum / here.length) {
                        let r = Math.random() * sum, k = 0;
                        while (r > weights[k] && k < here.length - 1) r -= weights[k++];
                        const who = here[k];
                        if (CrewNights.invite(who, CREW_HOME_VENUE[who], CrewNights._pick(CREW_SOLO_ASK[who]), { solo: true })) { S.lastSolo = now; return { who, kind: 'plan' }; }
                    }
                }
                return _crewBaseFeed.call(this);
            },
            /** One of the crew's place pins from the feed becomes an invite to their place */
            crewPlanFromPin(e) {
                const venue = CREW_IDS[e.who] && CREW_HOME_VENUE[e.who];
                if (!venue || !CrewNights._crewHere(game).includes(e.who)) return false;
                return !!CrewNights.invite(e.who, venue, e.text, { solo: true });
            },
            /** The group's "drinks?" after a job */
            crewGroupInvite() {
                const here = CrewNights._crewHere(game);
                const opts = CREW_GROUP_INVITE.filter(i => here.includes(i.who));
                if (here.length < 2 || !opts.length) return false;
                const i = CrewNights._pick(opts);
                return !!CrewNights.invite(i.who, 'moon_city', i.text, { delay: 9000 });
            },
        });

        // The bounty's intel, the stim after a rough job
        {
            const acc = MissionSystem.prototype.acceptMission, done = MissionSystem.prototype.completeMission;
            MissionSystem.prototype.acceptMission = function (m, g) { const ok = acc.call(this, m, g); if (ok) try { CrewNights.onBounty(g, m); } catch (e) { console.error(e); } return ok; };
            MissionSystem.prototype.completeMission = function (g) { const had = !!this.activeMission; done.call(this, g); if (had) try { CrewNights.onJobDone(g); } catch (e) { console.error(e); } };
        }
        setInterval(() => { try { CrewNights.tick(); } catch (e) { console.error(e); } }, 1000);
