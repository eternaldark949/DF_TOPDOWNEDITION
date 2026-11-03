/**
 * RENDER BACKEND LIBRARY — readable GPU programs and point-light view bases.
 * This module only declares source text and shared directions. It creates no GPU
 * context, schedules no work, and contains no game content or object-type exceptions.
 */
// Keep shader definitions under one descriptive library address.
const WorldShaders = {};

/**
 * GLSL is the browser GPU's shader language, not another JavaScript framework.
 * A vertex shader runs per submitted corner; a fragment shader computes a candidate pixel.
 * vec2/vec3/vec4 contain two/three/four numbers. “in” receives data, “out” supplies results,
 * and “uniform” is a shared setting supplied by JavaScript. “discard” rejects a pixel.
 * Depth testing determines which candidate surface actually appears in the image.
 */
WorldShaders.vertexSource = `#version 300 es
// Vertex calculations use high precision for world coordinates and depth agreement.
precision highp float;
// Actual world X, Y, Z, shared with physical element geometry.
in vec3 aPosition;
// Actual surface normal, used for illumination rather than visual layer guessing.
in vec3 aNormal;
// Reflective surface RGB in normalized channels.
in vec3 aColor;
// Luminous surface RGB, attached to this surface's geometry.
in vec3 aEmission;
// Normalized image coordinates; U selects columns and V selects source rows.
in vec2 aTexCoord;
// Optional source face tint is per vertex so multiple wall directions share resident batches.
in vec4 aArtworkShade;
// CSS-pixel dimensions of the final view.
uniform vec2 uViewport;
// CSS framing offset is independent from the physical eye point that controls height lean.
uniform vec2 uScreenOffset;
// Projected-world view center, matching the output renderer's camera.
uniform vec2 uCamera;
// CSS pixels per world unit.
uniform float uZoom;
// Upward screen displacement per unit of physical Z.
uniform float uHeightScale;
// Fits physical camera depth into the GPU clipping interval.
uniform float uDepthRange;
// One selects the original game's radial height projection; zero selects oblique mode.
uniform bool uRadial;
// Virtual camera altitude, already adjusted for current zoom by the shared helper.
uniform float uAltitude;
// Height exaggeration applies uniformly across this camera, not by building identity.
uniform float uHeightExaggeration;
// World coordinates interpolated across the visible triangle for lighting.
out vec3 vPosition;
// Surface normal interpolated across the same triangle.
out vec3 vNormal;
// Reflective color delivered to fragment shading.
out vec3 vColor;
// Emission delivered through the same depth-tested fragment path.
out vec3 vEmission;
// Carry artwork coordinates through the same triangle as its physical depth.
out vec2 vTexCoord;
// Original source face shade belongs to base artwork, not to visible night emission.
out vec4 vArtworkShade;
// Project a world vertex while preserving a separate perpendicular camera depth.
void main() {
    // Height moves a visible point upward without changing its physical Y coordinate.
    vec2 projected = vec2(aPosition.x, aPosition.y - aPosition.z * uHeightScale);
    // Radial projection enlarges both ground offsets at each physical elevation.
    if (uRadial) {
        // Match the original upper-height clamp and explicitly clamp below-ground lean to zero.
        float height = clamp(aPosition.z, 0.0, uAltitude * 0.86);
        // Apply the original hotel's lean formula through a reusable camera setting.
        float scale = 1.0 + (uAltitude / (uAltitude - height) - 1.0) * uHeightExaggeration;
        // Express the enlarged ground offset in projected world coordinates.
        projected = uCamera + (aPosition.xy - uCamera) * scale;
    }
    // Convert projected world coordinates to centered normalized device coordinates.
    vec2 screen = ((projected - uCamera) * uZoom + uScreenOffset) * 2.0 / uViewport;
    // Greater camera-facing depth should produce a smaller GPU depth value.
    float depth = -(uRadial ? aPosition.z : ((aPosition.y - uCamera.y) * uHeightScale + aPosition.z)) / uDepthRange;
    // Public screen Y points down, while normalized device Y points up.
    gl_Position = vec4(screen.x, -screen.y, depth, 1.0);
    // Preserve actual physical coordinates for point-light distance and obstruction tests.
    vPosition = aPosition;
    // Forward the physical normal unchanged.
    vNormal = aNormal;
    // Forward reflective color unchanged.
    vColor = aColor;
    // Forward surface emission unchanged.
    vEmission = aEmission;
    // Explicit mesh UV values are retained; curves are never translated from Canvas per frame.
    vTexCoord = aTexCoord;
    // Preserve original wall tint without generating a texture copy for each face normal.
    vArtworkShade = aArtworkShade;
}`;

// All world fragment programs share the cached-image interface and alpha-cutout rule.
WorldShaders.materialFragmentSource = `
// Image coordinates interpolated over the same physical triangle used by depth testing.
in vec2 vTexCoord;
// Cached base artwork, bound to texture unit one rather than the shadow cubemap unit.
uniform sampler2D uArtwork;
// Cached visible night emission, attached to this surface rather than a global overlay.
uniform sampler2D uEmissionArtwork;
// Missing artwork uses ordinary material colors without requiring a dummy image allocation.
uniform bool uHasArtwork;
// Missing emission artwork contributes no additional night pixels.
uniform bool uHasEmissionArtwork;
// Painted assets may preserve their original colors independently of ambient lighting.
uniform bool uUnlit;
// Alpha below the declared threshold is a hole in this surface, not blended transparency.
uniform float uAlphaCutoff;
// Shared time-of-day amount controls the visible cached emission without regenerating artwork.
uniform float uNightAmount;
// Return actual cached source pixels, or opaque white for ordinary colored geometry.
vec4 readArtwork() {
    // Default material RGB already lives in the vertex stream.
    vec4 artwork = uHasArtwork ? texture(uArtwork, vTexCoord) : vec4(1.0);
    // A cutout pixel must write neither visible color nor camera/source depth.
    if (artwork.a < uAlphaCutoff) discard;
    // Return source RGB and coverage to the particular lighting stage.
    return artwork;
}
`;

// Base color and emission are one opaque fragment, so roofs automatically hide both.
WorldShaders.baseFragmentSource = `#version 300 es
// High precision keeps the fragment interface consistent with the common vertex shader.
precision highp float;
${WorldShaders.materialFragmentSource}
// Interpolated world surface normal.
in vec3 vNormal;
// Reflective surface color.
in vec3 vColor;
// Self-emitted color; it does not illuminate unrelated geometry by itself.
in vec3 vEmission;
// Source face tint interpolated on the same triangle as artwork and physical height.
in vec4 vArtworkShade;
// Global ambient illumination level.
uniform float uAmbient;
// Output for the currently visible opaque fragment.
out vec4 outputColor;
// Shade only a fragment that passed the central depth buffer.
void main() {
    // A modest fixed directional term makes otherwise unlit surface orientation readable.
    float facing = max(0.0, dot(normalize(vNormal), normalize(vec3(-0.4, -0.4, 1.0))));
    // Read original painted RGB after applying the shared alpha-cutout visibility rule.
    vec4 artwork = readArtwork();
    // Unlit painted assets retain their source colors; ordinary primitives retain ambient shading.
    float illumination = uUnlit ? (1.0 - 0.55 * uNightAmount) : (uAmbient + 0.18 * facing);
    // Preserve straight-alpha light image RGB by multiplying its coverage before addition.
    vec4 emission = uHasEmissionArtwork ? texture(uEmissionArtwork, vTexCoord) : vec4(0.0);
    // Match the original face's colored shade overlay without altering its cached image.
    vec3 paintedColor = mix(artwork.rgb * vColor, vArtworkShade.rgb, vArtworkShade.a);
    // Every contribution belongs to the same physical fragment and the same depth test.
    outputColor = vec4(paintedColor * illumination + vEmission + emission.rgb * emission.a * uNightAmount, 1.0);
}`;

// Cubemap directions follow OpenGL's +X, -X, +Y, -Y, +Z, -Z face convention.
WorldShaders.cubeFaces = [
    // Positive X looks right in world space; its image-right axis points toward negative Z.
    { forward: [1, 0, 0], right: [0, 0, -1], up: [0, -1, 0] },
    // Negative X reverses the forward and horizontal axes consistently.
    { forward: [-1, 0, 0], right: [0, 0, 1], up: [0, -1, 0] },
    // Positive Y uses world Z as this face's upward image direction.
    { forward: [0, 1, 0], right: [1, 0, 0], up: [0, 0, 1] },
    // Negative Y reverses that vertical image direction.
    { forward: [0, -1, 0], right: [1, 0, 0], up: [0, 0, -1] },
    // Positive Z looks upward from the source.
    { forward: [0, 0, 1], right: [1, 0, 0], up: [0, -1, 0] },
    // Negative Z looks downward toward ground surfaces.
    { forward: [0, 0, -1], right: [-1, 0, 0], up: [0, -1, 0] }
];

// Light-view projection is separate from the camera projection but uses identical world vertices.
WorldShaders.shadowVertexSource = `#version 300 es
// Preserve enough precision for world coordinates and radial depth.
precision highp float;
// Read actual surface XYZ from the same scene mesh used by the camera.
in vec3 aPosition;
// Alpha-cutout artwork must obstruct light only where its actual image contains a surface.
in vec2 aTexCoord;
// Carry the artwork coordinates through the light-facing physical triangle.
out vec2 vTexCoord;
// Point source XYZ and maximum physical reach.
uniform vec4 uShadowLight;
// Current cubemap face's viewing direction.
uniform vec3 uForward;
// Current cubemap face's image-right direction.
uniform vec3 uRight;
// Current cubemap face's image-up direction.
uniform vec3 uUp;
// Pass actual world position to radial-distance storage.
out vec3 vPosition;
// Project each corner into a ninety-degree point-light view.
void main() {
    // Express this world corner relative to the source.
    vec3 local = aPosition - uShadowLight.xyz;
    // Perspective W is distance along the face's viewing axis.
    float forward = dot(local, uForward);
    // A small near plane avoids division at the source itself.
    float nearPlane = min(0.1, uShadowLight.w * 0.01);
    // The light's physical radius supplies its far clipping plane.
    float farPlane = uShadowLight.w;
    // Map the near/far face distances into the standard perspective clip interval.
    float clipDepth = forward * (farPlane + nearPlane) / (farPlane - nearPlane) - 2.0 * farPlane * nearPlane / (farPlane - nearPlane);
    // A ninety-degree field of view needs no extra horizontal/vertical focal scale.
    gl_Position = vec4(dot(local, uRight), dot(local, uUp), clipDepth, forward);
    // Preserve world coordinates for radial rather than face-axis depth storage.
    vPosition = aPosition;
    // Match the camera's image coverage when deciding source visibility.
    vTexCoord = aTexCoord;
}`;

// One radial depth value gives a shared obstruction distance in every source direction.
WorldShaders.shadowFragmentSource = `#version 300 es
// Radial distance must match the receiving-surface comparison precision.
precision highp float;
${WorldShaders.materialFragmentSource}
// Interpolated actual surface position.
in vec3 vPosition;
// Point source XYZ and its radius.
uniform vec4 uShadowLight;
// Store nearest radial geometry depth without any color output.
void main() {
    // Reject alpha holes before writing this source-facing geometry depth.
    readArtwork();
    // Normalize physical source-to-surface distance into the depth texture's zero-to-one range.
    gl_FragDepth = length(vPosition - uShadowLight.xyz) / uShadowLight.w;
}`;

// Direct illumination samples the central source-visibility map instead of looping over blockers per pixel.
WorldShaders.lightFragmentSource = `#version 300 es
// Keep geometric distance, normals, and depth comparisons in high precision.
precision highp float;
${WorldShaders.materialFragmentSource}
// Actual receiving-surface world position.
in vec3 vPosition;
// Physical receiving-surface normal.
in vec3 vNormal;
// Reflective material RGB, independent of self-emission.
in vec3 vColor;
// Point source XYZ and physical radius.
uniform vec4 uLight;
// Normalized source RGB and brightness multiplier.
uniform vec4 uLightColor;
// Six nearest-geometry depth images centered at the source.
uniform highp samplerCube uShadowMap;
// Face resolution determines angular sampling precision, not object-specific lighting rules.
uniform float uShadowMapSize;
// Additive RGB result for a fragment that already passed camera-depth equality.
out vec4 outputColor;
// Evaluate this source on the same visible physical surface as the base pass.
void main() {
    // Baked unlit artwork deliberately opts out of additional physical illumination.
    if (uUnlit) discard;
    // Sample the same visible material coverage as the base and shadow passes.
    vec4 artwork = readArtwork();
    // Include physical height when measuring source distance and orientation.
    vec3 toLight = uLight.xyz - vPosition;
    // Euclidean distance bounds the declared source influence.
    float distanceToLight = length(toLight);
    // No illumination exists beyond the source radius or at a degenerate zero-length direction.
    if (distanceToLight >= uLight.w || distanceToLight < 0.0001) discard;
    // Surface orientation prevents a source below a roof from lighting its upward face.
    float facing = max(0.0, dot(normalize(vNormal), toLight / distanceToLight));
    // Back-facing surfaces receive no direct contribution from this source.
    if (facing <= 0.0) discard;
    // Cubemap direction points outward from the source toward this receiving point.
    float closestDistance = texture(uShadowMap, -toLight).r * uLight.w;
    // Convert two angular texels and receiving-plane slope into a world-distance tolerance.
    float depthBias = max(0.05, distanceToLight * 2.0 / uShadowMapSize * sqrt(max(0.0, 1.0 - facing * facing)) / max(facing, 0.1));
    // Nearer opaque geometry blocks the source regardless of gameplay identity.
    if (distanceToLight - depthBias > closestDistance) discard;
    // Smoothly attenuate the source to zero at its physical radius.
    float attenuation = pow(1.0 - distanceToLight / uLight.w, 2.0);
    // Illuminate this surface's reflective color while preserving its base alpha during blending.
    outputColor = vec4(artwork.rgb * vColor * uLightColor.rgb * uLightColor.a * attenuation * facing, 0.0);
}`;
