/**
 * Basement / shadow math: light-space transforms, independent of GL and game content.
 * Matrices are column-major Float32 values. Coordinates use x/y ground and z height.
 */

/** Normalize finite directions once on configuration; zero vectors have no light frame. */
export function lightDirection(direction) {
  if(!direction||direction.length!==3||!Array.from(direction).every(Number.isFinite))throw new RangeError('Light direction requires three finite numbers');
  const length=Math.hypot(...direction);if(length<1e-6)throw new RangeError('Light direction must be nonzero');
  return Array.from(direction,n=>n/length);
}

/**
 * Orthographic sun matrix. Snap light-space x/y to whole texels to reduce swimming
 * when a camera pans. The depth half-range is twice the horizontal half-extent.
 * The incoming direction points FROM a receiver TO the sun, matching Lambert lighting.
 */
export function directionalShadowMatrix(direction,camera,extent,resolution,out=new Float32Array(16)) {
  const length=Math.hypot(...direction),lx=direction[0]/length,ly=direction[1]/length,lz=direction[2]/length;
  // Cross a stable up axis with the light; vertical suns need a different reference up.
  let rx,ry,rz;
  if(Math.abs(lz)<0.99){rx=-ly;ry=lx;rz=0;}else{rx=lz;ry=0;rz=-lx;}
  const rlen=Math.hypot(rx,ry,rz);rx/=rlen;ry/=rlen;rz/=rlen;
  const ux=ly*rz-lz*ry,uy=lz*rx-lx*rz,uz=lx*ry-ly*rx;
  const texel=2*extent/resolution,depth=extent*2;
  const cx=Math.round((rx*camera.x+ry*camera.y+rz*(camera.z??0))/texel)*texel;
  const cy=Math.round((ux*camera.x+uy*camera.y+uz*(camera.z??0))/texel)*texel;
  out.set([rx/extent,ux/extent,-lx/depth,0, ry/extent,uy/extent,-ly/depth,0,
    rz/extent,uz/extent,-lz/depth,0, -cx/extent,-cy/extent,(lx*camera.x+ly*camera.y+lz*(camera.z??0))/depth,1]);
  return out;
}

/** Standard GL cube face axes: +X,-X,+Y,-Y,+Z,-Z; each view has a 90° field of view. */
const CUBE_FRAMES=[
  [0,0,-1, 0,-1,0, 1,0,0], [0,0,1, 0,-1,0, -1,0,0],
  [1,0,0, 0,0,1, 0,1,0], [1,0,0, 0,0,-1, 0,-1,0],
  [1,0,0, 0,-1,0, 0,0,1], [-1,0,0, 0,-1,0, 0,0,-1],
];

/** Write projection × cube-face view, with finite near/far distances in world units. */
export function pointShadowMatrix(position,face,near,far,out=new Float32Array(16)) {
  if(!Number.isInteger(face)||face<0||face>5||!(far>near&&near>0))throw new RangeError('Invalid cube shadow projection');
  const [rx,ry,rz,ux,uy,uz,fx,fy,fz]=CUBE_FRAMES[face],a=-(far+near)/(far-near),b=-2*far*near/(far-near);
  const r=rx*position[0]+ry*position[1]+rz*position[2],u=ux*position[0]+uy*position[1]+uz*position[2];
  const f=fx*position[0]+fy*position[1]+fz*position[2];
  out.set([rx,ux,-a*fx,fx, ry,uy,-a*fy,fy, rz,uz,-a*fz,fz, -r,-u,a*f+b,-f]);
  return out;
}
