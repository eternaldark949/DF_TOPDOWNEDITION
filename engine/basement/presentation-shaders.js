/** Basement / final linear radiance composition, display encoding and guide depth restoration. */
/** An optional additive texture combines with unclipped scene radiance, followed by one exposure/rolloff/encoding.
 * Restore resolved geometry depth into the default framebuffer in the same submission.
 * Studio lines then use ordinary depth testing and display colours, outside image effects entirely. */
export const PRESENT_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uAdditive;
uniform sampler2D uDepth;
uniform vec2 uFinish; // additive radiance gain and exposure
out vec4 outColor;
void main(){
 vec3 linear=max(texture(uScene,vUV).rgb+texture(uAdditive,vUV).rgb*uFinish.x,vec3(0.0));
 vec3 mapped=vec3(1.0)-exp(-linear*uFinish.y);
 outColor=vec4(pow(mapped,vec3(1.0/2.2)),1.0);
 gl_FragDepth=texture(uDepth,vUV).r;
}`;
