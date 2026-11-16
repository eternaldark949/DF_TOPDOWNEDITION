// ===== LV0 BASEMENT =====
// RECORDING: a backend that draws nothing and keeps every frame it is given, as data. It runs where
// there is no screen (a server, a test, a headless replay) and it proves the backend contract: the
// render system cannot tell it from Canvas or WebGL, so nothing upstream may lean on one of them.
import {CAPABILITIES} from './values.mjs';

/** Keeps the last `keep` frames as plain data (`frames`), and the resources it was given (`resources`). */
export class recordingRenderer {
    #viewport=null;#surface=null;#frames=[];#resources=new Map();#keep;#disposed=false;
    constructor({keep=1,capabilities=CAPABILITIES}={}){
        if(!Number.isInteger(keep)||keep<1)throw new TypeError('A recording keeps one frame or more');
        if(!Array.isArray(capabilities)||capabilities.some(need=>!CAPABILITIES.includes(need)))throw new TypeError(`Capabilities are among ${CAPABILITIES.join(', ')}`);
        this.#keep=keep;this.capabilities=Object.freeze([...capabilities]);
    }
    get frames(){return this.#frames;}
    get resources(){return this.#resources;}
    get surface(){return this.#surface;}
    initialize(surface,{viewport}){if(this.#disposed)throw new Error('The recording is disposed');this.#surface=surface??null;this.resize(viewport);}
    resize(viewport){this.#viewport=viewport;}
    getSurfaceBounds(){return Object.freeze({left:0,top:0,width:this.#viewport.width,height:this.#viewport.height});}
    registerResource(id,resource){this.#resources.set(id,resource);}
    releaseResource(id){this.#resources.delete(id);}
    render(frame){this.#frames.push(structuredClone(frame));if(this.#frames.length>this.#keep)this.#frames.shift();}
    /** Text measured the way the looks outline guesses it: 0.6 of the size per character. */
    measureText(text,font={}){const size=font.size??16,count=[...String(text)].length;return Object.freeze({width:count*(size*.6+(font.letter_spacing??0)),ascent:size*.8,descent:size*.2});}
    dispose(){this.#disposed=true;this.#frames.length=0;this.#resources.clear();this.#surface=null;}
}
