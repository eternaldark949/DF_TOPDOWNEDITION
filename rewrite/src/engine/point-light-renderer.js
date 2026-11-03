/**
 * DIRECTORY RENDER BACKEND — produce point-light visibility from shared opaque meshes.
 * Each source uses six depth views, then the world renderer samples that visibility.
 * The helper borrows its parent's GPU resources; it owns no extra scheduler or scene.
 */
class PointLightRenderer {
    /** Retain the owner, not copies of GPU handles that may not exist yet or may be restored. */
    constructor(parentRenderer) {
        // Later methods follow this reference to the owner's current resources.
        this.parentRenderer = parentRenderer;
    }

    /** Render nearby opaque geometry into six point-light depth views, independent of camera. */
    renderShadowMap(light) {
        // Read the live parent renderer now, after its GPU resources have been initialized.
        // Keeping the parent reference does not snapshot its earlier null graphics/resources.
        const renderer = this.parentRenderer;
        // Query actual world-ground obstruction bounds, not camera-visible objects.
        const candidates = renderer.scene.shadowGeometry.query({
            // Leftmost possible source reach on the physical ground plane.
            minimumX: light.positionX - light.radius,
            // Farthest-back possible source reach.
            minimumY: light.positionY - light.radius,
            // Rightmost possible source reach.
            maximumX: light.positionX + light.radius,
            // Farthest-forward possible source reach.
            maximumY: light.positionY + light.radius
        });
        // Filter only explicit visibility/shadow exceptions and nonintersecting height ranges.
        const blockers = candidates.filter((element) => element.visible && element.castsShadow && element.transform.positionZ <= light.positionZ + light.radius && element.transform.positionZ + element.geometry.height >= light.positionZ - light.radius);
        // Report real nearby geometry rather than a fixed shader-array capacity.
        renderer.statistics.shadowCandidates += blockers.length;
        // Collect actual surface triangles; static per-element meshes are reused from WeakMap.
        const vertices = [];
        // “of” retrieves each nearby element value and stops after the spatial result list.
        for (const element of blockers) {
            // The very same opaque geometry participates in camera depth and light visibility.
            vertices.push(...renderer.meshLibrary.build(element));
        }
        // Twelve floats encode each interleaved position/normal/material vertex.
        const vertexCount = vertices.length / 12;
        // Select the buffer dedicated to this light's nearby obstruction geometry.
        renderer.graphics.bindBuffer(renderer.graphics.ARRAY_BUFFER, renderer.resources.shadowVertexBuffer);
        // Upload a contiguous geometry list without an artificial blocker-count limit.
        renderer.graphics.bufferData(renderer.graphics.ARRAY_BUFFER, new Float32Array(vertices), renderer.graphics.DYNAMIC_DRAW);
        // Use the six-view point-light projection rather than the camera projection.
        const program = renderer.resources.shadowProgram;
        // Select the radial-depth shader pair.
        renderer.graphics.useProgram(program);
        // Shadow rendering needs positions only; other interleaved attributes are ignored.
        const positionAttribute = renderer.graphics.getAttribLocation(program, 'aPosition');
        // Enable the positional vertex stream.
        renderer.graphics.enableVertexAttribArray(positionAttribute);
        // Read three position floats at the start of each 48-byte vertex record.
        renderer.graphics.vertexAttribPointer(positionAttribute, 3, renderer.graphics.FLOAT, false, 48, 0);
        // Supply source XYZ and radius to both shadow stages.
        renderer.graphics.uniform4f(renderer.graphics.getUniformLocation(program, 'uShadowLight'), light.positionX, light.positionY, light.positionZ, light.radius);
        // Light visibility must not be limited by the camera/source's screen scissor rectangle.
        renderer.graphics.disable(renderer.graphics.SCISSOR_TEST);
        // Shadow depth replaces nearest distance, so additive blending is inappropriate here.
        renderer.graphics.disable(renderer.graphics.BLEND);
        // Enable nearest-surface depth testing within each light view.
        renderer.graphics.enable(renderer.graphics.DEPTH_TEST);
        // Nearest source-facing geometry wins independently of submission order.
        renderer.graphics.depthFunc(renderer.graphics.LESS);
        // Each face needs to store its nearest obstruction distance.
        renderer.graphics.depthMask(true);
        // Use the configured bounded shadow resolution, independent of screen density.
        const shadowSize = renderer.basement.configuration.shadowMapSize;
        // Render into a separate target without touching the preserved world color/depth.
        renderer.graphics.bindFramebuffer(renderer.graphics.FRAMEBUFFER, renderer.resources.shadowFramebuffer);
        // This framebuffer intentionally contains no color attachments.
        renderer.graphics.drawBuffers([renderer.graphics.NONE]);
        // A depth-only framebuffer has no readable color attachment either.
        renderer.graphics.readBuffer(renderer.graphics.NONE);
        // Each cubemap face has the same square resolution.
        renderer.graphics.viewport(0, 0, shadowSize, shadowSize);
        // Process the six face definitions in the cubemap's documented direction order.
        // The counted index chooses the target face and its matching basis vectors.
        for (let faceIndex = 0; faceIndex < WorldShaders.cubeFaces.length; faceIndex += 1) {
            // Read this face's forward, right, and up directions.
            const face = WorldShaders.cubeFaces[faceIndex];
            // Attach exactly this cube face as the current light-depth target.
            renderer.graphics.framebufferTexture2D(renderer.graphics.FRAMEBUFFER, renderer.graphics.DEPTH_ATTACHMENT, renderer.graphics.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex, renderer.resources.shadowCube, 0);
            // Hardware must support the actual depth target, not merely compile shaders.
            if (renderer.graphics.checkFramebufferStatus(renderer.graphics.FRAMEBUFFER) !== renderer.graphics.FRAMEBUFFER_COMPLETE) {
                // Refuse a broken shadow path instead of leaking light through opaque geometry.
                throw new Error('This GPU could not create the point-light depth framebuffer.');
            }
            // Reset this direction to unobstructed maximum distance.
            renderer.graphics.clearDepth(1);
            // Clear only this face's depth; the world color image remains untouched.
            renderer.graphics.clear(renderer.graphics.DEPTH_BUFFER_BIT);
            // Orient a ninety-degree view along the current cubemap direction.
            renderer.graphics.uniform3fv(renderer.graphics.getUniformLocation(program, 'uForward'), face.forward);
            // Match cubemap sampling's horizontal face convention.
            renderer.graphics.uniform3fv(renderer.graphics.getUniformLocation(program, 'uRight'), face.right);
            // Match cubemap sampling's vertical face convention.
            renderer.graphics.uniform3fv(renderer.graphics.getUniformLocation(program, 'uUp'), face.up);
            // Ordinary surface triangles populate this light-facing depth view.
            renderer.graphics.drawArrays(renderer.graphics.TRIANGLES, 0, vertexCount);
            // Count actual shadow submissions alongside base/light submissions.
            renderer.statistics.drawCalls += 1;
        }
        // Return to the camera-facing world framebuffer before direct illumination.
        renderer.graphics.bindFramebuffer(renderer.graphics.FRAMEBUFFER, renderer.resources.frameFramebuffer);
        // Restore the camera image's actual pixel dimensions.
        renderer.graphics.viewport(0, 0, renderer.renderWidth, renderer.renderHeight);
        // Lighting must revisit exactly the previously visible camera surface.
        renderer.graphics.depthFunc(renderer.graphics.EQUAL);
        // Preserve established camera depth while adding illumination.
        renderer.graphics.depthMask(false);
        // Point-source RGB contributions add on the already visible surface.
        renderer.graphics.enable(renderer.graphics.BLEND);
        // Preserve base alpha while accumulating reflected source color.
        renderer.graphics.blendFuncSeparate(renderer.graphics.ONE, renderer.graphics.ONE, renderer.graphics.ZERO, renderer.graphics.ONE);
        // Select the same camera geometry/projection as the base world image.
        renderer.useProgram(renderer.resources.lightProgram, renderer.depthRange);
        // Bind the completed six-direction visibility map to texture unit zero.
        renderer.graphics.activeTexture(renderer.graphics.TEXTURE0);
        // Sampling direction now directly finds the nearest source obstruction.
        renderer.graphics.bindTexture(renderer.graphics.TEXTURE_CUBE_MAP, renderer.resources.shadowCube);
        // Tell direct lighting which sampler contains its source visibility.
        renderer.graphics.uniform1i(renderer.graphics.getUniformLocation(renderer.resources.lightProgram, 'uShadowMap'), 0);
    }

}
