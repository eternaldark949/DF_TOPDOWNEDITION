// ===== LV0 BASEMENT =====
import {packet} from './packets.mjs';
import {color,finite,freezeData,BLENDS} from './values.mjs';

/** Reused command buffers. Producers submit data; a backend borrows a completed frame. */
export class renderFrame {
    #pool=[];#passPool=[];#passes=[];#stack=[];#current=null;#count=0;#open=false;#view;
    begin(view,{clear_color='transparent'}={}){
        if(this.#open)throw new Error('A render frame is already open');this.#open=true;this.#view=view;this.#passes.length=0;this.#stack.length=0;this.#count=0;
        this.#current=this.#pass(null,clear_color,{width:view.width,height:view.height});return this;
    }
    #pass(target_id,clear_color,viewport){
        const index=this.#passes.length,pass=this.#passPool[index]??{packets:[]};this.#passPool[index]=pass;
        pass.target_id=target_id;pass.layer=null;pass.clear_color=clear_color===false?false:color(clear_color);pass.viewport={width:finite(viewport.width,'pass width',1),height:finite(viewport.height,'pass height',1)};
        pass.packets.length=0;this.#passes.push(pass);return pass;
    }
    #require(){if(!this.#open)throw new Error('Submit only during an open render frame');}
    clear(clear_color){this.#require();if(this.#current.packets.length)throw new Error('Clear must precede packets in its pass');this.#current.clear_color=color(clear_color);return this;}
    submit(description){
        this.#require();const slot=this.#pool[this.#count]??{};packet(description,slot);slot.sequence=this.#count;this.#pool[this.#count++]=slot;this.#current.packets.push(slot);return this;
    }
    beginPass({target_id=null,clear_color='transparent',viewport,layer=null}={}){
        this.#require();if(target_id!==null&&(typeof target_id!=='string'||!target_id))throw new TypeError('Pass target must be a resource ID');
        const previous=this.#current;if(previous.layer)throw new Error('A layer pass cannot open another pass');
        let spec=null;
        if(layer!==null){
            if(target_id!==null||viewport)throw new TypeError('A layer pass draws over its enclosing pass: give it no target or viewport');
            const {scale=1,blend='normal',opacity=1}=layer;if(!(scale>0&&scale<=1))throw new TypeError('Layer scale is in (0, 1]');if(!Object.hasOwn(BLENDS,blend))throw new TypeError('Unsupported blend');if(!(opacity>=0&&opacity<=1))throw new TypeError('Opacity must be in [0,1]');
            spec={scale,blend,opacity,into:previous.target_id};
        }
        this.#stack.push(previous);
        try{this.#current=this.#pass(target_id,clear_color,viewport??previous.viewport);this.#current.layer=spec;}catch(error){this.#stack.pop();throw error;}return this;
    }
    endPass(){this.#require();if(!this.#stack.length)throw new Error('No nested render pass');const previous=this.#stack.pop();this.#current=this.#pass(previous.target_id,false,previous.viewport);return this;}
    finish(){
        this.#require();if(this.#stack.length)throw new Error('Unclosed render pass');
        for(const pass of this.#passes)pass.packets.sort((a,b)=>a.layer-b.layer||a.depth-b.depth||a.sequence-b.sequence);
        this.#open=false;return {format_version:1,view:this.#view,passes:this.#passes,packet_count:this.#count};
    }
    abort(){this.#open=false;this.#current=null;this.#passes.length=0;this.#stack.length=0;this.#count=0;}
    snapshot(){return freezeData(structuredClone(   // a picture's build is not enumerable, so it is left behind
        {format_version:1,view:this.#view,passes:this.#passes,packet_count:this.#count}));}
    getStatistics(){return {packets:this.#count,packet_capacity:this.#pool.length,passes:this.#passes.length,pass_capacity:this.#passPool.length};}
}
