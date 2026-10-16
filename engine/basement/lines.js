/**
 * Basement / retained colored lines. A small general rendering capability for debug
 * bounds, construction grids and authoring guides; it knows no editor or game types.
 * One shared program per renderer; each layer owns a bounded CPU/GPU vertex buffer.
 * Renderer submits these passes inside its normal GPU timer and restores all handles.
 */
import { createProgram } from './gl-program.js';
const VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec4 aColor;
uniform mat4 uViewProjection;
out vec4 vColor;
void main(){vColor=aColor;gl_Position=uViewProjection*vec4(aPosition,1.0);}`;
const FRAGMENT=`#version 300 es
precision highp float;
in vec4 vColor;
out vec4 outColor;
void main(){outColor=vColor;}`;

export class LineRendering {
 /** Inert until a caller acquires its first layer. No programs/buffers in game-only use. */
 constructor(renderer){this.renderer=renderer;this.layers=new Set();this.program=null;}
 /** Create an explicitly owned bounded layer; caller disposes it when hidden/closed. */
 create(capacity=4096,{depthTest=true}={}){
  if(this.renderer.disposed||this.renderer.lost)throw new Error('Renderer is unavailable');
  if(!Number.isInteger(capacity)||capacity<2||capacity>16384)throw new Error('Line vertex budget must be 2–16384');
  const layer=new LineLayer(this,capacity,depthTest);
  try{this.ensure();layer.initialize();this.layers.add(layer);return layer;}
  catch(error){layer.dispose();if(!this.layers.size)this.releaseProgram();throw error;}
 }
 /** Program is shared only by layers belonging to this renderer and released with the last. */
 ensure(){if(this.program)return;const r=this.renderer;this.program=createProgram(r.gl,VERTEX,FRAGMENT);this.matrix=r.gl.getUniformLocation(this.program,'uViewProjection');r.stats.programs++;}
 releaseProgram(){if(!this.program)return;this.renderer.gl.deleteProgram(this.program);this.program=null;this.renderer.stats.programs--;}
 /** Context loss invalidates handles; retained numeric data remains available for restoration. */
 invalidate(){this.program=null;for(const layer of this.layers){layer.buffer=null;layer.vao=null;}}
 restore(){if(!this.layers.size)return;this.ensure();for(const layer of this.layers)layer.initialize();}
 /** Diagnostics return copied scalars, never borrowed layer objects or GL handles. */
 inspect(){let vertices=0,cpuBytes=0,gpuBufferBytes=0;for(const layer of this.layers){vertices+=layer.count;cpuBytes+=layer.cpuBytes;gpuBufferBytes+=layer.gpuBufferBytes;}return{layers:this.layers.size,vertices,cpuBytes,gpuBufferBytes};}
 dispose(){for(const layer of [...this.layers])layer.dispose();this.releaseProgram();}
}

class LineLayer {
 constructor(owner,capacity,depthTest){this.owner=owner;this.renderer=owner.renderer;this.capacity=capacity;this.depthTest=depthTest;this.data=new Float32Array(capacity*7);this.count=0;this.cursor=0;this.disposed=false;this.dirty=false;this.cpuBytes=this.gpuBufferBytes=this.data.byteLength;}
 /** Seven floats per vertex: world XYZ plus display RGBA. No texture/font preparation. */
 initialize(){
  const r=this.renderer,gl=r.gl;
  this.buffer=gl.createBuffer();this.vao=gl.createVertexArray();
  if(!this.buffer||!this.vao){if(this.buffer)gl.deleteBuffer(this.buffer);if(this.vao)gl.deleteVertexArray(this.vao);this.buffer=this.vao=null;throw new Error('Line layer allocation failed');}
  r.stats.buffers++;r.stats.vaos++;gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,28,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.FLOAT,false,28,12);gl.bindVertexArray(null);this.dirty=true;
 }
 /** Rewrite only on invalidation, never for every static frame. */
 begin(){this.cursor=0;}
 segment(a,b,color){if(this.cursor+14>this.data.length)throw new Error('Line layer vertex budget exceeded');for(const p of [a,b]){this.data.set(p,this.cursor);this.data.set(color,this.cursor+3);this.cursor+=7;}}
 end(){this.count=this.cursor/7;this.dirty=true;}
 /** Called only by Renderer.render; restore depth/blend state before the next submission. */
 draw(){
  if(this.disposed)throw new Error('Line layer is disposed');if(!this.count)return;
  const r=this.renderer,gl=r.gl;this.owner.ensure();
  gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  if(this.dirty){const bytes=this.count*28;gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data.subarray(0,this.count*7));r.stats.uploads++;r.stats.uploadedBytes+=bytes;r.totals.uploads++;r.totals.uploadedBytes+=bytes;this.dirty=false;}
  gl.useProgram(this.owner.program);gl.uniformMatrix4fv(this.owner.matrix,false,r.camera.matrix);
  if(!this.depthTest)gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.LINES,0,this.count);gl.bindVertexArray(null);gl.disable(gl.BLEND);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);r.stats.draws++;r.totals.draws++;
 }
 /** Removal is immediate; disposed guide layers cannot survive into Play or context restore. */
 dispose(){
  if(this.disposed)return;this.disposed=true;const r=this.renderer,gl=r.gl;
  if(this.buffer){gl.deleteBuffer(this.buffer);r.stats.buffers--;}
  if(this.vao){gl.deleteVertexArray(this.vao);r.stats.vaos--;}
  this.buffer=this.vao=null;this.owner.layers.delete(this);this.data=null;
  if(!this.owner.layers.size)this.owner.releaseProgram();
 }
}
