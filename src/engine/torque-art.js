// Torque Auto inside: a graphite epoxy service bay under strip lights, two cars up on lifts and Victoria's
// wrap bay; through the arch a black porcelain showroom with Lady's BlackMark V3 turning on its plinth and
// Torque's steel counter; behind its own door, the parts room on diamond plate. Amber is the house colour.
// Floor: drawTorqueInterior (painted once, released on leaving: MAP_BAKES). Furniture: drawTorqueDecorProp
// (ta_*, entities/props-decor.js). Light: drawTorqueGlow. The pieces stand where world/map-entities.js puts them.
const TQ = { amber: '#ff9a2a', amberHi: '#ffc46a', steel: '#9aa3ad', steelHi: '#dfe3ea', steelLo: '#4a5059', ink: '#0d0c10',
    graphite: '#24242a', chest: '#b4321e', chestHi: '#e0552e', rubber: '#141416', wrap: '#ff4fa3' };
// The cars on show: the lifts' two, the wrap bay's, the plinth's (a model, its paint and glow)
const TQ_CARS = [
    { brand: 'Zenxera', model: 'sports', color: '#CCCCFF', glowColor: '#00f3ff' },
    { brand: 'Gelfash', model: 'suv', color: '#e8e6ee', glowColor: null },
    { brand: 'Zenxera', model: 'sedan', color: '#C0C0C0', glowColor: '#00f3ff', wrapped: true },
    { brand: 'LADY', model: 'suv2', color: '#1a1a1a', glowColor: '#ffffff' }
].map(c => { const B = VEHICLE_BRANDS[c.brand], m = B.models[c.model];
    return Object.assign(c, { visualStyle: B.visualStyle, length: m.length, width: m.width, noHearseCap: !!m.noHearseCap }); });
const TQ_TURNTABLE = { x: 1165, y: 505, r: 64 };
const TQ_BAYS = [[90, 128, 200, 120, '01'], [90, 368, 200, 120, '02'], [400, 128, 210, 120, '03']];
// The lifts' status lamps (the posts stand mid-car, north and south of it: ta_lift)
const TQ_LIFT_LAMPS = [[196, 143], [196, 225], [196, 383], [196, 465]];

const TorqueArt = {
    box(c, x, y, w, h, fill, stroke, r = 0, lw = 1) {
        c.beginPath(); c.roundRect(x, y, w, h, r);
        if (fill) { c.fillStyle = fill; c.fill(); }
        if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
    },
    text(c, s, x, y, size, color, font = 'Orbitron, monospace') {
        c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${size}px ${font}`; c.fillText(s, x, y);
    },
    /** One of TQ_CARS at cx, cy, nose along `ang`; `raised` lifts it off the floor (a softer, further shadow) */
    car(c, car, cx, cy, ang, raised) {
        const sp = car.wrapped ? TorqueArt._wrapped(car) : carSprite(car), P = CAR_ART.PAD, L = sp.L, W = sp.W;
        c.save(); c.translate(cx, cy); c.rotate(ang);
        if (raised) { c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(-L / 2 + 6, -W / 2 + 7, L, W, 10); c.fill(); c.scale(1.06, 1.06); }
        c.drawImage(sp.cv, -L / 2 - P, -W / 2 - P, L + P * 2, W + P * 2);
        c.restore();
    },
    /** Paint the show cars' sprites now (the map's build), so a piece's own paint never does it */
    warm() { for (const car of TQ_CARS) car.wrapped ? TorqueArt._wrapped(car) : carSprite(car); },
    /** The wrap bay's car: Victoria's pink vinyl laid over its back half, the edge left raw */
    _wrapped(car) {
        if (car._wrap) return car._wrap;
        const sp = carSprite(car), cv = document.createElement('canvas'); cv.width = sp.cv.width; cv.height = sp.cv.height;
        const c = cv.getContext('2d'), S = CAR_ART.SCALE, edge = cv.width * 0.52;
        c.drawImage(sp.cv, 0, 0);
        c.globalCompositeOperation = 'source-atop';
        const g = c.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, '#c23a7c'); g.addColorStop(0.45, TQ.wrap); g.addColorStop(1, '#a12864');
        c.globalAlpha = 0.82; c.fillStyle = g; c.fillRect(0, 0, edge, cv.height);
        c.globalAlpha = 1; c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(edge - 1.2 * S, 0, 1.2 * S, cv.height);
        return (car._wrap = { cv, L: sp.L, W: sp.W });
    }
};

function drawTorqueDecorProp(c, p) {
    const x = p.x, y = p.y, w = p.width, h = p.height, d = p.decor || {}, B = TorqueArt.box, T = TQ;
    const steel = (x0, y0, x1, y1) => { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#6c747e'); g.addColorStop(0.45, T.steelHi); g.addColorStop(0.55, '#a9b1ba'); g.addColorStop(1, '#565d66'); return g; };
    switch (p.decorType) {
        case 'ta_lift': {                                   // a two-post lift, the car up on its arms
            const cx = x + w / 2, cy = y + h / 2;
            B(c, x + 2, y + 10, w - 4, h - 20, 'rgba(255,154,42,.06)', 'rgba(255,154,42,.35)', 4, 1);
            c.strokeStyle = '#3a3f46'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath();      // the arms, swung in under the sills
            for (const s of [-1, 1]) { const py = s < 0 ? y + 9 : y + h - 9; c.moveTo(cx, py); c.lineTo(cx - 30, cy + s * 12); c.moveTo(cx, py); c.lineTo(cx + 26, cy + s * 12); }
            c.stroke(); c.lineCap = 'butt';
            TorqueArt.car(c, TQ_CARS[d.variant | 0], cx, cy, 0, true);
            for (const py of [y, y + h - 14]) {             // the posts, amber with a steel cap and a status lamp
                B(c, cx - 9, py, 18, 14, T.amber, '#7a4206', 2, 1);
                B(c, cx - 6, py + 3, 12, 8, steel(cx - 6, py, cx + 6, py), null, 1);
                c.fillStyle = '#3cff8a'; c.beginPath(); c.arc(cx + 6, py + 3, 1.4, 0, Math.PI * 2); c.fill();
            }
            break;
        }
        case 'ta_wrap': {                                   // the wrap bay: a car half in pink vinyl, the roll on its stand
            const cx = x + w / 2 - 10, cy = y + h / 2;
            B(c, x, y + 4, w, h - 8, 'rgba(255,79,163,.05)', 'rgba(255,79,163,.4)', 6, 1);
            TorqueArt.car(c, TQ_CARS[2], cx, cy, 0, false);
            B(c, x + w - 22, y + 14, 16, h - 28, '#2b2b31', '#5b5e66', 3);
            const rg = c.createLinearGradient(x + w - 20, 0, x + w - 8, 0); rg.addColorStop(0, '#8e1f55'); rg.addColorStop(0.5, '#ff7cc0'); rg.addColorStop(1, '#8e1f55');
            B(c, x + w - 20, y + 20, 12, h - 40, rg, null, 5);
            c.fillStyle = 'rgba(255,124,192,.55)'; c.beginPath(); c.moveTo(x + w - 20, y + h / 2 - 8); c.lineTo(cx + 22, cy - 6); c.lineTo(cx + 22, cy + 6); c.lineTo(x + w - 20, y + h / 2 + 8); c.closePath(); c.fill();
            break;
        }
        case 'ta_chest': {                                  // a rolling tool chest: lacquer red, drawer pulls, a tray of spanners on top
            B(c, x + 2, y + 3, w, h, 'rgba(0,0,0,.35)', null, 3);
            const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, T.chestHi); g.addColorStop(1, '#7c1e12');
            B(c, x, y, w, h, g, '#4e120a', 3, 1);
            B(c, x + 3, y + 3, w - 6, h * 0.42, '#1a1a1e', '#5a5a62', 2, 0.8);
            c.strokeStyle = T.steelHi; c.lineWidth = 1; c.beginPath();
            for (let i = 0; i < 6; i++) { const sx = x + 7 + i * (w - 14) / 6; c.moveTo(sx, y + 6); c.lineTo(sx + 3, y + h * 0.4 - 2); }
            c.stroke();
            c.fillStyle = 'rgba(255,255,255,.55)';
            for (let i = 0; i < 3; i++) c.fillRect(x + 6, y + h * 0.55 + i * h * 0.14, w - 12, 1.2);
            break;
        }
        case 'ta_bench': {                                  // the workbench: butcher block, pegboard behind, a vise and a lamp
            B(c, x + 2, y + 3, w, h, 'rgba(0,0,0,.35)', null, 2);
            B(c, x, y, w, h * 0.34, '#2c2f35', '#4d525a', 1);
            c.fillStyle = 'rgba(223,227,234,.25)';
            for (let px = x + 5; px < x + w - 3; px += 6) for (let py = y + 3; py < y + h * 0.32; py += 5) c.fillRect(px, py, 1, 1);
            for (const [tx, tl] of [[x + 20, 8], [x + 34, 10], [x + 48, 7], [x + w - 40, 9]]) { c.strokeStyle = T.steelHi; c.lineWidth = 1.4; c.beginPath(); c.moveTo(tx, y + 2); c.lineTo(tx, y + 2 + tl); c.stroke(); }
            const wood = c.createLinearGradient(x, y, x, y + h); wood.addColorStop(0, '#8a5a32'); wood.addColorStop(1, '#5e3a1e');
            B(c, x, y + h * 0.34, w, h * 0.66, wood, '#3a2412', 2, 1);
            c.strokeStyle = 'rgba(40,20,8,.35)'; c.lineWidth = 0.7; c.beginPath();
            for (let px = x + 8; px < x + w; px += 8) { c.moveTo(px, y + h * 0.34); c.lineTo(px, y + h); } c.stroke();
            B(c, x + w - 28, y + h * 0.42, 20, 12, '#3c414a', T.steel, 2, 0.8);
            c.fillStyle = T.steelHi; c.fillRect(x + w - 32, y + h * 0.5, 28, 1.6);
            B(c, x + 14, y + h * 0.5, 24, 9, '#1c1c20', T.amber, 2, 0.8);
            break;
        }
        case 'ta_compressor': {                             // the air compressor: tank, motor and a coiled amber hose
            B(c, x + 2, y + 3, w, h, 'rgba(0,0,0,.35)', null, 8);
            B(c, x, y + h * 0.25, w, h * 0.6, steel(x, y, x, y + h), '#3d434b', h * 0.3, 1);
            B(c, x + w * 0.2, y + 2, w * 0.5, h * 0.32, '#1e2024', '#4d525a', 3, 1);
            c.strokeStyle = T.amber; c.lineWidth = 1.6;
            for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x + w * 0.78, y + h * 0.5, 4 + i * 2.2, 0, Math.PI * 2); c.stroke(); }
            break;
        }
        case 'ta_tires': {                                  // a stack of tyres, the top one's tread and rim
            const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
            c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.arc(cx + 3, cy + 4, r, 0, Math.PI * 2); c.fill();
            c.fillStyle = T.rubber; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
            c.strokeStyle = '#2c2c30'; c.lineWidth = 1;
            for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); c.lineTo(cx + Math.cos(a) * r * 0.98, cy + Math.sin(a) * r * 0.98); c.stroke(); }
            c.fillStyle = '#0a0a0c'; c.beginPath(); c.arc(cx, cy, r * 0.55, 0, Math.PI * 2); c.fill();
            c.strokeStyle = d.variant ? T.amber : T.steelHi; c.lineWidth = 1.2; c.beginPath(); c.arc(cx, cy, r * 0.42, 0, Math.PI * 2); c.stroke();
            c.fillStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.arc(cx - r * 0.3, cy - r * 0.3, r * 0.35, 0, Math.PI * 2); c.fill();
            break;
        }
        case 'ta_rack': {                                   // a tyre rack on the wall, tyres stood on edge
            B(c, x + 2, y + 3, w, h, 'rgba(0,0,0,.35)', null, 2);
            B(c, x, y, w, h, '#2a2d33', T.steelLo, 2, 1);
            const n = Math.floor(h / 15);
            for (let i = 0; i < n; i++) { const ty = y + 4 + i * (h - 8) / n; B(c, x + 3, ty, w - 6, (h - 8) / n - 2, T.rubber, '#36363c', 3, 0.8); c.fillStyle = '#3a3a40'; c.fillRect(x + 5, ty + (h - 8) / n / 2 - 1.5, w - 10, 1); }
            break;
        }
        case 'ta_drum': {                                   // an oil drum: ribbed lid, the brand's band
            const cx = x + w / 2, cy = y + h / 2, r = w / 2;
            c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.arc(cx + 2, cy + 3, r, 0, Math.PI * 2); c.fill();
            c.fillStyle = d.variant ? '#7a1f1a' : '#1f4a2c'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
            c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, r * 0.75, 0, Math.PI * 2); c.stroke();
            c.fillStyle = T.steel; c.beginPath(); c.arc(cx + r * 0.4, cy - r * 0.2, 2, 0, Math.PI * 2); c.fill();
            break;
        }
        case 'ta_counter': {                                // Torque's counter: brushed steel, an amber light line, the till and the bell
            B(c, x + 3, y + 4, w, h, 'rgba(0,0,0,.4)', null, 6);
            B(c, x, y, w, h, steel(x, y, x, y + h), '#3a3f46', 6, 1);
            B(c, x + 4, y + 4, w - 8, h - 12, '#16161a', '#5d636c', 4, 0.8);
            c.fillStyle = T.amber; c.fillRect(x + 6, y + h - 6, w - 12, 2);
            B(c, x + 18, y + 8, 30, 18, '#0d0d10', T.steel, 2, 0.8);
            c.fillStyle = '#58d0ff'; c.fillRect(x + 21, y + 11, 24, 7);
            c.fillStyle = T.steelHi; c.beginPath(); c.arc(x + w - 26, y + 16, 5, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#2b2b30'; c.beginPath(); c.arc(x + w - 26, y + 16, 1.6, 0, Math.PI * 2); c.fill();
            for (let i = 0; i < 3; i++) B(c, x + 60 + i * 20, y + 9, 15, 11, ['#e9e4dc', '#ffcf8a', '#c9c2ff'][i], null, 1);   // brochures
            TorqueArt.text(c, 'TORQUE', x + w - 66, y + 16, 7, 'rgba(255,196,106,.75)');
            break;
        }
        case 'ta_rims': {                                   // the rim wall: alloys hung in a row, a price chip under each
            B(c, x + 2, y + 3, w, h, 'rgba(0,0,0,.35)', null, 3);
            B(c, x, y, w, h, '#1b1b20', '#4b5059', 3, 1);
            const n = Math.floor(w / 30);
            for (let i = 0; i < n; i++) {
                const cx = x + 15 + i * (w - 30) / Math.max(1, n - 1), cy = y + h / 2, r = h / 2 - 3;
                c.fillStyle = T.rubber; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
                c.fillStyle = ['#c9ccd2', '#d4af37', '#2c2c32', '#b9b6c4', '#ff9a2a'][i % 5]; c.beginPath(); c.arc(cx, cy, r * 0.72, 0, Math.PI * 2); c.fill();
                c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1.2; c.beginPath();
                for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + i; c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7); } c.stroke();
                c.fillStyle = T.steelHi; c.beginPath(); c.arc(cx, cy, 1.6, 0, Math.PI * 2); c.fill();
            }
            break;
        }
        case 'ta_chair': {                                  // a showroom lounge chair, cognac leather on a chrome frame
            const f = d.face === 'W' ? -1 : 1;
            B(c, x + 2, y + 3, w, h, 'rgba(0,0,0,.35)', null, 8);
            B(c, x, y, w, h, '#6a3a1c', '#2e180a', 8, 1);
            B(c, f > 0 ? x : x + w - 10, y + 2, 10, h - 4, '#542c14', null, 5);
            B(c, x + 4, y + 4, w - 8, h - 8, null, 'rgba(255,214,160,.25)', 6, 0.8);
            c.strokeStyle = T.steelHi; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 3, y + h - 1); c.lineTo(x + w - 3, y + h - 1); c.stroke();
            break;
        }
        case 'ta_table': {                                  // a glass side table: magazines and a Bellafore
            c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.arc(x + w / 2 + 2, y + h / 2 + 3, w / 2, 0, Math.PI * 2); c.fill();
            c.fillStyle = 'rgba(190,210,230,.25)'; c.strokeStyle = T.steelHi; c.lineWidth = 1; c.beginPath(); c.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2); c.fill(); c.stroke();
            c.save(); c.translate(x + w / 2, y + h / 2); c.rotate(0.3); B(c, -8, -6, 12, 9, '#e94a7a', null, 1); c.restore();
            c.fillStyle = '#ffcf8a'; c.beginPath(); c.arc(x + w / 2 + 5, y + h / 2 + 3, 2.4, 0, Math.PI * 2); c.fill();
            break;
        }
        case 'ta_shelf': {                                  // parts shelving: steel uprights, labelled boxes
            B(c, x + 2, y + 3, w, h, 'rgba(0,0,0,.35)', null, 2);
            B(c, x, y, w, h, '#2b2e34', T.steelLo, 2, 1);
            let bx = x + 4, i = 0;
            while (bx < x + w - 10) {
                const bw = 14 + ((bx * 7 + y) % 13);
                if (bx + bw > x + w - 4) break;
                B(c, bx, y + 4, bw, h - 8, ['#a87a4a', '#c79a5e', '#4a5a7a', '#8a2a24', '#d8d2c4'][i++ % 5], 'rgba(0,0,0,.4)', 1, 0.6);
                c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(bx + 3, y + h / 2 - 1.5, bw - 6, 3);
                bx += bw + 3;
            }
            c.fillStyle = T.amber; c.fillRect(x, y + h - 2, w, 2);
            break;
        }
        case 'ta_sofa': {                                   // the waiting sofa by the door
            B(c, x + 2, y + 3, w, h, 'rgba(0,0,0,.35)', null, 9);
            B(c, x, y, w, h, '#5a3218', '#2e180a', 9, 1);
            B(c, x, y + h - 12, w, 12, '#46260f', null, 6);
            for (let i = 0; i < 3; i++) B(c, x + 6 + i * (w - 12) / 3, y + 5, (w - 12) / 3 - 3, h - 19, '#6e3e1e', 'rgba(255,214,160,.3)', 5, 0.8);
            break;
        }
        case 'ta_turntable': {                              // the plinth: a brushed disc turning slowly, Lady's V3 on it
            const { x: cx, y: cy, r } = TQ_TURNTABLE, a = ((_frameTime / 1000) * 0.12) % (Math.PI * 2);   // wrapped: the canvas takes angles as 32-bit floats, and a clock-sized one only moves in 16-radian jumps
            c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.arc(cx + 3, cy + 4, r + 4, 0, Math.PI * 2); c.fill();
            const g = c.createRadialGradient(cx - 20, cy - 24, 6, cx, cy, r + 4); g.addColorStop(0, '#5a6069'); g.addColorStop(0.7, '#2c3036'); g.addColorStop(1, '#16181c');
            c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r + 4, 0, Math.PI * 2); c.fill();
            c.strokeStyle = TQ.amber; c.lineWidth = 1.4; c.stroke();
            c.strokeStyle = 'rgba(223,227,234,.12)'; c.lineWidth = 0.8;
            for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(cx, cy, r * (0.3 + k * 0.12), a + k, a + k + 4); c.stroke(); }
            TorqueArt.car(c, TQ_CARS[3], cx, cy, -Math.PI / 2 + a, false);
            break;
        }
    }
}

engineMixin({
    drawTorqueInterior(c) { if (!this._torqueFloor) this._torqueFloor = this._paintTorqueFloor(); c.drawImage(this._torqueFloor, 0, 0); },
    _paintTorqueFloor() {
        const W = 1400, H = 1000, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const c = cv.getContext('2d'), r = seededRandom(5930), B = TorqueArt.box, T = TQ;
        c.fillStyle = '#0e0d11'; c.fillRect(0, 0, W, H);
        // The bay: graphite epoxy with a fleck in it, saw cuts every 100, a sheen where the lights sit
        const ep = c.createLinearGradient(50, 50, 880, 950); ep.addColorStop(0, '#2b2b31'); ep.addColorStop(1, '#1d1d22');
        c.fillStyle = ep; c.fillRect(50, 50, 830, 900);
        for (let i = 0; i < 2600; i++) { c.fillStyle = r() < 0.12 ? 'rgba(255,170,80,.18)' : r() < 0.5 ? 'rgba(223,227,234,.10)' : 'rgba(0,0,0,.25)'; c.fillRect(50 + r() * 830, 50 + r() * 900, 1.2, 1.2); }
        c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.beginPath();
        for (let x = 150; x < 880; x += 100) { c.moveTo(x, 50); c.lineTo(x, 950); }
        for (let y = 150; y < 950; y += 100) { c.moveTo(50, y); c.lineTo(880, y); } c.stroke();
        for (const [cx, cy, rr] of [[195, 195, 170], [195, 435, 170], [515, 195, 170], [560, 600, 260]]) {
            const g = c.createRadialGradient(cx, cy, 10, cx, cy, rr); g.addColorStop(0, 'rgba(255,236,210,.07)'); g.addColorStop(1, 'rgba(255,236,210,0)'); c.fillStyle = g; c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
        }
        // Oil under the lifts
        for (let i = 0; i < 14; i++) { const cx = 195 + (r() - 0.5) * 120, cy = (i % 2 ? 195 : 435) + (r() - 0.5) * 60, s = 6 + r() * 16; c.fillStyle = `rgba(4,3,6,${0.18 + r() * 0.2})`; c.beginPath(); c.ellipse(cx, cy, s, s * 0.6, r() * 3, 0, Math.PI * 2); c.fill(); }
        // The bays: amber lines, their numbers stencilled at the open end, a hazard band across it
        for (const [x, y, w, h, n] of TQ_BAYS) {
            c.strokeStyle = 'rgba(255,154,42,.75)'; c.lineWidth = 3; c.strokeRect(x, y, w, h);
            c.save(); c.beginPath(); c.rect(x + w - 16, y, 14, h); c.clip();
            for (let k = -2; k < h / 10 + 2; k++) { c.fillStyle = k % 2 ? '#141416' : 'rgba(255,170,40,.8)'; c.beginPath(); c.moveTo(x + w - 16, y + k * 10); c.lineTo(x + w - 2, y + k * 10 + 10); c.lineTo(x + w - 2, y + k * 10 + 20); c.lineTo(x + w - 16, y + k * 10 + 10); c.closePath(); c.fill(); }
            c.restore();
            TorqueArt.text(c, n, x + w - 40, y + h - 20, 26, 'rgba(255,154,42,.28)');
            c.strokeStyle = 'rgba(223,227,234,.3)'; c.lineWidth = 1; c.strokeRect(x + w / 2 - 14, y + h / 2 - 4, 28, 8);   // the drain grate
            for (let k = 1; k < 7; k++) { c.beginPath(); c.moveTo(x + w / 2 - 14 + k * 4, y + h / 2 - 4); c.lineTo(x + w / 2 - 14 + k * 4, y + h / 2 + 4); c.stroke(); }
        }
        TorqueArt.text(c, 'W R A P S', 515, 112, 9, 'rgba(255,79,163,.6)');
        // The walkway: from the door to the arch, a pair of white dashes
        c.strokeStyle = 'rgba(232,232,240,.35)'; c.lineWidth = 2; c.setLineDash([14, 10]);
        for (const off of [-30, 30]) { c.beginPath(); c.moveTo(700 + off, 950); c.lineTo(700 + off, 380 - off); c.lineTo(880, 380 - off); c.stroke(); }
        c.setLineDash([]);
        // The house seal: a gear ring with TORQUE in it, under the middle of the bay
        c.save(); c.translate(470, 640);
        c.strokeStyle = 'rgba(255,154,42,.35)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 74, 0, Math.PI * 2); c.stroke();
        c.fillStyle = 'rgba(255,154,42,.3)';
        for (let i = 0; i < 24; i++) { c.save(); c.rotate(i / 24 * Math.PI * 2); c.fillRect(-5, -88, 10, 12); c.restore(); }
        c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, 62, 0, Math.PI * 2); c.stroke();
        c.restore();
        TorqueArt.text(c, 'Torque', 470, 632, 40, 'rgba(255,170,70,.42)', '"Great Vibes", cursive');
        TorqueArt.text(c, 'A U T O  ·  S D C', 470, 666, 8, 'rgba(255,170,70,.45)');
        // The doormat
        B(c, 630, 846, 140, 40, '#1c1c20', 'rgba(255,154,42,.6)', 3, 1.5);
        TorqueArt.text(c, 'TORQUE AUTO', 700, 866, 10, 'rgba(255,170,70,.7)');
        // The showroom: black porcelain, bronze joints, the plinth's steel ring set in the floor, a runner from the arch
        for (let y = 50; y < 690; y += 64) for (let x = 900; x < 1350; x += 64) {
            const v = r(), g = c.createLinearGradient(x, y, x + 64, y + 64);
            g.addColorStop(0, `rgb(${22 + v * 8 | 0},${21 + v * 8 | 0},${26 + v * 9 | 0})`); g.addColorStop(1, '#0f0f13');
            c.fillStyle = g; c.fillRect(x, y, 64, 64);
            c.fillStyle = 'rgba(255,255,255,.035)'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 30, y); c.lineTo(x, y + 30); c.closePath(); c.fill();
        }
        c.strokeStyle = 'rgba(190,140,80,.28)'; c.lineWidth = 0.8; c.beginPath();
        for (let x = 900; x <= 1350; x += 64) { c.moveTo(x, 50); c.lineTo(x, 690); }
        for (let y = 50; y <= 690; y += 64) { c.moveTo(900, y); c.lineTo(1350, y); } c.stroke();
        const { x: tx, y: ty, r: tr } = TQ_TURNTABLE;
        c.strokeStyle = T.steel; c.lineWidth = 3; c.beginPath(); c.arc(tx, ty, tr + 14, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = 'rgba(255,154,42,.5)'; c.lineWidth = 1; c.beginPath(); c.arc(tx, ty, tr + 20, 0, Math.PI * 2); c.stroke();
        B(c, 906, 350, 44, 60, '#1b1a20', 'rgba(255,154,42,.5)', 2, 1);   // the mat in the arch
        TorqueArt.text(c, 'L A D Y  ·  B L A C K M A R K  V 3', tx, ty + tr + 34, 8, 'rgba(223,227,234,.55)');
        TorqueArt.text(c, 'est. 5930', tx, ty + tr + 48, 12, 'rgba(223,227,234,.4)', '"Great Vibes", cursive');
        // The parts room: diamond plate
        c.fillStyle = '#2a2c31'; c.fillRect(900, 710, 450, 240);
        c.fillStyle = 'rgba(255,255,255,.07)';
        for (let y = 714; y < 950; y += 12) for (let x = 904 + ((y / 12) % 2) * 9; x < 1350; x += 18) { c.save(); c.translate(x, y); c.rotate(0.6); c.fillRect(-4, -1, 8, 2); c.restore(); }
        TorqueArt.text(c, 'PARTS', 1125, 935, 10, 'rgba(255,154,42,.45)');
        // Depth: every room darkens toward its walls
        for (const [x, y, w, h] of [[50, 50, 830, 900], [900, 50, 450, 640], [900, 710, 450, 240]]) {
            for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[x, y, x, y + 40, x, y, w, 40], [x, y, x + 40, y, x, y, 40, h], [x + w, y, x + w - 40, y, x + w - 40, y, 40, h]]) {
                const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(rx, ry, rw, rh);
            }
        }
        return cv;
    },
    drawTorqueGlow(c) {
        const t = _frameTime / 1000, mirror = c !== this.ctx;
        c.save(); c.globalCompositeOperation = 'lighter';
        // Strip lights over each bay: two tubes, a cool-white wash under them
        for (const [x, y, w, h] of TQ_BAYS) {
            glowA(c, x + w / 2, y + h / 2, 150, '255, 238, 214', 0.13);
            for (const yy of [y + 24, y + h - 24]) for (let xx = x + 30; xx <= x + w - 30; xx += 34) glowA(c, xx, yy, 22, '255, 244, 226', 0.22);
        }
        glowA(c, 470, 640, 200, '255, 170, 70', 0.08);
        // The showroom: four rose-gold spots on the plinth, the counter's amber line, the neon script on the north wall
        const { x: tx, y: ty, r: tr } = TQ_TURNTABLE;
        glowA(c, tx, ty, tr + 70, '250, 206, 188', 0.17);
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; glowA(c, tx + Math.cos(a) * (tr + 6), ty + Math.sin(a) * (tr + 6), 40, '248, 190, 168', 0.2); }
        glowA(c, tx, ty, tr + 18, '236, 168, 142', 0.1 + 0.03 * Math.sin(t * 1.3));
        for (let x = 960; x <= 1140; x += 30) glowA(c, x, 290, 26, '255, 154, 42', 0.3);
        const hum = 0.85 + 0.08 * Math.sin(t * 1.7) + 0.05 * Math.sin(t * 13);
        c.globalAlpha = 0.55 * hum; TorqueArt.text(c, 'Torque', 1235, 96, 42, '#ff9a2a', '"Great Vibes", cursive');
        glowA(c, 1235, 96, 80, '255, 154, 42', 0.22 * hum);
        // The parts room's caged bulb, the lifts' lamps
        glowA(c, 1100, 800, 90, '255, 176, 112', 0.14);
        for (const [x, y] of TQ_LIFT_LAMPS) glowA(c, x, y, 7, '60, 255, 138', 0.5);
        // Sparks at the bench now and then: a grinder's spray
        if (!mirror) {
            const ph = (t * 0.25) % 1;
            if (ph < 0.3) for (let i = 0; i < 9; i++) {
                const k = ((t * 3 + i * 0.137) % 1), a = -0.4 - i * 0.12;
                glowA(c, 712 + Math.cos(a) * k * 46, 92 + Math.sin(a) * k * -22 + k * k * 30, 2.5, '255, 200, 120', 0.9 * (1 - k));
            }
        }
        c.restore();
        // The tubes themselves, drawn solid over the room
        if (!mirror) {
            c.save(); c.fillStyle = '#f6efe2'; c.strokeStyle = '#3a3a42'; c.lineWidth = 1;
            for (const [x, y, w, h] of TQ_BAYS) for (const yy of [y + 24, y + h - 24]) { c.beginPath(); c.roundRect(x + 24, yy - 2, w - 48, 4, 2); c.fill(); c.stroke(); }
            c.restore();
        }
    }
});
