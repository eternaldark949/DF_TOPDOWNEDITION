"""Prepare the real hotel asset with original Canvas painters, outside the runtime engine.

Run from a full repository checkout. --source-directory accepts a flat development
snapshot of the same source files. The output embeds PNGs/local geometry as generated
JSON. Browser/font versions can affect rasterization; this is not a cross-platform
pixel-identical asset compiler. No original game renderer is shipped with the result.
"""
# Locate repository source, generated asset data, and this tool's JavaScript callback.
from pathlib import Path
# Parse the optional source snapshot path without adding a runtime dependency.
import argparse
# Serialize generated images/geometry without changing the source painters.
import json
# Record source bytes for preparation provenance.
import hashlib
# Prefer a configured/system browser; otherwise use Playwright's managed executable.
import os
# Locate installed Chromium in the same way as the existing browser checks.
import shutil
# Real Canvas rasterization is development infrastructure, not an offline game dependency.
from playwright.sync_api import sync_playwright

# Resolve the foundation root independently from the caller's working directory.
rewrite_root = Path(__file__).resolve().parent.parent
# Resolve original game source beside the rewrite folder in a complete checkout.
repository_root = rewrite_root.parent
# Provide a descriptive command-line entry for asset regeneration.
parser = argparse.ArgumentParser(description=__doc__)
# Development snapshots may keep source basenames in one directory rather than the original hierarchy.
parser.add_argument('--source-directory', type=Path)
# Read the caller's explicit optional snapshot path.
arguments = parser.parse_args()
# Keep source addresses explicit so provenance and future edits remain easy to locate.
source_paths = [
    # Original deterministic random numbers preserve window/garden placement.
    'src/core/utils.js',
    # The hotel uses this original crescent painter for its emblem.
    'src/buildings/moon-city.js',
    # Original roof/forecourt image preparation helpers.
    'src/buildings/landmark-kit.js',
    # Original tier geometry exposure, wall strips, and roof painters.
    'src/buildings/tiered-kit.js',
    # Actual authored hotel configuration and Canvas artwork instructions.
    'src/buildings/double-nights.js',
]
# Retain source strings under their real repository addresses.
sources = {}
# Record preparation hashes separately from generated world geometry and image pixels.
source_hashes = {}
# Visit repository source address values once each; finish after all required inputs are loaded.
for source_path in source_paths:
    # Default to the original full-checkout location.
    input_path = repository_root / source_path
    # A flat snapshot is used only when the caller explicitly supplied one.
    if arguments.source_directory:
        # Preserve the source basename while selecting the requested development snapshot.
        input_path = arguments.source_directory / Path(source_path).name
    # Preserve actual UTF-8 source text, including its original explanatory comments.
    sources[source_path] = input_path.read_text()
    # Record the exact preparation input bytes so later provenance comparisons are concrete.
    source_hashes[source_path] = hashlib.sha256(input_path.read_bytes()).hexdigest()
# Read the deterministic generator from its original module rather than rewriting its random sequence.
utilities = sources['src/core/utils.js']
# Its following constant is an explicit extraction boundary in the unchanged source module.
seeded_random = utilities[utilities.index('        function seededRandom'):utilities.index('        const pickFrom', utilities.index('        function seededRandom'))]
# Read the original emblem helper from the building module that defines it.
moon_city = sources['src/buildings/moon-city.js']
# Preserve the exact crescent function, stopping at the next documented helper.
crescent = moon_city[moon_city.index('        function _mcCrescent'):moon_city.index('        /** A clean lune', moon_city.index('        function _mcCrescent'))]
# A preparation-only container lets the original tier constructor expose authored data
# without constructing the old game's simulation, input, renderer, or frame scheduler.
preparation_environment = r"""
// These original tier-constructor settings affect layout metadata, not a shipped renderer.
const CONFIG = {
    // Original source floors/height defaults needed while constructing its tier definitions.
    BUILDINGS: {MAX_FLOORS: 14, FLOOR_HEIGHT: 9, LEAN: true, CAM_HEIGHT: 700, REF_ZOOM: 1},
    // Crown reach is metadata; the original constructor expects this setting to exist.
    CULLING: {LEAN_EXTRA: 2}
};
// Source profiler wrappers do not alter image pixels and have no role in this export browser.
const RenderTags = {
    /** Accept original class-profile registration without adding game profiling state. */
    tagClass() {},
    /** Accept original helper-profile registration without modifying Canvas painters. */
    tag() {}
};
// Full source detail is used for the prepared dome/topiary images.
const _zoomLOD = 0;
// Source helper methods can read a camera during construction; no frames are scheduled.
const game = {
    // World-unit coordinates are used only by original helpers, not by the runtime asset data.
    camera: {x: 400, y: 900, zoom: 0.7}
};
/** Return the original helper's zoom-dependent camera height when construction asks for it. */
function leanCamHeight() {
    // This matches the game's documented camera-height formula.
    return 700 * Math.max(0.7, Math.min(3.2, 1 / game.camera.zoom));
}
/** Collect original attached light metadata; no old lighting system is created. */
class LampEntity {
    /** Store the original factory's supplied fields without registering a runtime entity. */
    constructor(configuration) {
        // Assignment copies primitive field values and retains object references as ordinary JavaScript does.
        Object.assign(this, configuration);
    }
}
/** Store just the parent metadata required to invoke the unchanged hotel's original art factory. */
class BuildingV2 {
    /** Receive original configuration; deliberately construct no old renderer or simulation. */
    constructor(configuration) {
        // Original child constructors read these supplied dimensions, position, and sections.
        Object.assign(this, configuration);
        // The tier constructor computes its complete extent from these initial source-plan bounds.
        this.localBounds = {
            // Original hotel's left plan origin.
            x: 0,
            // Original hotel's rear plan origin.
            y: 0,
            // Original plan width, in source world units.
            w: 800,
            // Original plan depth before its forecourt is appended.
            h: 430
        };
        // The original factory appends light definitions here; no lighting pass is executed.
        this.attachedLights = [];
        // Preserve the original subclass's style/seed initialization.
        this._applyStyle(configuration);
        // Preserve its original doorway metadata for the entrance/sign painter.
        this._setupDoor(configuration.door);
    }
    /** Supply inert parent reach metadata to the unchanged tier helper when requested. */
    _hullK() {
        // Ground-scale reach is sufficient; no old view renderer is invoked by this tool.
        return 1;
    }
    /** Original light-regeneration hooks are irrelevant to static image preparation. */
    regenerateLights() {}
    /** The exporter reads actual source sections directly instead of inventing collision bodies here. */
    getCollisionShapes() {
        // This inert parent container contributes no extra source game entities.
        return [];
    }
}
"""
# Real Canvas operations run in Chromium, with no external runtime asset requests.
with sync_playwright() as playwright:
    # Respect a selected browser before falling back to an installed/managed Chromium.
    executable_path = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
    # This development preparation step needs no GPU renderer; ordinary headless Canvas is enough.
    browser = playwright.chromium.launch(executable_path=executable_path, headless=True, args=['--no-sandbox'])
    # Keep the preparation page independent from the actual playable artifact and its engine.
    page = browser.new_page(offline=True)
    # Supply a minimal document so original image helpers can create their own canvases.
    page.set_content('<!doctype html><html><body></body></html>')
    # Construct only the metadata boundary required by the source artwork factory.
    page.add_script_tag(content=preparation_environment)
    # Load the unchanged source deterministic random helper.
    page.add_script_tag(content=seeded_random)
    # Load the unchanged source crescent helper used by hotel signs and medallions.
    page.add_script_tag(content=crescent)
    # Visit original helper/module values in dependency order and finish after the hotel module.
    for source_path in source_paths[2:]:
        # Original painters remain original source code, rather than being translated into new path APIs.
        page.add_script_tag(content=sources[source_path])
    # Execute the preparation-only callback and receive PNGs/physical surface declarations.
    definition = page.evaluate((rewrite_root / 'tools/export-hotel-artwork.js').read_text())
    # Record the exact original inputs used in this preparation run.
    definition['sourceSha256'] = source_hashes
    # Keep resource statistics explicit rather than implying an unlimited or fully migrated asset pipeline.
    definition['preparation'] = {
        # Distinguish cached source images from a complete pre-rendered building screenshot.
        'method': 'Original Canvas wall/roof/flat-plane painters; separate physical surfaces',
        # Count actual source images included in the prepared artifact.
        'imageCount': len(definition['images']),
        # Count actual surface definitions before installation-time triangulation.
        'surfaceCount': len(definition['surfaces']),
        # Explicitly list original view-dependent/game features not exported by this asset proof.
        'notExported': ['searchlight beams', 'blurred bloom', 'moving staff', 'parked vehicle sprites', 'view-dependent dome rib strokes'],
    }
    # Write generated data beside human-maintained source; no legacy game classes enter the runtime build.
    output_path = rewrite_root / 'src/assets/double-nights.json'
    # Compact JSON keeps embedded PNG data from acquiring unnecessary formatting overhead.
    output_path.write_text(json.dumps(definition, separators=(',', ':')))
    # Report the exact prepared resource count and one-file input size for review.
    print(f"Prepared hotel: {len(definition['images'])} images, {len(definition['surfaces'])} surfaces, {output_path.stat().st_size} bytes")
    # Release the preparation browser after all images and geometry have been serialized.
    browser.close()
