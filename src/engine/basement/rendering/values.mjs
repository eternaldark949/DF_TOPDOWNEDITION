// ===== LV0 BASEMENT =====
export function finite(value,name,min=-Infinity){if(!Number.isFinite(value)||value<min)throw new TypeError(`Invalid ${name}`);return value;}
export function vector(value,name='vector',out=[]){if(!Array.isArray(value)||value.length!==2)throw new TypeError(`Invalid ${name}`);out[0]=finite(value[0],name);out[1]=finite(value[1],name);return out;}
export function identifier(value){if(typeof value!=='string'||!value||value==='screen')throw new TypeError('A nonempty resource/renderer ID is required (screen is reserved)');return value;}
export function matrix(value,out=[]){if(!Array.isArray(value)||value.length!==6)throw new TypeError('Expected an affine matrix');for(let i=0;i<6;i++)out[i]=finite(value[i],'matrix');return out;}
export function inverse(m){const [a,b,c,d,e,f]=m,k=a*d-b*c;if(Math.abs(k)<1e-12)throw new TypeError('Singular transform');return [d/k,-b/k,-c/k,a/k,(c*f-d*e)/k,(b*e-a*f)/k];}
export function point(m,p){return [m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];}
const origin=Object.freeze([0,0]),unitScale=Object.freeze([1,1]);
export function transform(packet={},out=[]){if(packet.matrix)return matrix(packet.matrix,out);const p=packet.position??origin,s=packet.scale??unitScale;if(!Array.isArray(p)||p.length!==2||!Array.isArray(s)||s.length!==2)throw new TypeError('Invalid position/scale');finite(p[0],'position');finite(p[1],'position');finite(s[0],'scale');finite(s[1],'scale');const r=finite(packet.rotation??0,'rotation'),c=Math.cos(r),n=Math.sin(r);out[0]=c*s[0];out[1]=n*s[0];out[2]=-n*s[1];out[3]=c*s[1];out[4]=p[0];out[5]=p[1];return out;}
export function viewport(packet){return Object.freeze({width:finite(packet.width,'viewport width',1),height:finite(packet.height,'viewport height',1),pixel_ratio:finite(packet.pixel_ratio??1,'pixel ratio',.01)});}
export function freezeData(value){if(value&&typeof value==='object'&&!ArrayBuffer.isView(value)){for(const entry of Object.values(value))freezeData(entry);Object.freeze(value);}return value;}
export function color(value){if(typeof value!=='string'||!value.trim())throw new TypeError('A color string is required');return value;}
export const BLENDS = Object.freeze({normal:'source-over',add:'lighter',multiply:'multiply',screen:'screen','source-in':'source-in','source-out':'source-out','destination-in':'destination-in','destination-out':'destination-out','source-atop':'source-atop','destination-over':'destination-over',overlay:'overlay','soft-light':'soft-light',lighten:'lighten',darken:'darken'});
