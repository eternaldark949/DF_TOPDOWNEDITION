/**
 * DEVELOPMENT ASSET EXPORT — run the original game's unchanged Canvas painters in
 * a preparation-only browser, then return PNG pixels and explicit local XYZ/UV
 * surfaces. This callback is never shipped as the running world renderer. Its
 * result is generated asset data; the reusable engine knows no original painter
 * names, tier sorting rules, or hotel-specific glow passes.
 */
() => {
    // The original factory supplies authored tiers, heights, signs, and courtyard configuration.
    const hotel = createDoubleNightsHotel(0, 0);
    // Reuse the original tier exposure calculation so covered/shared wall portions stay covered.
    const tiers = hotel._tkGeo().tiers;
    // Named PNG data is kept separately from placed surface definitions.
    const images = {};
    // Each surface declares actual physical corners, direction, and material image addresses.
    const surfaces = [];

    /** Store one completed source Canvas image as an embedded PNG and return its asset address. */
    function storeImage(identifier, canvas) {
        // PNG preserves source pixels and alpha; no paths are translated into GPU instructions.
        images[identifier] = canvas.toDataURL('image/png');
        // Stable names let multiple faces reuse the same wall strip instead of duplicating images.
        return identifier;
    }

    /** Record one physical polygon/quad and its appearance; actual triangulation is reusable tooling. */
    function appendSurface(identifier, corners, normal, material, castsShadow = true) {
        // Store explicit fields so source data can be inspected independently of its renderer.
        surfaces.push({
            // Unique local address under a placed asset instance.
            id: identifier,
            // Local [world X,world Y,world Z,image U,image V] corners in perimeter order.
            corners,
            // Physical face direction used by illumination.
            normal,
            // Image addresses, color, and optional original face tint.
            material,
            // Alpha-cutout decorative layers may deliberately omit source-shadow casting.
            castsShadow
        });
    }

    /** Describe unchanged source artwork with optional cached night emission on the same surface. */
    function imageMaterial(artwork, emissionArtwork = null) {
        // Source RGB remains authored image RGB rather than acquiring extra primitive ambient shading.
        return {
            // White leaves cached source channels unchanged before original face tint.
            color: '#ffffff',
            // Stable address of the shared base image.
            artwork,
            // Stable address of the optional self-lit night image.
            emissionArtwork,
            // Preserve the original painter's shading; additional direct illumination is intentionally off.
            unlit: true
        };
    }

    // “of” reads tier values from the original layout, stopping after every authored tier.
    for (const tier of tiers) {
        // The original painter creates one day strip and one night strip around this tier's perimeter.
        const artwork = hotel._tkArt(tier);
        // Store the original wall strip once, even when many faces sample different portions of it.
        const dayIdentifier = storeImage(`${tier.id}.walls.day`, artwork.day);
        // Store night pixels separately so a time-of-day uniform can change without repainting.
        const nightIdentifier = storeImage(`${tier.id}.walls.night`, artwork.lit);
        // Count wall faces from zero, stopping before the face count and advancing one face each time.
        for (let faceIndex = 0; faceIndex < tier.faces.length; faceIndex += 1) {
            // Read this exposed portion of an original wall edge.
            const face = tier.faces[faceIndex];
            // Convert its starting perimeter distance into a normalized image column.
            const firstU = face.u0 * artwork.S / artwork.day.width;
            // Convert the edge's ending distance into the corresponding image column.
            const secondU = (face.u0 + face.L) * artwork.S / artwork.day.width;
            // Source strip rows run downward from the tier's top design height.
            const bottomV = (tier.z1 - face.z0) * artwork.S / artwork.day.height;
            // The exposed top can differ from the full tier top where neighboring geometry clips a face.
            const topV = (tier.z1 - face.z1) * artwork.S / artwork.day.height;
            // Reference this tier's two reusable images instead of copying a texture per normal direction.
            const material = imageMaterial(dayIdentifier, nightIdentifier);
            // Original wall shading used this RGB overlay, separate from visible window emission.
            const shadeChannels = tier.shade || [6, 16, 18];
            // map visits shade RGB values in order; division converts bytes into normalized channels.
            const normalizedShade = shadeChannels.map((channel) => channel / 255);
            // Preserve the original face's direction-dependent tint in per-vertex material data.
            material.artworkShade = [...normalizedShade, 0.03 + 0.4 * hotel._tkTurn(face)];
            // Convert authored heights through the original kit's two-world-units/design-unit scale.
            appendSurface(`${tier.id}.wall.${faceIndex}`, [
                // First bottom corner chooses the wall strip's beginning and lower row.
                [face.x1, face.y1, face.z0 * TierKit.Z_SCALE, firstU, bottomV],
                // Second bottom corner selects its ending image column.
                [face.x2, face.y2, face.z0 * TierKit.Z_SCALE, secondU, bottomV],
                // Second top corner uses the exposed upper elevation and row.
                [face.x2, face.y2, face.z1 * TierKit.Z_SCALE, secondU, topV],
                // First top corner completes the same physical wall quad.
                [face.x1, face.y1, face.z1 * TierKit.Z_SCALE, firstU, topV]
            ], [face.nx, face.ny, 0], material);
        }
        // Not every tier needs a painted upper surface.
        if (tier.roof) {
            // Reuse the original roof painter and its padded image bounds.
            const dayRoof = hotel._tkRoof(tier, false);
            // Each roof image retains the original pool, slate, glass ribs, lettering, and border pixels.
            const roofDayIdentifier = storeImage(`${tier.id}.roof.day`, dayRoof.cv);
            // Start with no extra night image unless this authored roof actually supplies one.
            let roofNightIdentifier = null;
            // The original tier flag identifies roofs with their own visible night detail.
            if (tier.roofGlow) {
                // The original emissive painter generates only its intended light pixels.
                roofNightIdentifier = storeImage(`${tier.id}.roof.night`, hotel._tkRoof(tier, true).cv);
            }
            // Retain padded image borders; alpha cutout supplies the exact painted roof silhouette.
            appendSurface(`${tier.id}.roof`, [
                // Image top-left is the original painter's world-space padded bound.
                [dayRoof.x, dayRoof.y, tier.z1 * TierKit.Z_SCALE, 0, 0],
                // Top-right advances one complete normalized image width.
                [dayRoof.x + dayRoof.w, dayRoof.y, tier.z1 * TierKit.Z_SCALE, 1, 0],
                // Bottom-right advances one complete normalized image height.
                [dayRoof.x + dayRoof.w, dayRoof.y + dayRoof.h, tier.z1 * TierKit.Z_SCALE, 1, 1],
                // Bottom-left completes the height plane without flattening the whole building.
                [dayRoof.x, dayRoof.y + dayRoof.h, tier.z1 * TierKit.Z_SCALE, 0, 1]
            ], [0, 0, 1], imageMaterial(roofDayIdentifier, roofNightIdentifier));
        }
        // Count authored cornices/ledges from zero, advancing once and stopping at the supplied list length.
        for (let ledgeIndex = 0; ledgeIndex < (tier.ledges || []).length; ledgeIndex += 1) {
            // Each ledge has its own actual elevation, thickness, outward reach, and colors.
            const ledge = tier.ledges[ledgeIndex];
            // For each ledge, visit the tier's exposed faces once in their original perimeter order.
            for (let faceIndex = 0; faceIndex < tier.faces.length; faceIndex += 1) {
                // Only exposed portions can carry visible ledge geometry.
                const face = tier.faces[faceIndex];
                // Match the original test for a ledge outside this face's visible vertical interval.
                if (ledge.z <= face.z0 + 0.5 || ledge.z > face.z1 + 0.5) {
                    // Continue to the next exposed face without manufacturing hidden trim.
                    continue;
                }
                // Whole-edge ends reuse the original corner join; clipped ends extend along the face normal.
                const firstOuter = face.atA ? hotel._tkMitre(tier, face.edge, ledge.out) : [face.x1 + face.nx * ledge.out, face.y1 + face.ny * ledge.out];
                // Wrap the second corner to the polygon's first corner when this is its final edge.
                const secondOuter = face.atB ? hotel._tkMitre(tier, (face.edge + 1) % tier.poly.length, ledge.out) : [face.x2 + face.nx * ledge.out, face.y2 + face.ny * ledge.out];
                // Physical ledge bottom cannot extend below the tier's own lower elevation.
                const bottom = Math.max(tier.z0, ledge.z - ledge.th) * TierKit.Z_SCALE;
                // Convert its upper elevation through the same source height scale.
                const top = ledge.z * TierKit.Z_SCALE;
                // Original ledge fronts darken according to face direction.
                const brightness = 1 - 0.5 * hotel._tkTurn(face);
                // map visits RGB byte values, converting the original shaded color into #rrggbb.
                const color = '#' + ledge.band.map((channel) => Math.round(channel * brightness).toString(16).padStart(2, '0')).join('');
                // Stable local addresses distinguish two physical faces of this same ledge section.
                const identifier = `${tier.id}.ledge.${ledgeIndex}.${faceIndex}`;
                // The outer front is a true vertical band, so it participates in shared camera depth.
                appendSurface(`${identifier}.band`, [
                    // First lower outer corner; UV is unused by this colored material.
                    [...firstOuter, bottom, 0, 1],
                    // Second lower outer corner.
                    [...secondOuter, bottom, 1, 1],
                    // Second upper outer corner.
                    [...secondOuter, top, 1, 0],
                    // First upper outer corner.
                    [...firstOuter, top, 0, 0]
                ], [face.nx, face.ny, 0], {color, unlit: true});
                // Its top is another physical height plane, joining the wall to the outer band.
                appendSurface(`${identifier}.top`, [
                    // First inner corner lies on the original wall edge.
                    [face.x1, face.y1, top, 0, 0],
                    // Second inner corner follows that same exposed wall edge.
                    [face.x2, face.y2, top, 1, 0],
                    // Second outer corner extends the top outward.
                    [...secondOuter, top, 1, 1],
                    // First outer corner completes the original joined trim footprint.
                    [...firstOuter, top, 0, 1]
                ], [0, 0, 1], {color: ledge.top, unlit: true});
            }
        }
    }
    // Prepare the same forecourt resolution used by the original LandmarkKit sprite.
    const courtyardCanvas = document.createElement('canvas');
    // Original world width 820 at 1.5 image pixels per world unit.
    courtyardCanvas.width = 1230;
    // Original world height 542 at the same image density.
    courtyardCanvas.height = 813;
    // Canvas 2D is used only for this development-time image generation.
    const courtyardContext = courtyardCanvas.getContext('2d');
    // Move the original world origin (-10,318) onto the image origin and apply source resolution.
    courtyardContext.setTransform(1.5, 0, 0, 1.5, 15, -318 * 1.5);
    // Run the original paving, garden, medallion, puddle, and lamp-footing instructions unchanged.
    hotel._dnPaintGround(courtyardContext);
    // Store that completed image once, independently from its placed surface.
    const courtyardIdentifier = storeImage('forecourt', courtyardCanvas);
    // A small physical offset avoids an exactly coplanar tie with other ground surfaces.
    appendSurface('forecourt', [[-10,318,0.01,0,0],[810,318,0.01,1,0],[810,860,0.01,1,1],[-10,860,0.01,0,1]], [0,0,1], imageMaterial(courtyardIdentifier), false);
    // Preserve source helpers before temporarily capturing their explicitly declared height planes.
    const originalFlat = LandmarkKit.flat;
    // Height is needed for exported geometry, not for rendering an already camera-projected screenshot.
    const originalHeightScale = hotel._tkK;
    /** Return the authored height so flat-plane callbacks can record their physical elevation. */
    hotel._tkK = (height) => height;
    // Give captured layers unique addresses even when several occur on one tier.
    let layerIndex = 0;
    // filter visits original tiers and retains only the dome and topiary flat-plane painters.
    const layeredTiers = tiers.filter((tier) => tier.id === 'crown' || tier.id.startsWith('topi'));
    // “of” supplies retained tier values and stops after each source layered painter is captured.
    for (const tier of layeredTiers) {
        // A source painter may draw foliage or an emblem beyond the tier's base footprint.
        const margin = 40;
        // Destructuring names the original footprint's four world-coordinate extrema.
        const [minimumX, minimumY, maximumX, maximumY] = tier.box;
        /** Capture one original flat-plane callback as an image at its declared height. */
        LandmarkKit.flat = (ignoredContext, height, paint) => {
            // Pad the original footprint so source circles/ornament are not clipped during generation.
            const positionX = minimumX - margin;
            // Apply the same image padding on the ground-depth axis.
            const positionY = minimumY - margin;
            // Include both horizontal margins in the reusable image's world extent.
            const width = maximumX - minimumX + margin * 2;
            // Include both vertical margins too.
            const depth = maximumY - minimumY + margin * 2;
            // This is an independent image-generation canvas, never a world frame canvas.
            const canvas = document.createElement('canvas');
            // Two source pixels per world unit preserve small gold/foliage details.
            canvas.width = Math.ceil(width * 2);
            // Use equal image density along the other ground axis.
            canvas.height = Math.ceil(depth * 2);
            // Obtain the context for this one original flat-plane paint callback.
            const context = canvas.getContext('2d');
            // Let source code draw in its original world coordinates inside this padded image.
            context.setTransform(2, 0, 0, 2, -positionX * 2, -positionY * 2);
            // Run original Canvas instructions once; no path interception/tessellation occurs.
            paint(context);
            // Use the current layer number before advancing it for the next plane.
            const identifier = `${tier.id}.detail.${layerIndex}`;
            // Keep identifiers distinct across all captured source layers.
            layerIndex += 1;
            // Store the exact source plane pixels as a reusable image.
            const artworkIdentifier = storeImage(identifier, canvas);
            // Actual world height controls this alpha-cutout plane's depth against roofs and walls.
            appendSurface(identifier, [[positionX,positionY,height*TierKit.Z_SCALE,0,0],[positionX+width,positionY,height*TierKit.Z_SCALE,1,0],[positionX+width,positionY+depth,height*TierKit.Z_SCALE,1,1],[positionX,positionY+depth,height*TierKit.Z_SCALE,0,1]], [0,0,1], imageMaterial(artworkIdentifier), false);
        };
        // Direct view-dependent outline strokes are not exported as a whole-object screenshot.
        const scratchContext = document.createElement('canvas').getContext('2d');
        // The source top painter supplies each static flat layer to the capture boundary above.
        tier.top(scratchContext, false, tier, hotel);
    }
    // Restore source helper behavior before returning from this preparation-only operation.
    hotel._tkK = originalHeightScale;
    // The original LandmarkKit remains usable for reference rendering after export.
    LandmarkKit.flat = originalFlat;
    // Prepare the source section volumes with physical heights from the corresponding authored tiers.
    const suppliedVolumes = hotel.sections.map(
        /** Convert one original ground section into an explicit static-box asset declaration. */
        (section, index) => ({
            // Local volume address under a placed instance.
            id: `solid-${index}`,
            // Convert the original section's upper-left X into a box center coordinate.
            positionX: section.x + section.w / 2,
            // Convert its upper-left ground Y into the corresponding box center.
            positionY: section.y + section.h / 2,
            // Preserve the source section's physical width exactly.
            width: section.w,
            // Preserve its physical ground-depth extent.
            depth: section.h,
            // The first wings, core, and remaining rotunda bands share their source tier heights.
            height: (index < 2 ? DN.Z.WING : index === 2 ? DN.Z.CORE : DN.Z.ROT) * TierKit.Z_SCALE
        })
    );
    // The original final rounded-tip band has zero width; keep it recorded rather than hiding the defect.
    const ignoredDegenerateVolumes = suppliedVolumes.filter((volume) => volume.width <= 0 || volume.depth <= 0);
    // Zero-area source bands have no physical volume; reject no valid geometry and invent no replacement.
    const collisions = suppliedVolumes.filter((volume) => volume.width > 0 && volume.depth > 0);
    /** Add a thin physical trim bar between two XYZ points using a colored quad. */
    function appendBar(identifier, first, second, width, color) {
        // Vertical members need horizontal thickness; horizontal members use vertical thickness.
        const vertical = Math.abs(second[2] - first[2]) > Math.hypot(second[0] - first[0], second[1] - first[1]);
        // A bar's width is a physical world dimension, not an arbitrary painter priority.
        const offset = vertical ? [width / 2, 0, 0] : [0, 0, width / 2];
        // Convert one endpoint into a quad corner using the chosen thickness direction.
        const firstLower = first.map((value, componentIndex) => value - offset[componentIndex]);
        // The corresponding opposite thickness side begins at the same endpoint.
        const firstUpper = first.map((value, componentIndex) => value + offset[componentIndex]);
        // Obtain both thickness sides at the segment's second endpoint.
        const secondLower = second.map((value, componentIndex) => value - offset[componentIndex]);
        // The final endpoint completes the thin physical rectangle.
        const secondUpper = second.map((value, componentIndex) => value + offset[componentIndex]);
        // Compute the bar's actual tangent from its physical endpoints.
        const tangent = second.map((value, componentIndex) => value - first[componentIndex]);
        // The cross product gives a real face direction perpendicular to tangent and thickness.
        const cross = [tangent[1]*offset[2]-tangent[2]*offset[1],tangent[2]*offset[0]-tangent[0]*offset[2],tangent[0]*offset[1]-tangent[1]*offset[0]];
        // Normalize that direction so a future reflective material receives physically oriented light.
        const normal = cross.map((component) => component / Math.hypot(...cross));
        // UV is unused because original iron/gold colors are stored directly in this material.
        appendSurface(identifier, [[...firstLower,0,1],[...secondLower,1,1],[...secondUpper,1,0],[...firstUpper,0,0]], normal, {color, unlit:true});
    }

    // filter selects source canopy tiers that declare cresting; no engine identity rule is involved.
    const canopies = tiers.filter((tier) => tier.id === 'canW' || tier.id === 'canE');
    // “of” supplies each authored canopy and stops after both iron-framed entrances.
    for (const canopy of canopies) {
        // The source painter excludes the rear edge lying on the wing's wall.
        const points = canopy.poly.filter((point) => Math.abs(point[1] - DN.ROT[2]) > 0.5);
        // Original cresting starts on the canopy top and rises four design units above it.
        const lowerHeight = canopy.z1 * TierKit.Z_SCALE;
        // The upper rail uses the same physical/design conversion as every wall.
        const railHeight = (canopy.z1 + 4) * TierKit.Z_SCALE;
        // Count source points from zero, advancing one and stopping after the curved front is complete.
        for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
            // Read the original curved-front perimeter location.
            const point = points[pointIndex];
            // Source posts alternate a small ornamental rise above the upper rail.
            const postHeight = (canopy.z1 + 4 + (pointIndex % 2 ? 0 : 1.6)) * TierKit.Z_SCALE;
            // A real iron member connects two actual physical heights at this ground location.
            appendBar(`${canopy.id}.crest.post.${pointIndex}`, [point[0],point[1],lowerHeight], [point[0],point[1],postHeight], 0.9, DN.C.iron);
            // The first point has no preceding point to connect with an upper-rail segment.
            if (pointIndex > 0) {
                // Read the preceding curve point without wrapping across the source's open rear edge.
                const previous = points[pointIndex - 1];
                // Retain a static rail segment instead of reprojecting a Path2D each display frame.
                appendBar(`${canopy.id}.crest.rail.${pointIndex}`, [previous[0],previous[1],railHeight], [point[0],point[1],railHeight], 0.9, DN.C.iron);
            }
        }
    }
    /** Record one supported solid volume from the same source fixture dimensions/heights. */
    function appendVolume(identifier, positionX, positionY, width, depth, height) {
        // Plain data enters the same generic static-body declaration path as main building sections.
        collisions.push({
            // Stable local address under the placed source asset instance.
            id: identifier,
            // Physical box center along the source world's X axis.
            positionX,
            // Physical box center along the source world's ground-depth axis.
            positionY,
            // Full horizontal extent in physical world units.
            width,
            // Full ground-depth extent in physical world units.
            depth,
            // Upward physical extent above ground zero, matching visible source geometry.
            height
        });
    }

    // Count the four authored lamps by index so every fixture gets a stable local address.
    for (let lampIndex = 0; lampIndex < DN.LAMPS.length; lampIndex += 1) {
        // Destructuring names the source lamp's local ground position.
        const [positionX, positionY] = DN.LAMPS[lampIndex];
        // Original banners point outward toward the nearest side of the courtyard.
        const side = positionX < 400 ? -1 : 1;
        // The lower iron column has four world units of thickness.
        appendBar(`lamp.${lampIndex}.base`, [positionX,positionY,0], [positionX,positionY,12], 4, DN.C.iron);
        // The upper pole narrows to the original 1.8-world-unit column width.
        appendBar(`lamp.${lampIndex}.pole`, [positionX,positionY,12], [positionX,positionY,68], 1.8, DN.C.iron);
        // Source arm height is thirty design units, converted to actual world elevation.
        appendBar(`lamp.${lampIndex}.arm`, [positionX,positionY,60], [positionX+side*9,positionY,60], 0.8, DN.C.iron);
        // The original lantern's warm body spans design elevations 34 through 42.
        appendBar(`lamp.${lampIndex}.lantern`, [positionX,positionY,68], [positionX,positionY,84], 5.2, '#efe0b0');
        // A compact dark top preserves the source cap's silhouette without a view-dependent circle stamp.
        appendBar(`lamp.${lampIndex}.cap`, [positionX-2.8,positionY,88], [positionX+2.8,positionY,88], 1.2, DN.C.iron);
        // Prepare the source banner colors/emblem once in its own two-dimensional artwork space.
        const bannerCanvas = document.createElement('canvas');
        // Four pixels per world unit preserve this seven-unit-wide flag's small gold emblem.
        bannerCanvas.width = 28;
        // Banner height is 14.5 design units; image space keeps the original painter's proportions.
        bannerCanvas.height = 58;
        // Obtain only this reusable banner image's Canvas drawing context.
        const bannerContext = bannerCanvas.getContext('2d');
        // Draw in original local world/design coordinates rather than backing pixels.
        bannerContext.scale(4,4);
        // The original banner is black lacquer with a gold outline.
        bannerContext.fillStyle = '#121016';
        // Begin the source pennant's five-corner silhouette at the upper-left image origin.
        bannerContext.beginPath();
        // Top-left corner starts the seven-unit-wide banner.
        bannerContext.moveTo(0,0);
        // Top-right corner finishes its horizontal top edge.
        bannerContext.lineTo(7,0);
        // Lower-right corner reaches the source's 14.5-unit hanging length.
        bannerContext.lineTo(7,14.5);
        // The central notch rises by the source's 2.5 design units.
        bannerContext.lineTo(3.5,12);
        // Lower-left completes the hanging pennant shape.
        bannerContext.lineTo(0,14.5);
        // Close the outline before filling its original lacquer color.
        bannerContext.closePath();
        // Fill this source artwork once during preparation.
        bannerContext.fill();
        // Use the original gold outline color.
        bannerContext.strokeStyle = DN.C.goldDk;
        // The original outline has 0.6 source units of thickness.
        bannerContext.lineWidth = 0.6;
        // Stroke the existing pennant path; it is never translated into runtime GPU paths.
        bannerContext.stroke();
        // The original emblem is painted with the same unchanged crescent helper as the hotel's sign.
        bannerContext.fillStyle = DN.C.gold;
        // Place the emblem at the source banner's midpoint and original 2.6-unit radius.
        _dnEmblem(bannerContext,3.5,5,2.6);
        // Store the original-style fixture detail as one reusable image resource.
        const bannerIdentifier = storeImage(`lamp.${lampIndex}.banner`,bannerCanvas);
        // Map that image onto its actual vertical physical hanging plane, not a late overlay.
        appendSurface(`lamp.${lampIndex}.banner`, [[positionX+side*2,positionY,59,0,0],[positionX+side*9,positionY,59,1,0],[positionX+side*9,positionY,30,1,1],[positionX+side*2,positionY,30,0,1]], [0,1,0], imageMaterial(bannerIdentifier));
        // Retain the source pole's six-by-six collision footprint with its real fixture height.
        appendVolume(`lamp-solid-${lampIndex}`,positionX,positionY,6,6,88);
    }
    // Count source topiary planters so ordinary bodies match the visible decorative locations.
    for (let planterIndex = 0; planterIndex < DN.TOPI.length; planterIndex += 1) {
        // Source clipped foliage rises 26 design units above a seven-design-unit pot.
        appendVolume(`planter-solid-${planterIndex}`,DN.TOPI[planterIndex][0],DN.TOPI[planterIndex][1],14,14,66);
    }
    // The original sign plinth is a separate solid volume with the same height as its painted faces.
    appendVolume('plinth-solid',DN.PLINTH[0]+DN.PLINTH[2]/2,DN.PLINTH[1]+DN.PLINTH[3]/2,DN.PLINTH[2],DN.PLINTH[3],DN.Z.PLINTH*TierKit.Z_SCALE);
    // Return generated data only; the original game renderer/classes are not included in the artifact.
    return {
        // Human-readable identity of this real source asset.
        label: 'Double Nights Hotel',
        // Source-authored view emphasis belongs to the asset proof, not to a hotel-specific engine default.
        heightExaggeration: hotel.hero,
        // Named reusable PNGs, embedded later by the one-file build.
        images,
        // Explicit local geometry references those images through ordinary material declarations.
        surfaces,
        // Supported solid volumes use the same physical units as those surfaces.
        collisions,
        // Preserve known zero-area input so the preparation decision can be audited.
        ignoredDegenerateVolumes,
        // Record the implementation boundary rather than claiming a full game/animation migration.
        source: 'Original Canvas painters; no old frame renderer is shipped.'
    };
}
