/** FrameProfiler is a measurement tool, not a scheduler or a visual HUD. */
class FrameProfiler {
    /** Start with no measured frames or simulation work. */
    constructor() {
        // Count completed rendered frames since this tool was constructed.
        this.frameCount = 0;
        // Count fixed updates actually completed, independent of monitor refresh rate.
        this.simulationSteps = 0;
        // Sum discarded wall-clock duration when catch-up is capped, in seconds.
        this.droppedSeconds = 0;
        // Count rendered frames in the current sampling window.
        this.sampleFrames = 0;
        // Accumulate actual callback intervals before simulation clamping, in seconds.
        this.sampleSeconds = 0;
        // Zero means a complete measurement window is not available yet.
        this.framesPerSecond = 0;
        // Store the latest synchronous update/render cost, not GPU completion time.
        this.frameCostMilliseconds = 0;
    }

    /** Record one completed frame; refresh FPS after at least half a second of samples. */
    record(elapsedSeconds, simulationSteps, droppedSeconds, frameCostMilliseconds) {
        // Increase the total number of frames actually rendered.
        this.frameCount += 1;
        // Add the number of fixed updates completed during this frame.
        this.simulationSteps += simulationSteps;
        // Track intentionally discarded time rather than hiding overloaded frames.
        this.droppedSeconds += droppedSeconds;
        // Add this frame to the current FPS sample.
        this.sampleFrames += 1;
        // Use actual elapsed time so a simulation clamp does not inflate reported FPS.
        this.sampleSeconds += elapsedSeconds;
        // Report synchronous execution time supplied by the Lobby.
        this.frameCostMilliseconds = frameCostMilliseconds;
        // Wait for enough elapsed time to avoid a jittery per-frame reciprocal display.
        if (this.sampleSeconds >= 0.5) {
            // Divide completed frames by actual wall-clock seconds.
            this.framesPerSecond = this.sampleFrames / this.sampleSeconds;
            // Begin the next independent measurement window.
            this.sampleFrames = 0;
            // Reset elapsed sample duration alongside its frame count.
            this.sampleSeconds = 0;
        }
    }
}
