/**
 * Basement / shaders: GPU-native instanced boxes and rounded shapes, with inexpensive
 * surface lighting. shapeVertex() (rounded-shapes.js) places both primitives.
 * Optional ambient visibility is supplied by the Basement occlusion capability.
 * No Canvas preparation, font atlas or external assets.
 * This is the first renderer material, not a full PBR material system.
 */
import { AMBIENT_VISIBILITY } from './occlusion-shaders.js';
import { SHADOW_VISIBILITY } from './shadow-shaders.js';
import { ROTATION_GLSL } from './rotation.js';
import { SHAPE_GLSL } from './rounded-shapes.js';

export const VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition; // box corner, or rounded-mesh parameters
layout(location=1) in vec3 aNormal;
// Per-instance layout, documented in renderer.js: pose/taper, dimensions/profile, color.
layout(location=2) in vec4 aPose;
layout(location=3) in vec4 aSize;
layout(location=4) in vec4 aColor;
layout(location=5) in vec4 aRotation;
layout(location=6) in vec4 aEmission; // linear emissive radiance / sharpness
layout(location=7) in vec4 aSpecular; // tint / normal-incidence reflectance
uniform mat4 uViewProjection;
${ROTATION_GLSL}
${SHAPE_GLSL}
out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
out vec3 vEmission;
flat out vec4 vSpecular;
flat out float vSharpness;
out float vHighlight;
void main() {
  vec3 local,normal;shapeVertex(aPosition,aNormal,aPose,aSize,local,normal);
  vec3 p=rotateByQuaternion(aRotation,local)+aPose.xyz;
  vWorld=p;vNormal=rotateByQuaternion(aRotation,normal);
  vColor = aColor.rgb;
  vEmission = aEmission.rgb;vHighlight=aColor.w;
  vSpecular=aSpecular;vSharpness=aEmission.w;
  gl_Position=uViewProjection*vec4(p,1.0);
}`;

export const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
in vec3 vEmission;
flat in vec4 vSpecular;
flat in float vSharpness;
uniform vec3 uCameraEye;
uniform vec3 uCameraBack;
uniform bool uPerspective;
in float vHighlight;
uniform bool uLinearOutput; // HDR scene target defers exposure/encoding to the compositor
uniform float uExposure;
uniform vec3 uAmbient;
uniform vec4 uLights[8]; // x/y/z, radius; radius 0 disables a slot
uniform vec3 uLightColors[8]; // linear RGB irradiance
out vec4 outColor;
${AMBIENT_VISIBILITY}
${SHADOW_VISIBILITY}
// Direct-light GGX microfacet lobe with Schlick Fresnel and Smith masking.
// Sharpness maps to perceptual roughness; the floor bounds singularities at polish=1.
// No environment texture/SSR/GI is implied. Zero reflectivity is an exact legacy bypass.
vec3 reflection(vec3 n,vec3 v,vec3 l,vec3 irradiance) {
  if(vSpecular.w<=0.0)return vec3(0.0);
  float nv=max(dot(n,v),0.0), nl=max(dot(n,l),0.0);
  if(nv<=0.0 || nl<=0.0)return vec3(0.0);
  vec3 h=normalize(v+l+vec3(0.000001));
  float nh=max(dot(n,h),0.0), vh=max(dot(v,h),0.0);
  float rough=max(0.08,1.0-vSharpness), a=rough*rough, a2=a*a;
  float d=nh*nh*(a2-1.0)+1.0;
  float distribution=a2/(3.14159265*d*d);
  // Smith GGX: alpha is roughness squared, with finite denominators at grazing angles.
  float gv=2.0*nv/(nv+sqrt(a2+(1.0-a2)*nv*nv));
  float gl=2.0*nl/(nl+sqrt(a2+(1.0-a2)*nl*nl));
  vec3 f0=vSpecular.rgb*vSpecular.w;
  // Scale the grazing term too: zero reflectivity really disables the lobe.
  vec3 fresnel=f0+(vec3(vSpecular.w)-f0)*pow(1.0-vh,5.0);
  return irradiance*fresnel*(distribution*gv*gl/max(4.0*nv,0.0001));
}
void main() {
  vec3 n = normalize(vNormal);
  vec3 view=uPerspective?normalize(uCameraEye-vWorld):normalize(uCameraBack);
  float sunVisible=sunVisibility(vWorld,n);
  vec3 specular=reflection(n,view,uSunDirection,uSunColor*sunVisible);
  // Occlusion attenuates ambient irradiance only, before exposure and display gamma.
  vec3 light = uAmbient * (0.65 + 0.35 * max(n.z, 0.0)) * ambientVisibility(vWorld,n);
  light += uSunColor * max(dot(n,uSunDirection),0.0) * sunVisible;
  for (int i=0; i<8; i++) {
    vec3 delta = uLights[i].xyz - vWorld;
    float distanceToLight = length(delta);
    float radius = uLights[i].w;
    if (radius > 0.0) {
      float falloff = max(0.0, 1.0 - distanceToLight / radius);
      float visibility=i==uPointShadowIndex?pointVisibility(vWorld,n):1.0;
      vec3 direction=normalize(delta+0.0001);
      vec3 irradiance=uLightColors[i]*visibility*falloff*falloff;
      light += irradiance * (0.25 + 0.75 * max(dot(n,direction),0.0));
      specular += reflection(n,view,direction,irradiance);
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
  vec3 linear = surface * light * (vec3(1.0)-vSpecular.rgb*vSpecular.w) + specular + vEmission + vec3(0.18,0.12,0.04)*vHighlight;
  // Soft exposure rolloff then display gamma. No claim of physical spectral accuracy.
  if(uLinearOutput){outColor=vec4(clamp(linear,vec3(0.0),vec3(65000.0)),1.0);return;}
  vec3 mapped = vec3(1.0) - exp(-linear * uExposure);
  outColor = vec4(pow(mapped, vec3(1.0 / 2.2)), 1.0);
}`;
