// ===== LV0 BASEMENT =====
import {packet} from './packets.mjs';
import {color,finite,freezeData,BLENDS} from './values.mjs';
import {effectStack} from './effects.mjs';
import {occlusionOrder} from './depth.mjs';

/** Reused command buffers. Producers submit data; a backend borrows a completed frame. */
export class renderFrame {
    #pool=[];#passPool=[];#passes=[];#stack=[];#current=null;#count=0;#open=false;#view;#effects=[];#layerEffects=new Map();
    begin(view,{clear_color='transparent'}={}){
        if(this.#open)throw new Error('A render frame is already open');this.#open=true;this.#view=view;this.#passes.length=0;this.#stack.length=0;this.#count=0;this.#effects=[];this.#layerEffects.clear();
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
            const {scale=1,blend='normal',opacity=1,effects=null}=layer;if(!(scale>0&&scale<=1))throw new TypeError('Layer scale is in (0, 1]');if(!BLENDS.includes(blend))throw new TypeError('Unsupported blend');if(!(opacity>=0&&opacity<=1))throw new TypeError('Opacity must be in [0,1]');
            spec={scale,blend,opacity,into:previous.target_id,effects:effectStack(effects)};
        }
        this.#stack.push(previous);
        try{this.#current=this.#pass(target_id,clear_color,viewport??previous.viewport);this.#current.layer=spec;}catch(error){this.#stack.pop();throw error;}return this;
    }
    /** The frame's effects so far. */
    getEffects(){this.#require();return this.#effects;}
    /** Effects done to the whole frame once everything is drawn (a list of effects; see effects.mjs). */
    setEffects(effects){this.#require();this.#effects=effectStack(effects);return this;}
    /**
     * Effects done to the packets of one layer number in the frame's own passes: they are drawn in a layer
     * pass of their own, between the layers under and over them, which the effects work on alone.
     */
    setLayerEffects(layer,effects){this.#require();finite(layer,'layer');const stack=effectStack(effects);if(stack.length)this.#layerEffects.set(layer,stack);else this.#layerEffects.delete(layer);return this;}
    endPass(){this.#require();if(!this.#stack.length)throw new Error('No nested render pass');const previous=this.#stack.pop();this.#current=this.#pass(previous.target_id,false,previous.viewport);return this;}
    finish(){
        this.#require();if(this.#stack.length)throw new Error('Unclosed render pass');
        for(const pass of this.#passes){
            pass.packets.sort((a,b)=>a.layer-b.layer||a.depth-b.depth||a.sequence-b.sequence);
            // then, where packets say what they fill, what stands between the eye and another goes after it
            if(pass.packets.some(p=>p.solid)){
                const group=p=>p.space==='world'&&p.solid?.world&&!this.#layerEffects.size?'world':p.layer;
                const ordered=occlusionOrder(pass.packets,{group});
                if(ordered!==pass.packets)for(let i=0;i<ordered.length;i++)pass.packets[i]=ordered[i];
            }
        }
        if(this.#layerEffects.size)this.#splitLayers();
        this.#open=false;return {format_version:1,view:this.#view,passes:this.#passes,packet_count:this.#count,effects:this.#effects};
    }
    // A frame pass's packets of a layer with effects go into a layer pass of their own, in order.
    #splitLayers(){
        const out=[];
        for(const pass of this.#passes){
            if(pass.layer||pass.target_id!==null||!pass.packets.some(p=>this.#layerEffects.has(p.layer))){out.push(pass);continue;}
            let current=null,first=true;
            for(const packet of pass.packets){
                const effects=this.#layerEffects.get(packet.layer)??null,key=effects?packet.layer:null;
                if(!current||current.key!==key){
                    current={key,target_id:null,viewport:pass.viewport,packets:[],clear_color:effects?color('transparent'):first?pass.clear_color:false,
                        layer:effects?{scale:1,blend:'normal',opacity:1,into:null,effects}:null};
                    if(effects&&first)out.push({target_id:null,viewport:pass.viewport,packets:[],clear_color:pass.clear_color,layer:null});
                    out.push(current);first=false;
                }
                current.packets.push(packet);
            }
            for(const p of out)delete p.key;
        }
        this.#passes.length=0;this.#passes.push(...out);
    }
    abort(){this.#open=false;this.#current=null;this.#passes.length=0;this.#stack.length=0;this.#count=0;}
    snapshot(){return freezeData(structuredClone(   // a picture's build is not enumerable, so it is left behind
        {format_version:1,view:this.#view,passes:this.#passes,packet_count:this.#count,effects:this.#effects}));}
    getStatistics(){return {packets:this.#count,packet_capacity:this.#pool.length,passes:this.#passes.length,pass_capacity:this.#passPool.length};}
}
