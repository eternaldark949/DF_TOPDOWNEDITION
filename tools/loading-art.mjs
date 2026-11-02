/*
 * The loading screen's art (src/styles/loading-screen.css), drawn here at build time as small SVGs so it is
 * in the page's first bytes: nothing has to load or run before the loading screen can paint.
 *
 *   url(@art:skyline-far)          a far row of towers, a tile that repeats sideways
 *   url(@art:skyline-near)         the near row, taller and darker
 *   url(@art:windows-far-a) … -c   that row's lit windows, split three ways so each set can twinkle on its own
 *   url(@art:windows-near-a) … -c
 *   url(@art:stars-a) / -b         two star fields that drift at different speeds
 *   url(@art:grain)                film grain: a tile of grey pixel noise (a PNG), for the world and the pause screen
 *
 * Everything is seeded, so the build is the same every time (CI checks the built file is up to date).
 */

import { deflateSync } from 'node:zlib';

const W = 1600;            // one skyline tile, in SVG units; the CSS repeats it sideways
const H = 400;

function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none">${body}</svg>`;
const r1 = (n) => Math.round(n * 10) / 10;

/** A row of towers: some stepped like the city's tiered landmarks, some with a spire or a mast. */
function skyline(seed, { minH, maxH, minW, maxW, fill, rim, windowColours }) {
    const rand = rng(seed);
    const shapes = [], lit = [[], [], []];
    let x = 0;
    while (x < W - minW) {
        const w = Math.min(W - x, minW + rand() * (maxW - minW));
        const h = minH + Math.pow(rand(), 1.4) * (maxH - minH);
        const top = H - h;
        // the tower and, half the time, one or two setbacks on top (the tiered kit)
        const parts = [[x, top, w, h]];
        const tiers = rand() < 0.5 ? (rand() < 0.5 ? 1 : 2) : 0;
        let tx = x, tw = w, ty = top;
        for (let t = 0; t < tiers; t++) {
            const inset = tw * (0.14 + rand() * 0.12), th = 14 + rand() * 34;
            tx += inset; tw -= inset * 2; ty -= th;
            if (tw < 10) break;
            parts.push([tx, ty, tw, th]);
        }
        const peak = parts[parts.length - 1];
        if (rand() < 0.28) {                                           // a mast with a light on it
            const mx = peak[0] + peak[2] / 2, mh = 18 + rand() * 40;
            shapes.push(`<rect x="${r1(mx - 1)}" y="${r1(peak[1] - mh)}" width="2" height="${r1(mh)}"/>`);
            lit[Math.floor(rand() * 3)].push(`<circle cx="${r1(mx)}" cy="${r1(peak[1] - mh)}" r="2.2" fill="#ff5a7a"/>`);
        } else if (rand() < 0.18) {                                    // a spire
            const mx = peak[0] + peak[2] / 2, sh = 20 + rand() * 46, sw = Math.min(peak[2] * 0.4, 16);
            shapes.push(`<path d="M${r1(mx - sw / 2)} ${r1(peak[1])}L${r1(mx)} ${r1(peak[1] - sh)}L${r1(mx + sw / 2)} ${r1(peak[1])}Z"/>`);
        }
        for (const [px, py, pw, ph] of parts) shapes.push(`<rect x="${r1(px)}" y="${r1(py)}" width="${r1(pw)}" height="${r1(ph + 1)}"/>`);
        // a thin lit rim along the tower's roof, as the city's lamps catch it
        if (rim) shapes.push(`<rect x="${r1(peak[0])}" y="${r1(peak[1])}" width="${r1(peak[2])}" height="1.4" fill="${rim}"/>`);
        // windows: a grid on the main block, about a third of them lit
        const cw = 5 + rand() * 3, ch = 7 + rand() * 3, gx = cw + 4 + rand() * 4, gy = ch + 6 + rand() * 4;
        const cols = Math.floor((w - 10) / gx), rows = Math.floor((h - 20) / gy);
        const ox = x + (w - cols * gx) / 2 + (gx - cw) / 2, density = 0.18 + rand() * 0.3;
        const colour = windowColours[Math.floor(rand() * windowColours.length)];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            if (rand() > density) continue;
            const fill = rand() < 0.12 ? windowColours[Math.floor(rand() * windowColours.length)] : colour;
            lit[Math.floor(rand() * 3)].push(`<rect x="${r1(ox + c * gx)}" y="${r1(top + 14 + r * gy)}" width="${r1(cw)}" height="${r1(ch)}" fill="${fill}"/>`);
        }
        x += w + (rand() < 0.3 ? 4 + rand() * 30 : 0);
    }
    return {
        shape: svg(W, H, `<g fill="${fill}">${shapes.join('')}</g>`),
        windows: lit.map(set => svg(W, H, set.join('')))
    };
}

/** A tile of stars: small soft dots, a few brighter ones with a cross glint. */
function stars(seed, count, size) {
    const rand = rng(seed), out = [];
    for (let i = 0; i < count; i++) {
        const x = r1(rand() * size), y = r1(rand() * size), big = rand() < 0.08;
        const colour = rand() < 0.3 ? '#e8c27a' : rand() < 0.5 ? '#d6beff' : '#f4efff';
        const r = big ? 1.6 : 0.5 + rand() * 0.8, a = r1(0.35 + rand() * 0.6);
        out.push(`<circle cx="${x}" cy="${y}" r="${r1(r)}" fill="${colour}" opacity="${a}"/>`);
        if (big) out.push(`<path d="M${x - 6} ${y}H${x + 6}M${x} ${y - 6}V${y + 6}" stroke="${colour}" stroke-width="0.6" opacity="0.6"/>`);
    }
    return svg(size, size, out.join(''));
}

/** A square of grey noise, each pixel its own shade, as a PNG (written by hand: no dependencies) */
function grainPng(seed, size) {
    const rand = rng(seed), raw = Buffer.alloc((size * 2 + 1) * size);   // grey + alpha per pixel, a filter byte per row
    for (let y = 0; y < size; y++) {
        const row = y * (size * 2 + 1);
        raw[row] = 0;
        for (let x = 0; x < size; x++) {
            // mostly mid-grey, a long tail to black and white: reads as grain rather than static
            const g = Math.max(0, Math.min(255, Math.round(128 + (rand() + rand() + rand() - 1.5) * 150)));
            raw[row + 1 + x * 2] = g;
            raw[row + 2 + x * 2] = 255;
        }
    }
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
        return Buffer.concat([len, td, c]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 4; ihdr[10] = ihdr[11] = ihdr[12] = 0;   // 8-bit grey + alpha
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

export function loadingArt() {
    const far = skyline(949, { minH: 90, maxH: 250, minW: 40, maxW: 120, fill: '#1c0c2c', rim: '#4a2a6a', windowColours: ['#8f6ad8', '#c49be8', '#e8c27a'] });
    const near = skyline(747, { minH: 60, maxH: 330, minW: 60, maxW: 170, fill: '#09030d', rim: '#3a1838', windowColours: ['#e8c27a', '#f3d9a0', '#ffb070', '#b48cff'] });
    return {
        'skyline-far': far.shape, 'windows-far-a': far.windows[0], 'windows-far-b': far.windows[1], 'windows-far-c': far.windows[2],
        'skyline-near': near.shape, 'windows-near-a': near.windows[0], 'windows-near-b': near.windows[1], 'windows-near-c': near.windows[2],
        'stars-a': stars(6125, 90, 600), 'stars-b': stars(4202, 40, 900),
        'grain': grainPng(35, 192)
    };
}

/** Swap every url(@art:name) in a stylesheet for that drawing, as a data URI. */
export function inlineLoadingArt(css) {
    const art = loadingArt();
    return css.replace(/url\(@art:([a-z-]+)\)/g, (m, name) => {
        if (!art[name]) throw new Error(`loading art "${name}" is not drawn in tools/loading-art.mjs`);
        if (Buffer.isBuffer(art[name])) return `url("data:image/png;base64,${art[name].toString('base64')}")`;
        return `url("data:image/svg+xml,${encodeURIComponent(art[name]).replace(/'/g, '%27')}")`;
    });
}
