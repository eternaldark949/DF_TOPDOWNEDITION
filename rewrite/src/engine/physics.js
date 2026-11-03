/**
 * DIRECTORY PHYSICS — shared contacts between extruded circles and oriented boxes.
 * Broad phase queries registered spatial bounds; narrow phase tests real shapes and
 * overlapping Z intervals. A minimum-translation normal separates solid bodies, then
 * linear impulses apply mass, restitution, and friction. No gameplay names are consulted.
 * This is a linear 2.5D solver: it does not yet provide angular impulses or constraints.
 */
class PhysicsBody {
    /** Validate body configuration for one shared element; solids interact by default. */
    constructor(element, definition) {
        // Retain the world element; geometry and position are never independently copied.
        this.element = element;
        // Static bodies stay still; kinematic bodies move but do not receive impulses.
        const motion = definition.motion ?? 'static';
        // Dynamic bodies participate in mass-based separation and velocity response.
        if (!['static', 'dynamic', 'kinematic'].includes(motion)) {
            // Unknown modes must not silently bypass generic contact processing.
            throw new Error(`Unsupported body motion: ${motion}`);
        }
        // Motion is fixed for this body's lifetime so edits cannot stale static/moving indexes.
        Object.defineProperty(this, 'motion', { value: motion, enumerable: true });
        // Store finite positive mass even for immovable bodies for inspectable configuration.
        this.mass = definition.mass ?? 1;
        // Restitution is the fraction of closing normal speed returned as bounce.
        this.restitution = definition.restitution ?? 0;
        // Coulomb friction limits sliding impulse relative to the normal impulse.
        this.friction = definition.friction ?? 0.5;
        // A sensor reports contact without physically separating either participant.
        this.sensor = definition.sensor === true;
        // Category/mask filters are exceptions; the default mask accepts every category.
        this.category = definition.category ?? 1;
        // JavaScript bitwise operators operate on 32-bit integers; all bits means all categories.
        this.collisionMask = definition.collisionMask ?? 0xffffffff;
        // A caller may explicitly ignore specific IDs, such as an attached owner's body.
        this.ignoredIdentifiers = new Set(definition.ignore ?? []);
        // X velocity is measured in world units per second, independent of display rate.
        this.velocityX = definition.velocityX ?? 0;
        // Y velocity moves along the ground plane.
        this.velocityY = definition.velocityY ?? 0;
        // Z velocity moves upward/downward through the shared height coordinate.
        this.velocityZ = definition.velocityZ ?? 0;
        // Individual objects can deliberately opt out of global gravity.
        this.gravityScale = definition.gravityScale ?? 1;
        // Mass and material response must have physically meaningful finite values.
        if (!Number.isFinite(this.mass) || this.mass <= 0 || !Number.isFinite(this.restitution) || this.restitution < 0 || this.restitution > 1 || !Number.isFinite(this.friction) || this.friction < 0 || !Number.isFinite(this.gravityScale)) {
            // Reject invalid configuration before this body enters any registry.
            throw new RangeError('Body mass must be positive; restitution 0..1; friction nonnegative; gravity finite.');
        }
        // Validate category and mask as explicit unsigned 32-bit integers.
        for (const filter of [this.category, this.collisionMask]) {
            // Each filter must be representable without accidental coercion.
            if (!Number.isInteger(filter) || filter < 0 || filter > 0xffffffff) {
                // Unsupported filter values must not turn interactions on/off unpredictably.
                throw new RangeError('Collision categories and masks use unsigned 32-bit integers.');
            }
        }
        // Validate initial velocity before the first physics update.
        this.validateVelocity();
    }

    /** Read inverse mass; only dynamic bodies yield to physical response. */
    get inverseMass() {
        // Zero inverse mass makes static/kinematic bodies immovable during resolution.
        return this.motion === 'dynamic' ? 1 / this.mass : 0;
    }

    /** Reject invalid public velocity edits before moving any coordinates. */
    validateVelocity() {
        // Check all three axes because height is a real physical coordinate.
        if (![this.velocityX, this.velocityY, this.velocityZ].every(Number.isFinite)) {
            // Surface the invalid input rather than poisoning the scene's shared transform.
            throw new RangeError('Body velocities must be finite world units per second.');
        }
    }
}

/** Shape contact helpers live separately from registry ownership and simulation scheduling. */
class ContactGeometry {
    /** Test one pair; return A-to-B unit normal/penetration or null when separated. */
    static intersect(firstBody, secondBody) {
        // Read each participant's one shared world element.
        const first = firstBody.element;
        // The second body may be any gameplay identity with a supported geometry shape.
        const second = secondBody.element;
        // Compare vertical intervals before doing more expensive footprint tests.
        const verticalOverlap = Math.min(first.transform.positionZ + first.geometry.height, second.transform.positionZ + second.geometry.height) - Math.max(first.transform.positionZ, second.transform.positionZ);
        // A real vertical gap excludes contact; touching intervals still report resting contact.
        if (verticalOverlap < -1e-8) {
            // Objects on a bridge and below it can share XY without colliding.
            return null;
        }
        // A minimum translation across Z may be smaller than a lateral correction.
        const upwardExit = first.transform.positionZ + first.geometry.height - second.transform.positionZ;
        // Measure how far the first volume could exit through the opposite vertical side.
        const downwardExit = second.transform.positionZ + second.geometry.height - first.transform.positionZ;
        // Begin with the smaller vertical separating translation.
        let contact = {
            // A Z separation has no horizontal component.
            normalX: 0,
            // A Z separation has no ground-depth component.
            normalY: 0,
            // Choose the shorter direction; equal overlaps use a stable upward normal.
            normalZ: upwardExit <= downwardExit ? 1 : -1,
            // Use exit distance, not intersection length, for fully contained volumes.
            penetration: Math.max(0, Math.min(upwardExit, downwardExit))
        };
        // Gather shape axes: box face normals plus circle-specific separation directions.
        const axes = [];
        // Visit the two element values; “of” stops after both footprints contribute axes.
        for (const element of [first, second]) {
            // Circular shapes have no fixed face normals.
            if (element.geometry.shape === 'box') {
                // The rotated box's local X axis tests separation along its width.
                axes.push([Math.cos(element.transform.angle), Math.sin(element.transform.angle)]);
                // Its perpendicular local Y axis tests separation along its depth.
                axes.push([-Math.sin(element.transform.angle), Math.cos(element.transform.angle)]);
            }
        }
        // Circle-circle separation uses the line between centers.
        if (first.geometry.shape === 'circle' && second.geometry.shape === 'circle') {
            // Coincident centers use a stable X axis rather than dividing by zero.
            const distance = Math.hypot(second.transform.positionX - first.transform.positionX, second.transform.positionY - first.transform.positionY);
            // Add a normalized center axis, or the deterministic fallback.
            axes.push(distance > 1e-10 ? [(second.transform.positionX - first.transform.positionX) / distance, (second.transform.positionY - first.transform.positionY) / distance] : [1, 0]);
        } else {
            // A circle touching a box corner also needs the circle-to-nearest-corner axis.
            const circle = first.geometry.shape === 'circle' ? first : second;
            // The other shape supplies corners when one participant is circular.
            const box = circle === first ? second : first;
            // Only mixed circle/box contacts need this additional curved-boundary test.
            if (circle.geometry.shape === 'circle') {
                // Track the closest box corner by squared distance.
                let nearestDistanceSquared = Infinity;
                // No nearest point exists until the first corner is examined.
                let nearestPoint = null;
                // “of” supplies each cached world corner, finishing after the four box corners.
                for (const point of box.footprint) {
                    // Squared distance avoids a square root during corner selection.
                    const distanceSquared = (point[0] - circle.transform.positionX) ** 2 + (point[1] - circle.transform.positionY) ** 2;
                    // Retain the nearest available corner.
                    if (distanceSquared < nearestDistanceSquared) {
                        // Update the best distance for the remaining comparisons.
                        nearestDistanceSquared = distanceSquared;
                        // Keep the corresponding world coordinate.
                        nearestPoint = point;
                    }
                }
                // A coincident corner supplies no usable axis but box axes still apply.
                if (nearestDistanceSquared > 1e-16) {
                    // Normalize the corner direction so projection distances use world units.
                    const distance = Math.sqrt(nearestDistanceSquared);
                    // Add the extra circle-to-corner separating axis.
                    axes.push([(nearestPoint[0] - circle.transform.positionX) / distance, (nearestPoint[1] - circle.transform.positionY) / distance]);
                }
            }
        }
        // “of” visits each necessary normalized axis, stopping early on any separation.
        for (const axis of axes) {
            // Project the first shape onto this one-dimensional axis.
            const firstInterval = ContactGeometry.project(first, axis);
            // Project the second shape onto the same axis for a meaningful comparison.
            const secondInterval = ContactGeometry.project(second, axis);
            // A gap on any axis means the volumes do not contact at all.
            if (firstInterval.maximum < secondInterval.minimum - 1e-8 || secondInterval.maximum < firstInterval.minimum - 1e-8) {
                // Stop narrow-phase work as soon as separation is proven.
                return null;
            }
            // Moving A backward along the axis exits this side of B.
            const positiveExit = firstInterval.maximum - secondInterval.minimum;
            // Moving A forward along the axis exits the opposite side.
            const negativeExit = secondInterval.maximum - firstInterval.minimum;
            // Choose the shorter exit, including complete shape containment.
            const penetration = Math.max(0, Math.min(positiveExit, negativeExit));
            // Keep the smallest correction across ground and vertical axes.
            if (penetration < contact.penetration) {
                // Orient the contact from A toward B along the shortest separating route.
                const direction = positiveExit <= negativeExit ? 1 : -1;
                // Replace the previous best contact with the current normalized axis.
                contact = { normalX: axis[0] * direction, normalY: axis[1] * direction, normalZ: 0, penetration };
            }
        }
        // All required axes overlap; return the least-displacement separating contact.
        return contact;
    }

    /** Return the min/max footprint projection on a supplied normalized ground-plane axis. */
    static project(element, axis) {
        // A true circle projects to a center plus/minus radius on every normalized axis.
        if (element.geometry.shape === 'circle') {
            // Dot product measures the center's coordinate along this axis.
            const center = element.transform.positionX * axis[0] + element.transform.positionY * axis[1];
            // Return exact circular extent rather than the visual polygon approximation.
            return { minimum: center - element.geometry.radius, maximum: center + element.geometry.radius };
        }
        // Start extrema beyond any valid projection so the first corner establishes them.
        let minimum = Infinity;
        // Maximum begins below every finite world coordinate.
        let maximum = -Infinity;
        // “of” visits the actual rotated box corners, finishing after all four projections.
        for (const point of element.footprint) {
            // Dot this corner with the normalized axis.
            const projection = point[0] * axis[0] + point[1] * axis[1];
            // Expand the lower one-dimensional bound.
            minimum = Math.min(minimum, projection);
            // Expand the upper one-dimensional bound.
            maximum = Math.max(maximum, projection);
        }
        // Keep names explicit for contact calculations.
        return { minimum, maximum };
    }
}

/** One registry-driven simulation for every body; category names never choose algorithms. */
class PhysicsSystem {
    /** Initialize registries and tunable response settings without scheduling a loop. */
    constructor(basement) {
        // Read common gravity and safety limits from shared engine configuration.
        this.basement = basement;
        // Keep every registered body addressable without requiring a full scan during updates.
        this.bodies = new Map();
        // Only non-static bodies require velocity integration and neighborhood queries.
        this.movingBodies = new Map();
        // Subscribers receive begin/stay/end contacts separately from physical response.
        this.listeners = new Set();
        // Retain prior fixed-step contacts to distinguish begin, stay, and end.
        this.previousContacts = new Map();
        // Reuse nearby-static query storage instead of allocating one array per moving body.
        this.staticQueryOutput = [];
        // Keep moving query output separate while combining each body's candidate list.
        this.movingQueryOutput = [];
        // Publish bounded work counters for benchmarks and diagnostics.
        this.statistics = { candidatePairs: 0, narrowChecks: 0, resolvedContacts: 0, substeps: 0 };
    }

    /** Resolve scene/index references after all Directory systems have been constructed. */
    connect(directory) {
        // The scene owns physical index memberships and shared world geometry.
        this.scene = directory.systems.get('scene');
    }

    /** Register one body idempotently; scene synchronization calls this after tracked edits. */
    register(body) {
        // Use the same identifier used by elements and spatial membership.
        this.bodies.set(body.element.identifier, body);
        // Static bodies need no integration or pair-generation entry.
        if (body.motion !== 'static') {
            // Maintain the active moving collection incrementally.
            this.movingBodies.set(body.element.identifier, body);
        }
    }

    /** Unregister a body's integration reference; SceneSystem removes spatial membership. */
    remove(identifier) {
        // Remove this ID from the complete body registry.
        this.bodies.delete(identifier);
        // Remove it from the integration list if it was moving.
        this.movingBodies.delete(identifier);
        // Scratch query outputs are temporary and must not retain unloaded bodies while stopped.
        this.staticQueryOutput.length = 0;
        // Clear the separate moving-candidate buffer for the same ownership reason.
        this.movingQueryOutput.length = 0;
        // A stopped/unloaded scene must not retain old bodies through contact history.
        for (const [pairIdentifier, collision] of this.previousContacts) {
            // Only pairs involving this exact removed element are ending.
            if (collision.first.element.identifier === identifier || collision.second.element.identifier === identifier) {
                // Release history before notifying callbacks that might request another removal.
                this.previousContacts.delete(pairIdentifier);
                // Removal ends contact even if no later simulation step will run.
                for (const listener of Array.from(this.listeners)) {
                    // Contact observation remains independent from physical body cleanup.
                    listener({ type: 'end', ...collision });
                }
            }
        }
    }

    /** Subscribe to contact events and return a function that removes this exact listener. */
    subscribe(listener) {
        // Validate the API before a later fixed step attempts to call a non-function.
        if (typeof listener !== 'function') {
            // Keep callback errors local to registration.
            throw new TypeError('A contact listener must be a function.');
        }
        // Sets prevent duplicate registration of the same callback reference.
        this.listeners.add(listener);
        /** Release this listener without changing any other subscriber. */
        return () => this.listeners.delete(listener);
    }

    /** Determine whether a candidate pair is eligible, with all categories enabled by default. */
    eligible(first, second) {
        // Self-contact never represents two physical objects.
        if (first === second) {
            // Ignore duplicate membership referring to the same body.
            return false;
        }
        // Both participants must agree to category filtering.
        if ((first.collisionMask & second.category) === 0 || (second.collisionMask & first.category) === 0) {
            // These exclusions are explicit body declarations, not missing shape handlers.
            return false;
        }
        // Attached bodies or intentional exceptions can ignore a specific stable ID.
        if (first.ignoredIdentifiers.has(second.element.identifier) || second.ignoredIdentifiers.has(first.element.identifier)) {
            // An intentional exclusion does not trigger contact events either.
            return false;
        }
        // Kinematic/immovable pairs still report contact even when neither yields to impulses.
        return true;
    }

    /** Build unique nearby pairs in deterministic identifier order for one solver pass. */
    candidatePairs() {
        // Pair keys are JSON arrays, so IDs containing punctuation cannot collide.
        const pairs = new Map();
        // “of” visits moving-body values only, never the full static body list.
        for (const body of this.movingBodies.values()) {
            // Query stable geometry using only this body's current ground bounds.
            const neighbors = this.scene.staticBodies.query(body.element.bounds, this.staticQueryOutput);
            // Append nearby moving bodies from their independent index.
            this.scene.movingBodies.query(body.element.bounds, this.movingQueryOutput);
            // “of” visits nearby body values; avoid a huge spread argument list in dense scenes.
            for (const movingCandidate of this.movingQueryOutput) {
                // Append one candidate without risking the JavaScript function-argument limit.
                neighbors.push(movingCandidate);
            }
            // “of” supplies candidate body references and ends after both query outputs.
            for (const other of neighbors) {
                // Remove self-pairs and intentionally excluded contacts before narrow tests.
                if (!this.eligible(body, other)) {
                    // Continue with the next nearby body.
                    continue;
                }
                // Stable lexical identifier order makes contact processing independent of cells.
                const first = body.element.identifier < other.element.identifier ? body : other;
                // The remaining participant becomes the second body.
                const second = first === body ? other : body;
                // The same pair encountered from another body/cell overwrites rather than duplicates.
                pairs.set(JSON.stringify([first.element.identifier, second.element.identifier]), { first, second });
            }
        }
        // Sort the canonical pair keys so movement between cells cannot change solver order.
        return Array.from(pairs.entries()).sort(PhysicsSystem.comparePairs);
    }

    /** Sort canonical pair-key entries deterministically without locale-dependent collation. */
    static comparePairs(first, second) {
        // Earlier string keys are processed first.
        if (first[0] < second[0]) {
            // Preserve a stable ordering independent of spatial-cell traversal.
            return -1;
        }
        // Later keys follow earlier keys.
        if (first[0] > second[0]) {
            // Reverse the comparator result for this ordering.
            return 1;
        }
        // A duplicate key represents the same pair.
        return 0;
    }

    /** Apply a minimum translation and linear/friction impulses to one ordinary solid pair. */
    resolve(first, second, contact) {
        // Sensors inform gameplay/tools but never physically push either body.
        if (first.sensor || second.sensor) {
            // Detection has already been recorded by the caller.
            return;
        }
        // Sum inverse masses to distribute separation and impulse consistently.
        const inverseMassSum = first.inverseMass + second.inverseMass;
        // An eligible sensorless pair should have movable mass, but guard against public edits.
        if (inverseMassSum === 0) {
            // Two immovable bodies cannot be separated by this linear solver.
            return;
        }
        // Divide penetration according to how readily each body yields.
        const correction = contact.penetration / inverseMassSum;
        // Move the first body away from the second along the negative contact normal.
        this.translate(first, -contact.normalX * correction * first.inverseMass, -contact.normalY * correction * first.inverseMass, -contact.normalZ * correction * first.inverseMass);
        // Move the second body along the positive normal, respecting its inverse mass.
        this.translate(second, contact.normalX * correction * second.inverseMass, contact.normalY * correction * second.inverseMass, contact.normalZ * correction * second.inverseMass);
        // Compute relative velocity along the separating normal.
        const closingSpeed = (second.velocityX - first.velocityX) * contact.normalX + (second.velocityY - first.velocityY) * contact.normalY + (second.velocityZ - first.velocityZ) * contact.normalZ;
        // Bodies already moving apart need positional correction but no bounce impulse.
        if (closingSpeed >= 0) {
            // Avoid adding energy to an already separating pair.
            return;
        }
        // Use the less-bouncy material so an elastic object does not make every wall elastic.
        const restitution = Math.min(first.restitution, second.restitution);
        // Convert closing speed to the impulse needed to separate these masses.
        const impulse = -(1 + restitution) * closingSpeed / inverseMassSum;
        // Apply the normal impulse to both participants.
        this.applyImpulse(first, second, contact.normalX * impulse, contact.normalY * impulse, contact.normalZ * impulse);
        // Recompute relative velocity after the normal response.
        const relativeX = second.velocityX - first.velocityX;
        // Read the updated ground-depth relative velocity.
        const relativeY = second.velocityY - first.velocityY;
        // Read the updated vertical relative velocity.
        const relativeZ = second.velocityZ - first.velocityZ;
        // Project the new relative velocity onto the contact normal.
        const normalSpeed = relativeX * contact.normalX + relativeY * contact.normalY + relativeZ * contact.normalZ;
        // Remove the normal component to obtain sliding motion across the contact.
        const tangentX = relativeX - normalSpeed * contact.normalX;
        // Find the corresponding ground-depth sliding component.
        const tangentY = relativeY - normalSpeed * contact.normalY;
        // Find vertical sliding for contacts against upright walls.
        const tangentZ = relativeZ - normalSpeed * contact.normalZ;
        // Normalize sliding only when there is meaningful tangent velocity.
        const tangentSpeed = Math.hypot(tangentX, tangentY, tangentZ);
        // Zero sliding needs no friction impulse.
        if (tangentSpeed > 1e-10) {
            // Geometric mean combines material friction symmetrically.
            const frictionLimit = impulse * Math.sqrt(first.friction * second.friction);
            // Do not reverse sliding; clamp friction to the amount needed to stop it.
            const frictionImpulse = Math.min(tangentSpeed / inverseMassSum, frictionLimit);
            // Apply an impulse opposing the relative tangent motion.
            this.applyImpulse(first, second, -tangentX / tangentSpeed * frictionImpulse, -tangentY / tangentSpeed * frictionImpulse, -tangentZ / tangentSpeed * frictionImpulse);
        }
    }

    /** Move a body by world deltas through its notifying shared transform. */
    translate(body, deltaX, deltaY, deltaZ) {
        // Avoid needless index updates for immovable participants or zero corrections.
        if (deltaX === 0 && deltaY === 0 && deltaZ === 0) {
            // Its position and memberships are already correct.
            return;
        }
        // Use the shared element transform as the single source of physical/visual position.
        const transform = body.element.transform;
        // One atomic change refreshes collision and projected visual bounds automatically.
        transform.setPosition(transform.positionX + deltaX, transform.positionY + deltaY, transform.positionZ + deltaZ);
    }

    /** Apply equal/opposite linear impulses, scaled by each participant's inverse mass. */
    applyImpulse(first, second, impulseX, impulseY, impulseZ) {
        // The first body receives the opposite X impulse.
        first.velocityX -= impulseX * first.inverseMass;
        // Apply the corresponding first-body Y response.
        first.velocityY -= impulseY * first.inverseMass;
        // Apply the corresponding first-body Z response.
        first.velocityZ -= impulseZ * first.inverseMass;
        // The second body receives the positive X impulse.
        second.velocityX += impulseX * second.inverseMass;
        // Apply the corresponding second-body Y response.
        second.velocityY += impulseY * second.inverseMass;
        // Apply the corresponding second-body Z response.
        second.velocityZ += impulseZ * second.inverseMass;
    }

    /** Advance one fixed step with bounded adaptive substeps, then publish contact lifecycle. */
    update(stepSeconds) {
        // Validate time before any velocities or coordinates change.
        if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
            // Reject invalid caller timing rather than permit a reversed simulation.
            throw new RangeError('Physics step duration must be finite and positive.');
        }
        // Start a new set of fixed-step measurements.
        this.statistics = { candidatePairs: 0, narrowChecks: 0, resolvedContacts: 0, substeps: 1 };
        // Estimate travel relative to body size to prevent jumping over thin obstacles.
        let requiredSubsteps = 1;
        // “of” visits moving bodies only; static-scene population does not increase this scan.
        for (const body of this.movingBodies.values()) {
            // Public velocity assignments are checked before any body is moved.
            body.validateVelocity();
            // Read the physical shape's smallest dimension.
            const geometry = body.element.geometry;
            // Circle diameter or box minimum extent supplies the lateral travel scale.
            const minimumWidth = geometry.shape === 'circle' ? geometry.radius * 2 : Math.min(geometry.width, geometry.depth);
            // Height matters too, so a fast falling body cannot skip a thin support slab.
            const minimumExtent = Math.min(minimumWidth, geometry.height);
            // Include acceleration over the full step in the conservative travel estimate.
            const maximumSpeed = Math.hypot(body.velocityX, body.velocityY, body.velocityZ) + Math.abs(this.basement.configuration.gravityZ * body.gravityScale) * stepSeconds;
            // Limit each body's travel to less than half its smallest extent per substep.
            requiredSubsteps = Math.max(requiredSubsteps, Math.ceil(maximumSpeed * stepSeconds / (minimumExtent * 0.4)));
        }
        // Reject unbounded work instead of silently capping and allowing extreme tunneling.
        if (requiredSubsteps > this.basement.configuration.maximumPhysicsSubsteps) {
            // Callers must reduce extreme speeds/step size or deliberately raise the budget.
            throw new RangeError(`Physics needs ${requiredSubsteps} substeps, exceeding the configured safety budget.`);
        }
        // Publish the chosen safety subdivision count.
        this.statistics.substeps = requiredSubsteps;
        // Divide this fixed step into equal smaller durations.
        const substepSeconds = stepSeconds / requiredSubsteps;
        // Collect contacts across subdivisions so a fast impact still generates an event.
        const currentContacts = new Map();
        // Count from zero to requiredSubsteps-1, increasing by one after each complete substep.
        for (let substepIndex = 0; substepIndex < requiredSubsteps; substepIndex += 1) {
            // Visit each moving body once to integrate velocity and position.
            for (const body of this.movingBodies.values()) {
                // Gravity affects dynamic mass, while kinematic motion remains caller-controlled.
                if (body.motion === 'dynamic') {
                    // Integrate upward-positive Z velocity using configured downward gravity.
                    body.velocityZ += this.basement.configuration.gravityZ * body.gravityScale * substepSeconds;
                }
                // Movement updates all spatial/visual membership through the same transform.
                this.translate(body, body.velocityX * substepSeconds, body.velocityY * substepSeconds, body.velocityZ * substepSeconds);
            }
            // Repeat the shared solver a fixed number of times for stacks and multi-body contacts.
            // Start at zero, stop before solverIterations, and increase by one per pass.
            for (let iteration = 0; iteration < this.basement.configuration.solverIterations; iteration += 1) {
                // Re-query after corrections so newly adjacent bodies can join the next pass.
                const candidates = this.candidatePairs();
                // Count actual spatially discovered candidate pairs for diagnostics.
                this.statistics.candidatePairs += candidates.length;
                // “of” retrieves [canonical key, pair] entries; destructuring names both values.
                for (const [pairIdentifier, pair] of candidates) {
                    // A contact callback from a previous step may have removed a retained object.
                    if (!this.bodies.has(pair.first.element.identifier) || !this.bodies.has(pair.second.element.identifier)) {
                        // Do not resolve against unregistered objects.
                        continue;
                    }
                    // Record one actual geometry test rather than the total registry population.
                    this.statistics.narrowChecks += 1;
                    // Shape geometry, not gameplay class, determines the contact algorithm.
                    const contact = ContactGeometry.intersect(pair.first, pair.second);
                    // Separated footprints or height intervals need no physical response.
                    if (!contact) {
                        // Continue to the next nearby pair.
                        continue;
                    }
                    // Retain the participants and measured normal for contact notifications.
                    currentContacts.set(pairIdentifier, { first: pair.first, second: pair.second, contact });
                    // Resolve every ordinary solid pair through the same mass-based response.
                    this.resolve(pair.first, pair.second, contact);
                    // Count actual contacts encountered, including sensors.
                    this.statistics.resolvedContacts += 1;
                }
            }
        }
        // Snapshot events before notifying code that could modify the scene or subscriptions.
        const events = [];
        // “of” visits each contacted pair value once for this complete fixed step.
        for (const [identifier, collision] of currentContacts) {
            // Distinguish a first encounter from one also observed during the previous step.
            events.push({ type: this.previousContacts.has(identifier) ? 'stay' : 'begin', ...collision });
        }
        // Visit prior pairs to discover contacts absent from this fixed step.
        for (const [identifier, collision] of this.previousContacts) {
            // A removed/separated pair produces one end event.
            if (!currentContacts.has(identifier)) {
                // Preserve the last measured contact for subscribers that need it.
                events.push({ type: 'end', ...collision });
            }
        }
        // Install the new reference before callbacks can initiate scene changes.
        this.previousContacts = currentContacts;
        // “of” reads event values in deterministic pair order and stops after all events.
        for (const event of events) {
            // Snapshot callbacks so subscription changes take effect on subsequent delivery.
            for (const listener of Array.from(this.listeners)) {
                // Notify game/tools without making physical resolution depend on their identity.
                listener(event);
            }
        }
    }

    /** Release every body/contact/listener reference during Directory destruction. */
    dispose() {
        // Forget all registered bodies.
        this.bodies.clear();
        // Forget moving integration entries separately.
        this.movingBodies.clear();
        // Release contact-history references to removed scene elements.
        this.previousContacts.clear();
        // Release external callback references.
        this.listeners.clear();
        // Reusable scratch arrays must not retain neighbors after scene destruction.
        this.staticQueryOutput.length = 0;
        // Release moving-query body references separately.
        this.movingQueryOutput.length = 0;
    }
}
