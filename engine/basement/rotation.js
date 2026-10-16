/** Basement / rotations: z-up unit quaternions, radians, and allocation-free vector transforms. */

/** Compose orientations a × b, allowing the output to alias either operand. */
export function multiplyRotation(a,b,out) {
  const [x,y,z,w]=a,[i,j,k,l]=b;
  out[0]=w*i+x*l+y*k-z*j;out[1]=w*j-x*k+y*l+z*i;
  out[2]=w*k+x*j-y*i+z*l;out[3]=w*l-x*i-y*j-z*k;return out;
}

/** Rotate a vector by a unit quaternion, optionally with its conjugate for inverse queries. */
export function rotateVector(q,x,y,z,out,inverse=false) {
  const sign=inverse?-1:1,a=q[0]*sign,b=q[1]*sign,c=q[2]*sign,w=q[3];
  const tx=2*(b*z-c*y),ty=2*(c*x-a*z),tz=2*(a*y-b*x);
  out[0]=x+w*tx+b*tz-c*ty;out[1]=y+w*ty+c*tx-a*tz;out[2]=z+w*tz+a*ty-b*tx;return out;
}

/** XYZ Euler controls compose qz × qy × qx. Stored documents always retain quaternions. */
export function eulerRotation(x,y,z) {
  const a=Math.sin(x/2),b=Math.sin(y/2),c=Math.sin(z/2),d=Math.cos(x/2),e=Math.cos(y/2),f=Math.cos(z/2);
  return [a*e*f-d*b*c,d*b*f+a*e*c,d*e*c-a*b*f,d*e*f+a*b*c];
}

/** Convert a unit quaternion to XYZ Euler controls; clamp the pitch at numerical poles. */
export function rotationEuler(q) {
  const [x,y,z,w]=q;
  return [Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y)),Math.asin(Math.max(-1,Math.min(1,2*(w*y-z*x)))),Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z))];
}

/** Shared GLSL helper for visible geometry, depth geometry and analytic box occlusion. */
export const ROTATION_GLSL=`
vec3 rotateByQuaternion(vec4 q,vec3 p){return p+2.0*cross(q.xyz,cross(q.xyz,p)+q.w*p);}
`;
