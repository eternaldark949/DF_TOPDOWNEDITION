/* =====================================================================
   NEURAL SYSTEMS: a luxury department store carved from dark sapphire
   ---------------------------------------------------------------------
   Built on the tiered kit (buildings/tiered-kit.js):
     · the atrium, the tall back block: sapphire glass cut into facets on
       every wall (a few lit ice blue after dark), a gold thread over the
       vitrines, a pale stone plinth; on its roof the great crystal;
     · the salon, the lower front block: pale stone vitrines along the
       street (mannequins and crystals, lit after dark), the portal in the
       middle under NEURAL SYSTEMS in the fascia, sapphire facets above;
       on its roof the crystal and the engraved lettering;
     · a slim glass canopy over the portal.
   Collision is the atrium and the salon (the old T); the canopy overhangs.
   ===================================================================== */
const NEURAL = { ink:'#081326', navy:'#102444', blue:'#234d80', cobalt:'#326fc2', ice:'#bed8ee',
    metal:'#9baebe', pale:'#e5e6df', gold:'#c1a980', glass:'#102a46',
    W:400, D:400, ATRIUM:46, SALON:28, VIT:14 };
const NeuralArt = {
    box(c,x,y,w,h,fill,stroke,r=3,lw=1){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}},
    text(c,t,x,y,size,color=NEURAL.ice){c.fillStyle=color;c.font=`${size}px Georgia,serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(t,x,y);},
    crystal(c,x,y,w,h,base='#102d59'){
        const pts=[[x+w*.18,y],[x+w*.82,y],[x+w,y+h*.24],[x+w*.82,y+h],[x+w*.18,y+h],[x,y+h*.24]],cx=x+w*.5,cy=y+h*.48;
        const colors=[base,'#28588a','#15345b','#0b1b3c','#1b4374','#456d9b'];
        for(let i=0;i<6;i++){const a=pts[i],b=pts[(i+1)%6];c.fillStyle=colors[i];c.beginPath();c.moveTo(...a);c.lineTo(...b);c.lineTo(cx,cy);c.closePath();c.fill();}
        c.strokeStyle='rgba(181,216,243,.6)';c.lineWidth=.8;c.beginPath();pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.stroke();
        c.strokeStyle='rgba(232,245,255,.3)';c.beginPath();c.moveTo(x+w*.18,y+1);c.lineTo(cx,cy);c.lineTo(x+w*.82,y+h-1);c.stroke();
    },
    seal(c,x,y,r,color=NEURAL.ice){
        c.save();c.translate(x,y);c.strokeStyle=color;c.lineWidth=Math.max(.7,r*.022);
        c.beginPath();c.moveTo(0,-r);c.lineTo(r*.7,-r*.35);c.lineTo(r*.52,r*.55);c.lineTo(0,r);c.lineTo(-r*.52,r*.55);c.lineTo(-r*.7,-r*.35);c.closePath();c.stroke();
        c.beginPath();c.moveTo(0,-r);c.lineTo(r*.3,0);c.lineTo(0,r);c.lineTo(-r*.3,0);c.closePath();c.moveTo(-r*.7,-r*.35);c.lineTo(r*.7,-r*.35);c.moveTo(-r*.52,r*.55);c.lineTo(r*.52,r*.55);c.stroke();c.restore();
    }
};
const _nsFront = (t) => t.mitre.find(e => e && !e.hidden && e.ny > 0.99);
const _NS_FACET = ['#0e2442','#163558','#1d4372','#0b1d38','#25528a','#112c4e'];

/** Sapphire facets from y0 down to y1 on every visible edge: columns cut on alternating diagonals, a few lit at night */
function _nsFacets(d, l, t, y0, y1, seed) {
    const r = seededRandom(seed), cw = 22;
    for (const e of t.mitre) {
        if (!e || e.hidden) continue;
        const n = Math.max(1, Math.round(e.L / cw)), w = e.L / n;
        for (let i = 0; i < n; i++) {
            const x0 = e.u0 + i * w, x1 = x0 + w, mid = y0 + (y1 - y0) * (0.3 + r() * 0.4), flip = (i % 2) === 0;
            const tris = flip ? [[[x0, y0], [x1, y0], [x0, mid]], [[x1, y0], [x1, y1], [x0, mid]], [[x0, mid], [x1, y1], [x0, y1]]]
                              : [[[x0, y0], [x1, y0], [x1, mid]], [[x0, y0], [x1, mid], [x0, y1]], [[x0, y1], [x1, mid], [x1, y1]]];
            for (const tri of tris) {
                d.fillStyle = _NS_FACET[Math.floor(r() * _NS_FACET.length)];
                d.beginPath(); d.moveTo(...tri[0]); d.lineTo(...tri[1]); d.lineTo(...tri[2]); d.closePath(); d.fill();
                const lit = r();
                if (lit < 0.3) { l.fillStyle = `rgba(120,176,240,${(0.18 + lit).toFixed(2)})`; l.beginPath(); l.moveTo(...tri[0]); l.lineTo(...tri[1]); l.lineTo(...tri[2]); l.closePath(); l.fill(); }
            }
            d.strokeStyle = 'rgba(190,216,238,.42)'; d.lineWidth = 0.35; d.beginPath();
            if (flip) { d.moveTo(x1, y0); d.lineTo(x0, mid); d.lineTo(x1, y1); } else { d.moveTo(x0, y0); d.lineTo(x1, mid); d.lineTo(x0, y1); }
            d.stroke();
            d.fillStyle = 'rgba(155,174,190,.7)'; d.fillRect(x0 - 0.3, y0, 0.6, y1 - y0);             // the mullions
        }
        d.fillStyle = 'rgba(232,245,255,.08)'; d.fillRect(e.u0, y0, e.L, (y1 - y0) * 0.25);         // the sky in the top of the glass
    }
}

/** Pale stone vitrines from y0 to the plinth, on every visible edge (gapped for the portal on the salon's front) */
function _nsVitrines(d, l, t, y0, H, gap) {
    const r = seededRandom(t.i * 31 + 7), plinth = H - 2.2;
    for (const e of t.mitre) {
        if (!e || e.hidden) continue;
        d.fillStyle = '#d9d8cf'; d.fillRect(e.u0, y0, e.L, H - y0);
        d.fillStyle = '#b9b8ae'; d.fillRect(e.u0, plinth, e.L, H - plinth);
        d.fillStyle = 'rgba(0,0,0,.18)'; d.fillRect(e.u0, plinth, e.L, 0.3);
        d.fillStyle = NEURAL.gold; d.fillRect(e.u0, y0, e.L, 0.6);
        const n = Math.max(1, Math.floor((e.L - 8) / 40)), w = (e.L - 8) / n;
        for (let i = 0; i < n; i++) {
            const a = e.u0 + 4 + i * w + 3, b = a + w - 6, top = y0 + 2.4, bot = plinth - 0.8;
            if (gap && b > gap[0] && a < gap[1]) continue;
            d.fillStyle = '#0a1628'; d.fillRect(a, top, b - a, bot - top);
            const g = d.createLinearGradient(0, top, 0, bot); g.addColorStop(0, 'rgba(120,170,220,.25)'); g.addColorStop(1, 'rgba(20,40,70,.1)'); d.fillStyle = g; d.fillRect(a, top, b - a, bot - top);
            l.fillStyle = 'rgba(206,226,255,.62)'; l.fillRect(a, top, b - a, bot - top);
            const m = (a + b) / 2, kind = Math.floor(r() * 3);                                         // what's in the window
            for (const c of [d, l]) {
                c.fillStyle = c === d ? '#cfd6de' : 'rgba(0,0,0,.55)';
                if (kind === 0) { c.beginPath(); c.arc(m, top + 2.2, 0.9, 0, Math.PI * 2); c.fill(); c.fillRect(m - 1.2, top + 3.2, 2.4, 5); c.fillRect(m - 0.3, top + 8.2, 0.6, bot - top - 8.4); }
                else if (kind === 1) { for (const dx of [-5, 5]) { c.beginPath(); c.arc(m + dx, top + 2.4, 0.8, 0, Math.PI * 2); c.fill(); c.fillRect(m + dx - 1, top + 3.3, 2, 4.6); } }
                else { c.beginPath(); c.moveTo(m, top + 1.6); c.lineTo(m + 3, top + 4.4); c.lineTo(m, bot - 2.4); c.lineTo(m - 3, top + 4.4); c.closePath(); c.fill(); }
            }
            d.fillStyle = '#9baebe'; d.fillRect(a - 0.6, top - 0.6, b - a + 1.2, 0.6); d.fillRect(a - 0.6, bot, b - a + 1.2, 0.5);
            d.fillStyle = 'rgba(255,255,255,.08)'; d.fillRect(a + 1, top, 1.2, bot - top);
        }
    }
}

/** The coping along the top: brushed metal, a cobalt LED line under it */
function _nsCoping(d, l, L) {
    d.fillStyle = NEURAL.metal; d.fillRect(0, 0, L, 1.6); d.fillStyle = 'rgba(255,255,255,.35)'; d.fillRect(0, 0, L, 0.35);
    d.fillStyle = '#0b1830'; d.fillRect(0, 1.6, L, 0.8);
    d.fillStyle = '#5b8fd0'; d.fillRect(0, 2.0, L, 0.3); l.fillStyle = 'rgba(80,150,255,1)'; l.fillRect(0, 1.9, L, 0.5);
}

/** The atrium: sapphire facets over a band of vitrines */
function _nsAtrium(d, l, t, H, L) {
    d.fillStyle = NEURAL.ink; d.fillRect(0, 0, L, H);
    _nsFacets(d, l, t, 2.4, H - NEURAL.VIT, 811);
    _nsVitrines(d, l, t, H - NEURAL.VIT, H, null);
    _nsCoping(d, l, L);
}

/** The salon: facets over the fascia, the vitrines and the portal on the street */
function _nsSalon(d, l, t, H, L) {
    const front = _nsFront(t), V = NEURAL.VIT, fy = H - V - 4.6;
    d.fillStyle = NEURAL.ink; d.fillRect(0, 0, L, H);
    _nsFacets(d, l, t, 2.4, fy, 377);
    const cx = front ? front.u0 + 125 : -999, pw = 24;
    _nsVitrines(d, l, t, H - V, H, front ? [cx - pw - 4, cx + pw + 4] : null);
    // the fascia: dark sapphire stone with a gold thread, the name engraved on the front
    d.fillStyle = '#0b1a32'; d.fillRect(0, fy, L, 4.6); d.fillStyle = NEURAL.gold; d.fillRect(0, fy, L, 0.4); d.fillRect(0, fy + 4.2, L, 0.4);
    if (front) {
        for (const [c, col] of [[d, NEURAL.pale], [l, 'rgba(170,205,245,1)']]) {
            c.save(); c.font = '3.4px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col;
            if ('letterSpacing' in c) c.letterSpacing = '1.6px';
            c.fillText('NEURAL  SYSTEMS', cx, fy + 2.4); c.restore();
        }
        // the portal: a stone frame, two glass doors, the seal over them
        const top = H - V + 1.2, bot = H - 2.2;
        d.fillStyle = '#e8e7df'; d.fillRect(cx - pw - 3, H - V, (pw + 3) * 2, V - 2.2);
        d.fillStyle = '#b9b8ae'; d.fillRect(cx - pw - 3, H - V, 0.6, V - 2.2); d.fillRect(cx + pw + 2.4, H - V, 0.6, V - 2.2);
        d.fillStyle = '#0c1a2e'; d.fillRect(cx - pw, top + 3.4, pw * 2, bot - top - 3.4);
        const g = d.createLinearGradient(0, top, 0, bot); g.addColorStop(0, 'rgba(150,196,236,.38)'); g.addColorStop(1, 'rgba(60,100,150,.18)'); d.fillStyle = g; d.fillRect(cx - pw, top + 3.4, pw * 2, bot - top - 3.4);
        l.fillStyle = 'rgba(214,232,255,.85)'; l.fillRect(cx - pw, top + 3.4, pw * 2, bot - top - 3.4);
        d.fillStyle = '#9baebe'; for (const x of [cx - pw, cx - pw / 2, cx, cx + pw / 2, cx + pw - 0.5]) d.fillRect(x, top + 3.4, 0.5, bot - top - 3.4);
        d.fillStyle = NEURAL.gold; d.fillRect(cx - 2.6, top + 7, 0.5, 3); d.fillRect(cx + 2.1, top + 7, 0.5, 3);   // the pulls
        d.save(); d.translate(cx, top + 1.7); d.scale(1, 0.55); NeuralArt.seal(d, 0, 0, 2.6, '#3a5a84'); d.restore();
        l.save(); l.translate(cx, top + 1.7); l.scale(1, 0.55); NeuralArt.seal(l, 0, 0, 2.6, 'rgba(140,190,250,1)'); l.restore();
        // the two crystal plinths either side
        for (const s of [-1, 1]) { const px = cx + s * (pw + 9); d.fillStyle = '#41648c'; d.beginPath(); d.moveTo(px, top + 1); d.lineTo(px + 2.6, top + 4); d.lineTo(px, bot - 1); d.lineTo(px - 2.6, top + 4); d.closePath(); d.fill(); l.fillStyle = 'rgba(120,180,250,.7)'; l.fill(); }
    }
    _nsCoping(d, l, L);
}

/** The canopy's edge: brushed metal and a cobalt line */
function _nsCanopy(d, l, t, H, L) { d.fillStyle = NEURAL.metal; d.fillRect(0, 0, L, H); d.fillStyle = '#5b8fd0'; d.fillRect(0, H - 0.4, L, 0.4); l.fillStyle = 'rgba(80,150,255,1)'; l.fillRect(0, H - 0.4, L, 0.4); }

// ── roofs ──

function _nsAtriumRoof(c, glow, t) {
    const [x, y] = t.box, B = NeuralArt.box, T = NEURAL;
    if (glow) { NeuralArt.seal(c, x + 200, y + 96, 30, '#668db8'); c.strokeStyle = '#2b548a'; c.lineWidth = 2; c.strokeRect(x + 8, y + 8, 384, 184); return; }
    const g = c.createLinearGradient(x, y, x + 400, y + 200); g.addColorStop(0, '#264363'); g.addColorStop(.45, '#11233c'); g.addColorStop(1, '#0a1427');
    B(c, x, y, 400, 200, g, T.metal, 2, 1.5); B(c, x + 7, y + 7, 386, 186, null, '#43638a', 3);
    // large, quiet facets read as load-bearing crystal rather than cladding
    NeuralArt.crystal(c, x + 13, y + 12, 374, 175, '#183d6d');
    NeuralArt.crystal(c, x + 123, y + 34, 154, 122, '#315d8b');
    c.save(); c.globalAlpha = .24; c.fillStyle = '#c0daf0'; c.beginPath(); c.moveTo(x + 49, y + 16); c.lineTo(x + 75, y + 16); c.lineTo(x + 289, y + 180); c.lineTo(x + 252, y + 180); c.closePath(); c.fill(); c.restore();
}

function _nsSalonRoof(c, glow, t) {
    const [x0, y0] = t.box, x = x0 - 75, y = y0 - 200, T = NEURAL;           // (the old plan's frame: the lettering keeps its place)
    if (glow) {
        NeuralArt.text(c, 'NEURAL', x + 200, y + 278, 29, '#a7cdf4'); NeuralArt.text(c, 'S Y S T E M S', x + 200, y + 307, 12, '#82aed8');
        c.strokeStyle = '#2b548a'; c.lineWidth = 2; c.strokeRect(x0 + 8, y0 + 8, 234, 184); return;
    }
    const g = c.createLinearGradient(x0, y0, x0 + 250, y0 + 200); g.addColorStop(0, '#264363'); g.addColorStop(.45, '#11233c'); g.addColorStop(1, '#0a1427');
    NeuralArt.box(c, x0, y0, 250, 200, g, T.metal, 2, 1.5); NeuralArt.box(c, x0 + 7, y0 + 7, 236, 186, null, '#43638a', 3);
    NeuralArt.crystal(c, x + 87, y + 210, 226, 178, '#183963');
    // engraved department-store lettering sits directly on the sapphire surface
    NeuralArt.text(c, 'NEURAL', x + 200, y + 278, 29, T.pale);
    NeuralArt.text(c, 'S Y S T E M S', x + 200, y + 307, 12, T.ice);
    c.fillStyle = '#b4c7d7'; c.fillRect(x + 158, y + 326, 84, .7);
    NeuralArt.text(c, 'THE ART OF BECOMING', x + 200, y + 348, 7, T.pale);
}

function _nsCanopyRoof(c, glow, t) {
    const [x0, y0, x1, y1] = t.box;
    if (glow) { c.strokeStyle = 'rgba(80,150,255,.8)'; c.lineWidth = 1.6; c.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2); return; }
    c.fillStyle = 'rgba(70,110,150,.85)'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    c.strokeStyle = 'rgba(210,232,250,.4)'; c.lineWidth = 0.8; c.beginPath(); for (let x = x0 + 12; x < x1; x += 12) { c.moveTo(x, y0); c.lineTo(x, y1); } c.stroke();
    c.strokeStyle = NEURAL.metal; c.lineWidth = 1.2; c.strokeRect(x0 + 0.6, y0 + 0.6, x1 - x0 - 1.2, y1 - y0 - 1.2);
}

class NeuralSystemsBuilding extends TieredBuilding {
    _setupSign() { this.attachedSign = null; }
    _generateLights() {
        const e = this._entrance(); if (e) for (const d of [-76, 76]) this.attachedLights.push(new LampEntity({
            x: e.cx + e.ny * d + e.nx * 14, y: e.cy - e.nx * d + e.ny * 14, lampType: 3, color: '#b4d1f5', lightRadius: 145 }));
        this.topReach = 80; this.glowReach = 80;
    }
    /** The forecourt at the portal: a stone mat, the seal, two crystal plinths */
    drawBase(c) {
        super.drawBase(c);
        const e = this._entrance(); if (!e) return;
        const s = LandmarkKit.sprite(this, 'neural_entry', e.cx - 120, e.cy - 50, 240, 100, 1, p => {
            p.save(); p.transform(e.ny, -e.nx, e.nx, e.ny, e.cx, e.cy);
            NeuralArt.box(p, -82, 0, 164, 34, '#172840', NEURAL.metal, 3);
            for (const y of [8, 17, 26]) { p.strokeStyle = '#526275'; p.lineWidth = .6; p.beginPath(); p.moveTo(-80, y); p.lineTo(80, y); p.stroke(); }
            NeuralArt.box(p, -41, 0, 82, 33, 'rgba(111,161,205,.24)', '#afc8dc', 1);
            p.strokeStyle = '#b0c7d8'; p.lineWidth = .8; p.beginPath(); p.moveTo(0, 1); p.lineTo(0, 31); p.stroke();
            NeuralArt.seal(p, 0, 16, 9, NEURAL.pale);
            for (const x of [-101, 85]) NeuralArt.crystal(p, x, 3, 16, 28, '#41648c');
            p.restore();
        });
        LandmarkKit.drawSprite(c, s, 1);
    }
    drawSign() {}
}
TierKit.profile(NeuralSystemsBuilding);

/** Neural Systems: x, y its corner; the atrium at the back, the salon (and the portal) on the street, south. */
function createNeuralSystemsTiered(x, y, config = {}) {
    const T = NEURAL, ledge = (z, lip) => ({ z, out: 2.2, th: 2, top: '#9baebe', band: [26, 44, 70], lip });
    return new NeuralSystemsBuilding({
        id: 'neural_sys', x, y, label: 'Neural Systems', type: 'tech', facing: 'S', hero: 1.5, plan: { W: T.W, D: T.D },
        roofColor: '#161630', roofLightColor: '#1e1e3a', wallColor: '#141428', wallLightColor: '#1a1a30', accentColor: '#0088ff',
        windowColor: '#040410', windowLitColor: '#0088ff', windowFrameColor: '#060612', balconyColor: '#0a0a18', balconies: [], roofProps: [],
        sign: { text: 'NEURAL', color: '#0088ff', size: 22 },
        door: { target: config.doorTarget || 'neural_sys_interior', label: 'Enter Neural Systems', lightColor: '#0088ff' },
        tiers: [
            { id: 'atrium', rect: [0, 0, 400, 200], z0: 0, z1: T.ATRIUM, S: 2, fill: T.ink, paint: _nsAtrium, shade: [6, 12, 26],
              ledges: [ledge(T.VIT, 'rgba(193,169,128,.9)'), ledge(T.ATRIUM, 'rgba(190,216,238,.8)')], roofRes: 1, roofGlow: true, roof: _nsAtriumRoof },
            { id: 'salon', rect: [75, 200, 250, 200], z0: 0, z1: T.SALON, S: 2, fill: T.ink, paint: _nsSalon, shade: [6, 12, 26],
              ledges: [ledge(T.VIT, 'rgba(193,169,128,.9)'), ledge(T.SALON, 'rgba(190,216,238,.8)')], roofRes: 1, roofGlow: true, roof: _nsSalonRoof },
            // (a px off the wall: a tier back to back with a wall hides it below its top, _tkGeo)
            { id: 'canopy', solid: false, rect: [160, 401, 80, 18], z0: T.VIT - 1.4, z1: T.VIT, S: 4, fill: T.metal, paint: _nsCanopy, shade: [6, 12, 26],
              roofRes: 1, roofGlow: true, roof: _nsCanopyRoof }
        ],
        ...config
    });
}
