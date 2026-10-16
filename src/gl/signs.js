// GL engine: the street's neon signs. Each sign's lettering is the text atlas's distance field
// (gl/text.js) drawn three times, as Canvas draws it (entities/street-objects.js NeonSign): its
// colour blurred out into a glow, the letters in its colour, and a white core. Built once per
// sign; each frame only the flicker (the Canvas formula) changes its alpha.
const GLNeonSigns = (() => {
    function build(s, e) {
        const B = new GLBuildingBuilder(0);
        B.color(s.color, .9); GLText.quad(B, e, 0, 0, 0, 0, 1, 1.15);         // shadowBlur 15 in the sign's colour
        B.color(s.color, .9); GLText.quad(B, e, 0, 0, 0, 0, 0);
        B.color('#ffffff', .7); GLText.quad(B, e, 0, 0, 0, 0, 0);
        return GLInstance.geometry(B);
    }
    class Signs extends PIXI.Container {
        constructor() { super(); this.recs = new Map(); this.stats = { signs: 0 }; }
        sync(signs, time) {
            const live = new Set(); let n = 0;
            for (const s of signs) {
                const e = GLText.entry(s.text, s.fontSize, s.fontFamily, true, 'bold');
                if (!e) continue;
                let r = this.recs.get(s);
                const key = s.text + '|' + s.color + '|' + e.u0 + '|' + e.v0 + '|' + e.ww;
                if (!r) { r = new GLInstance(); this.addChild(r); this.recs.set(s, r); }
                if (r.key !== key) { r.geometry?.destroy(); r.geometry = build(s, e); r.key = key; }
                const t = time + s.flickerOffset;
                r.alpha = (Math.sin(t / 50) > .95 || Math.random() < .02) ? .3 : 1;
                r.position.set(s.x, s.y); r.visible = true; live.add(s); n++;
            }
            for (const [s, r] of this.recs) if (!live.has(s)) { if (r.visible) r.visible = false; }
            this.stats.signs = n;
        }
        destroy() { for (const r of this.recs.values()) r.geometry?.destroy(); this.recs.clear(); super.destroy({ children: true }); }
    }
    return Signs;
})();
