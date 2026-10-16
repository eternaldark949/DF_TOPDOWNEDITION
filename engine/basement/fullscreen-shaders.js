/** Basement / vertex-ID fullscreen triangle shared by screen-space capabilities. */
export const FULLSCREEN_VERTEX = `#version 300 es
precision highp float;
out vec2 vUV;
void main(){vUV=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(vUV*2.0-1.0,0.0,1.0);}`;
