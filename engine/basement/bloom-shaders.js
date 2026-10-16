/** Basement / linear-light bloom pyramid. Bright energy is extracted before tone mapping.
 * Stable spatial filters only: no history, noise textures, Canvas assets or frame jitter. */
/** Thirteen overlapping taps reduce aliasing of narrow signs before the first reduction.
 * Soft-knee extraction occurs per source sample so tiny bright geometry survives averaging. */
export const BLOOM_DOWN = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform bool uExtract;
uniform vec2 uThreshold; // threshold and relative knee
out vec4 outColor;
vec3 sampleAt(vec2 p){
 vec3 c=max(texture(uSource,p).rgb,vec3(0.0));
 if(!uExtract)return c;
 float brightness=max(c.r,max(c.g,c.b)),k=uThreshold.x*uThreshold.y;
 float soft=clamp(brightness-uThreshold.x+k,0.0,2.0*k);
 soft=soft*soft/(4.0*k+0.00001);
 return c*(max(brightness-uThreshold.x,soft)/max(brightness,0.00001));
}
void main(){
 vec2 t=1.0/vec2(textureSize(uSource,0));vec3 c=sampleAt(vUV)*0.125;
 c+=(sampleAt(vUV+t*vec2(-2,-2))+sampleAt(vUV+t*vec2(2,-2))+sampleAt(vUV+t*vec2(-2,2))+sampleAt(vUV+t*vec2(2,2)))*0.03125;
 c+=(sampleAt(vUV+t*vec2(-2,0))+sampleAt(vUV+t*vec2(2,0))+sampleAt(vUV+t*vec2(0,-2))+sampleAt(vUV+t*vec2(0,2)))*0.0625;
 c+=(sampleAt(vUV+t*vec2(-1,-1))+sampleAt(vUV+t*vec2(1,-1))+sampleAt(vUV+t*vec2(-1,1))+sampleAt(vUV+t*vec2(1,1)))*0.125;
 outColor=vec4(min(c,vec3(65000.0)),1.0);
}`;
/** Normalized tent reconstruction mixes scales without amplifying a constant field per level.
 * Distinct upsample targets prevent sampling from the texture currently being written. */
export const BLOOM_UP = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uFine;
uniform sampler2D uCoarse;
uniform vec2 uSpread; // radius in coarse texels, fraction of broad reconstructed energy
out vec4 outColor;
void main(){
 vec2 t=uSpread.x/vec2(textureSize(uCoarse,0));
 vec3 c=texture(uCoarse,vUV).rgb*4.0;
 c+=(texture(uCoarse,vUV+t*vec2(-1,0)).rgb+texture(uCoarse,vUV+t*vec2(1,0)).rgb+texture(uCoarse,vUV+t*vec2(0,-1)).rgb+texture(uCoarse,vUV+t*vec2(0,1)).rgb)*2.0;
 c+=texture(uCoarse,vUV+t*vec2(-1,-1)).rgb+texture(uCoarse,vUV+t*vec2(1,-1)).rgb+texture(uCoarse,vUV+t*vec2(-1,1)).rgb+texture(uCoarse,vUV+t*vec2(1,1)).rgb;
 outColor=vec4(mix(texture(uFine,vUV).rgb,c/16.0,uSpread.y),1.0);
}`;
