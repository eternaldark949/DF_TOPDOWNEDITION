// Authored character reactions, shared by native and remaining classic NPCs.
export function resolveEmoteLines(reactions, cat, tier) {
    const pool = reactions && reactions[cat];
    if (!pool) return null;
    if (Array.isArray(pool)) return pool.length ? pool : null;
    // Tier-keyed object — walk down from the requested tier.
    for (let t = tier; t >= 0; t--) {
        const lines = pool[t];
        if (Array.isArray(lines) && lines.length) return lines;
    }
    return null;
}

export const NPC_EMOTE_REACTIONS = {
    Anavia: {
        reactSmile: [
            "There she is.",
            "Good to see you smiling.",
            "Brightens the place up."
        ],
        reactZany: [
            "Long day?",
            "Hm. Alright.",
            "Whatever keeps you sharp."
        ],
        reactCry: [
            "Hey. Take a breath.",
            "I've got you.",
            "Sit with it. I'm not going anywhere."
        ],
        reactFrown: [
            "City'll do that.",
            "Talk to me when you're ready.",
            "Yeah. I know that look."
        ]
    },
    Mirabel: {
        reactSmile: [
            "Charming.",
            "Don't get soft on me.",
            "Mm. Save it for later."
        ],
        reactZany: [
            "Cute.",
            "Focus, 949.",
            "Are we doing this or not?"
        ],
        reactCry: [
            "Pull yourself together.",
            "Not here.",
            "I've seen worse. So have you."
        ],
        reactFrown: [
            "That's the face I like.",
            "Good. Stay sharp.",
            "Now we're talking."
        ]
    },

    // ── Permanent teammates: tier-keyed, indexed to BONDING_TIERS ──
    // 0 Acquaintance · 1 Companion · 2 Trusted · 3 Inner Circle
    Victoria: {
        reactSmile: {
            0: ["What's that face for?", "Huh. Alright then.", "Don't get used to me being nice about it."],
            3: ["There it is. Keep that.", "That's my Freelancer.", "Good. You've earned that one."]
        },
        reactZany: {
            0: ["...Okay.", "Sure. Whatever that was.", "Is that a face or a malfunction?"],
            3: ["You're an idiot. I like that about you.", "Alright, that got me.", "Do it again. I'm not laughing. I'm not."]
        },
        reactCry: {
            0: ["Hey. Not in the street.", "Whatever it is, walk it off.", "Save it for the apartment."],
            2: ["Come here. No — seriously. Come here.", "Okay. Okay. I've got you.", "Who do I have to hit?"],
            3: ["You don't carry it alone. That's what I'm for.", "I'm not going anywhere. Take your time.", "Whoever did this is already finished. They just don't know it yet."]
        },
        reactFrown: {
            0: ["Yeah. City's like that.", "Shake it off.", "Join the club."],
            3: ["Talk to me. I'll listen. Once.", "That look means work. Point me at it.", "Whatever it is — we handle it together."]
        }
    },
    Yenna: {
        reactSmile: {
            0: ["Noted.", "Your posture improves when you do that.", "Hm."],
            2: ["Good. Morale affects accuracy.", "That helps more than you'd think."],
            3: ["I've started looking for that.", "Keep doing it. It steadies me.", "...I'm smiling too. Don't look."]
        },
        reactZany: {
            0: ["Unusual. Recording it.", "That's a new expression.", "I have no read on that."],
            3: ["You're ridiculous. It's disarming. Which I assume is the point.", "I never know what you'll do next. That's rare."]
        },
        reactCry: {
            0: ["Breathe. Four in, four out.", "I'll watch the street. Take a minute.", "Tears don't compromise the position."],
            2: ["I've cried in worse places. Nobody covered me. I'm covering you.", "Sit. I have the angles."],
            3: ["You hold everyone else together. Let me hold you.", "I'm here. Nothing gets through me."]
        },
        reactFrown: {
            0: ["Something's wrong. Range and bearing.", "Your jaw's tight. What is it?"],
            3: ["I know that face. We'll fix it, or I'll remove it.", "Point me at the problem."]
        }
    },
    Sabrina: {
        reactSmile: {
            0: ["Oh, we're doing faces now. Delightful.", "Adorable. Truly.", "Careful, someone might think you're happy."],
            3: ["That one's real. I can tell the difference now.", "Stop it, you'll make me feel something."]
        },
        reactZany: {
            0: ["Finally, someone speaking my language.", "Oh, I like you.", "Yes. More of that."],
            3: ["We're broken in the same direction. It's beautiful.", "This is why I stay."]
        },
        reactCry: {
            0: ["Oh. Um. Joke, or silence?", "I'm bad at this. But I'm here.", "Right. Deflecting won't help. Probably."],
            2: ["No jokes. I promise. Just — come here.", "I'll stop deflecting for exactly one minute. Go."],
            3: ["Fall apart. I'll hold the pieces and I won't make it funny.", "I've got you. No punchline."]
        },
        reactFrown: {
            0: ["Ugh, that face. What did the city do now?", "Somebody's had a day."],
            3: ["Tell me who. I'll ruin their week. Quietly. Creatively.", "That's your something's-wrong face. Talk."]
        }
    },
    Max: {
        reactSmile: {
            0: ["YES! Smiling! Love it!", "Oh good, we're friends now, right?", "That's the energy!"],
            3: ["Okay this is gonna sound weird — when you smile my hands stop buzzing.", "Best part of my day. Easily."]
        },
        reactZany: {
            0: ["OH we're doing THIS?! Finally!", "*bzzt* YEAH!", "You and me, same brand of broken."],
            3: ["I love you. Platonically! Mostly! Don't make it weird!", "This. THIS is the crew I signed up for."]
        },
        reactCry: {
            0: ["Whoa — hey. Hey. What do you need?", "I'm not good at quiet. But I'll try. For you."],
            2: ["I'm sitting right here and I'm not moving. Take your time.", "Sparks are off. I checked. You can lean."],
            3: ["My hands are steady. Feel that? That's you. So let me be the steady one for once."]
        },
        reactFrown: {
            0: ["Uh oh. Who do I need to shock?", "That's a bad face. I hate that face."],
            3: ["Nope. Not on my watch. What's wrong — tell me — go."]
        }
    },
    Josh: {
        reactSmile: {
            0: ["Expression logged.", "Positive affect. Noted.", "Acknowledged."],
            2: ["Your baseline mood is up 18% since recruitment. I've been tracking."],
            3: ["I've stopped logging these. I just like them."]
        },
        reactZany: {
            0: ["Unparseable. Continuing.", "I have no classification for that.", "...Noted. Reluctantly."],
            3: ["I built a category for you. It has one entry."]
        },
        reactCry: {
            0: ["Distress detected. I am not equipped. I will remain nearby.", "I don't know the correct response. I'm choosing to stay."],
            2: ["I looked up what helps. Every source said 'presence.' So. I'm present."],
            3: ["You don't have to explain it. I've stopped needing the data."]
        },
        reactFrown: {
            0: ["Negative affect. Cause unclear. Querying.", "Something is wrong. Specify and I'll solve it."],
            3: ["That face means don't ask yet. So I won't. I'll wait."]
        }
    }
};

