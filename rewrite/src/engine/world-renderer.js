/**
 * DIRECTORY WORLD RENDERER — opaque surfaces use a real GPU depth buffer.
 * Rendering occurs on an internal WebGL2 canvas, then the existing Canvas renderer
 * composites that one world image. Geometry, surface emission, and point-light
 * contributions all use identical vertex positions and depth tests. No building,
 * shop, roof, or character name changes visibility rules.
 * This first contract supports opaque extruded boxes/circles and flat planes;
 * transparent materials, bloom blur, textures, and skeletal meshes are not implemented.
 */
class WorldRendererSystem {
    /** Store no GPU resources until a world scene is actually drawn. */
    constructor(basement) {
        // Shared height projection and ambient configuration must match the Scene indexes.
        this.basement = basement;
        // Offscreen canvas is allocated lazily so an empty/Canvas-only engine needs no WebGL.
        this.canvas = null;
        // Null means no WebGL resource set has been created yet.
        this.resources = null;
        // One engine-owned pass draws all declared world surfaces.
        this.active = false;
        // Context loss suspends world drawing until the browser restores GPU resources.
        this.contextLost = false;
        // Cache uploaded geometry against scene and viewport revisions.
        this.cachedGeometryKey = '';
        // Reuse a completed world image when geometry, sources, and view are unchanged.
        this.cachedFrameKey = '';
        // Mesh generation/cache has its own concern, independent of GPU resource ownership.
        this.meshLibrary = new WorldSurfaceMesh();
        // Point-light visibility has its own backend helper, using live parent resource lookup.
        this.pointLighting = new PointLightRenderer(this);
        // Track what the GPU is actually asked to draw.
        this.statistics = { visibleElements: 0, vertices: 0, lights: 0, shadowCandidates: 0, drawCalls: 0 };
        // Bound handlers retain this renderer when the canvas dispatches GPU lifecycle events.
        this.handleContextLost = this.onContextLost.bind(this);
        // Keep the exact function reference for later listener removal.
        this.handleContextRestored = this.onContextRestored.bind(this);
    }

    /** Resolve shared services after Directory assembly; do not register an empty draw pass. */
    connect(directory) {
        // Scene elements are the authoritative geometry providers.
        this.scene = directory.systems.get('scene');
        // The Canvas renderer remains the owner of final viewport composition.
        this.renderer = directory.systems.get('renderer');
    }

    /** Register one central world pass when the first scene element is added. */
    activate() {
        // Multiple scene objects must not create multiple rendering pipelines.
        if (this.active) {
            // Preserve the existing engine-owned pass.
            return;
        }
        // The world image uses screen coordinates because its vertices already project the camera.
        this.renderer.registerPass('engine.world', 20, 'screen', this.draw.bind(this));
        // Remember that the final compositor now owns this one callback.
        this.active = true;
    }

    /** Remove the central pass when the scene becomes empty, keeping reusable GPU resources. */
    deactivate() {
        // Remove only the world pass, leaving independent UI/Canvas passes intact.
        this.renderer.removePass('engine.world');
        // A later scene can reactivate the same renderer.
        this.active = false;
        // Drop cached references and vertex count when the scene is unloaded.
        this.cachedGeometryKey = '';
        // An empty/replaced scene must not reuse the prior scene's finished image.
        this.cachedFrameKey = '';
        // Prevent diagnostics from reporting the removed scene's population.
        this.statistics.visibleElements = 0;
        // Reset draw accounting immediately even if the engine is stopped.
        this.statistics.vertices = 0;
    }

    /** Compile one GLSL shader; a failure reports the GPU compiler's explanation. */
    compileShader(type, source) {
        // Use the currently owned WebGL2 context.
        const graphics = this.graphics;
        // Allocate the requested vertex/fragment shader object.
        const shader = graphics.createShader(type);
        // Supply readable shader code containing explanatory comments.
        graphics.shaderSource(shader, source);
        // Ask the GPU driver to compile the supplied source.
        graphics.compileShader(shader);
        // Invalid shader code must stop initialization rather than produce a blank world silently.
        if (!graphics.getShaderParameter(shader, graphics.COMPILE_STATUS)) {
            // Preserve the concrete GPU error before releasing the failed shader.
            const message = graphics.getShaderInfoLog(shader);
            // A failed object is no longer needed.
            graphics.deleteShader(shader);
            // Explain which shared renderer component failed.
            throw new Error(`World shader compilation failed: ${message}`);
        }
        // Return the compiled shader to the program-linking stage.
        return shader;
    }

    /** Create/link a vertex+fragment program and release temporary shader objects. */
    createProgram(fragmentSource, vertexSource = WorldShaders.vertexSource) {
        // Vertex projection is identical for base color and every light contribution.
        const vertexShader = this.compileShader(this.graphics.VERTEX_SHADER, vertexSource);
        // Fragment code supplies either base/emission or direct lighting.
        const fragmentShader = this.compileShader(this.graphics.FRAGMENT_SHADER, fragmentSource);
        // Allocate a program that joins geometry and pixel calculations.
        const program = this.graphics.createProgram();
        // Attach the common vertex computation.
        this.graphics.attachShader(program, vertexShader);
        // Attach this pass's pixel computation.
        this.graphics.attachShader(program, fragmentShader);
        // Link attribute/uniform interfaces into an executable GPU program.
        this.graphics.linkProgram(program);
        // Shader objects can be released after their compiled code is linked.
        this.graphics.deleteShader(vertexShader);
        // Release the corresponding fragment-shader object.
        this.graphics.deleteShader(fragmentShader);
        // Reject incompatible shader interfaces before attempting to render a frame.
        if (!this.graphics.getProgramParameter(program, this.graphics.LINK_STATUS)) {
            // Capture the actual driver diagnosis for debugging.
            const message = this.graphics.getProgramInfoLog(program);
            // Release the unsuccessful program allocation.
            this.graphics.deleteProgram(program);
            // Stop rather than pretending a fallback has equivalent depth/lighting behavior.
            throw new Error(`World shader linking failed: ${message}`);
        }
        // Return the linked program to the renderer's resource owner.
        return program;
    }

    /** Allocate one internal WebGL2 canvas and reusable geometry/shadow buffers. */
    initialize() {
        // Create the offscreen surface only when a nonempty world is rendered.
        if (!this.canvas) {
            // Use the host canvas's document so embedding does not depend on a global page.
            this.canvas = this.renderer.canvas.ownerDocument.createElement('canvas');
            // Context loss is a browser event, not a reason to start another engine loop.
            this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
            // Restoration reconstructs resources during the existing Lobby schedule.
            this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
        }
        // Request a real depth-capable rendering context; no external engine dependency is used.
        this.graphics = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true });
        // Devices without WebGL2 must receive a clear capability error.
        if (!this.graphics) {
            // Do not fall back to incorrect painter ordering while claiming depth correctness.
            throw new Error('Shared world surfaces require WebGL2; the Canvas-only loop study remains available.');
        }
        // Keep GPU handles together for explicit disposal and context restoration.
        this.resources = {
            // Draw opaque color and attached surface emission into the depth buffer.
            baseProgram: this.createProgram(WorldShaders.baseFragmentSource),
            // Add point lighting only to the same visible fragments, with geometric shadows.
            lightProgram: this.createProgram(WorldShaders.lightFragmentSource),
            // The light's six views store nearest opaque geometry as radial depth.
            shadowProgram: this.createProgram(WorldShaders.shadowFragmentSource, WorldShaders.shadowVertexSource),
            // One interleaved vertex buffer stores position, normal, color, and emission.
            vertexBuffer: this.graphics.createBuffer(),
            // Shadow geometry is queried independently of the camera's visible geometry.
            shadowVertexBuffer: this.graphics.createBuffer(),
            // A depth cubemap covers every direction around one point source.
            shadowCube: this.graphics.createTexture(),
            // Render depth into one cubemap face at a time, without touching the world image.
            shadowFramebuffer: this.graphics.createFramebuffer()
        };
        // Validate configured shadow resolution against actual hardware capacity.
        const shadowSize = this.basement.configuration.shadowMapSize;
        // Cubemap allocation must fit the device rather than silently reducing declared quality.
        if (shadowSize > this.graphics.getParameter(this.graphics.MAX_CUBE_MAP_TEXTURE_SIZE)) {
            // State the capability mismatch explicitly during GPU initialization.
            throw new RangeError('Configured shadowMapSize exceeds this GPU cubemap capacity.');
        }
        // Bind the one reusable six-direction shadow texture.
        this.graphics.bindTexture(this.graphics.TEXTURE_CUBE_MAP, this.resources.shadowCube);
        // Allocate every cubemap face before using the texture or attaching it to a framebuffer.
        // Count zero through five, increasing once for each of the six cube directions.
        for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
            // Depth textures store visibility distance, not decorative glow color.
            this.graphics.texImage2D(this.graphics.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex, 0, this.graphics.DEPTH_COMPONENT24, shadowSize, shadowSize, 0, this.graphics.DEPTH_COMPONENT, this.graphics.UNSIGNED_INT, null);
        }
        // Use exact nearest samples for this first hard-shadow implementation.
        this.graphics.texParameteri(this.graphics.TEXTURE_CUBE_MAP, this.graphics.TEXTURE_MIN_FILTER, this.graphics.NEAREST);
        // Keep magnification consistent with the depth comparison rule.
        this.graphics.texParameteri(this.graphics.TEXTURE_CUBE_MAP, this.graphics.TEXTURE_MAG_FILTER, this.graphics.NEAREST);
        // Clamp each cube-coordinate axis rather than wrapping a shadow direction.
        for (const axis of [this.graphics.TEXTURE_WRAP_S, this.graphics.TEXTURE_WRAP_T, this.graphics.TEXTURE_WRAP_R]) {
            // Apply the same sampling boundary policy to all cube faces.
            this.graphics.texParameteri(this.graphics.TEXTURE_CUBE_MAP, axis, this.graphics.CLAMP_TO_EDGE);
        }
        // A restored GPU has no uploaded geometry even if the scene itself did not change.
        this.cachedGeometryKey = '';
        // Restored buffers contain no previously shaded scene image.
        this.cachedFrameKey = '';
    }

    /** Handle GPU loss by suspending world submission, preserving the scene's CPU declarations. */
    onContextLost(event) {
        // Allow the browser to restore this context instead of treating the loss as permanent.
        event.preventDefault();
        // The ordinary Lobby may continue; draw() skips unavailable GPU work.
        this.contextLost = true;
    }

    /** Recreate programs/buffers after browser restoration; geometry uploads on the next frame. */
    onContextRestored() {
        // Old handles are invalid after restoration and must not be reused.
        this.resources = null;
        // Permit draw() to initialize a fresh resource set.
        this.contextLost = false;
        // Force a complete upload from authoritative scene data.
        this.cachedGeometryKey = '';
        // A restored context must shade the scene again before reusing its finished image.
        this.cachedFrameKey = '';
    }

    /** Configure interleaved attributes and shared projection for one linked program. */
    useProgram(program, depthRange) {
        // Keep the Graphics API owner explicit in every call below.
        const graphics = this.graphics;
        // Select the base or point-light fragment computation.
        graphics.useProgram(program);
        // Bind the same authoritative geometry buffer for both passes.
        graphics.bindBuffer(graphics.ARRAY_BUFFER, this.resources.vertexBuffer);
        // Describe each attribute's name, float offset, and vector width.
        const attributes = [['aPosition', 0], ['aNormal', 3], ['aColor', 6], ['aEmission', 9]];
        // “of” yields each [name, offset] pair; destructuring makes both meanings explicit.
        for (const [name, offset] of attributes) {
            // Link-time optimization may omit attributes unused by this particular fragment pass.
            const location = graphics.getAttribLocation(program, name);
            // A negative location means this program needs no data for that attribute.
            if (location < 0) {
                // Skip inactive attributes instead of issuing an invalid GPU command.
                continue;
            }
            // Enable this attribute's data source.
            graphics.enableVertexAttribArray(location);
            // Each vertex has twelve floats (48 bytes); the offset is measured in bytes.
            graphics.vertexAttribPointer(location, 3, graphics.FLOAT, false, 48, offset * 4);
        }
        // Viewport and camera values use CSS pixels/world units, not backing pixel dimensions.
        graphics.uniform2f(graphics.getUniformLocation(program, 'uViewport'), this.renderer.viewportWidth, this.renderer.viewportHeight);
        // Camera center addresses projected-world coordinates for both culling and drawing.
        graphics.uniform2f(graphics.getUniformLocation(program, 'uCamera'), this.renderer.camera.positionX, this.renderer.camera.positionY);
        // Camera zoom scales both projected axes consistently.
        graphics.uniform1f(graphics.getUniformLocation(program, 'uZoom'), this.renderer.camera.zoom);
        // Shared vertical projection must exactly match SceneSystem's visual bounds.
        graphics.uniform1f(graphics.getUniformLocation(program, 'uHeightScale'), this.basement.configuration.heightProjectionScale);
        // Fit visible depth into GPU clip range without relying on draw submission order.
        graphics.uniform1f(graphics.getUniformLocation(program, 'uDepthRange'), depthRange);
    }

    /** Project, depth-test, shade, and composite all visible opaque world geometry once. */
    draw(renderer) {
        // A lost context must not issue invalid GPU calls while waiting for restoration.
        if (this.contextLost) {
            // Keep the authoritative CPU scene intact for a later restored frame.
            return;
        }
        // Initialize GPU resources only when a world pass actually executes.
        if (!this.resources) {
            // An unavailable WebGL2 capability produces an explicit setup error here.
            this.initialize();
        }
        // Shading density is independently capped; the final image still fills the same CSS view.
        const worldPixelRatio = Math.min(renderer.pixelRatio, this.basement.configuration.maximumWorldPixelRatio);
        // Calculate desired backing width without forcing high-density lighting on phone GPUs.
        const desiredWidth = Math.max(1, Math.round(renderer.viewportWidth * worldPixelRatio));
        // Calculate desired backing height with the same density policy.
        const desiredHeight = Math.max(1, Math.round(renderer.viewportHeight * worldPixelRatio));
        // Reallocate only when actual shading dimensions change.
        if (this.canvas.width !== desiredWidth) {
            // Reallocate only on a real size change, not on every frame.
            this.canvas.width = desiredWidth;
        }
        // Allocate matching vertical backing resolution.
        if (this.canvas.height !== desiredHeight) {
            // Keep unchanged backing storage across ordinary frames.
            this.canvas.height = desiredHeight;
        }
        // Set the GPU viewport to the full internal backing image.
        this.graphics.viewport(0, 0, this.canvas.width, this.canvas.height);
        // Read zoom once while constructing projected-world query bounds.
        const zoom = renderer.camera.zoom;
        // Camera coordinates are projected-world coordinates; Z was already included by Scene.
        const view = {
            // Left edge of the visible projected world.
            minimumX: renderer.camera.positionX - renderer.viewportWidth / (2 * zoom),
            // Upper edge of the visible projected world.
            minimumY: renderer.camera.positionY - renderer.viewportHeight / (2 * zoom),
            // Right edge of the visible projected world.
            maximumX: renderer.camera.positionX + renderer.viewportWidth / (2 * zoom),
            // Lower edge of the visible projected world.
            maximumY: renderer.camera.positionY + renderer.viewportHeight / (2 * zoom)
        };
        // Include pixel allocation because resizing invalidates the preserved drawing buffer.
        const frameKey = `${this.scene.revision}:${JSON.stringify(view)}:${desiredWidth}:${desiredHeight}`;
        // An unchanged view and world need only a final image copy, not another shadow pass.
        if (frameKey === this.cachedFrameKey) {
            // This frame submitted no internal GPU geometry or shadow work.
            this.statistics.drawCalls = 0;
            // No shadow candidates were newly processed for this cached frame.
            this.statistics.shadowCandidates = 0;
            // Copy the preserved complete world image under the same final screen transform.
            renderer.drawingContext.drawImage(this.canvas, 0, 0, renderer.viewportWidth, renderer.viewportHeight);
            // Report the one actual Canvas copy required for this cached frame.
            renderer.drawCalls += 1;
            // Leave existing geometry and depth buffers available for a later changed frame.
            return;
        }
        // Reset current-frame diagnostics before visibility and lighting work.
        this.statistics = { visibleElements: 0, vertices: 0, lights: 0, shadowCandidates: 0, drawCalls: 0 };
        // Query geometry using its actual height-expanded visual extent.
        const visible = this.scene.visibleGeometry.query(view).filter((element) => element.visible);
        // Stable IDs determine only exactly coplanar ties, never ordinary occlusion.
        visible.sort(WorldRendererSystem.compareElements);
        // Publish the number of actual visible scene elements.
        this.statistics.visibleElements = visible.length;
        // Build a cache key from tracked scene changes and camera query bounds.
        const geometryKey = `${this.scene.revision}:${JSON.stringify(view)}`;
        // Reuse GPU geometry for a stationary scene and unchanged view.
        if (geometryKey !== this.cachedGeometryKey) {
            // Collect only currently visible geometry for upload.
            const vertices = [];
            // Minimum depth range avoids clipping a scene close to the origin.
            this.depthRange = 100;
            // “of” visits visible element values and ends after the culled list.
            for (const element of visible) {
                // Generate ordinary box/circle/plane surface attributes.
                vertices.push(...this.meshLibrary.build(element));
                // Include both extrema of physical Y and Z when fitting the depth range.
                for (const groundY of [element.bounds.minimumY, element.bounds.maximumY]) {
                    // Each vertical endpoint may be the nearest/farthest visible point.
                    for (const height of [element.transform.positionZ, element.transform.positionZ + element.geometry.height]) {
                        // Camera-relative depth is perpendicular to projected screen Y.
                        const depth = (groundY - renderer.camera.positionY) * this.basement.configuration.heightProjectionScale + height;
                        // Add a small margin so valid geometry cannot land on a clip boundary.
                        this.depthRange = Math.max(this.depthRange, Math.abs(depth) * 1.05 + 1);
                    }
                }
            }
            // Every vertex has twelve floats in the documented interleaved layout.
            this.vertexCount = vertices.length / 12;
            // Select the shared geometry buffer before replacing its contents.
            this.graphics.bindBuffer(this.graphics.ARRAY_BUFFER, this.resources.vertexBuffer);
            // Upload one compact vertex array, not one GPU draw per scene object.
            this.graphics.bufferData(this.graphics.ARRAY_BUFFER, new Float32Array(vertices), this.graphics.DYNAMIC_DRAW);
            // Remember which scene/view generated the current GPU geometry.
            this.cachedGeometryKey = geometryKey;
        }
        // Publish the actual geometry submitted rather than the total scene registry size.
        this.statistics.vertices = this.vertexCount;
        // Clear to transparent so the Canvas background can remain independently styled.
        this.graphics.clearColor(0, 0, 0, 0);
        // Far depth starts at one; smaller fragment depth means closer to the camera.
        this.graphics.clearDepth(1);
        // Depth writes must be enabled when clearing and rendering opaque surfaces.
        this.graphics.depthMask(true);
        // A previous source's scissor rectangle must never restrict the next frame's clear.
        this.graphics.disable(this.graphics.SCISSOR_TEST);
        // Clear both the image and its visibility buffer every frame.
        this.graphics.clear(this.graphics.COLOR_BUFFER_BIT | this.graphics.DEPTH_BUFFER_BIT);
        // Turn on geometry-based visibility rather than caller-maintained painter layers.
        this.graphics.enable(this.graphics.DEPTH_TEST);
        // Only nearer surfaces replace the current visible pixel.
        this.graphics.depthFunc(this.graphics.LESS);
        // Base material color is opaque and must replace, not add to, prior fragments.
        this.graphics.disable(this.graphics.BLEND);
        // Configure common geometry/projection and the base fragment program.
        this.useProgram(this.resources.baseProgram, this.depthRange);
        // Apply the shared scene ambient level without treating emission as a late overlay.
        this.graphics.uniform1f(this.graphics.getUniformLocation(this.resources.baseProgram, 'uAmbient'), this.basement.configuration.ambientLight);
        // Draw all opaque surfaces; depth resolves roofs/ground and unrelated objects alike.
        this.graphics.drawArrays(this.graphics.TRIANGLES, 0, this.vertexCount);
        // Count this actual GPU geometry submission.
        this.statistics.drawCalls += 1;
        // Add light only where the same already-visible surface passes an exact depth match.
        this.graphics.depthFunc(this.graphics.EQUAL);
        // Light contributions must not change the established visible-surface depth.
        this.graphics.depthMask(false);
        // Point lights accumulate color contributions on that visible surface.
        this.graphics.enable(this.graphics.BLEND);
        // Add RGB while preserving the opaque base alpha instead of making empty pixels opaque.
        this.graphics.blendFuncSeparate(this.graphics.ONE, this.graphics.ONE, this.graphics.ZERO, this.graphics.ONE);
        // Set the same vertex attributes and projection for the direct-light program.
        this.useProgram(this.resources.lightProgram, this.depthRange);
        // Light influence bounds account for elevation and offscreen sources.
        const lights = this.scene.lightReach.query(view);
        // Restrict expensive fragment lighting to each source's projected influence rectangle.
        this.graphics.enable(this.graphics.SCISSOR_TEST);
        // “of” visits visible/reaching point lights; each gets the same shared shading rules.
        for (const light of lights) {
            // Convert the physical source position through the same public projection contract.
            const lightCenter = renderer.worldToScreen(light.positionX, light.positionY, light.positionZ);
            // A sphere projects to this horizontal influence radius in CSS pixels.
            const radiusX = light.radius * renderer.camera.zoom;
            // Height projection expands its vertical influence by this exact linear bound.
            const radiusY = light.radius * Math.hypot(1, this.basement.configuration.heightProjectionScale) * renderer.camera.zoom;
            // Clamp the left influence edge to the actual backing image.
            const minimumX = Math.max(0, Math.floor((lightCenter.positionX - radiusX) * worldPixelRatio));
            // WebGL scissor Y starts at the bottom, unlike CSS coordinates.
            const minimumY = Math.max(0, Math.floor((renderer.viewportHeight - lightCenter.positionY - radiusY) * worldPixelRatio));
            // Clamp the right influence edge to avoid irrelevant offscreen fragments.
            const maximumX = Math.min(this.canvas.width, Math.ceil((lightCenter.positionX + radiusX) * worldPixelRatio));
            // Clamp the upper WebGL influence edge using the inverted vertical coordinate.
            const maximumY = Math.min(this.canvas.height, Math.ceil((renderer.viewportHeight - lightCenter.positionY + radiusY) * worldPixelRatio));
            // Empty projected influence produces no lighting submission.
            if (maximumX <= minimumX || maximumY <= minimumY) {
                // Continue with the next visible/reaching source.
                continue;
            }
            // Build geometric source visibility independently from the camera's surface depth.
            this.pointLighting.renderShadowMap(light);
            // Shadow rendering used its own viewport/state; restore source-area camera clipping.
            this.graphics.enable(this.graphics.SCISSOR_TEST);
            // Fragment shading outside this rectangle cannot contribute to this source.
            this.graphics.scissor(minimumX, minimumY, maximumX - minimumX, maximumY - minimumY);
            // Supply actual world coordinates and radius to the pixel shader.
            this.graphics.uniform4f(this.graphics.getUniformLocation(this.resources.lightProgram, 'uLight'), light.positionX, light.positionY, light.positionZ, light.radius);
            // Supply normalized source color and intensity separately from receiving materials.
            this.graphics.uniform4f(this.graphics.getUniformLocation(this.resources.lightProgram, 'uLightColor'), ...light.color, light.intensity);
            // Finite shadow resolution sets the numerical comparison bias in world units.
            this.graphics.uniform1f(this.graphics.getUniformLocation(this.resources.lightProgram, 'uShadowMapSize'), this.basement.configuration.shadowMapSize);
            // Revisit geometry under exact depth equality, adding light only to visible fragments.
            this.graphics.drawArrays(this.graphics.TRIANGLES, 0, this.vertexCount);
            // Count this source's actual GPU submission.
            this.statistics.drawCalls += 1;
        }
        // Publish the number of sources considered by this frame's central light stage.
        this.statistics.lights = lights.length;
        // Leave no source-specific scissor restriction on later world frames.
        this.graphics.disable(this.graphics.SCISSOR_TEST);
        // Restore depth-write state for the next frame's clear/base pass.
        this.graphics.depthMask(true);
        // Flush commands before copying this canvas into the final Canvas image.
        this.graphics.flush();
        // Composite the completed depth-aware world image in CSS-pixel screen coordinates.
        renderer.drawingContext.drawImage(this.canvas, 0, 0, renderer.viewportWidth, renderer.viewportHeight);
        // Account for this final Canvas composition independently of internal GPU submissions.
        renderer.drawCalls += 1;
        // The preserved opaque/light image is now reusable until tracked scene/view changes.
        this.cachedFrameKey = frameKey;
    }

    /** Compare element IDs solely to make exactly coplanar ties deterministic. */
    static compareElements(first, second) {
        // An earlier lexical ID wins an exact depth tie under the LESS test.
        if (first.identifier < second.identifier) {
            // Place first before second without depending on locale collation.
            return -1;
        }
        // A later lexical ID follows the other coplanar declaration.
        if (first.identifier > second.identifier) {
            // Reverse the comparison result for this ordering.
            return 1;
        }
        // Matching IDs cannot coexist in a scene, but equality is still a valid comparator result.
        return 0;
    }

    /** Release GPU objects and context listeners when the Directory destroys this service. */
    dispose() {
        // Remove the compositor callback before releasing resources it might use.
        this.deactivate();
        // A Canvas-only session may never have allocated an offscreen context.
        if (this.canvas) {
            // Remove the exact bound context-loss listener.
            this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
            // Remove the corresponding restoration listener.
            this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
        }
        // Lost contexts already own invalid handles, so ordinary deletion is unnecessary there.
        if (this.resources && !this.contextLost) {
            // Release linked base shader resources.
            this.graphics.deleteProgram(this.resources.baseProgram);
            // Release the direct-light program.
            this.graphics.deleteProgram(this.resources.lightProgram);
            // Release uploaded world geometry.
            this.graphics.deleteBuffer(this.resources.vertexBuffer);
            // Release the light-view shader program.
            this.graphics.deleteProgram(this.resources.shadowProgram);
            // Release uploaded nearby shadow geometry.
            this.graphics.deleteBuffer(this.resources.shadowVertexBuffer);
            // Release the six-direction light visibility texture.
            this.graphics.deleteTexture(this.resources.shadowCube);
            // Release the target used to produce that visibility texture.
            this.graphics.deleteFramebuffer(this.resources.shadowFramebuffer);
        }
        // Do not retain disposed GPU handles.
        this.resources = null;
    }
}
