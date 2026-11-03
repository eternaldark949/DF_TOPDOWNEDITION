/**
 * LOBBY — the only owner of requestAnimationFrame scheduling.
 * It advances systems in fixed seconds, then renders an interpolated frame.
 * Pausing still permits rendering; stop cancels scheduling entirely. Hidden-page
 * suspension cancels callbacks until visible so returning never fast-forwards time.
 */
class LevelLobby {
    /** Store connected levels and an injectable scheduler; construction never starts a loop. */
    constructor(basement, directory, penthouse, scheduler) {
        // Keep shared timestep and catch-up settings available.
        this.basement = basement;
        // Systems and tools are addressed through the Directory.
        this.directory = directory;
        // Optional features advance after core systems on each fixed step.
        this.penthouse = penthouse;
        // Browser and deterministic tests provide the same request/cancel/now interface.
        this.scheduler = scheduler;
        // Running means start was requested and stop has not been called.
        this.running = false;
        // Hidden pages remain logically running but have no scheduled callback.
        this.suspended = false;
        // Different owners hold independent pause reasons; releasing one cannot release others.
        this.pauseReasons = new Set();
        // Null means there is no outstanding animation callback; zero is a valid callback ID.
        this.animationRequestId = null;
        // Null means the next frame must establish a fresh time baseline.
        this.previousTimestampMilliseconds = null;
        // Leftover accepted wall-clock time awaiting a complete fixed step.
        this.accumulatedSeconds = 0;
        // Simulation time advances only when an update actually runs.
        this.simulationSeconds = 0;
        // Preserve the most recent callback error for a diagnostic UI or test.
        this.lastError = null;
        // Keep “this” pointing to this Lobby when the scheduler invokes the callback.
        this.handleFrame = this.onFrame.bind(this);
    }

    /** Report whether any owner currently requires simulation to remain paused. */
    get paused() {
        // Read the live Set size rather than maintaining a duplicate boolean.
        return this.pauseReasons.size > 0;
    }

    /** Forget elapsed-time carry so stop, focus changes, and pause cannot queue catch-up work. */
    resetTiming() {
        // The next callback establishes its own baseline instead of using an old timestamp.
        this.previousTimestampMilliseconds = null;
        // Discard partial simulation time across lifecycle boundaries.
        this.accumulatedSeconds = 0;
        // Require fresh input after lifecycle changes to avoid stale held controls.
        this.directory.systems.get('input').clear();
    }

    /** Request exactly one callback if active; repeated starts/resumes cannot multiply loops. */
    schedule() {
        // Stopped, hidden, or already-scheduled loops need no additional callback.
        if (!this.running || this.suspended || this.animationRequestId !== null) {
            // Preserve the current scheduling state.
            return;
        }
        // Retain the ID needed to cancel this exact future callback.
        this.animationRequestId = this.scheduler.request(this.handleFrame);
    }

    /** Start scheduling with a fresh timing baseline; calling start twice is harmless. */
    start() {
        // Do not reset a loop that is already active.
        if (this.running) {
            // Keep its existing callback and accumulated time.
            return;
        }
        // Mark the Lobby active before asking for a callback.
        this.running = true;
        // A fresh run clears the diagnostic from a previous failed run.
        this.lastError = null;
        // Exclude any time spent stopped from simulation.
        this.resetTiming();
        // Schedule through the single guarded path.
        this.schedule();
    }

    /** Stop all frame scheduling while preserving scene state for a later restart. */
    stop() {
        // Mark inactive so no later path can accidentally schedule another frame.
        this.running = false;
        // A pending callback must be canceled using its stored ID.
        if (this.animationRequestId !== null) {
            // Cancel only the Lobby's own outstanding request.
            this.scheduler.cancel(this.animationRequestId);
        }
        // No outstanding callback remains after cancellation.
        this.animationRequestId = null;
        // Clear inputs and time carry, leaving actual simulation state intact.
        this.resetTiming();
    }

    /** Add/remove a named pause owner; keep drawing so UI can remain responsive. */
    setPaused(reason, shouldPause) {
        // Choose between acquiring and releasing this owner's pause reason.
        if (shouldPause) {
            // A Set makes repeated acquisition by the same owner idempotent.
            this.pauseReasons.add(reason);
        } else {
            // Release only this owner's reason, preserving every other owner's pause.
            this.pauseReasons.delete(reason);
        }
        // Exclude the pause interval and any old held input from later simulation.
        this.resetTiming();
    }

    /** Suspend scheduling while hidden; resume once with no hidden-time catch-up. */
    setSuspended(shouldSuspend) {
        // Remember browser visibility independently from manual pause reasons.
        this.suspended = shouldSuspend;
        // Hidden pages must release an already scheduled callback.
        if (shouldSuspend && this.animationRequestId !== null) {
            // Cancel the existing request rather than creating an additional hidden loop.
            this.scheduler.cancel(this.animationRequestId);
            // Record that no pending request remains.
            this.animationRequestId = null;
        }
        // Discard time spent hidden or crossing the visibility boundary.
        this.resetTiming();
        // This schedules only if running, visible, and without another request.
        this.schedule();
    }

    /** Consume one browser timestamp in milliseconds; stop and expose any execution error. */
    onFrame(timestampMilliseconds) {
        // The scheduler has consumed this request; no callback is outstanding now.
        this.animationRequestId = null;
        // A canceled callback that was already delivered must not do work.
        if (!this.running || this.suspended) {
            // Return without scheduling a replacement.
            return;
        }
        // Stop safely if an update or render callback throws.
        try {
            // Measure synchronous CPU-side frame work independently from frame interval.
            const frameStartedMilliseconds = this.scheduler.now();
            // The first callback establishes a baseline and has zero elapsed time.
            const previousTimestamp = this.previousTimestampMilliseconds ?? timestampMilliseconds;
            // Convert milliseconds to seconds and reject negative clock movement.
            const elapsedSeconds = Math.max(0, (timestampMilliseconds - previousTimestamp) / 1000);
            // Save this timestamp for the next callback's interval.
            this.previousTimestampMilliseconds = timestampMilliseconds;
            // Read shared limits once for this frame.
            const configuration = this.basement.configuration;
            // A fixed update's duration is independent of monitor refresh rate.
            const stepSeconds = 1 / configuration.simulationHz;
            // Discard excessive wall-clock intervals instead of simulating a long stall.
            const acceptedSeconds = Math.min(elapsedSeconds, configuration.maximumFrameSeconds);
            // Track time deliberately excluded by the wall-clock clamp.
            let droppedSeconds = elapsedSeconds - acceptedSeconds;
            // Count only actual updates completed in this callback.
            let completedSteps = 0;
            // Paused frames render but accumulate no simulation backlog.
            if (!this.paused) {
                // Carry partial elapsed time forward until a full step is available.
                this.accumulatedSeconds += acceptedSeconds;
                // Repeat while a full fixed step remains and the work limit is not reached.
                // Each repetition consumes one step and increments completedSteps by one.
                // The tiny tolerance avoids losing a step to floating-point roundoff.
                while (
                    this.accumulatedSeconds + 1e-10 >= stepSeconds &&
                    completedSteps < configuration.maximumStepsPerFrame
                ) {
                    // Capture shared moving transforms before controls and physics change them.
                    this.directory.systems.get('scene').beginStep();
                    // Let installed controls/features declare this step's intended motion first.
                    this.penthouse.update(stepSeconds);
                    // Apply reusable systems, including physics, to those intentions.
                    this.directory.update(stepSeconds);
                    // Move simulation time only after both update phases succeed.
                    this.simulationSeconds += stepSeconds;
                    // Remove the elapsed duration consumed by this fixed update.
                    this.accumulatedSeconds = Math.max(0, this.accumulatedSeconds - stepSeconds);
                    // Count this completed simulation step toward the catch-up limit.
                    completedSteps += 1;
                }
                // Discard whole extra steps after overload, retaining only a partial step.
                if (this.accumulatedSeconds >= stepSeconds) {
                    // Compute the duration that would require additional full updates.
                    const excessSeconds = Math.floor(this.accumulatedSeconds / stepSeconds) * stepSeconds;
                    // Record this dropped backlog for diagnostics.
                    droppedSeconds += excessSeconds;
                    // Retain only the fractional remainder used for interpolation.
                    this.accumulatedSeconds -= excessSeconds;
                }
            }
            // Describe rendering without exposing scheduler internals to drawing callbacks.
            const frame = {
                // Simulation duration already completed, measured in seconds.
                simulationSeconds: this.simulationSeconds,
                // Interpolate between prior/current states; pause uses the current state.
                interpolationFraction: this.paused ? 1 : this.basement.clamp(this.accumulatedSeconds / stepSeconds, 0, 1),
                // Let drawing code explain the current simulation status if necessary.
                paused: this.paused
            };
            // Render once even if this display frame needed no simulation update.
            this.directory.systems.get('renderer').render(frame);
            // Finish the synchronous work measurement after rendering commands are submitted.
            const frameCostMilliseconds = this.scheduler.now() - frameStartedMilliseconds;
            // Record raw elapsed time, actual steps, discarded time, and CPU-side cost.
            this.directory.tools.get('profiler').record(elapsedSeconds, completedSteps, droppedSeconds, frameCostMilliseconds);
            // Request the next callback only through the duplicate-safe scheduler path.
            this.schedule();
        } catch (error) {
            // Retain the failure for the harness or developer to inspect.
            this.lastError = error;
            // Stop the loop so the same broken frame cannot repeat indefinitely.
            this.stop();
            // Surface the failure to browser diagnostics and automated checks.
            throw error;
        }
    }
}
