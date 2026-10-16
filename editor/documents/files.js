/** Studio / portable files and best-effort local recovery. No repository credentials or sync. */
import { parseProject, PROJECT_LIMITS } from '../../engine/basement/project.js';
export class ProjectFiles {
 /** One recovery slot and at most one download URL belong to this workspace. */
 constructor(validate){this.validate=validate;this.key='ETRNLNINE.Studio.project.v1';this.url=null;}
 /** Browser storage failure must not prevent editing or an explicit download. */
 recover(){try{const text=localStorage.getItem(this.key);return text?parseProject(text,this.validate):null;}catch{return null;}}
 store(data){try{localStorage.setItem(this.key,JSON.stringify(data));return true;}catch{return false;}}
 /** Check file size before reading/JSON parsing; adoption is the caller's atomic operation. */
 async read(file){if(file.size>PROJECT_LIMITS.bytes)throw new Error('Project exceeds 512 KiB');return parseProject(await file.text(),this.validate);}
 /** Strict JSON plus stable IDs is the durable portable backup, separate from generated HTML. */
 download(data){if(this.url)URL.revokeObjectURL(this.url);let text=JSON.stringify(data,null,2)+'\n';if(new TextEncoder().encode(text).length>PROJECT_LIMITS.bytes)text=JSON.stringify(data);this.url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=this.url;a.download='ETRNLNINE-project.json';a.click();}
 dispose(){if(this.url)URL.revokeObjectURL(this.url);this.url=null;}
}
