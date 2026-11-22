// ===== LV0 BASEMENT =====
// The UI's drawing: every open screen as page elements over the game, styled by its data's CSS. uiSystem keeps the
// state; this turns it into elements, writes only what changed each poll, plays the transitions and animations
// (Web Animations), and hands mouse and touch back to the system as hover, press, click and input.
import { ANIMATIONS } from './values.mjs';

const BASE_CSS = `
.ui-root { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 10; font-family: system-ui, sans-serif; color: #f3eef7; user-select: none; -webkit-user-select: none; }
.ui-root *, .ui-root *::before, .ui-root *::after { box-sizing: border-box; }
.ui-root [hidden] { display: none !important; }
.ui-screen { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
.ui-screen.ui-modal { pointer-events: auto; }
.ui-screen.ui-leaving, .ui-screen.ui-leaving * { pointer-events: none !important; }
.ui-button, .ui-toggle, .ui-slider, .ui-input, .ui-focusable { pointer-events: auto; cursor: pointer; }
.ui-button { padding: 10px 22px; background: rgba(255,255,255,.08); border-radius: 6px; text-align: center; }
.ui-button.is-focus, .ui-toggle.is-focus, .ui-slider.is-focus { background: rgba(255,255,255,.22); }
.ui-button.is-inactive, .ui-toggle.is-inactive, .ui-slider.is-inactive { opacity: .4; cursor: default; }
.ui-toggle, .ui-slider { display: flex; justify-content: space-between; gap: 18px; padding: 8px 14px; border-radius: 6px; }
.ui-track { display: block; position: relative; height: 4px; width: 100%; background: rgba(255,255,255,.18); border-radius: 2px; }
.ui-bar { position: relative; min-width: 60px; height: 8px; background: rgba(255,255,255,.15); border-radius: 4px; overflow: hidden; }
.ui-fill { position: absolute; left: 0; top: 0; bottom: 0; background: currentColor; border-radius: inherit; }
.ui-input input { font: inherit; color: inherit; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.3); border-radius: 4px; padding: 6px 8px; pointer-events: auto; }
.ui-panel, .ui-list { display: flex; flex-direction: column; }
`;
const ALIGN = { start: 'flex-start', centre: 'center', end: 'flex-end', stretch: 'stretch' };
// Where an anchor puts an item, and how far it is pulled back over itself so the anchor is its own matching point.
const ANCHOR = {
    top_left: [0, 0], top: [50, 0], top_right: [100, 0], left: [0, 50], centre: [50, 50], right: [100, 50],
    bottom_left: [0, 100], bottom: [50, 100], bottom_right: [100, 100]
};
const kebab = k => k.startsWith('--') ? k : k.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

export class uiView {
    #document; #handlers; #css = new Map(); #base;
    /** `root` is the element to draw in; `handlers` are the system's {hover, press, click, input}. */
    constructor(root, handlers) {
        if (!root?.ownerDocument) throw new TypeError('The UI draws into a page element');
        this.root = root; this.#document = root.ownerDocument; this.#handlers = handlers;
        root.classList.add('ui-root');
        this.#base = this.#style('ui-base', BASE_CSS);
    }
    #style(key, css) { const el = this.#document.createElement('style'); el.dataset.ui = key; el.textContent = css; this.root.prepend(el); return el; }
    openScreen(screen) {
        const r = screen.record, el = this.#document.createElement('div');
        el.className = `ui-screen${r.modal ? ' ui-modal' : ''}${r.class ? ' ' + r.class : ''}`; el.dataset.ui = screen.name;
        this.#apply(el, r.style); this.#layout(el, r.layout);
        if (r.css && !this.#css.has(screen.name)) this.#css.set(screen.name, this.#style(`css-${screen.name}`, [r.css].flat().join('\n')));
        screen.element = el;
        for (const node of screen.roots) el.append(this.#build(screen, node));
        this.root.append(el);
        const t = r.transition?.in;
        if (t && t.kind !== 'none') this.#animate(el, this.#frames(t), t.seconds ?? .25, 0, 'cubic-bezier(.2,.8,.25,1)');
        let i = 0; for (const node of screen.nodes.values()) this.#enter(node, i++);
    }
    closeScreen(screen) {
        const el = screen.element; if (!el) return;
        screen.element = null; el.classList.add('ui-leaving');
        const t = screen.record.transition?.out;
        const done = () => el.remove();
        if (t && t.kind !== 'none' && typeof el.animate === 'function') { const a = this.#animate(el, [...this.#frames(t)].reverse(), t.seconds ?? .2, 0, 'ease-in'); a ? a.finished.then(done, done) : done(); }
        else done();
    }
    #frames(t) {
        if (t.kind === 'fade') return ANIMATIONS.fade;
        const d = { left: 'translateX(-40px)', right: 'translateX(40px)', top: 'translateY(-40px)', bottom: 'translateY(40px)' }[t.from ?? 'bottom'];
        return [{ opacity: 0, transform: d }, { opacity: 1, transform: 'none' }];
    }
    #animate(el, frames, seconds, delay = 0, easing = 'ease-out', fill = 'both') {
        if (typeof el.animate !== 'function' || !seconds) return null;
        return el.animate(frames, { duration: seconds * 1000, delay: delay * 1000, easing, fill });
    }
    #enter(node, i) {
        const a = node.def.animations?.enter; if (!a || !node.element) return;
        const siblings = node.parent ? node.parent.children : null, at = siblings ? siblings.indexOf(node) : i;
        this.#animate(node.element, ANIMATIONS[a.name], a.seconds ?? .3, (a.delay ?? 0) + (a.stagger ?? 0) * at, a.easing ?? 'cubic-bezier(.2,.85,.25,1)', 'backwards');
    }
    /** Plays an item's animation for a moment (hover, click, focus). */
    play(node, moment) { const a = node.def.animations?.[moment]; if (a && node.element) this.#animate(node.element, ANIMATIONS[a.name], a.seconds ?? .25, a.delay ?? 0, a.easing ?? 'ease-out', 'none'); }
    /** Puts the page's own typing focus in an input item. */
    edit(node) { node.element?.querySelector('input')?.focus(); }
    #layout(el, layout) {
        if (!layout) return;
        const kind = layout.kind ?? 'list', s = el.style;
        if (kind === 'free') { s.display = 'block'; if (!el.classList.contains('ui-screen')) s.position ||= 'relative'; return; }
        if (kind === 'grid') { s.display = 'grid'; s.gridTemplateColumns = `repeat(${layout.columns ?? 1}, minmax(0, 1fr))`; }
        else { s.display = 'flex'; s.flexDirection = layout.direction ?? 'column'; if (layout.wrap) s.flexWrap = 'wrap'; }
        if (layout.spacing === 'auto') s.justifyContent = 'space-evenly'; else if (layout.spacing !== undefined) s.gap = `${layout.spacing}px`;
        if (layout.align) s.alignItems = ALIGN[layout.align];
        if (layout.justify && layout.spacing !== 'auto') s.justifyContent = ALIGN[layout.justify];
    }
    #apply(el, style) { if (style) for (const [k, v] of Object.entries(style)) el.style.setProperty(kebab(k), String(v)); }
    #build(screen, node) {
        const d = node.def, doc = this.#document, el = doc.createElement(d.type === 'image' ? 'img' : 'div');
        el.dataset.uiItem = node.id; node.element = el;
        el.className = `ui-item ui-${d.type}${d.focusable ? ' ui-focusable' : ''}${d.class ? ' ' + d.class : ''}`;
        if (['button', 'toggle', 'slider'].includes(d.type)) el.setAttribute('role', d.type === 'button' ? 'button' : d.type === 'toggle' ? 'switch' : 'slider');
        if (d.type === 'toggle' || d.type === 'slider') {
            el.innerHTML = '<span class="ui-label"></span><span class="ui-value"></span>';
            if (d.type === 'slider' && !d.choices) el.insertAdjacentHTML('beforeend', '<span class="ui-track"><span class="ui-fill"></span></span>');
        }
        if (d.type === 'bar') el.innerHTML = '<span class="ui-fill"></span>';
        if (d.type === 'input') {
            el.innerHTML = '<span class="ui-label"></span><input type="text">';
            const input = el.querySelector('input');
            input.addEventListener('input', () => this.#handlers.input(screen, node, input.value));
            input.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') input.blur(); });
        }
        if (d.position) {
            const [ax, ay] = ANCHOR[d.position.anchor], [ox, oy] = d.position.offset ?? [0, 0];
            // Measured from the nearest edge (a right anchor sets `right`), so an item keeps its own width wherever it sits.
            const s = el.style; s.position = 'absolute';
            if (ax === 100) s.right = `${-ox}px`; else s.left = ax === 50 ? `calc(50% + ${ox}px)` : `${ox}px`;
            if (ay === 100) s.bottom = `${-oy}px`; else s.top = ay === 50 ? `calc(50% + ${oy}px)` : `${oy}px`;
            s.translate = `${ax === 50 ? '-50%' : '0'} ${ay === 50 ? '-50%' : '0'}`;
        }
        if (d.type === 'panel' || d.type === 'list') this.#layout(el, d.layout);
        for (const child of node.children) el.append(this.#build(screen, child));
        if (d.type === 'list' && d.empty !== undefined) { const empty = doc.createElement('div'); empty.className = 'ui-empty'; empty.textContent = d.empty; el.append(empty); }
        const h = this.#handlers;
        el.addEventListener('pointerenter', () => h.hover(screen, node, true));
        el.addEventListener('pointerleave', () => { h.hover(screen, node, false); h.press(screen, node, false); });
        el.addEventListener('pointerdown', e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); h.press(screen, node, true); });
        el.addEventListener('pointerup', () => h.press(screen, node, false));
        el.addEventListener('click', e => { e.stopPropagation(); if (d.type !== 'panel' && d.type !== 'list' && d.type !== 'label' || d.focusable || d.on_click) h.click(screen, node); });
        node.rendered = null;
        return el;
    }
    /** Writes what changed since the last poll into each element of a screen. */
    /** Marks the root with the open screens (data-ui-open="pause pause.settings") and the top one, for CSS that spans screens. */
    syncRoot(names) { const open = names.join(' '), top = names.at(-1) ?? ''; if (this.root.dataset.uiOpen !== open) this.root.dataset.uiOpen = open; if (this.root.dataset.uiTop !== top) this.root.dataset.uiTop = top; }
    /** Loads a font for the page: { family, src, weight?, style? }; resolves true once it can be drawn. */
    async addFont({ family, src, weight = 'normal', style = 'normal' }) {
        const FontFaceType = this.#document.defaultView?.FontFace; if (!FontFaceType || !this.#document.fonts) return false;
        const face = new FontFaceType(family, `url(${JSON.stringify(src)})`, { weight: String(weight), style });
        this.#document.fonts.add(face); await face.load(); return true;
    }
    syncScreen(screen, index, target) {
        const el = screen.element; if (!el) return;
        const z = String((screen.record.layer ?? 0) * 100 + index); if (el.style.zIndex !== z) el.style.zIndex = z;
        el.classList.toggle('ui-target', target);
        for (const node of screen.nodes.values()) this.#syncNode(screen, node);
    }
    #syncNode(screen, node) {
        if (node.rebuilt) { node.rebuilt = false; this.#rebuild(screen, node); }
        const el = node.element; if (!el) return;
        const d = node.def, focus = screen.focus === node, on = d.type === 'toggle' && !!node.value;
        const states = d.states ?? {}, style = { ...d.style, ...(!node.enabled && states.inactive), ...(on && states.active), ...(focus && states.focus), ...(node.hovered && node.enabled && states.hover), ...(node.pressed && node.enabled && states.pressed) };
        const value_text = this.#valueText(screen, node);
        const key = JSON.stringify([node.text, value_text, node.value, node.enabled, node.visible, focus, node.hovered, node.pressed, style, d.src, d.class]);
        if (key === node.rendered) return;
        const before = node.rendered ? JSON.parse(node.rendered) : null; node.rendered = key;
        el.hidden = !node.visible;
        el.classList.toggle('is-focus', focus); el.classList.toggle('is-hover', !!node.hovered); el.classList.toggle('is-pressed', !!node.pressed);
        el.classList.toggle('is-inactive', !node.enabled); el.classList.toggle('is-active', on);
        if (before) for (const k of Object.keys(before[7] ?? {})) if (!(k in style)) el.style.removeProperty(kebab(k));
        this.#apply(el, style);
        if (d.position) el.style.position = 'absolute';
        if (d.type === 'toggle' || d.type === 'slider' || d.type === 'input') el.querySelector('.ui-label').textContent = node.text;
        if (d.type === 'toggle' || d.type === 'slider') el.querySelector('.ui-value').textContent = value_text;
        if (d.type === 'toggle') el.setAttribute('aria-checked', String(on));
        if (d.type === 'slider' && !d.choices) el.querySelector('.ui-fill').style.width = `${Math.max(0, Math.min(1, ((node.value ?? d.min) - d.min) / ((d.max - d.min) || 1))) * 100}%`;
        if (d.type === 'bar') { const max = d.max ?? 1, min = d.min ?? 0; el.querySelector('.ui-fill').style.width = `${Math.max(0, Math.min(1, ((Number(node.value) || 0) - min) / ((max - min) || 1))) * 100}%`; }
        if (d.type === 'input') { const input = el.querySelector('input'); if (input.value !== String(node.value ?? '')) input.value = String(node.value ?? ''); if (d.placeholder) input.placeholder = d.placeholder; }
        if (d.type === 'image' && d.src && el.getAttribute('src') !== d.src) el.setAttribute('src', d.src);
        if (['button', 'label'].includes(d.type) && !node.children.length) el.textContent = node.text;
        if (d.type === 'list' && d.empty !== undefined) { const empty = el.querySelector(':scope > .ui-empty'); if (empty) empty.hidden = node.children.length > 0; }
    }
    #valueText(screen, node) {
        const d = node.def;
        if (d.type === 'toggle') return node.value ? (d.on_text ?? 'ON') : (d.off_text ?? 'OFF');
        if (d.type !== 'slider') return '';
        const choice = d.choices?.find(c => (c && typeof c === 'object' ? c.value : c) === node.value);
        const shown = choice && typeof choice === 'object' ? choice.text ?? String(choice.value) : String(choice ?? node.value);
        return d.value_text ? d.value_text.replaceAll('{value}', shown) : shown;
    }
    #rebuild(screen, node) {
        const el = node.element; if (!el) return;
        for (const child of [...el.children]) if (child.dataset.uiItem) child.remove();
        const empty = el.querySelector(':scope > .ui-empty');
        for (const child of node.children) { const built = this.#build(screen, child); empty ? el.insertBefore(built, empty) : el.append(built); }
        const visit = n => { this.#enter(n, n.index); n.children.forEach(visit); }; node.children.forEach(visit);
    }
    dispose() { for (const el of [...this.root.children]) if (el.classList?.contains('ui-screen')) el.remove(); this.#base?.remove(); for (const s of this.#css.values()) s.remove(); this.#css.clear(); this.root.classList.remove('ui-root'); }
}
