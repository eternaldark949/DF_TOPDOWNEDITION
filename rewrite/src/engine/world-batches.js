/**
 * GPU GEOMETRY BATCHES — retain uploaded triangles by material interface. Many
 * colored faces can share a batch within a retained/mutable bucket because their RGB is already in the vertex data.
 * Image pairs, unlit behavior, and alpha cutoff require separate GPU submissions.
 * Moving a small actor must not reconstruct or reupload an unchanged hotel's mesh.
 * This helper owns batch buffers only; it never paints artwork or schedules work.
 */
class WorldGeometryBatches {
    /** Retain the resource owner so restored contexts/resources are read when needed. */
    constructor(worldRenderer) {
        // Keep the actual parent object, not a snapshot of its initially absent GPU handles.
        this.worldRenderer = worldRenderer;
        // Map interface keys to retained GPU buffers and their source-reference snapshots.
        this.entries = new Map();
        // Count buffer replacements in the latest prepare operation for diagnostics/tests.
        this.uploadCount = 0;
    }

    /** Return retained batches for element values; rebuild only batches with changed members/data. */
    prepare(elements) {
        // Group only the current query's candidates, preserving their stable submission order.
        const groups = new Map();
        // Reset actual upload accounting for this query.
        this.uploadCount = 0;
        // “of” reads element values, stopping after every candidate in this camera/source query.
        for (const element of elements) {
            // Uniform interface settings determine which surfaces can share one GPU submission.
            const material = element.material;
            // Separate automatically tracked mutable objects from retained geometry before batching.
            // JSON preserves tuple boundaries even when an asset ID contains punctuation.
            const key = JSON.stringify([material.artwork, material.emissionArtwork, material.unlit, material.alphaCutoff, element.renderMutable]);
            // Allocate one temporary membership list for a previously unseen material interface.
            if (!groups.has(key)) {
                // The material reference supplies uniforms; RGB itself remains per vertex.
                groups.set(key, {material, elements: []});
            }
            // Retain this actual element in the interface group, without rebuilding its mesh.
            groups.get(key).elements.push(element);
        }
        // Collect current batches for the renderer while stale batches are released below.
        const batches = [];
        // “of” supplies [key,value] pairs; destructuring names the interface key and its group.
        // Stop after each group is prepared once, not once per element or triangle.
        for (const [key, group] of groups) {
            // Retrieve any previously uploaded geometry for this material interface.
            let batch = this.entries.get(key);
            // Matching counts are necessary before checking individual source references.
            let unchanged = Boolean(batch && batch.sources.length === group.elements.length);
            // Start with member zero, advance one member, and stop at the current group length.
            // An index compares each current element with the same retained slot.
            for (let memberIndex = 0; unchanged && memberIndex < group.elements.length; memberIndex += 1) {
                // Read the actual current scene element in this slot.
                const element = group.elements[memberIndex];
                // Read the reference/revision snapshot associated with the uploaded triangles.
                const source = batch.sources[memberIndex];
                // Any changed object, transform/geometry, or material reference invalidates this batch.
                unchanged = source.element === element && source.revision === element.geometryRevision && source.material === element.material && source.topMaterial === element.topMaterial;
            }
            // Only changed membership or source data authorizes CPU mesh assembly/GPU replacement.
            if (!unchanged) {
                // First use allocates a GPU buffer; later edits keep the existing buffer object.
                if (!batch) {
                    // Every property here belongs to this buffer's resource-lifetime record.
                    batch = {
                        // GPU allocation dedicated to this interface's interleaved triangles.
                        buffer: this.worldRenderer.graphics.createBuffer(),
                        // Source references will be recorded after successful mesh preparation.
                        sources: [],
                        // Number of triangle corners available for this buffer's next draw.
                        vertexCount: 0,
                        // Current material uniform settings are refreshed for every query.
                        material: group.material
                    };
                    // Register ownership immediately so ordinary disposal can release the buffer.
                    this.entries.set(key, batch);
                }
                // Accumulate only this changed batch, not the unchanged neighboring hotel geometry.
                const vertices = [];
                // Drop old source snapshots before publishing the new source membership.
                batch.sources = [];
                // “of” visits member values in stable order, ending after this interface's members.
                for (const element of group.elements) {
                    // Mesh generation itself is cached by each element's tracked revision/materials.
                    const mesh = this.worldRenderer.meshLibrary.build(element);
                    // “of” reads numeric vertex components and stops after this element's mesh.
                    // Explicit appending avoids a giant spread call exceeding JavaScript argument limits.
                    for (const component of mesh) {
                        // Append the next interleaved XYZ/normal/RGB/emission/UV component.
                        vertices.push(component);
                    }
                    // Capture references and revision numbers that correspond to these exact triangles.
                    batch.sources.push({
                        // The actual scene object, retained only while this visible batch exists.
                        element,
                        // Position/shape revision of the uploaded world geometry.
                        revision: element.geometryRevision,
                        // Material identity detects tracked replacement even without a position change.
                        material: element.material,
                        // Top material identity matters for ordinary box/circle surfaces too.
                        topMaterial: element.topMaterial
                    });
                }
                // Select this interface's retained GPU storage before replacing its contents.
                this.worldRenderer.graphics.bindBuffer(this.worldRenderer.graphics.ARRAY_BUFFER, batch.buffer);
                // Upload eighteen floats per corner only for the batch whose sources changed.
                this.worldRenderer.graphics.bufferData(this.worldRenderer.graphics.ARRAY_BUFFER, new Float32Array(vertices), this.worldRenderer.graphics.DYNAMIC_DRAW);
                // Convert the flat component count into the actual submitted vertex count.
                batch.vertexCount = vertices.length / 18;
                // Count one actual buffer replacement, not the number of elements it contains.
                this.uploadCount += 1;
            }
            // Current uniform settings follow the current group owner even when triangles are reused.
            batch.material = group.material;
            // Return the retained buffer for this query's rendering stage.
            batches.push(batch);
        }
        // “of” supplies cached [key,batch] pairs, ending after all retained interface keys.
        for (const [key, batch] of this.entries) {
            // Interfaces absent from this view/source must not retain their element references forever.
            if (!groups.has(key)) {
                // Release the no-longer-used GPU buffer through its context owner.
                this.worldRenderer.graphics.deleteBuffer(batch.buffer);
                // Removing the entry releases its source snapshots too.
                this.entries.delete(key);
            }
        }
        // Return only active buffers; frame orchestration owns actual shader/draw submission.
        return batches;
    }

    /** Forget lost handles without deleting invalid resources after browser GPU restoration. */
    restoreContext() {
        // The browser has already invalidated these handles; preserved scene data will rebuild them.
        this.entries.clear();
    }

    /** Release live GPU buffers and source references during ordinary renderer destruction. */
    dispose() {
        // “of” supplies batch values and stops once every currently retained buffer has been visited.
        for (const batch of this.entries.values()) {
            // Context loss already invalidates resources; ordinary live contexts require explicit release.
            if (!this.worldRenderer.contextLost) {
                // Free this batch's actual GPU allocation.
                this.worldRenderer.graphics.deleteBuffer(batch.buffer);
            }
        }
        // Release source references even when GPU handles were already lost.
        this.entries.clear();
    }
}
