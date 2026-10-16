/**
 * Basement / lighting: reusable irradiance data, validated configuration and shadow ownership.
 * Games author light placement/palettes; no world names, scheduling or game rules live here.
 * Fixed eight-point storage is explicit. Shadows budget one sun plus one selected point.
 */
import { lightDirection } from './shadow-math.js';
import { ShadowMaps } from './shadow-maps.js';

/** Validate copied RGB values; runtime data cannot silently retain a caller's mutable array. */
function colorValues(color) {
  if(!color||color.length!==3||!Array.from(color).every(n=>Number.isFinite(n)&&n>=0&&n<=32))throw new RangeError('Light color requires three values in [0,32]');
  return Array.from(color);
}

/** Atomically validate all settings, including the hard one-point-shadow budget. */
export function shadowSettings(previous,patch={}) {
  const next={...previous,...patch};
  if(!['off','low','high'].includes(next.mode))throw new RangeError('Shadow mode must be off, low or high');
  for(const[key,min,max]of [['extent',4,128],['bias',0.001,0.2],['normalBias',0,0.2],['softness',0,2],['pointRefreshHz',1,60]]) {
    if(!Number.isFinite(next[key])||next[key]<min||next[key]>max)throw new RangeError(`Shadow ${key} must be between ${min} and ${max}`);
  }
  if(!Number.isInteger(next.pointIndex)||next.pointIndex < -1||next.pointIndex>7)throw new RangeError('Shadow pointIndex must be -1 or one slot from 0 to 7');
  if(![128,256,512].includes(next.pointResolution))throw new RangeError('Point shadow resolution must be 128, 256 or 512');
  return Object.freeze(next);
}

export class Lighting {
  /** Default light appearance matches First Light; shadow targets are opt-in and lazy. */
  constructor(renderer,{directional={},shadows={}}={}) {
    this.renderer=renderer;this.disposed=false;
    this.ambient=new Float32Array([0.13,0.13,0.23]);
    this.positions=new Float32Array(8*4);this.colors=new Float32Array(8*3);
    this.direction=new Float32Array(lightDirection([-0.4,-0.5,1]));this.directionColor=new Float32Array([0.20,0.22,0.29]);
    this.configureDirectional(directional);
    this.settings=shadowSettings({mode:'off',extent:48,bias:0.02,normalBias:0.025,softness:0.22,pointIndex:-1,pointResolution:256,pointRefreshHz:10},shadows);
    this.maps=new ShadowMaps(renderer,this);
  }

  /** Direction points toward the source; colors are linear RGB irradiance, not sRGB UI colors. */
  configureDirectional(patch={}) {
    if(this.disposed)throw new Error('Lighting is disposed');
    const normalized=lightDirection(patch.direction??this.direction),rgb=colorValues(patch.color??this.directionColor);
    this.direction.set(normalized);this.directionColor.set(rgb);
  }

  /** Change budgets between submissions. Disable immediately releases optional GPU resources. */
  configureShadows(patch) {
    if(this.disposed)throw new Error('Lighting is disposed');
    const next=shadowSettings(this.settings,patch);this.maps.reconfigure(this.settings,next);this.settings=next;
  }

  /** Configure one point slot; radius zero disables it. No ninth slot or automatic growth. */
  setPoint(index,{position,color,radius}) {
    if(this.disposed)throw new Error('Lighting is disposed');
    if(!Number.isInteger(index)||index<0||index>7)throw new RangeError('Point light slot must be 0..7');
    if(!position||position.length!==3||!Array.from(position).every(Number.isFinite)||!Number.isFinite(radius)||radius<0||radius>256)throw new RangeError('Invalid point position or radius');
    const rgb=colorValues(color);this.positions.set([...position,radius],index*4);this.colors.set(rgb,index*3);
  }

  /** Submit shadow work through the renderer's existing frame and retained geometry path. */
  prepare(batch) {this.maps.prepare(batch);}

  /** Supply direct light and corresponding visibility; AO samples only ambient irradiance. */
  bind(uniforms) {
    const gl=this.renderer.gl;
    gl.uniform3fv(uniforms.uAmbient,this.ambient);gl.uniform4fv(uniforms['uLights[0]'],this.positions);gl.uniform3fv(uniforms['uLightColors[0]'],this.colors);
    gl.uniform3fv(uniforms.uSunDirection,this.direction);gl.uniform3fv(uniforms.uSunColor,this.directionColor);
    this.maps.bind(uniforms);
  }

  /** Capture scalar/copyable state only; provider snapshots never retain a live world or GL object. */
  inspect() {return {pointBudget:8,direction:Array.from(this.direction),directionColor:Array.from(this.directionColor),shadows:this.maps.inspect()};}

  /** Invalidate lost handles; world state remains owned by Directory, not the light cache. */
  invalidate() {this.maps.invalidate();}

  /** Drop the active world's borrowed shadow geometry without retaining disposed scenery. */
  clearWorld() {this.maps.clearWorld();}

  /** A world batch's owner can unload it while the runtime is stopped. */
  releaseBatch(batch) {this.maps.releaseSource(batch);}

  /** Release maps/batches once; no listeners, timers or animation callbacks were installed here. */
  dispose() {if(this.disposed)return;this.disposed=true;this.maps.dispose();}
}
