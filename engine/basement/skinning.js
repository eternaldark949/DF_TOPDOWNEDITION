/**
 * Basement / skinning: the GPU half of skeletal meshes.
 *
 * Vertex placement: every geometry pass (lit, shadow depth, SSAO normals) calls one
 * function, placeVertex(), so a bent elbow casts, occludes and shades from the same
 * surface. It dispatches on the record's pose.w lane, which already tells boxes (0) from
 * rounded shapes (> 0, rounded-shapes.js); meshes use negative values:
 *   pose.w = -1        rigid mesh: mesh-frame position × size
 *   pose.w = -(row+2)  skinned mesh whose joint palette is row `row` of the batch texture
 * size.xyz scales the mesh frame per axis (1,1,1 = authored metres); size.w is unused.
 *
 * Joint palettes: each batch owns at most one RGBA32F texture, MAX_JOINTS × 3 texels wide
 * and one row per skinned instance it can hold. A row stores each joint's
 * (world × inverse bind) matrix as three texels of [r0 r1 r2 t]. Shaders read it with
 * texelFetch, so no float filtering extension is needed: RGBA32F sampling is WebGL 2 core.
 * The texture is created only when a batch first holds a skinned instance and freed when
 * it holds none, so worlds without skeletons pay nothing.
 *
 * Texture unit 5 is reserved for palettes (AO owns 0–2, shadows 3–4).
 */
import { MAX_JOINTS } from "./skeleton.js";

/** Texture unit shared by every program that places vertices. */
export const PALETTE_UNIT = 5;
/** Texels per row: three per joint. */
export const PALETTE_WIDTH = MAX_JOINTS * 3;

/** GLSL: blend joint matrices for skinned records; defer everything else to shapeVertex. */
export const SKIN_GLSL = `
uniform highp sampler2D uJointPalette;
void placeVertex(vec3 a,vec3 b,vec4 joints,vec4 weights,vec4 pose,vec4 size,out vec3 p,out vec3 n){
  if(pose.w>-0.5){shapeVertex(a,b,pose,size,p,n);return;}
  vec3 local=a,normal=b;
  if(pose.w<-1.5){
    int row=int(-pose.w+0.5)-2;
    vec4 r0=vec4(0.0),r1=vec4(0.0),r2=vec4(0.0);
    for(int i=0;i<4;i++){
      float w=weights[i];
      if(w<=0.0)continue;
      int column=int(joints[i]+0.5)*3;
      r0+=w*texelFetch(uJointPalette,ivec2(column,row),0);
      r1+=w*texelFetch(uJointPalette,ivec2(column+1,row),0);
      r2+=w*texelFetch(uJointPalette,ivec2(column+2,row),0);
    }
    vec4 h=vec4(a,1.0);
    local=vec3(dot(r0,h),dot(r1,h),dot(r2,h));
    // Joints are rigid, so the blended 3×3 rotates normals; blending can shorten them.
    normal=vec3(dot(r0.xyz,b),dot(r1.xyz,b),dot(r2.xyz,b));
  }
  p=local*size.xyz;
  // Per-axis scale bends normals the inverse way.
  n=normalize(normal/max(size.xyz,vec3(1e-6)));
}
`;

/** Point a linked program's palette sampler at the reserved unit (once per program). */
export function configurePaletteSampler(gl, program) {
  const location = gl.getUniformLocation(program, "uJointPalette");
  if (!location) return;
  gl.useProgram(program);
  gl.uniform1i(location, PALETTE_UNIT);
}

/**
 * One batch's joint palette texture plus its retained CPU copy. Rows are written during
 * the batch's sync and uploaded as one contiguous changed range, like instance records.
 */
export class JointPalette {
  constructor(batch, rows) {
    this.batch = batch; this.rows = rows;
    this.data = new Float32Array(rows * PALETTE_WIDTH * 4);
    this.firstDirty = Infinity; this.lastDirty = -1;
    this.initialize();
  }

  /** Texture storage bytes (RGBA32F): an estimate of what the driver allocates. */
  get bytes() { return this.data.byteLength; }

  /** Allocate immutable storage and mark every row for upload (first use or restoration). */
  initialize() {
    const r = this.batch.renderer, gl = r.gl;
    this.texture = gl.createTexture();
    if (!this.texture) throw new Error("Joint palette allocation failed");
    gl.activeTexture(gl.TEXTURE0 + PALETTE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, PALETTE_WIDTH, this.rows);
    // texelFetch ignores filtering, but NEAREST keeps the texture complete everywhere.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    r.stats.jointPalettes++;
    this.firstDirty = 0; this.lastDirty = this.rows - 1;
  }

  /** Copy one skin pose's palette into a row. Returns whether any value changed. */
  write(row, palette) {
    const base = row * PALETTE_WIDTH * 4;
    let changed = false;
    for (let i = 0; i < palette.length; i++)
      if (this.data[base + i] !== palette[i]) { this.data[base + i] = palette[i]; changed = true; }
    if (changed) { this.firstDirty = Math.min(this.firstDirty, row); this.lastDirty = Math.max(this.lastDirty, row); }
    return changed;
  }

  /** Upload the changed rows as one range; counted with the renderer's other uploads. */
  upload() {
    if (this.lastDirty < this.firstDirty) return;
    const r = this.batch.renderer, gl = r.gl, rows = this.lastDirty - this.firstDirty + 1;
    gl.activeTexture(gl.TEXTURE0 + PALETTE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.firstDirty, PALETTE_WIDTH, rows, gl.RGBA, gl.FLOAT, this.data, this.firstDirty * PALETTE_WIDTH * 4);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    const bytes = rows * PALETTE_WIDTH * 16;
    r.stats.uploads++; r.stats.uploadedBytes += bytes; r.totals.uploads++; r.totals.uploadedBytes += bytes;
    this.firstDirty = Infinity; this.lastDirty = -1;
  }

  /** Bind for the draw that follows; programs already point their sampler at this unit. */
  bind() {
    const gl = this.batch.renderer.gl;
    gl.activeTexture(gl.TEXTURE0 + PALETTE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Free the texture once. Deleting a lost context's handle is a harmless no-op. */
  dispose() {
    const r = this.batch.renderer;
    r.gl.deleteTexture(this.texture);
    r.stats.jointPalettes--;
    this.texture = null; this.data = null;
  }
}
