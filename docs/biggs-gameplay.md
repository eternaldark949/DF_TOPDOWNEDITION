# Biggs: chase control and fair impact scoring

The original bumper scoring checked facing and a ten-tick global cooldown on any overlap. It did not require a closing impact, so stationary or separating cars could score repeatedly while trapped together. Direction input also selected reverse automatically beyond 135 degrees, while the physics reversed steering with backward motion. This made turning toward a target behind the player awkward.

The revised controls turn toward the requested direction, including from rest, and reduce throttle during tight turns. Diagonal keyboard input is normalized to the same maximum throttle as other directions. Mild chase assistance uses a short velocity lead for nearby opponents inside the input cone, retains an eligible target to reduce switching, and releases when steering away or releasing input. It does not accelerate on its own.

A scoring collision now needs at least 1.4 units/tick of closing speed. A scoring driver must contribute at least 0.9 units/tick toward the contact and face the opponent. Both moving drivers can score a head-on hit; a stationary recipient cannot score just by facing an incoming car. After a scored impact, that pair must separate by 18 units beyond contact distance and recover for 45 simulation ticks before scoring again. Physical bounces and sparks still run independently of scoring. AI cars spend 40 ticks breaking away toward the arena center and avoid retargeting that opponent for 150 ticks when another opponent is available. All drivers use the same scoring rules.

Validation:

- `node tools/test-bumper-balance.cjs`: overlap, separating contact, weak contact, repeated contact, fresh reentry, stationary recipients, different opponents, AI breakup, about-face steering, bounded assistance, idle behavior, and a complete seven-car round with exit/control restoration and no duplicate payout.
- `node tools/test-biggs-art.cjs`: layout/entry preservation, retained artwork, balanced transforms, and interior bake lifecycle. The former pre-redesign handling snapshot was replaced with the behavior tests above because handling is intentionally changing.
- Five seeded full-round simulations using a directional chase controller refreshed every twelve ticks, compared with the previous implementation. All completed with finite positions, scores and restored controls. These are diagnostic simulations, not human playtests or evidence that the player should always win.
- Chromium with the supplied save: keyboard steering, live seven-car gameplay, results, and control restoration; no page errors. The private save is not included in the repository.
