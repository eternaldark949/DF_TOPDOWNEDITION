// Native drawing steps for Classic's bullet streaks, electrical trails and golden dust.
const noise = seed => {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value) - .5;
};

const line = (points, stroke, line_width, alpha) => ({
    shape: 'line', points, stroke, line_width, alpha, blend: 'add'
});

function backAlong(points, distance) {
    const tail = [points.at(-1)];
    for (let index = points.length - 1; index > 0 && distance > 0; index--) {
        const from = points[index], to = points[index - 1];
        const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
        if (length > distance) {
            tail.unshift(from.map((value, axis) => value + (to[axis] - value) * distance / length));
            break;
        }
        tail.unshift(to);
        distance -= length;
    }
    return tail;
}

function electricalSteps(points, profile, color, core, age, seed, opacity) {
    const result = [], frame = Math.floor(age / profile.flicker);
    for (let pass = 0; pass < profile.passes; pass++) {
        const jitter = index => noise(seed + frame + index + pass * 31);
        const path = points.map(([x, y], index) => {
            const next = points[index + 1];
            if (!next) return [x, y];
            const dx = next[0] - x, dy = next[1] - y, length = Math.hypot(dx, dy) || 1;
            const offset = 2 * jitter(index * 7) * profile.amplitude * (1 - index / points.length / 2) / length;
            return [x - dy * offset, y + dx * offset];
        });
        for (const [width, ink, alpha] of [[2.2, color, .35], [.7, core, .85]]) {
            for (let index = 1; index < path.length; index++) {
                result.push(line([path[index - 1], path[index]], ink, width, alpha * opacity * index / path.length));
            }
        }
        if (path.length > 2 && jitter(99) > .25) {
            const [x, y] = path[1 + Math.floor(Math.abs(jitter(5)) * (path.length - 2))];
            result.push(line([[x, y], [x + jitter(11) * 9, y + jitter(13) * 9]], core, .5, .6 * opacity));
        }
    }
    return result;
}

function wispSteps(shot) {
    const steps = [];
    for (const { at, born, phase } of shot.puffs) {
        const elapsed = shot.age - born;
        const u = elapsed / shot.style.lifetime;
        const x = at[0] + elapsed * Math.cos(phase) * 8, y = at[1] + elapsed * Math.sin(phase) * 8;
        const alpha = .55 * Math.sin(Math.min(1, u * 4) * Math.PI / 2) * (1 - u);
        steps.push({ shape: 'glow', x, y, radius: 2.2 * (3 + 8.4 * elapsed), color: shot.trail_color, alpha });
        if (u < .72 && Math.sin(phase) < .9) {
            const flicker = .55 + .45 * Math.sin(shot.age * 30 + phase);
            steps.push({ shape: 'rectangle', x: x + 2 * Math.sin(phase), y: y + 2 * Math.cos(phase),
                width: .75, height: .75, fill: shot.style.dust, alpha: (1 - u / .72) * flicker, blend: 'add' });
        }
    }
    return steps;
}

export function shotSteps(shot) {
    const { points, style, color, core, trail_color, age, seed, remaining } = shot;
    const opacity = Math.min(1, remaining / style.fade);
    const steps = style.sample_interval ? wispSteps(shot) : [];
    if (points.length < 2 || opacity <= 0) return steps;
    if (style.long_tail) {
        const tail = backAlong(points, style.long_tail);
        const alpha = opacity * Math.max(.15, 1 - age / shot.lifetime);
        steps.push(line(tail, color, 2, alpha), line(tail, '#ffffff', 1, alpha * .5));
    }
    if (style.passes) steps.push(...electricalSteps(points.slice(-8), style, trail_color, core, age, seed, opacity));
    const streak = backAlong(points, shot.streak_length);
    steps.push(line(streak, color, 6, opacity * .19), line(streak, color, 4, opacity), line(streak, '#fffaf3', 1.2, opacity * .55));
    return steps;
}
