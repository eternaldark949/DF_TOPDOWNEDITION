/**
 * Basement / shadow shaders: retained instanced depth geometry and filtered visibility.
 * Shadow visibility affects its corresponding direct light only. Ambient AO and emission
 * remain separate. PCF has a fixed kernel; it is not area-light penumbra simulation.
 */
export const SHADOW_VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=2) in vec4 aPose;
layout(location=3) in vec4 aSize;
uniform mat4 uLightMatrix;
void main(){
  float c=cos(aPose.w),s=sin(aPose.w);
  vec3 p=aPosition*aSize.xyz;
  p.xy=mat2(c,s,-s,c)*p.xy;
  gl_Position=uLightMatrix*vec4(p+aPose.xyz,1.0);
}`;

/** Depth-only framebuffers have no color attachment or fragment color work. */
export const SHADOW_FRAGMENT=`#version 300 es
precision highp float;
void main(){}`;

/**
 * Raw depth samplers permit portable explicit PCF with standard WebGL2 formats.
 * Sun and cube use independent texture units, including when their branches are off.
 * Biases and filter radii are expressed in world units, not arbitrary depth fractions.
 */
export const SHADOW_VISIBILITY=`
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform int uSunShadowEnabled;
uniform mat4 uSunMatrix;
uniform sampler2D uSunShadow;
uniform vec4 uShadowParameters; // receiver bias, normal bias, world filter radius, sun half-extent
uniform int uPointShadowIndex;
uniform samplerCube uPointShadow;
uniform vec4 uPointShadowParameters; // near, far, bias, filter radius in world units
uniform float uPointShadowResolution;
uniform vec3 uPointShadowPosition; // position actually captured in the cached cube
// Bilinear interpolation of depth COMPARISONS, not depth values. Four offset taps
// provide continuous soft edges (16 comparisons) without blending occluder depths.
float sunTap(vec2 uv,float reference,vec2 gradient,vec2 origin){
  vec2 dimensions=vec2(textureSize(uSunShadow,0));
  vec2 pixel=uv*dimensions-0.5,base=floor(pixel),fraction=fract(pixel);
  float visibility=0.0;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){
    vec2 center=(base+vec2(x,y)+0.5)/dimensions;
    float planeReference=reference+dot(gradient,center-origin);
    float visible=any(lessThan(center,vec2(0.0)))||any(greaterThan(center,vec2(1.0)))?1.0:step(planeReference,texture(uSunShadow,center).r);
    visibility+=visible*(x==0?1.0-fraction.x:fraction.x)*(y==0?1.0-fraction.y:fraction.y);
  }
  return visibility;
}
float sunVisibility(vec3 p,vec3 n){
  if(uSunShadowEnabled==0)return 1.0;
  vec3 coord=(uSunMatrix*vec4(p+n*uShadowParameters.y,1.0)).xyz*0.5+0.5;
  // Receiver-plane depth correction compares each texel at its actual world-plane
  // intersection, removing nearest-texel slope acne without a large detached bias.
  vec3 dx=dFdx(coord),dy=dFdy(coord);
  float determinant=dx.x*dy.y-dx.y*dy.x;
  vec2 gradient=abs(determinant)>1e-10?vec2(dy.y*dx.z-dx.y*dy.z,dx.x*dy.z-dy.x*dx.z)/determinant:vec2(0.0);
  if(any(lessThan(coord,vec3(0.0)))||any(greaterThan(coord,vec3(1.0))))return 1.0;
  float bias=uShadowParameters.x*(1.0+2.0*(1.0-max(dot(n,uSunDirection),0.0)))/(uShadowParameters.w*4.0);
  float reference=coord.z-bias;
  float radius=uShadowParameters.z/(uShadowParameters.w*2.0);
  float visibility=0.0;
  for(int i=0;i<4;i++){
    vec2 offset=vec2((i&1)==0?-0.5:0.5,(i&2)==0?-0.5:0.5);
    visibility+=sunTap(coord.xy+offset*radius,reference,gradient,coord.xy);
  }
  return visibility*0.25;
}
// Snap a direction to the selected cube face's texel center. Explicit face orientation
// matches shadow-math.js and GL cube sampling, including seams and negative faces.
vec3 cubeTexelRay(vec3 d){
  vec3 a=abs(d);vec2 uv;int face;
  if(a.x>=a.y&&a.x>=a.z){face=d.x>0.0?0:1;uv=vec2(d.x>0.0?-d.z:d.z,-d.y)/a.x;}
  else if(a.y>=a.z){face=d.y>0.0?2:3;uv=vec2(d.x,d.y>0.0?d.z:-d.z)/a.y;}
  else{face=d.z>0.0?4:5;uv=vec2(d.z>0.0?d.x:-d.x,-d.y)/a.z;}
  vec2 pixel=clamp(floor((uv*0.5+0.5)*uPointShadowResolution),vec2(0.0),vec2(uPointShadowResolution-1.0));
  uv=(pixel+0.5)/uPointShadowResolution*2.0-1.0;
  if(face==0)return vec3(1.0,-uv.y,-uv.x);
  if(face==1)return vec3(-1.0,-uv.y,uv.x);
  if(face==2)return vec3(uv.x,1.0,uv.y);
  if(face==3)return vec3(uv.x,-1.0,-uv.y);
  if(face==4)return vec3(uv.x,-uv.y,1.0);
  return vec3(-uv.x,-uv.y,-1.0);
}
float pointVisibility(vec3 p,vec3 n){
  vec3 delta=p+n*uShadowParameters.y-uPointShadowPosition;
  float major=max(max(abs(delta.x),abs(delta.y)),abs(delta.z));
  float near=uPointShadowParameters.x,far=uPointShadowParameters.y;
  if(major<=near||major>=far)return 1.0;
  vec3 direction=normalize(delta),axis=abs(direction.z)<0.9?vec3(0,0,1):vec3(0,1,0);
  vec3 tangent=normalize(cross(direction,axis)),bitangent=cross(direction,tangent);
  float visibility=0.0,radius=uPointShadowParameters.w;
  for(int i=0;i<4;i++){
    vec2 offset=vec2((i&1)==0?-0.5:0.5,(i&2)==0?-0.5:0.5);
    vec3 ray=cubeTexelRay(delta+radius*(tangent*offset.x+bitangent*offset.y));
    // Intersect the sample ray with the receiver's local plane. Comparing its own
    // perspective depth prevents the receiver from shadowing itself across a PCF tap.
    float denominator=dot(n,ray);
    float distanceAlongRay=abs(denominator)>0.0001?dot(n,delta)/denominator:-1.0;
    if(distanceAlongRay<=near||distanceAlongRay>=far){visibility+=1.0;continue;}
    float adjusted=max(near,distanceAlongRay-uPointShadowParameters.z);
    float reference=far/(far-near)-far*near/((far-near)*adjusted);
    visibility+=step(reference,texture(uPointShadow,ray).r);
  }
  return visibility*0.25;
}`;
