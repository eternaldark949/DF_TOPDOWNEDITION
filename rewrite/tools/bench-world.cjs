/**
 * Measure actual scene-registration and local physics work for sparse static populations.
 * Run from any directory with Node; optional first argument writes structured JSON.
 * These are CPU-side engine measurements, not browser/GPU or real-phone FPS claims.
 */
const { performance } = require('node:perf_hooks');
// Optional structured evidence is written using Node's standard library only.
const { writeFileSync } = require('node:fs');
// Load the real engine fixture; its existing baseline checks execute before measurements.
const { environment } = require('./test-foundation.cjs');
// Keep separate measurements for each declared static registry size.
const reports = [];

// Visit population sizes by value, finishing after all three sparse-scene cases.
for (const staticPopulation of [1000, 10000, 25000]) {
    // Isolate measurements from gravity and from previous scene state.
    const fixture = environment({ gravityZ: 0 });
    // Obtain the actual declaration API used by browser scenes.
    const scene = fixture.engine.directory.systems.get('scene');
    // Obtain the actual shared contact implementation.
    const physics = fixture.engine.directory.systems.get('physics');
    // Start registration timing before any benchmark object is created.
    const registrationStarted = performance.now();
    // Count every static registration once, from zero through population minus one.
    for (let objectIndex = 0; objectIndex < staticPopulation; objectIndex += 1) {
        // Sparse ground placement gives nearby queries a bounded local population.
        scene.createElement(`static-${objectIndex}`, {
            // Arrange one hundred columns spaced well beyond each object's footprint.
            positionX: (objectIndex % 100) * 100,
            // Increase the row after each complete group of one hundred objects.
            positionY: Math.floor(objectIndex / 100) * 100,
            // Small boxes occupy one or a few grid cells each.
            width: 16,
            // Ground depth matches width for a simple repeatable footprint.
            depth: 16,
            // These are real solid volumes with ordinary scene/render metadata.
            height: 30
        });
    }
    // Keep exactly one hundred moving objects across all static-population cases.
    for (let movingIndex = 0; movingIndex < 100; movingIndex += 1) {
        // Each moving object overlaps one nearby static box initially.
        scene.createElement(`moving-${movingIndex}`, {
            // Circle contact exercises a different shape combination from the static boxes.
            shape: 'circle',
            // Put each mover beside its corresponding first-row static object.
            positionX: movingIndex * 100 + 12,
            // Radius eight gives a physical diameter equal to the static box width.
            radius: 8,
            // Height remains below the static body's height to test volume overlap.
            height: 24,
            // Dynamic registration uses the same default all-category collision path.
            body: { motion: 'dynamic' }
        });
    }
    // Registration includes actual element creation and every index membership.
    const registrationMilliseconds = performance.now() - registrationStarted;
    // Warm actual contact resolution before recording steady-state timings.
    for (let warmupStep = 0; warmupStep < 5; warmupStep += 1) {
        // Run a real fixed update rather than a synthetic bounds-only loop.
        physics.update(1 / 60);
    }
    // Measure a block of updates to reduce single-call timer noise.
    const simulationStarted = performance.now();
    // Record sixty real fixed updates for each population size.
    for (let sampleStep = 0; sampleStep < 60; sampleStep += 1) {
        // Static membership is retained; only local queries and moving-body work execute.
        physics.update(1 / 60);
    }
    // Divide elapsed CPU time by actual completed updates, not wall-clock simulated seconds.
    const meanStepMilliseconds = (performance.now() - simulationStarted) / 60;
    // Store the measured state alongside its workload description.
    reports.push({
        // Registry size is real element/body population, not an advertised capacity.
        staticPopulation,
        // Moving work remains constant while the static population grows.
        movingPopulation: physics.movingBodies.size,
        // One-time setup includes validation and indexing for each object.
        registrationMilliseconds,
        // Average steady-state CPU work in this execution environment.
        meanStepMilliseconds,
        // Narrow checks demonstrate whether contacts accidentally scan the full registry.
        narrowChecksPerStep: physics.statistics.narrowChecks,
        // Pair count includes repeated solver iterations, as documented by diagnostics.
        candidatePairsPerStep: physics.statistics.candidatePairs,
        // A sparse local query should not invoke the huge-query fallback path.
        finalStaticQueryUsedFullScan: scene.staticBodies.statistics.usedFullScan
    });
    // Release all memberships, bodies, listeners, and references before the next population.
    fixture.engine.destroy();
}

// Keep environment and workload limitations with the numerical measurements.
const report = {
    // Identify the runtime that produced these CPU-side observations.
    nodeVersion: process.version,
    // State the workload rather than implying universal constant-time behavior.
    workload: 'Sparse static boxes, 100 dynamic circles, 4 solver iterations, zero gravity; 5 warmup + 60 measured fixed steps.',
    // Dense overlapping scenes can still require many pair checks and are not represented here.
    limitation: 'CPU-only sparse-scene measurements; not GPU/phone FPS or a guarantee for clustered contacts.',
    // Preserve each independently measured population case.
    reports
};
// An optional path lets documentation retain reproducible structured local evidence.
if (process.argv[2]) {
    // Serialize actual values, preserving readable indentation and a final newline.
    writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
}
// Print the same measurements for a caller running the benchmark interactively.
console.log(JSON.stringify(report, null, 2));
