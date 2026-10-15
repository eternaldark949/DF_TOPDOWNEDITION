/** Basement / GL programs: shared compilation with complete failure-path ownership. */

/** Link two GLSL stages; delete temporary shaders on success and every failure path. */
export function createProgram(gl, vertexSource, fragmentSource) {
  const shaders=[]; let program;
  try {
    for(const [type,source] of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,fragmentSource]]) {
      const shader=gl.createShader(type);
      if(!shader)throw new Error('WebGL shader allocation failed');
      shaders.push(shader);
      gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(`WebGL shader: ${gl.getShaderInfoLog(shader)}`);
    }
    program=gl.createProgram();
    if(!program)throw new Error('WebGL program allocation failed');
    for(const shader of shaders)gl.attachShader(program,shader);
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(`WebGL program: ${gl.getProgramInfoLog(program)}`);
    return program;
  } catch(error) {if(program)gl.deleteProgram(program);throw error;}
  finally {for(const shader of shaders)if(shader)gl.deleteShader(shader);}
}
