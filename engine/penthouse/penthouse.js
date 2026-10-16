/**
 * Penthouse assembly: expose inert libraries without coupling Directory to toy names.
 * ETRNLNINE installs these factories; games request them through Directory.
 */
import { assembly } from './assembly.js';
import { pavilion, actor, box } from './toys.js';
import { Joystick, ActionButton } from './controls.js';
import { ProfilerView } from './profiler-view.js';
import { WORKSPACE_ICONS } from './workspace-icons.js';

export class Penthouse {
  /** Catalog creation is inert: allocation begins only when a factory is requested. */
  constructor() {
    this.libraries = Object.freeze({
      'toy.assembly':assembly,
      'toy.box': options => box(options.world, options),
      'toy.pavilion': pavilion,
      'toy.actor': actor,
      'control.joystick': options => new Joystick(options),
      'control.button': options => new ActionButton(options),
      'tool.profiler':options=>new ProfilerView(options),
      // Catalog lookup is inert: SVG DOM is created only by the requesting workspace.
      'ui.icons':()=>WORKSPACE_ICONS,
    });
  }
}
