// ===== LV0 BASEMENT =====
// COLORS: CSS colour strings read as numbers, for backends that paint with numbers (WebGL). The packet
// contract says colours are CSS colour notation; this reads the forms the engine's art uses: names,
// #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() and hsl()/hsla() (commas or spaces, `/ alpha`, percentages).
// Anything else is refused, so a colour a backend cannot read never draws as black.

const NAMES = 'aliceblue:f0f8ff,antiquewhite:faebd7,aqua:00ffff,aquamarine:7fffd4,azure:f0ffff,beige:f5f5dc,bisque:ffe4c4,black:000000,blanchedalmond:ffebcd,blue:0000ff,blueviolet:8a2be2,brown:a52a2a,burlywood:deb887,cadetblue:5f9ea0,chartreuse:7fff00,chocolate:d2691e,coral:ff7f50,cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,cyan:00ffff,darkblue:00008b,darkcyan:008b8b,darkgoldenrod:b8860b,darkgray:a9a9a9,darkgreen:006400,darkgrey:a9a9a9,darkkhaki:bdb76b,darkmagenta:8b008b,darkolivegreen:556b2f,darkorange:ff8c00,darkorchid:9932cc,darkred:8b0000,darksalmon:e9967a,darkseagreen:8fbc8f,darkslateblue:483d8b,darkslategray:2f4f4f,darkslategrey:2f4f4f,darkturquoise:00ced1,darkviolet:9400d3,deeppink:ff1493,deepskyblue:00bfff,dimgray:696969,dimgrey:696969,dodgerblue:1e90ff,firebrick:b22222,floralwhite:fffaf0,forestgreen:228b22,fuchsia:ff00ff,gainsboro:dcdcdc,ghostwhite:f8f8ff,gold:ffd700,goldenrod:daa520,gray:808080,green:008000,greenyellow:adff2f,grey:808080,honeydew:f0fff0,hotpink:ff69b4,indianred:cd5c5c,indigo:4b0082,ivory:fffff0,khaki:f0e68c,lavender:e6e6fa,lavenderblush:fff0f5,lawngreen:7cfc00,lemonchiffon:fffacd,lightblue:add8e6,lightcoral:f08080,lightcyan:e0ffff,lightgoldenrodyellow:fafad2,lightgray:d3d3d3,lightgreen:90ee90,lightgrey:d3d3d3,lightpink:ffb6c1,lightsalmon:ffa07a,lightseagreen:20b2aa,lightskyblue:87cefa,lightslategray:778899,lightslategrey:778899,lightsteelblue:b0c4de,lightyellow:ffffe0,lime:00ff00,limegreen:32cd32,linen:faf0e6,magenta:ff00ff,maroon:800000,mediumaquamarine:66cdaa,mediumblue:0000cd,mediumorchid:ba55d3,mediumpurple:9370db,mediumseagreen:3cb371,mediumslateblue:7b68ee,mediumspringgreen:00fa9a,mediumturquoise:48d1cc,mediumvioletred:c71585,midnightblue:191970,mintcream:f5fffa,mistyrose:ffe4e1,moccasin:ffe4b5,navajowhite:ffdead,navy:000080,oldlace:fdf5e6,olive:808000,olivedrab:6b8e23,orange:ffa500,orangered:ff4500,orchid:da70d6,palegoldenrod:eee8aa,palegreen:98fb98,paleturquoise:afeeee,palevioletred:db7093,papayawhip:ffefd5,peachpuff:ffdab9,peru:cd853f,pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6,purple:800080,rebeccapurple:663399,red:ff0000,rosybrown:bc8f8f,royalblue:4169e1,saddlebrown:8b4513,salmon:fa8072,sandybrown:f4a460,seagreen:2e8b57,seashell:fff5ee,sienna:a0522d,silver:c0c0c0,skyblue:87ceeb,slateblue:6a5acd,slategray:708090,slategrey:708090,snow:fffafa,springgreen:00ff7f,steelblue:4682b4,tan:d2b48c,teal:008080,thistle:d8bfd8,tomato:ff6347,turquoise:40e0d0,violet:ee82ee,wheat:f5deb3,white:ffffff,whitesmoke:f5f5f5,yellow:ffff00,yellowgreen:9acd32';
const named = new Map(NAMES.split(',').map(entry => entry.split(':')));
const parsed = new Map();

const channel = (text, max) => {
    const percent = text.endsWith('%'), value = Number(percent ? text.slice(0, -1) : text);
    if (!Number.isFinite(value)) throw new TypeError(`Unreadable colour value: ${text}`);
    return Math.min(1, Math.max(0, percent ? value / 100 : value / max));
};
const hue = text => {
    const match = /^(-?[\d.]+(?:e-?\d+)?)(deg|turn|rad|grad)?$/.exec(text); if (!match) throw new TypeError(`Unreadable hue: ${text}`);
    const value = Number(match[1]), unit = match[2] ?? 'deg';
    const degrees = unit === 'turn' ? value * 360 : unit === 'rad' ? value * 180 / Math.PI : unit === 'grad' ? value * .9 : value;
    return ((degrees % 360) + 360) % 360 / 360;
};
function hslToRgb(h, s, l) {
    const k = n => (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return [0, 8, 4].map(n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
}
function read(text) {
    const value = text.trim().toLowerCase();
    if (value === 'transparent') return [0, 0, 0, 0];
    const hex = value.startsWith('#') ? value.slice(1) : named.get(value);
    if (hex !== undefined) {
        if (!/^[0-9a-f]+$/.test(hex) || ![3, 4, 6, 8].includes(hex.length)) throw new TypeError(`Unreadable colour: ${text}`);
        const full = hex.length < 5 ? [...hex].map(c => c + c).join('') : hex;
        return [0, 2, 4, 6].map(i => i < full.length ? parseInt(full.slice(i, i + 2), 16) / 255 : 1);
    }
    const match = /^(rgba?|hsla?)\((.*)\)$/.exec(value); if (!match) throw new TypeError(`Unreadable colour: ${text}`);
    let parts = match[2].includes(',') ? match[2].split(',') : match[2].replace('/', ' / ').split(/\s+/);
    parts = parts.map(part => part.trim()).filter(part => part && part !== '/');
    if (parts.length !== 3 && parts.length !== 4) throw new TypeError(`Unreadable colour: ${text}`);
    const alpha = parts.length === 4 ? channel(parts[3], 1) : 1;
    if (match[1].startsWith('rgb')) return [channel(parts[0], 255), channel(parts[1], 255), channel(parts[2], 255), alpha];
    return [...hslToRgb(hue(parts[0]), channel(parts[1].endsWith('%') ? parts[1] : `${parts[1]}%`, 1), channel(parts[2].endsWith('%') ? parts[2] : `${parts[2]}%`, 1)), alpha];
}

/** A CSS colour as [r, g, b, a], each 0..1, not premultiplied. Unreadable colours throw. Results are cached and frozen. */
export function readColor(text) {
    let rgba = parsed.get(text);
    if (!rgba) { if (typeof text !== 'string') throw new TypeError('A colour string is required'); rgba = Object.freeze(read(text)); if (parsed.size > 4096) parsed.clear(); parsed.set(text, rgba); }
    return rgba;
}
/** The same colour premultiplied by its alpha and by `opacity`, into `out` ([r, g, b, a]). */
export function premultiplied(text, opacity = 1, out = [0, 0, 0, 0]) {
    const [r, g, b, a] = readColor(text), k = a * opacity;
    out[0] = r * k; out[1] = g * k; out[2] = b * k; out[3] = k; return out;
}
/**
 * A gradient's stops as a strip of `size` RGBA bytes, premultiplied: colours interpolate between stops
 * without premultiplying, as Canvas gradients do; before the first stop and after the last the end colours hold.
 */
export function gradientRamp(stops, size = 256) {
    const sorted = stops.map(([offset, color], index) => ({ offset, color: readColor(color), index })).sort((a, b) => a.offset - b.offset || a.index - b.index);
    const bytes = new Uint8Array(size * 4);
    for (let i = 0; i < size; i++) {
        const t = i / (size - 1); let j = 0;
        while (j < sorted.length - 1 && sorted[j + 1].offset <= t) j++;
        const a = sorted[j], b = sorted[Math.min(j + 1, sorted.length - 1)];
        const k = t <= a.offset || b.offset <= a.offset ? (t < a.offset ? 0 : t >= b.offset ? 1 : 0) : (t - a.offset) / (b.offset - a.offset);
        const c = [0, 1, 2, 3].map(n => a.color[n] + (b.color[n] - a.color[n]) * k);
        bytes[i * 4] = Math.round(c[0] * c[3] * 255); bytes[i * 4 + 1] = Math.round(c[1] * c[3] * 255); bytes[i * 4 + 2] = Math.round(c[2] * c[3] * 255); bytes[i * 4 + 3] = Math.round(c[3] * 255);
    }
    return bytes;
}
