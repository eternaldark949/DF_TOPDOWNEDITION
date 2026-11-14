// Authored local animation poses, shared by presentation and native swept queries.
import rules from '../../data/game-combat-rules.json' with {type:'json'};
export const MELEE_SWING={duration:rules.blade.duration_seconds,windup:rules.blade.windup_seconds,cutEnd:rules.blade.cut_end_seconds};
/* A long blade's swing (a model with swing: 'wide', Blood Pact): two hands on the grip, she
   winds the blade far back to one side, then sweeps it round in front of her in one wide arc
   (the hands travel a half-circle about her chest), body turning with it, and settles back to
   a two-handed guard. Phases are shares of the swing's time; the left hand rides the grip,
   WIDE_SWING.grip model units behind the right. */
export const WIDE_SWING = { windup: .22, cutEnd: .7, guard: { a: .3, handX: 11, handY: 3 },
    centerX: 2, radius: 16, handArc: 1.25, bladeArc: 2.0, twist: .45, grip: 6.2 };
function _wideHand(theta, out) {
    out.handX = WIDE_SWING.centerX + WIDE_SWING.radius * Math.cos(theta);
    out.handY = WIDE_SWING.radius * Math.sin(theta);
}
export function sampleWideSwing(u, sign, out) {
    const W = WIDE_SWING, G = W.guard, smooth = x => x * x * (3 - 2 * x);
    if (u < W.windup) {                                                     // wind back to one side
        const w = smooth(u / W.windup);
        _wideHand(sign * W.handArc, out);
        out.handX = G.handX + (out.handX - G.handX) * w; out.handY = G.handY + (out.handY - G.handY) * w;
        out.a = G.a + (sign * W.bladeArc - G.a) * w; out.twist = sign * W.twist * w;
    } else if (u <= W.cutEnd) {                                             // the sweep across her front
        const p = smooth((u - W.windup) / (W.cutEnd - W.windup));
        _wideHand(sign * W.handArc * (1 - 2 * p), out);
        out.a = sign * W.bladeArc * (1 - 2 * p); out.twist = sign * W.twist * Math.cos(p * Math.PI);
    } else {                                                                // the follow-through settles to guard
        const r = smooth((u - W.cutEnd) / (1 - W.cutEnd));
        _wideHand(-sign * W.handArc, out);
        out.handX += (G.handX - out.handX) * r; out.handY += (G.handY - out.handY) * r;
        out.a = -sign * W.bladeArc + (G.a + sign * W.bladeArc) * r; out.twist = -sign * W.twist * (1 - r);
    }
    out.reach = out.handX - 8;
    return wideGrip(out);
}
/** The left hand on a long blade's grip, behind the right (sets lHandX/lHandY on a pose) */
export function wideGrip(pose) {
    pose.lHandX = pose.handX - WIDE_SWING.grip * Math.cos(pose.a);
    pose.lHandY = pose.handY - WIDE_SWING.grip * Math.sin(pose.a);
    return pose;
}
/** A swing style's phase times, as shares of the swing */
export function swingPhases(style) {
    return style === 'wide' ? WIDE_SWING : { windup: MELEE_SWING.windup / MELEE_SWING.duration, cutEnd: MELEE_SWING.cutEnd / MELEE_SWING.duration };
}

export function sampleMeleeSwing(age, side, out = {}, secs = MELEE_SWING.duration, style = 'knife') {
    if (style === 'wide') return age < 0 || age > secs ? null : sampleWideSwing(age / secs, side || 1, out);
    age *= MELEE_SWING.duration / secs;
    if (age < 0 || age > MELEE_SWING.duration) return null;
    const smooth = x => x * x * (3 - 2 * x);
    const sign = side || 1;
    let a, x, y, twist;
    if (age < MELEE_SWING.windup) {
        const w = smooth(age / MELEE_SWING.windup);
        a = .35 + (sign * 1.15 - .35) * w;
        x = 8; y = 9 + sign * 8 * w; twist = sign * .18 * w;
    } else if (age <= MELEE_SWING.cutEnd) {
        const p = smooth((age - MELEE_SWING.windup) / (MELEE_SWING.cutEnd - MELEE_SWING.windup));
        a = sign * (1.15 - 2.3 * p);
        x = 8 + 14 * Math.sin(p * Math.PI);
        y = 9 + sign * 8 * Math.cos(p * Math.PI);
        twist = sign * .18 * Math.cos(p * Math.PI);
    } else {
        const r = smooth((age - MELEE_SWING.cutEnd) / (MELEE_SWING.duration - MELEE_SWING.cutEnd));
        a = -sign * 1.15 + (.35 + sign * 1.15) * r;
        x = 8; y = 9 - sign * 8 * (1 - r); twist = -sign * .18 * (1 - r);
    }
    out.a = a; out.handX = x; out.handY = y; out.twist = twist; out.reach = x - 8;
    return out;
}

