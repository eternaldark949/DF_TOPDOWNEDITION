/**
 * InputSystem owns keyboard and pointer state. Pointer positions are CSS pixels
 * inside the canvas; callers ask the renderer to convert them into world units.
 * Gameplay bindings are deliberately left to the game or test harness.
 */
class InputSystem {
    /** Store DOM references and handlers; connect() installs them after setup is complete. */
    constructor(canvas, browserWindow) {
        // Keep the interactive drawing surface used to measure pointer positions.
        this.canvas = canvas;
        // Retain the browser event source so listeners can be removed from that same object.
        this.browserWindow = browserWindow;
        // Track physical key codes without prescribing which action they mean.
        this.heldKeys = new Set();
        // Pointer state is one persistent object whose fields are updated by events.
        this.pointer = {
            // Horizontal CSS-pixel coordinate relative to the canvas.
            positionX: 0,
            // Vertical CSS-pixel coordinate relative to the canvas.
            positionY: 0,
            // Whether a primary pointer is currently held on this canvas.
            held: false
        };
        // Avoid installing duplicate listeners if connect is accidentally requested twice.
        this.connected = false;
        // Bind preserves this InputSystem as “this” when the browser calls its method.
        // Unlike a Python bound method, a detached JavaScript method does not retain its owner.
        this.handleKeyDown = this.onKeyDown.bind(this);
        // Retain the bound reference so removeEventListener receives the exact same function.
        this.handleKeyUp = this.onKeyUp.bind(this);
        // Pointer events serve both mouse and touch input through the same handler.
        this.handlePointer = this.onPointer.bind(this);
        // Losing focus must clear controls so a missed keyup cannot leave movement stuck.
        this.handleBlur = this.clear.bind(this);
    }

    /** Install listeners once; called only after the engine has connected its components. */
    connect() {
        // Repeated connection must not create duplicate input delivery.
        if (this.connected) {
            // Leave the existing listener set intact.
            return;
        }
        // Begin collecting key presses from the page.
        this.browserWindow.addEventListener('keydown', this.handleKeyDown);
        // Remove held keys when the browser reports releases.
        this.browserWindow.addEventListener('keyup', this.handleKeyUp);
        // Clear state if the browser stops delivering input to this page.
        this.browserWindow.addEventListener('blur', this.handleBlur);
        // Install the same handler for each supported pointer event name.
        // “of” reads event-name strings in sequence, finishing after all four names.
        for (const eventName of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
            // Listen on the canvas so UI buttons outside it do not move the target.
            this.canvas.addEventListener(eventName, this.handlePointer);
        }
        // Mark the listener installation complete.
        this.connected = true;
    }

    /** Record a physical key press while allowing ordinary typing in page controls. */
    onKeyDown(event) {
        // Ignore form controls so engine input does not interfere with text editing.
        if (event.target?.closest?.('input, textarea, select, button, [contenteditable]')) {
            // The optional-chaining operators skip calls when a target lacks those methods.
            return;
        }
        // A Set keeps a held key once even when the OS repeats keydown events.
        this.heldKeys.add(event.code);
        // Arrow keys and Space would otherwise scroll the page during canvas interaction.
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
            // Prevent only these navigation defaults, leaving browser shortcuts intact.
            event.preventDefault();
        }
    }

    /** Release a key by physical code even if focus moved to another page control. */
    onKeyUp(event) {
        // Delete safely whether or not the corresponding keydown was recorded.
        this.heldKeys.delete(event.code);
    }

    /** Update primary mouse/touch coordinates and held state from one pointer event. */
    onPointer(event) {
        // Ignore extra touch points; this basic foundation tracks one primary pointer.
        if (event.isPrimary === false) {
            // Leave primary input unchanged.
            return;
        }
        // Read the canvas's actual CSS rectangle, not its high-density backing dimensions.
        const canvasBounds = this.canvas.getBoundingClientRect();
        // Convert the page's client coordinate into an offset within the canvas.
        this.pointer.positionX = event.clientX - canvasBounds.left;
        // Apply the same conversion to the vertical coordinate.
        this.pointer.positionY = event.clientY - canvasBounds.top;
        // A press begins a held gesture and captures subsequent movement/releases.
        if (event.type === 'pointerdown') {
            // Remember that the primary pointer is down.
            this.pointer.held = true;
            // Pointer capture lets an outside release still reach this canvas.
            this.canvas.setPointerCapture(event.pointerId);
        }
        // Both normal release and browser cancellation finish the gesture.
        if (event.type === 'pointerup' || event.type === 'pointercancel') {
            // Stop treating this pointer as held.
            this.pointer.held = false;
        }
    }

    /** Clear transient controls on blur, pause, or stop; preserve coordinate values. */
    clear() {
        // No previously held key should act after focus or lifecycle changes.
        this.heldKeys.clear();
        // Require a fresh press before a pointer can control the scene again.
        this.pointer.held = false;
    }

    /** Remove every installed listener and clear state; safe to call repeatedly. */
    dispose() {
        // Remove the exact bound keydown function installed during connection.
        this.browserWindow.removeEventListener('keydown', this.handleKeyDown);
        // Remove the corresponding keyup listener.
        this.browserWindow.removeEventListener('keyup', this.handleKeyUp);
        // Remove automatic focus-loss cleanup.
        this.browserWindow.removeEventListener('blur', this.handleBlur);
        // Visit the same four event-name values used when installing listeners.
        // “of” yields each name once and ends when the array is exhausted.
        for (const eventName of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
            // Unsubscribe this canvas from its pointer handler.
            this.canvas.removeEventListener(eventName, this.handlePointer);
        }
        // Release any input still recorded at destruction time.
        this.clear();
        // Record that no input listeners remain active.
        this.connected = false;
    }
}
