/**
 * Basement / camera: arbitrary z-up orthographic views and their exact inverse rays.
 * Geometry, culling, picking, aiming and screen-space AO share the same projection.
 * Near/far depth spans +/-200 world units around the focus. Perspective is future work.
 */
export class Camera {
  /** The default reproduces the Atrium's former oblique view; all angles are radians. */
  constructor(){this.x=0;this.y=0;this.z=0;this.halfHeight=21;this.azimuth=0;this.elevation=Math.atan2(0.65,0.76);this.matrix=new Float32Array(16);this.inverse=new Float32Array(16);this.right=[1,0,0];this.up=[0,0.65,0.76];this.back=[0,-0.76,0.65];}

  /** Recompute orthonormal basis and matrices without per-frame matrix allocation. */
  update(aspect) {
    const c=Math.cos(this.azimuth),s=Math.sin(this.azimuth),e=Math.sin(this.elevation),f=Math.cos(this.elevation);
    this.right[0]=c;this.right[1]=s;this.right[2]=0;this.up[0]=-s*e;this.up[1]=c*e;this.up[2]=f;
    this.back[0]=s*f;this.back[1]=-c*f;this.back[2]=e;
    const r=this.right,u=this.up,b=this.back,w=this.halfHeight*aspect,h=this.halfHeight;
    for(let i=0;i<3;i++){this.matrix[i*4]=r[i]/w;this.matrix[i*4+1]=u[i]/h;this.matrix[i*4+2]=-b[i]/200;this.matrix[i*4+3]=0;
      this.inverse[i]=r[i]*w;this.inverse[4+i]=u[i]*h;this.inverse[8+i]=-b[i]*200;}
    this.matrix[12]=-(r[0]*this.x+r[1]*this.y+r[2]*this.z)/w;this.matrix[13]=-(u[0]*this.x+u[1]*this.y+u[2]*this.z)/h;
    this.matrix[14]=(b[0]*this.x+b[1]*this.y+b[2]*this.z)/200;this.matrix[15]=1;
    this.inverse[3]=this.inverse[7]=this.inverse[11]=0;this.inverse[12]=this.x;this.inverse[13]=this.y;this.inverse[14]=this.z;this.inverse[15]=1;
  }

  /** Named views change orientation only, preserving focus and zoom. */
  preset(name){const views={oblique:[0,Math.atan2(0.65,0.76)],top:[0,Math.PI/2],front:[0,0],side:[Math.PI/2,0]};if(!views[name])throw new Error('Unknown camera view');[this.azimuth,this.elevation]=views[name];}

  /** Ray starts on the near plane; CSS coordinates are relative to the drawing surface. */
  ray(x,y,width,height){this.update(width/height);const sx=(x/width*2-1)*this.halfHeight*width/height,sy=(1-y/height*2)*this.halfHeight;return{origin:[this.x+this.right[0]*sx+this.up[0]*sy+this.back[0]*200,this.y+this.right[1]*sx+this.up[1]*sy+this.back[1]*200,this.z+this.up[2]*sy+this.back[2]*200],direction:this.back.map(n=>-n)};}

  /** Intersect a horizontal construction plane; side/front parallel rays have no intersection. */
  ground(x,y,width,height,z=0){const ray=this.ray(x,y,width,height);if(Math.abs(ray.direction[2])<1e-6)return null;const t=(z-ray.origin[2])/ray.direction[2];return{x:ray.origin[0]+t*ray.direction[0],y:ray.origin[1]+t*ray.direction[1],z};}

  /** Project one world point for engine overlays; return surface-relative CSS pixels. */
  project(p,width,height){this.update(width/height);const x=p.x-this.x,y=p.y-this.y,z=p.z-this.z;return{x:(1+(x*this.right[0]+y*this.right[1])/(this.halfHeight*width/height))*width/2,y:(1-(x*this.up[0]+y*this.up[1]+z*this.up[2])/this.halfHeight)*height/2};}
}
