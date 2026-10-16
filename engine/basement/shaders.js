/**
 * Basement / shaders: GPU-native instanced boxes and inexpensive surface lighting.
 * Optional ambient visibility is supplied by the Basement occlusion capability.
 * No Canvas preparation, font atlas or external assets.
 * This is the first renderer material, not the final luxe/bloom renderer.
 */
import { AMBIENT_VISIBILITY } from './occlusion-shaders.js';
import { SHADOW_VISIBILITY } from './shadow-shaders.js';

export const VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
// Per-instance layout, documented in renderer.js: pose, dimensions/emission, color.
layout(location=2) in vec4 aPose;
layout(location=3) in vec4 aSize;
layout(location=4) in vec4 aColor;
uniform vec4 uCamera; // center x/y, visible half-width/half-height in world units
out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
out float vEmission;
void main() {
  float c = cos(aPose.w), s = sin(aPose.w);
  mat2 rotation = mat2(c, s, -s, c);
  vec3 p = aPosition * aSize.xyz;
  p.xy = rotation * p.xy;
  p += aPose.xyz;
  vWorld = p;
  vNormal = vec3(rotation * aNormal.xy, aNormal.z);
  vColor = aColor.rgb;
  vEmission = aSize.w;
  // Orthographic oblique camera. z is height; y is ground depth, never screen pixels.
  vec2 screen = vec2(p.x - uCamera.x, (p.y - uCamera.y) * 0.65 + p.z * 0.76);
  float depth = (p.y - uCamera.y) * 0.76 - p.z * 0.65;
  gl_Position = vec4(screen / uCamera.zw, depth / 200.0, 1.0);
}`;

export const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
in float vEmission;
uniform vec3 uAmbient;
uniform vec4 uLights[8]; // x/y/z, radius; radius 0 disables a slot
uniform vec3 uLightColors[8]; // linear RGB irradiance
out vec4 outColor;
${AMBIENT_VISIBILITY}
${SHADOW_VISIBILITY}
void main() {
  vec3 n = normalize(vNormal);
  // Occlusion attenuates ambient irradiance only, before exposure and display gamma.
  vec3 light = uAmbient * (0.65 + 0.35 * max(n.z, 0.0)) * ambientVisibility(vWorld,n);
  light += uSunColor * max(dot(n,uSunDirection),0.0) * sunVisibility(vWorld,n);
  for (int i=0; i<8; i++) {
    vec3 delta = uLights[i].xyz - vWorld;
    float distanceToLight = length(delta);
    float radius = uLights[i].w;
    if (radius > 0.0) {
      float falloff = max(0.0, 1.0 - distanceToLight / radius);
      float visibility=i==uPointShadowIndex?pointVisibility(vWorld,n):1.0;
      light += uLightColors[i] * visibility * falloff * falloff * (0.25 + 0.75 * max(dot(n, normalize(delta + 0.0001)), 0.0));
    }
  }
  vec3 surface = vColor;
  // A procedural stone-joint pattern on horizontal low surfaces. It is evaluated
  // in world coordinates, so resizing never rebuilds or rasterizes floor textures.
  if (vWorld.z < 0.01 && n.z > 0.9) {
    vec2 tile = abs(fract(vWorld.xy / 2.0 + 0.5) - 0.5);
    float joint = smoothstep(0.475, 0.495, max(tile.x, tile.y));
    surface *= 1.0 - joint * 0.30;
  }
  vec3 linear = surface * light + vColor * vEmission;
  // Soft exposure rolloff then display gamma. No claim of physical spectral accuracy.
  vec3 mapped = vec3(1.0) - exp(-linear * 1.25);
  outColor = vec4(pow(mapped, vec3(1.0 / 2.2)), 1.0);
}`;
