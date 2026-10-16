/**
 * Basement / occlusion shaders: local analytic box approximation and bounded SSAO.
 * Camera reconstruction uses the same inverse view/projection as visible geometry.
 * These are ambient visibility estimates, never a replacement for cast shadows.
 */

/** Shared world-position reconstruction. Depth texture values span [0,1], not world units. */
import { ROTATION_GLSL } from './rotation.js';

export const RECONSTRUCT = `
uniform mat4 uInverseViewProjection;
vec3 reconstruct(vec2 uv,float depth){vec4 p=uInverseViewProjection*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);return p.xyz/p.w;}`;

/** No lit color target is needed: retain normals plus hardware depth at bounded resolution. */
export const NORMAL_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vNormal;
out vec4 outColor;
void main(){outColor=vec4(normalize(vNormal)*0.5+0.5,1.0);}`;

/**
 * Deterministic eight-direction/two-distance neighborhood estimator. World-unit
 * radius prevents a fixed-pixel halo as zoom changes. No temporal noise/history.
 * Missing offscreen samples contribute no occlusion; foreground gaps are range-rejected.
 */
export const SSAO_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uDepth;
uniform sampler2D uNormals;
uniform float uRadius;
uniform mat4 uViewProjection;
uniform vec2 uProjectionScale;
out vec4 outColor;
${RECONSTRUCT}
void main(){
  float depth=texture(uDepth,vUV).r;
  if(depth>=0.99999){outColor=vec4(1.0);return;}
  vec3 p=reconstruct(vUV,depth);
  vec3 n=normalize(texture(uNormals,vUV).xyz*2.0-1.0);
  // clip.w is view depth in perspective, 1 in orthographic: radius stays in metres.
  vec2 radiusScale=uProjectionScale/(2.0*(uViewProjection*vec4(p,1.0)).w);
  float blocked=0.0;
  for(int i=0;i<8;i++){
    float angle=(float(i)+0.125)*0.7853981634;
    vec2 direction=vec2(cos(angle),sin(angle));
    for(int j=0;j<2;j++){
      float reach=uRadius*(j==0?0.3:0.8);
      vec2 uv=vUV+direction*reach*radiusScale;
      if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))continue;
      float other=texture(uDepth,uv).r;
      if(other>=0.99999)continue;
      vec3 delta=reconstruct(uv,other)-p;
      float distanceToSample=length(delta);
      // Bias is in world units and suppresses self-occlusion of nearly coplanar surfaces.
      float horizon=max(0.0,(dot(n,delta)-0.035)/max(distanceToSample,0.035));
      blocked+=horizon*(1.0-smoothstep(uRadius*0.25,uRadius,distanceToSample));
    }
  }
  float visibility=clamp(1.0-blocked*(2.8/16.0),0.35,1.0);
  outColor=vec4(visibility,0.0,0.0,1.0);
}`;

/**
 * Compact analytic box proxies cover nearby offscreen blockers too. For each OBB,
 * distance to its surface sets falloff; a nearest interior point estimates hemisphere
 * coverage. Ignore the receiver's own surface/inside, so a convex box never shades
 * itself as a cavity. This approximates solid-angle coverage, not a physical bake.
 */
export const AMBIENT_VISIBILITY = `
uniform int uAOMode; // 0 off, 1 analytic geometry, 2 analytic + screen contacts
uniform float uAOStrength;
uniform float uAORadius;
uniform int uBlockerCount;
uniform vec4 uBlockerPose[12]; // xyz center, padding
uniform vec4 uBlockerSize[12]; // half extents xyz, padding
uniform sampler2D uAOScreen;
uniform sampler2D uAODepth;
uniform sampler2D uAONormals;
uniform vec2 uAOSize;
${RECONSTRUCT}
${ROTATION_GLSL}
uniform vec4 uBlockerRotation[12];
float ambientVisibility(vec3 p,vec3 n){
  if(uAOMode==0||uAOStrength==0.0)return 1.0;
  float visibility=1.0;
  for(int i=0;i<12;i++){
    if(i>=uBlockerCount)break;
    vec4 pose=uBlockerPose[i];vec3 h=uBlockerSize[i].xyz;
    vec4 rotation=uBlockerRotation[i];
    vec3 q=rotateByQuaternion(vec4(-rotation.xyz,rotation.w),p-pose.xyz);
    vec3 outside=max(abs(q)-h,0.0);
    float gap=length(outside);
    if(gap<0.015||gap>=uAORadius)continue;
    // Aim slightly into the box rather than at a coplanar nearest point on its base.
    vec3 target=clamp(q,-h*0.75,h*0.75)-q;
    vec3 direction=rotateByQuaternion(rotation,target);
    float facing=max(0.0,dot(n,normalize(direction)));
    float coverage=1.0-smoothstep(0.0,uAORadius,gap);
    visibility*=1.0-0.48*coverage*facing;
  }
  visibility=max(visibility,0.40);
  if(uAOMode==2){
    // Four-tap depth/normal-aware upsampling preserves silhouettes of the full-res
    // MSAA forward pass. A low-res foreground sample must not darken a distant floor.
    vec2 uv=gl_FragCoord.xy/uAOSize;
    vec2 grid=uv*vec2(textureSize(uAOScreen,0))-0.5;
    vec2 base=floor(grid),f=fract(grid);
    float sum=0.0,weightSum=0.0;
    for(int y=0;y<2;y++)for(int x=0;x<2;x++){
      vec2 sampleUV=(base+vec2(x,y)+0.5)/vec2(textureSize(uAOScreen,0));
      float depth=texture(uAODepth,sampleUV).r;
      vec3 other=reconstruct(sampleUV,depth);
      vec3 normal=normalize(texture(uAONormals,sampleUV).xyz*2.0-1.0);
      float weight=(x==0?1.0-f.x:f.x)*(y==0?1.0-f.y:f.y);
      weight*=exp(-abs(dot(other-p,n))*30.0)*pow(max(dot(n,normal),0.0),8.0);
      sum+=texture(uAOScreen,sampleUV).r*weight;weightSum+=weight;
    }
    // max-strength combination avoids stacking two estimates of the same cavity.
    if(weightSum>0.0001)visibility=min(visibility,sum/weightSum);
  }
  return mix(1.0,visibility,uAOStrength);
}`;
