/**
 * Penthouse / controls: parameterized HTML control templates over Basement actions.
 * HTML is intentional for accessible interface text; the world remains pure WebGL.
 * Each instance has its own pointer capture, source ID, mutable state, and Lifetime.
 */
import { Lifetime } from '../basement/lifetime.js';

/** Track a single pointer per control, independently of other control instances. */
function capture(element, life, begin, move, end) {
  let pointerId = null;
  /** Cancel only this owner's interaction, without affecting another active finger. */
  const release = () => {
    if (pointerId === null) return;
    const old = pointerId; pointerId = null;
    if (element.hasPointerCapture?.(old)) element.releasePointerCapture(old);
    end();
  };
  life.listen(element, 'pointerdown', event => {
    if (pointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); pointerId = event.pointerId;
    element.setPointerCapture(pointerId); begin(event);
  });
  life.listen(element, 'pointermove', event => { if (event.pointerId === pointerId) move(event); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    life.listen(element, type, event => { if (event.pointerId === pointerId) release(); });
  }
  life.listen(window, 'blur', release);
  life.own(release);
  return release;
}

export class Joystick {
  /** radius is CSS pixels; deadZone is normalized; curve >1 softens small movements. */
  constructor({ input, sourceId, action, host, radius = 54, deadZone = 0.13, curve = 1.4, label = 'Move' }) {
    this.life = new Lifetime(); this.input = input; this.sourceId = sourceId;
    this.element = document.createElement('div'); this.element.className = 'engine-joystick';
    this.element.setAttribute('aria-label', label); this.element.setAttribute('role', 'group');
    this.element.style.width = this.element.style.height = `${radius * 2}px`;
    const knob = document.createElement('span'); this.element.append(knob); host.append(this.element);
    /** Fixed-origin stick: clamp displacement, remap dead zone, then apply response curve. */
    const update = event => {
      const r = this.element.getBoundingClientRect();
      let x = (event.clientX - r.left - r.width / 2) / radius;
      let y = (event.clientY - r.top - r.height / 2) / radius;
      const length = Math.hypot(x, y), clamp = Math.min(1, length);
      if (length) { x /= length; y /= length; }
      knob.style.transform = `translate(${x * clamp * radius * 0.6}px,${y * clamp * radius * 0.6}px)`;
      const response = Math.pow(Math.max(0, (clamp - deadZone) / (1 - deadZone)), curve);
      input.setSource(sourceId, action, x * response, y * response);
    };
    /** Releasing a stick removes only its contribution and centers its visual knob. */
    const reset = () => { input.removeSource(sourceId); knob.style.transform = ''; };
    this.cancel = capture(this.element, this.life, update, update, reset);
    this.life.own(() => { reset(); this.element.remove(); });
  }
  /** Templates expose cancellation so a pause cannot leave capture alive after resuming. */
  dispose() { this.life.dispose(); }
}

export class ActionButton {
  /** A held button template; press edges are generated once by Basement input aggregation. */
  constructor({ input, sourceId, action, host, label = 'Action', diameter = 72 }) {
    this.life = new Lifetime(); this.element = document.createElement('button');
    this.element.className = 'engine-action'; this.element.type = 'button'; this.element.textContent = label;
    this.element.style.width = this.element.style.height = `${diameter}px`; host.append(this.element);
    /** State and appearance are instance-local, with no shared pressed flags. */
    const release = () => {
      input.removeSource(sourceId); this.element.classList.remove('held');
    };
    const cancelPointer = capture(this.element, this.life,
      () => { input.setSource(sourceId, action, 1); this.element.classList.add('held'); },
      () => {}, release);
    // Native button focus remains useful to keyboard users. A separate contribution
    // prevents releasing a key from cancelling a concurrently held pointer.
    const keyboardSource = `${sourceId}:keyboard`;
    const releaseKeyboard = () => input.removeSource(keyboardSource);
    this.life.listen(this.element, 'keydown', event => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault(); input.setSource(keyboardSource, action, 1);
    });
    this.life.listen(this.element, 'keyup', event => {
      if (event.code === 'Space' || event.code === 'Enter') releaseKeyboard();
    });
    this.life.listen(this.element, 'blur', releaseKeyboard);
    this.cancel = () => { cancelPointer(); releaseKeyboard(); };
    this.life.own(() => { release(); releaseKeyboard(); this.element.remove(); });
  }
  /** Remove listeners, active pointer contribution, and owned DOM. */
  dispose() { this.life.dispose(); }
}
