/**
 * Penthouse assembly: expose inert libraries without coupling Directory to toy names.
 * ETRNLNINE installs these factories; games request them through Directory.
 */
import { assembly } from './assembly.js';
import { pavilion, actor, box } from './toys.js';
import { createHumanoid } from './humanoid.js';
import { Joystick, ActionButton } from './controls.js';
import { ProfilerView } from './profiler-view.js';
import { WORKSPACE_ICONS } from './workspace-icons.js';
import { meshLibraries } from './mesh-generators.js';

export class Penthouse {
  /** Catalog creation is inert: allocation begins only when a factory is requested. */
  constructor() {
    this.libraries = Object.freeze({
      'toy.assembly':assembly,
      'toy.box': options => box(options.world, options),
      'toy.pavilion': pavilion,
      'toy.actor': actor,
      // Articulated proportion-review mannequin; callers supply a validated document.
      'toy.humanoid': createHumanoid,
      'control.joystick': options => new Joystick(options),
      'control.button': options => new ActionButton(options),
      'tool.profiler':options=>new ProfilerView(options),
      // Catalog lookup is inert: SVG DOM is created only by the requesting workspace.
      'ui.icons':()=>WORKSPACE_ICONS,
      // Procedural mesh sources named by authored mesh assets (MESH_GENERATORS validates
      // them); each returns CPU MeshData, which Directory leases onto the GPU.
      ...meshLibraries(),
    });
  }
}
