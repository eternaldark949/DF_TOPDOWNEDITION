/**
 * DIRECTORY WORLD RENDERER — opaque surfaces use a real GPU depth buffer.
 * Rendering uses the displayed canvas's WebGL2 context. A retained GPU image is
 * presented by a GPU framebuffer copy, never by a Canvas 2D drawing context. Geometry, surface emission, and point-light
 * contributions all use identical vertex positions and depth tests. No building,
 * shop, roof, or character name changes visibility rules.
 * Opaque primitives and explicit textured alpha-cutout surfaces share this pipeline.
 * Blended transparency, bloom blur, and skeletal meshes are not implemented.
 */
class WorldRendererSystem {
    /** Store no GPU resources until a world scene is actually drawn. */
    constructor(basement) {
        // Shared height projection and ambient configuration must match the Scene indexes.
        this.basement = basement;
        // The connection phase supplies the actual displayed canvas, never an offscreen canvas.
        this.canvas = null;
        // Null means no WebGL resource set has been created yet.
        this.resources = null;
        // One engine-owned pass draws all declared world surfaces.
        this.active = false;
        // Context loss suspends world drawing until the browser restores GPU resources.
        this.contextLost = false;
        // Reuse a completed world image when geometry, sources, and view are unchanged.
        this.cachedFrameKey = '';
        // Mesh generation/cache has its own concern, independent of GPU resource ownership.
        this.meshLibrary = new WorldSurfaceMesh();
        // Retained camera batches keep static hotel meshes resident while actors move.
        this.cameraBatches = new WorldGeometryBatches(this);
        // Source visibility uses independently queried/cached geometry and the same material rules.
        this.shadowBatches = new WorldGeometryBatches(this);
        // Point-light visibility has its own backend helper, using live parent resource lookup.
        this.pointLighting = new PointLightRenderer(this);
        // Track what the GPU is actually asked to draw.
        this.statistics = {
            // Scene elements returned by the current camera visibility query.
            visibleElements: 0,
            // Triangle corners submitted for the visible opaque geometry.
            vertices: 0,
            // Point sources whose influence reaches the current view.
            lights: 0,
            // Nearby opaque candidates processed for source visibility this frame.
            shadowCandidates: 0,
            // Camera geometry buffers replaced this frame; unchanged static meshes stay resident.
            bufferUploads: 0,
            // Actual world/light/shadow GPU draw submissions, excluding final presentation.
            drawCalls: 0
        };
        // Bound handlers retain this renderer when the canvas dispatches GPU lifecycle events.
        this.handleContextLost = this.onContextLost.bind(this);
        // Keep the exact function reference for later listener removal.
        this.handleContextRestored = this.onContextRestored.bind(this);
    }

    /** Resolve shared services after Directory assembly; do not register an empty draw pass. */
    connect(directory) {
        // Scene elements are the authoritative geometry providers.
        this.scene = directory.systems.get('scene');
        // The output system owns the actual displayed canvas and its WebGL2 context.
        this.renderer = directory.systems.get('renderer');
        // Both systems use the same canvas object; no inter-canvas world copy is possible.
        this.canvas = this.renderer.canvas;
        // Retain the same live GPU context used for final presentation.
        this.graphics = this.renderer.graphics;
        // Artwork remains CPU-resident across context loss and restores textures on demand.
        this.artwork = directory.systems.get('artwork');
        // Listen before the first frame so early GPU loss is handled too.
        this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
        // Reuse the Lobby's existing schedule after the browser restores GPU availability.
        this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
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
        // Remember that the final GPU output schedule now owns this callback.
        this.active = true;
    }

    /** Remove the central pass when the scene becomes empty, keeping reusable GPU resources. */
    deactivate() {
        // Remove only the world pass, leaving independent screen preparation/UI callbacks intact.
        this.renderer.removePass('engine.world');
        // Scene unload must release retained buffer source references, even while the Lobby is stopped.
        this.cameraBatches.dispose();
        // Release independent source-view batch ownership under the same unload rule.
        this.shadowBatches.dispose();
        // Drop the last returned batch array so removed scene objects are not held through it.
        this.visibleBatches = [];
        // A later scene can reactivate the same renderer.
        this.active = false;
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

    /** Allocate retained GPU image/depth storage and reusable geometry/shadow buffers. */
    initialize() {
        // Keep GPU handles together for explicit disposal and context restoration.
        this.resources = {
            // Retain the completed world image on the GPU between display callbacks.
            frameTexture: this.graphics.createTexture(),
            // Physical visibility needs depth storage at the world's shading resolution.
            frameDepth: this.graphics.createRenderbuffer(),
            // Attach that color/depth storage to one reusable world rendering target.
            frameFramebuffer: this.graphics.createFramebuffer(),
            // Draw opaque color and attached surface emission into the depth buffer.
            baseProgram: this.createProgram(WorldShaders.baseFragmentSource),
            // Add point lighting only to the same visible fragments, with geometric shadows.
            lightProgram: this.createProgram(WorldShaders.lightFragmentSource),
            // The light's six views store nearest opaque geometry as radial depth.
            shadowProgram: this.createProgram(WorldShaders.shadowFragmentSource, WorldShaders.shadowVertexSource),
            // A depth cubemap covers every direction around one point source.
            shadowCube: this.graphics.createTexture(),
            // Render depth into one cubemap face at a time, without touching the world image.
            shadowFramebuffer: this.graphics.createFramebuffer()
        };
        // Force color/depth allocation even when restoring the same canvas dimensions.
        this.renderWidth = 0;
        // A new resource set has no valid retained image height either.
        this.renderHeight = 0;
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
        // Uploaded camera geometry handles were lost, but scene declarations remain authoritative.
        this.cameraBatches.restoreContext();
        // Source-facing geometry will rebuild its own buffers on next demand.
        this.shadowBatches.restoreContext();
        // Artwork texture handles were lost too; retain painted images for upload, not repaint.
        this.artwork.restoreContext();
        // A restored context must shade the scene again before reusing its finished image.
        this.cachedFrameKey = '';
    }

    /** Select a camera program and projection; each retained batch binds its own vertex data before drawing. */
    useProgram(program, depthRange) {
        // Keep the Graphics API owner explicit in every call below.
        const graphics = this.graphics;
        // Select the base or point-light fragment computation.
        graphics.useProgram(program);
        // Viewport and camera values use CSS pixels/world units, not backing pixel dimensions.
        graphics.uniform2f(graphics.getUniformLocation(program, 'uViewport'), this.renderer.viewportWidth, this.renderer.viewportHeight);
        // Framing moves the view window without changing the eye point used for height lean.
        graphics.uniform2f(graphics.getUniformLocation(program, 'uScreenOffset'), this.renderer.camera.screenOffsetX, this.renderer.camera.screenOffsetY);
        // Camera center addresses projected-world coordinates for both culling and drawing.
        graphics.uniform2f(graphics.getUniformLocation(program, 'uCamera'), this.renderer.camera.positionX, this.renderer.camera.positionY);
        // Camera zoom scales both projected axes consistently.
        graphics.uniform1f(graphics.getUniformLocation(program, 'uZoom'), this.renderer.camera.zoom);
        // Shared vertical projection must exactly match SceneSystem's visual bounds.
        graphics.uniform1f(graphics.getUniformLocation(program, 'uHeightScale'), this.basement.configuration.heightProjectionScale);
        // Select the same camera model used by public world/screen coordinate helpers.
        graphics.uniform1i(graphics.getUniformLocation(program, 'uRadial'), this.renderer.camera.projection === 'radial');
        // Original zoom-dependent altitude is computed once through the shared helper.
        graphics.uniform1f(graphics.getUniformLocation(program, 'uAltitude'), WorldProjection.altitude(this.renderer.camera));
        // Height emphasis is a camera setting, not a shader exception for a named building.
        graphics.uniform1f(graphics.getUniformLocation(program, 'uHeightExaggeration'), this.renderer.camera.heightExaggeration);
        // Fit visible depth into GPU clip range without relying on draw submission order.
        graphics.uniform1f(graphics.getUniformLocation(program, 'uDepthRange'), depthRange);
    }

    /** Bind one retained buffer's XYZ, normal, RGB, emission, and normalized image coordinates. */
    bindAttributes(program, vertexBuffer) {
        // Select the actual interleaved geometry allocation for this particular material batch.
        this.graphics.bindBuffer(this.graphics.ARRAY_BUFFER, vertexBuffer);
        // Each entry names an attribute, its float offset, and its component width.
        const attributes = [['aPosition', 0, 3], ['aNormal', 3, 3], ['aColor', 6, 3], ['aEmission', 9, 3], ['aTexCoord', 12, 2], ['aArtworkShade', 14, 4]];
        // “of” supplies tuple values; destructuring names each attribute property explicitly.
        // Stop after all six possible streams have been considered for this shader program.
        for (const [attributeName, floatOffset, componentCount] of attributes) {
            // The GPU compiler can remove streams unused by the current camera/source program.
            const location = this.graphics.getAttribLocation(program, attributeName);
            // Negative locations mean the linked shader does not consume this attribute.
            if (location < 0) {
                // Continue without issuing an invalid attribute-array command.
                continue;
            }
            // Enable this attribute's input stream before describing its layout.
            this.graphics.enableVertexAttribArray(location);
            // Eighteen floats occupy 72 bytes; texture coordinates use two components, not three.
            this.graphics.vertexAttribPointer(location, componentCount, this.graphics.FLOAT, false, 72, floatOffset * 4);
        }
    }

    /** Bind cached artwork/unlit/cutout settings for the same camera or shadow material. */
    useMaterial(program, material) {
        // Base artwork is optional; normal colored primitives require no generated texture.
        const artwork = material.artwork ? this.artwork.prepare(material.artwork) : null;
        // Visible emission uses another cached image on this exact same physical surface.
        const emission = material.emissionArtwork ? this.artwork.prepare(material.emissionArtwork) : null;
        // Unit zero remains reserved for a point light's depth cubemap.
        this.graphics.activeTexture(this.graphics.TEXTURE1);
        // Bind either the resident image or an explicit empty binding for ordinary material RGB.
        this.graphics.bindTexture(this.graphics.TEXTURE_2D, artwork);
        // Tell this program where its base artwork sampler reads.
        this.graphics.uniform1i(this.graphics.getUniformLocation(program, 'uArtwork'), 1);
        // Unit two keeps emission separate from base artwork and shadow visibility.
        this.graphics.activeTexture(this.graphics.TEXTURE2);
        // A missing emission image intentionally contributes nothing.
        this.graphics.bindTexture(this.graphics.TEXTURE_2D, emission);
        // Assign the emission sampler even when a program optimizes that uniform away.
        this.graphics.uniform1i(this.graphics.getUniformLocation(program, 'uEmissionArtwork'), 2);
        // Null uniforms are ignored by WebGL, permitting the same contract in the shadow program.
        this.graphics.uniform1i(this.graphics.getUniformLocation(program, 'uHasArtwork'), Boolean(artwork));
        // Explicit presence flags avoid allocating/uploading dummy one-pixel images.
        this.graphics.uniform1i(this.graphics.getUniformLocation(program, 'uHasEmissionArtwork'), Boolean(emission));
        // Unlit art preserves its original generated colors rather than applying primitive shading.
        this.graphics.uniform1i(this.graphics.getUniformLocation(program, 'uUnlit'), material.unlit);
        // The same alpha threshold controls visible fragments and source obstruction.
        this.graphics.uniform1f(this.graphics.getUniformLocation(program, 'uAlphaCutoff'), material.alphaCutoff);
        // Time-of-day updates a uniform; it does not regenerate the hotel's windows every frame.
        this.graphics.uniform1f(this.graphics.getUniformLocation(program, 'uNightAmount'), this.renderer.nightAmount);
    }

    /** Submit retained batches with their actual material images; return the actual draw count. */
    drawBatches(program, batches) {
        // Count only real triangle submissions, not per-element bookkeeping.
        let drawCount = 0;
        // “of” visits retained material batches and stops after the query's active batch list.
        for (const batch of batches) {
            // Select the physical geometry that belongs to this material interface.
            this.bindAttributes(program, batch.buffer);
            // Obtain resident images without repainting or reuploading clean artwork.
            this.useMaterial(program, batch.material);
            // Submit this retained triangle buffer under the stage's existing depth/blend policy.
            this.graphics.drawArrays(this.graphics.TRIANGLES, 0, batch.vertexCount);
            // Account for this real GPU submission.
            drawCount += 1;
        }
        // The calling camera/light stage adds this count to its own frame diagnostics.
        return drawCount;
    }

    /** Project, depth-test, shade, and present all visible opaque world geometry once. */
    draw(renderer) {
        // An unloaded scene or lost context must not submit obsolete or invalid GPU work.
        if (!this.active || this.contextLost) {
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
        // Resize the retained GPU target only when the shading allocation changes.
        this.resizeFrame(desiredWidth, desiredHeight);
        // Select the retained world color/depth target before any camera shading.
        this.graphics.bindFramebuffer(this.graphics.FRAMEBUFFER, this.resources.frameFramebuffer);
        // Use the world shading density, independently of the displayed canvas density.
        this.graphics.viewport(0, 0, this.renderWidth, this.renderHeight);
        // Read zoom once while constructing projected-world query bounds.
        const zoom = renderer.camera.zoom;
        // Camera coordinates are projected-world coordinates; Z was already included by Scene.
        const view = {
            // Left edge of the visible projected world.
            minimumX: Math.min(renderer.camera.positionX, renderer.camera.positionX - (renderer.viewportWidth / 2 + renderer.camera.screenOffsetX) / zoom),
            // Upper edge of the visible projected world.
            minimumY: Math.min(renderer.camera.positionY, renderer.camera.positionY - (renderer.viewportHeight / 2 + renderer.camera.screenOffsetY) / zoom),
            // Right edge of the visible projected world.
            maximumX: Math.max(renderer.camera.positionX, renderer.camera.positionX + (renderer.viewportWidth / 2 - renderer.camera.screenOffsetX) / zoom),
            // Lower edge of the visible projected world.
            maximumY: Math.max(renderer.camera.positionY, renderer.camera.positionY + (renderer.viewportHeight / 2 - renderer.camera.screenOffsetY) / zoom)
        };
        // Include shading allocation because resizing invalidates the retained GPU image.
        const frameKey = `${this.scene.revision}:${JSON.stringify(view)}:${desiredWidth}:${desiredHeight}:${renderer.backgroundColor.join(',')}:${JSON.stringify(renderer.camera)}:${renderer.nightAmount}:${this.artwork.revision}`;
        // An unchanged world needs only GPU presentation, not another geometry/light pass.
        if (frameKey === this.cachedFrameKey) {
            // No geometry or source-shadow work is submitted for this cached frame.
            this.statistics.drawCalls = 0;
            // Cached frames replace no geometry buffers either.
            this.statistics.bufferUploads = 0;
            // No shadow candidates are processed when the retained image is reused.
            this.statistics.shadowCandidates = 0;
            // Copy between GPU framebuffers directly into the displayed WebGL canvas.
            this.present(renderer);
            // Leave retained color/depth and geometry available for the next changed frame.
            return;
        }
        // Reset current-frame diagnostics before visibility and lighting work.
        this.statistics = {
            // Scene elements returned by the current camera visibility query.
            visibleElements: 0,
            // Triangle corners submitted for the visible opaque geometry.
            vertices: 0,
            // Point sources whose influence reaches the current view.
            lights: 0,
            // Nearby opaque candidates processed for source visibility this frame.
            shadowCandidates: 0,
            // Camera geometry buffers replaced this frame; unchanged static meshes stay resident.
            bufferUploads: 0,
            // Actual world/light/shadow GPU draw submissions, excluding final presentation.
            drawCalls: 0
        };
        // Query geometry using its actual height-expanded visual extent.
        const visible = this.scene.visibleGeometry.query(view).filter((element) => element.visible);
        // Stable IDs determine only exactly coplanar ties, never ordinary occlusion.
        visible.sort(WorldRendererSystem.compareElements);
        // Publish the number of actual visible scene elements.
        this.statistics.visibleElements = visible.length;
        // Prepare retained GPU batches; unchanged static geometry is neither assembled nor uploaded.
        this.visibleBatches = this.cameraBatches.prepare(visible);
        // Report actual current camera buffer replacements separately from draw submissions.
        this.statistics.bufferUploads = this.cameraBatches.uploadCount;
        // A generous minimum keeps nearby geometry within the clipping interval.
        this.depthRange = 100;
        // Count all submitted corners without reconstructing the already resident buffers.
        this.vertexCount = 0;
        // “of” visits current retained batches, finishing after every interface group.
        for (const batch of this.visibleBatches) {
            // Add the actual triangle corner count owned by this retained buffer.
            this.vertexCount += batch.vertexCount;
        }
        // Fit the clip range from visible physical bounds; this does not generate triangle data.
        // “of” visits element values and stops after the visibility query's results.
        for (const element of visible) {
            // Include both extrema of physical ground depth.
            for (const groundY of [element.bounds.minimumY, element.bounds.maximumY]) {
                // Include both physical elevation extrema for the same shared element geometry.
                for (const height of [element.transform.positionZ, element.transform.positionZ + element.geometry.height]) {
                    // Radial views order by physical Z; oblique views use their perpendicular axis.
                    const depth = renderer.camera.projection === 'radial' ? height : (groundY - renderer.camera.positionY) * this.basement.configuration.heightProjectionScale + height;
                    // Keep a numerical margin so valid corners do not lie on a clipping boundary.
                    this.depthRange = Math.max(this.depthRange, Math.abs(depth) * 1.05 + 1);
                }
            }
        }
        // Publish actual submitted camera vertices rather than total scene population.
        this.statistics.vertices = this.vertexCount;
        // The world target includes the opaque background; presentation needs no Canvas layer.
        this.graphics.clearColor(...renderer.backgroundColor, 1);
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
        this.statistics.drawCalls += this.drawBatches(this.resources.baseProgram, this.visibleBatches);
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
            // Use the same camera projection as actual world surfaces when bounding light work.
            const influence = WorldProjection.lightBounds(renderer, light);
            // Convert the leftmost CSS influence into clamped world-target backing pixels.
            const minimumX = Math.max(0, Math.floor(influence.minimumX * worldPixelRatio));
            // GPU Y starts at the bottom, so the lower CSS edge becomes the minimum GPU Y.
            const minimumY = Math.max(0, Math.floor((renderer.viewportHeight - influence.maximumY) * worldPixelRatio));
            // Keep right-side fragment work inside the retained world target.
            const maximumX = Math.min(this.renderWidth, Math.ceil(influence.maximumX * worldPixelRatio));
            // Convert the upper CSS influence into the opposite GPU Y edge.
            const maximumY = Math.min(this.renderHeight, Math.ceil((renderer.viewportHeight - influence.minimumY) * worldPixelRatio));
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
            this.statistics.drawCalls += this.drawBatches(this.resources.lightProgram, this.visibleBatches);
        }
        // Publish the number of sources considered by this frame's central light stage.
        this.statistics.lights = lights.length;
        // Leave no source-specific scissor restriction on later world frames.
        this.graphics.disable(this.graphics.SCISSOR_TEST);
        // Restore depth-write state for the next frame's clear/base pass.
        this.graphics.depthMask(true);
        // The retained world color is complete; present it through the same GPU context.
        this.present(renderer);
        // Reuse this finished GPU image until a tracked scene/view/allocation change.
        this.cachedFrameKey = frameKey;
    }

    /** Allocate world color/depth pixels when shading dimensions change; no CPU image copy. */
    resizeFrame(width, height) {
        // Matching dimensions mean the retained GPU storage is already suitable.
        if (width === this.renderWidth && height === this.renderHeight) {
            // Preserve both image contents and allocation on ordinary frames.
            return;
        }
        // Both color textures and depth renderbuffers must support the requested extent.
        const maximumSize = Math.min(this.graphics.getParameter(this.graphics.MAX_TEXTURE_SIZE), this.graphics.getParameter(this.graphics.MAX_RENDERBUFFER_SIZE));
        // Reject impossible image dimensions rather than silently producing an incomplete target.
        if (width > maximumSize || height > maximumSize) {
            // Let the caller reduce the declared output/shading density explicitly.
            throw new RangeError('World shading dimensions exceed this GPU texture capacity.');
        }
        // Bind the retained color texture before allocating or configuring its pixels.
        this.graphics.bindTexture(this.graphics.TEXTURE_2D, this.resources.frameTexture);
        // Allocate normalized RGBA storage entirely on the GPU; null supplies no CPU pixels.
        this.graphics.texImage2D(this.graphics.TEXTURE_2D, 0, this.graphics.RGBA8, width, height, 0, this.graphics.RGBA, this.graphics.UNSIGNED_BYTE, null);
        // No mipmap chain is needed for a viewport-sized retained image.
        this.graphics.texParameteri(this.graphics.TEXTURE_2D, this.graphics.TEXTURE_MIN_FILTER, this.graphics.LINEAR);
        // Smoothly enlarge a deliberately lower-density world image onto the output canvas.
        this.graphics.texParameteri(this.graphics.TEXTURE_2D, this.graphics.TEXTURE_MAG_FILTER, this.graphics.LINEAR);
        // Select depth storage for this world's exact shading dimensions.
        this.graphics.bindRenderbuffer(this.graphics.RENDERBUFFER, this.resources.frameDepth);
        // A 24-bit depth buffer resolves physical visibility independently from color.
        this.graphics.renderbufferStorage(this.graphics.RENDERBUFFER, this.graphics.DEPTH_COMPONENT24, width, height);
        // Attach the retained color and depth resources to their owned framebuffer.
        this.graphics.bindFramebuffer(this.graphics.FRAMEBUFFER, this.resources.frameFramebuffer);
        // Color attachment zero receives the world fragment shader's output.
        this.graphics.framebufferTexture2D(this.graphics.FRAMEBUFFER, this.graphics.COLOR_ATTACHMENT0, this.graphics.TEXTURE_2D, this.resources.frameTexture, 0);
        // The shared visibility test writes the retained depth attachment.
        this.graphics.framebufferRenderbuffer(this.graphics.FRAMEBUFFER, this.graphics.DEPTH_ATTACHMENT, this.graphics.RENDERBUFFER, this.resources.frameDepth);
        // Verify actual hardware support before presenting any supposedly valid world frame.
        if (this.graphics.checkFramebufferStatus(this.graphics.FRAMEBUFFER) !== this.graphics.FRAMEBUFFER_COMPLETE) {
            // Stop clearly rather than displaying stale output from an incomplete target.
            throw new Error('This GPU could not allocate the retained world framebuffer.');
        }
        // Remember the successfully allocated width in backing pixels.
        this.renderWidth = width;
        // Remember the successfully allocated height in backing pixels.
        this.renderHeight = height;
        // A reallocated color image must be shaded before reuse.
        this.cachedFrameKey = '';
    }

    /** Present retained world color to the actual output using one GPU-to-GPU image copy. */
    present(renderer) {
        // No source-specific clipping may limit the completed image's output region.
        this.graphics.disable(this.graphics.SCISSOR_TEST);
        // Read pixels directly from the retained GPU world target.
        this.graphics.bindFramebuffer(this.graphics.READ_FRAMEBUFFER, this.resources.frameFramebuffer);
        // Write into the displayed canvas's default GPU framebuffer.
        this.graphics.bindFramebuffer(this.graphics.DRAW_FRAMEBUFFER, null);
        // Scale world shading pixels to output pixels entirely on the GPU. This operation
        // copies only color; world visibility was already resolved by its physical depth.
        this.graphics.blitFramebuffer(0, 0, this.renderWidth, this.renderHeight, 0, 0, this.canvas.width, this.canvas.height, this.graphics.COLOR_BUFFER_BIT, this.graphics.LINEAR);
        // Restore both framebuffer bindings for later screen work or the next frame's clear.
        this.graphics.bindFramebuffer(this.graphics.FRAMEBUFFER, null);
        // Restore the full output viewport after lower-density world shading.
        this.graphics.viewport(0, 0, this.canvas.width, this.canvas.height);
        // Report the actual final-output GPU copy separately from world/shadow draw calls.
        renderer.drawCalls += 1;
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
        // Remove the world presentation callback before releasing resources it might use.
        this.deactivate();
        // Lifecycle listeners belong to the displayed canvas even if no world was shaded.
        if (this.canvas) {
            // Remove the exact bound context-loss listener.
            this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
            // Remove the corresponding restoration listener.
            this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
        }
        // Retained camera batches own independent GPU buffers and element references.
        this.cameraBatches.dispose();
        // Source-view batches must release their independent resources too.
        this.shadowBatches.dispose();
        // Lost contexts already own invalid handles, so ordinary deletion is unnecessary there.
        if (this.resources && !this.contextLost) {
            // Release retained world color pixels.
            this.graphics.deleteTexture(this.resources.frameTexture);
            // Release the world visibility depth storage.
            this.graphics.deleteRenderbuffer(this.resources.frameDepth);
            // Release the framebuffer joining world color and depth.
            this.graphics.deleteFramebuffer(this.resources.frameFramebuffer);
            // Release linked base shader resources.
            this.graphics.deleteProgram(this.resources.baseProgram);
            // Release the direct-light program.
            this.graphics.deleteProgram(this.resources.lightProgram);
            // Release the light-view shader program.
            this.graphics.deleteProgram(this.resources.shadowProgram);
            // Release the six-direction light visibility texture.
            this.graphics.deleteTexture(this.resources.shadowCube);
            // Release the target used to produce that visibility texture.
            this.graphics.deleteFramebuffer(this.resources.shadowFramebuffer);
        }
        // Do not retain disposed GPU handles.
        this.resources = null;
    }
}
