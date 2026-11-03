/**
 * Build the foundation as one offline HTML file using only Node's standard library.
 * The explicit source order satisfies classic-script class dependencies. This tool
 * does not modify the original game's build, source, or playable HTML file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
// Resolve paths relative to this script so builds work from any working directory.
import { fileURLToPath } from 'node:url';
// Join path segments using the current operating system's separator.
import { dirname, join } from 'node:path';

// Locate the rewrite directory one level above this tools directory.
const rewriteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
// Define dependency order explicitly: helpers, services, levels, coordinator, then test content.
const sourceFiles = [
    // The Basement supplies shared settings and NamedLibrary before other classes use them.
    'engine/basement.js',
    // Camera projection is shared by public tools and GPU uniform setup.
    'engine/projection.js',
    // Sparse grids provide shared lookup before scene/physics services are defined.
    'engine/spatial.js',
    // World positions, dimensions, and materials share one vocabulary.
    'engine/world-geometry.js',
    // Shape contact and body classes are defined before scene declarations instantiate them.
    'engine/physics.js',
    // Scenes own shared object and light declarations.
    'engine/scene.js',
    // GPU source definitions explain projection, depth, and source-visibility calculations.
    'engine/world-shaders.js',
    // Mesh conversion/cache is independent of GPU context and rendering schedules.
    'engine/world-mesh.js',
    // Retained GPU batches keep unchanged artwork geometry resident while other bodies move.
    'engine/world-batches.js',
    // Point-light depth views use ordinary world geometry through a separate backend helper.
    'engine/point-light-renderer.js',
    // World surfaces use GPU depth and a central geometric lighting stage.
    'engine/world-renderer.js',
    // Artwork generators cache CPU images and resident textures without rendering world frames.
    'engine/artwork.js',
    // The Directory constructs the renderer defined here.
    'engine/renderer.js',
    // Input owns browser device state and listener cleanup.
    'engine/input.js',
    // The profiler owns measurements separately from device or drawing behavior.
    'engine/profiler.js',
    // The Directory assembles services without containing their implementations.
    'engine/directory.js',
    // Optional features need the Directory interface before execution starts.
    'engine/penthouse.js',
    // The Lobby coordinates previously defined levels but schedules nothing during loading.
    'engine/lobby.js',
    // Assembly comes after all four level classes exist.
    'engine/engine.js',
    // Prepared assets install explicit geometry through a reusable Penthouse tool.
    'penthouse/textured-asset.js',
    // Real game artwork tests the foundation before wider game migration.
    'demo/hotel-study.js',
    // Test content is independently removable from the build list.
    'demo/rectangle-study.js',
    // Neutral bodies and height/lighting studies declare content without engine-specific repairs.
    'demo/world-study.js',
    // Boot is last because it actually constructs and starts an engine.
    'demo/boot.js'
];
// Read the HTML shell that contains style/script insertion markers.
let outputHtml = readFileSync(join(rewriteRoot, 'src/index.html'), 'utf8');
// Read harness-only styles for inlining rather than making a runtime file dependency.
const stylesheet = readFileSync(join(rewriteRoot, 'src/styles.css'), 'utf8');
// Keep each source file in a separate readable script block in the output.
const scriptBlocks = [];
// Visit each relative filename in dependency order; “of” supplies filename values.
// Stop after all files have been read and added to the output list.
for (const sourceFile of sourceFiles) {
    // Read the human-maintained source, including its explanatory comments.
    const sourceCode = readFileSync(join(rewriteRoot, 'src', sourceFile), 'utf8');
    // Reject text that would unexpectedly close an inline HTML script element.
    if (/<\/script/i.test(sourceCode)) {
        // Report the offending source rather than generating malformed HTML.
        throw new Error(`${sourceFile} contains an inline script closing sequence.`);
    }
    // Preserve a visible source label so the one-file build remains navigable.
    scriptBlocks.push(`<script data-source="${sourceFile}">\n${sourceCode}\n</script>`);
}
// Replace the style marker using a callback so literal dollar signs remain unchanged.
outputHtml = outputHtml.replace('<!-- @styles -->', () => `<style>\n${stylesheet}\n</style>`);
// Read prepared original artwork; this generated data contains images and local surface definitions.
const hotelAssetData = readFileSync(join(rewriteRoot, 'src/assets/double-nights.json'), 'utf8');
// Inline JSON separately from engine code, preserving one offline deliverable without runtime fetches.
outputHtml = outputHtml.replace('<!-- @assets -->', () => `<script id="hotel-asset-data" type="application/json">${hotelAssetData}</script>`);
// Insert the ordered inline scripts; no network fetch is needed when opening the result.
outputHtml = outputHtml.replace('<!-- @scripts -->', () => scriptBlocks.join('\n'));
// Keep the deliverable distinct from DFAB V8.html, which remains the original game.
const outputPath = join(rewriteRoot, 'ETRNL9 Foundation.html');
// Check mode verifies reproducibility without modifying the existing artifact.
if (process.argv.includes('--check')) {
    // Read the committed deliverable for exact comparison with the current sources.
    const existingHtml = readFileSync(outputPath, 'utf8');
    // A difference means the source and downloadable file no longer match.
    if (existingHtml !== outputHtml) {
        // Fail checks with the concrete rebuild command.
        throw new Error('Foundation build is stale: run node rewrite/tools/build.mjs');
    }
} else {
    // Emit the single complete offline HTML deliverable.
    writeFileSync(outputPath, outputHtml);
}
// Report success for both local runs and continuous integration logs.
console.log(`Foundation ${process.argv.includes('--check') ? 'verified' : 'built'}: ${Buffer.byteLength(outputHtml)} bytes.`);
