        // Optional detailed timing only. Stage values are exclusive within each tree;
        // rows remain children of AI:Traffic/Physics:Collisions or the render wrappers.
        function makeStageProfiler(prefix) {
            return {
                active: false, hooks: null, depth: 0, part: null, stamp: 0,
                bind(hooks, owner, key, part, entry = false, allowed = null) {
                    const original = owner[key], stage = this;
                    if (typeof original !== 'function') return;
                    const wrapped = function(...args) {
                        if (!stage.depth && !entry && !(allowed && allowed())) return original.apply(this, args);
                        const parent = stage.part, start = performance.now();
                        if (parent !== null) game.profiler.add(prefix + parent, start - stage.stamp, true);
                        stage.part = part; stage.stamp = start; stage.depth++;
                        try { return original.apply(this, args); }
                        finally {
                            const end = performance.now();
                            game.profiler.add(prefix + part, end - stage.stamp, true);
                            stage.part = parent; stage.stamp = end; stage.depth--;
                        }
                    };
                    hooks.push({ owner, key, original, wrapped });
                },
                sync(on) {
                    on = !!on; if (on === this.active) return;
                    if (!this.hooks) { this.hooks = []; this.install(this.hooks); }
                    for (const h of this.hooks) h.owner[h.key] = on ? h.wrapped : h.original;
                    this.active = on;
                }
            };
        }
        const TrafficProfiler = makeStageProfiler('Traffic: ');
        TrafficProfiler.install = function(hooks) {
            const bind = (owner, key, part, entry = false) => this.bind(hooks, owner, key, part, entry);
            bind(TrafficManager.prototype, 'update', 'Manager', true);
            bind(TrafficManager.prototype, 'resolveCollisions', 'Vehicle contacts', true);
            const V = TrafficVehicle.prototype;
            bind(V, 'updateAIDriving', 'Driving decisions');
            bind(V, 'aiDriveStep', 'Physics integration');
            bind(V, '_wallContact', 'Wall contacts');
            bind(V, 'checkEnvironmentCollision', 'Environment checks');
            bind(_physicsSpatial, 'query', 'Static broadphase');
            bind(_physicsSpatial, 'refresh', 'Static geometry validation');
            bind(V, '_readFolk', 'People sensing');
            for (const key of ['_routeProbe', '_probeGap']) bind(V, key, 'Route sensing');
            for (const key of ['_carAheadInLane', '_exitBlocked', 'isLaneClear', '_folkInLane', '_stripClear']) bind(V, key, 'Lane decisions');
            for (const key of ['update', 'recollectVehicle']) bind(Intersection.prototype, key, 'Junctions');
            bind(JunctionSignal.prototype, 'update', 'Signals');
        };
        const SignProfiler = makeStageProfiler('Signs: ');
        SignProfiler.install = function(hooks) {
            const allowed = () => !!WorldRenderProfiler.scope;
            const bind = (owner, key, part) => this.bind(hooks, owner, key, part, false, allowed);
            bind(NeonSign.prototype, 'draw', 'Street neon');
            const B = BuildingV2.prototype;
            bind(B, '_paintSign', 'Building sign and awning');
            bind(B, '_bakeSignSprites', 'Cold sprite baking');
            bind(B, '_vFront', 'Shopfronts');
            bind(B, '_mcDrawSign', 'Moon City');
        };
