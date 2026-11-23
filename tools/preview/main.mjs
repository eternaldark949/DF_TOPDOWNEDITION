// The preview page's own controls: the bar along the top, the exit prompt, the touch use button. It reads the
// game's libraries from the page (the build put them there) and boots the preview with them.
import { bootPreview } from './play.mjs';

const $ = id => document.getElementById(id);
const libraries = JSON.parse(document.getElementById('preview-data').textContent);
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (touch) document.body.classList.add('touch');
let api = null, exit = null;

const hud = {
    setup(a) {
        api = a;
        const select = $('maps');
        for (const m of [...a.maps].sort((x, y) => (x.id === 'sdc' ? -1 : y.id === 'sdc' ? 1 : x.label.localeCompare(y.label)))) select.add(new Option(m.label, m.id));
        select.onchange = () => { select.blur(); a.pick(select.value); };
        for (const b of document.querySelectorAll('[data-time]')) b.onclick = () => a.setTime(b.dataset.time);
        let fast = false; $('fast').onclick = () => { fast = !fast; $('fast').classList.toggle('on', fast); a.setSpeed(fast ? 600 : 12); };
        for (const b of document.querySelectorAll('[data-weather]')) b.onclick = () => a.setWeather(b.dataset.weather, 'normal');
        $('zin').onclick = () => a.zoom(1); $('zout').onclick = () => a.zoom(-1);
        const fullscreen = $('fullscreen');
        const orientation = window.screen.orientation;
        let lockedLandscape = false;
        const showFullscreen = () => {
            const active = Boolean(document.fullscreenElement);
            fullscreen.setAttribute('aria-pressed', String(active));
            if (!active && lockedLandscape) {
                orientation.unlock?.();
                lockedLandscape = false;
            }
        };
        fullscreen.disabled = !document.fullscreenEnabled;
        fullscreen.title = fullscreen.disabled ? 'Fullscreen is unavailable in this window' : touch ? 'Toggle landscape fullscreen' : 'Toggle fullscreen';
        document.addEventListener('fullscreenchange', showFullscreen);
        fullscreen.onclick = async () => {
            fullscreen.blur();
            try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else {
                    await document.documentElement.requestFullscreen();
                    if (touch && document.fullscreenElement && orientation?.lock) {
                        try {
                            await orientation.lock('landscape');
                            lockedLandscape = true;
                            showFullscreen();
                        } catch {
                            // Some mobile browsers allow fullscreen while leaving rotation to the device.
                        }
                    }
                }
            } catch (error) { this.error(error); }
        };
        $('prompt').onclick = () => a.take();
        if (touch) a.button($('use'));
        this.zoomed(a.zoom_now);
        const backend = $('renderer');
        backend.onchange = async () => { backend.blur(); try { backend.value = await a.renderer(backend.value); } catch (e) { this.error(e); backend.value = 'canvas'; } };
        let frames = 0, since = performance.now();
        const count = now => { frames++; if (now - since >= 1000) { $('fps').textContent = `${Math.round(frames * 1000 / (now - since))} fps`; frames = 0; since = now; } requestAnimationFrame(count); };
        requestAnimationFrame(count);
        const tick = () => {
            $('clock').textContent = a.clock();
            const w = a.weather().state; for (const b of document.querySelectorAll('[data-weather]')) b.classList.toggle('on', b.dataset.weather === w);
            setTimeout(tick, 250);
        };
        tick();
    },
    arrived(id, label) { $('loading').style.display = 'none'; $('where').textContent = label; $('maps').value = id; try { history.replaceState(null, '', `#${id}`); } catch {} },
    exit(next) {
        exit = next; const p = $('prompt');
        p.classList.toggle('show', !!next); p.classList.toggle('locked', !!next && !next.available);
        if (next) { p.querySelector('kbd').textContent = touch ? 'USE' : 'E'; $('exit-label').textContent = next.available ? (next.label ?? `Go to ${next.target}`) : `${next.label ?? next.target} (not built yet)`; }
    },
    rendered(id) { $('renderer').value = id; },
    zoomed(k) { $('zoom').textContent = `${k}×`; },
    fade(on) { $('fade').classList.toggle('on', on); },
    error(e) { console.error(e); $('err').textContent = String(e?.stack ?? e).split('\n').slice(0, 4).join('\n'); }
};
addEventListener('error', e => hud.error(e.error ?? e.message));
addEventListener('unhandledrejection', e => hud.error(e.reason));
window.preview = await bootPreview({ libraries, hud }).catch(e => { hud.error(e); $('loading').textContent = 'The preview could not start.'; throw e; });
