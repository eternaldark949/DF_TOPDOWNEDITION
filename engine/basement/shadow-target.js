/**
 * Basement / shadow target: owns one depth-only 2D or cube texture and framebuffer.
 * Requested depth24 storage is budgeted at four bytes/texel; driver padding is unknown.
 */
export class ShadowTarget {
  /** Allocate immutable single-level depth; clean partial creation on every refusal. */
  constructor(gl,resolution,cube=false) {
    this.gl=gl;this.resolution=resolution;this.cube=cube;this.texture=null;this.framebuffer=null;
    this.bytes=resolution*resolution*(cube?6:1)*4;
    try {
      this.texture=gl.createTexture();this.framebuffer=gl.createFramebuffer();
      if(!this.texture||!this.framebuffer)throw new Error('Shadow target allocation failed');
      const type=cube?gl.TEXTURE_CUBE_MAP:gl.TEXTURE_2D;
      gl.activeTexture(gl.TEXTURE0+(cube?4:3));gl.bindTexture(type,this.texture);
      gl.texStorage2D(type,1,gl.DEPTH_COMPONENT24,resolution,resolution);
      for(const parameter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(type,parameter,gl.NEAREST);
      for(const parameter of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(type,parameter,gl.CLAMP_TO_EDGE);
      if(cube)gl.texParameteri(type,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
      this.face(0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Shadow framebuffer unavailable');
    } catch(error) {this.dispose();throw error;}
    finally {gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
  }

  /** Attach the sun image or one cube face before clearing and drawing depth. */
  face(index) {
    const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,this.cube?gl.TEXTURE_CUBE_MAP_POSITIVE_X+index:gl.TEXTURE_2D,this.texture,0);
  }

  /** Delete actual handles once; lost-context owners discard handles without calling this. */
  dispose() {
    if(this.framebuffer)this.gl.deleteFramebuffer(this.framebuffer);if(this.texture)this.gl.deleteTexture(this.texture);
    this.framebuffer=this.texture=null;this.bytes=0;
  }
}
