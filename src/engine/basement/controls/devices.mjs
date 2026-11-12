// ===== LV0 BASEMENT =====
import { touchStick } from './touch-stick.mjs';
import { radialStick, cleanupAll } from './values.mjs';

/** Device state uses the terminology from the original Python input instances. */
export class inputInstance {
    constructor(system, device) {
        this.system=system;this.device=device;
        this.input_active=new Set();this.input_just_activated=new Set();this.input_just_released=new Set();this.ghost_image=new Set();
        this.input_time=Object.create(null);this.armed=Object.create(null);this.spent=new Set();
    }
    isActive(input){return this.input_active.has(input)&&!this.spent.has(input);}
    getActiveInputs(){return [...this.input_active].filter(input=>!this.spent.has(input));}
    generateGhostImage(){this.ghost_image=new Set(this.input_active);this.input_just_activated.clear();this.input_just_released.clear();}
    /** Replay injection changes held state without invoking action callbacks. */
    setInputs(inputs){
        for(const input of [...this.input_active])if(!inputs.includes(input))this.system.changeInput(input,()=>{this.input_active.delete(input);this.spent.delete(input);delete this.armed[input];this.input_just_released.add(input);});
        for(const input of inputs)if(!this.input_active.has(input))this.system.changeInput(input,()=>{this.input_active.add(input);this.input_time[input]=this.system.now();this.input_just_activated.add(input);});
    }
    releaseAll(){for(const input of [...this.input_active])this.system.cancelInput(this,input);}
}

export class keyboardInstance extends inputInstance {
    constructor(system){
        super(system,'keyboard');const target=system.event_target;
        system.listen(target,'keydown',event=>this.event(event,true));system.listen(target,'keyup',event=>this.event(event,false),true);
    }
    static keyName(key){return key===' '?'space':key?.length===1?key.toLowerCase():key;}
    static editable(target){return !!target&&(!!target.isContentEditable||typeof target.closest==='function'&&!!target.closest('input, textarea, select, [contenteditable="true"]'));}
    event(event,down){const input=keyboardInstance.keyName(event.key);if(!input||down&&event.repeat&&!this.input_active.has(input))return;const ev=this.system.ev('keyboard',input,event);down?this.system.press(this,input,ev):this.system.release(this,input,ev);}
}

export class mouseInstance extends inputInstance {
    constructor(system,target=system.event_target){
        super(system,'mouse');this.disposers=[];const listen=(...args)=>this.disposers.push(system.listen(...args));this.x=0;this.y=0;this.delta=[0,0];this.wheel=[0,0];this.known=false;
        const buttons=['mouseLeft','mouseMiddle','mouseRight'];
        const sample=event=>{
            if(event.sourceCapabilities?.firesTouchEvents||!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return;
            if(this.known){this.delta[0]+=event.clientX-this.x;this.delta[1]+=event.clientY-this.y;}
            this.x=event.clientX;this.y=event.clientY;this.known=true;system.active_device='mouse';
        };
        listen(target,'mousemove',sample,{passive:true});
        if(target!==system.event_target)listen(system.event_target,'mousemove',event=>{if(this.input_active.size)sample(event);},{passive:true});
        listen(target,'mousedown',event=>{if(event.sourceCapabilities?.firesTouchEvents)return;const input=buttons[event.button];if(input){sample(event);system.press(this,input,system.ev('mouse',input,event));}});
        listen(system.event_target,'mouseup',event=>{const input=buttons[event.button];if(input){if(this.input_active.has(input))sample(event);system.release(this,input,system.ev('mouse',input,event));}});
        listen(target,'wheel',event=>{const unit=event.deltaMode===1?16:event.deltaMode===2?(target.innerHeight||800):1;this.wheel[0]+=event.deltaX*unit;this.wheel[1]+=event.deltaY*unit;system.active_device='mouse';},{passive:true});
    }
    dispose(){this.releaseAll();this.disposers.splice(0).forEach(drop=>drop());}
    generateGhostImage(){super.generateGhostImage();this.delta=[0,0];this.wheel=[0,0];}
}

export class touchInstance extends inputInstance {
    constructor(system){super(system,'touch');this.elements=Object.create(null);this.sticks=Object.create(null);this.bindings=new Map();}
    stick(name,packet){this.sticks[name]?.dispose();return this.sticks[name]=new touchStick(this.system,name,packet);}
    buttons(list){for(const [element,input]of list)this.button(element,input);}
    button(element,input){
        if(typeof input!=='string'||!input.startsWith('touch'))throw new TypeError('Touch button inputs must start with touch');
        const el=typeof element==='string'?this.system.document?.getElementById(element):element;
        if(!el)return;if(this.elements[input]===el)return this.bindings.get(input).dispose;
        this.bindings.get(input)?.dispose();this.elements[input]=el;const pointers=new Set(),drops=[];
        const touchAction=el.style?.touchAction;if(el.style)el.style.touchAction='none';
        const down=event=>{
            if(event.button>0||this.system.muted)return;if(event.cancelable)event.preventDefault();const id=event.pointerId??'pointer';pointers.add(id);
            try{if(event.pointerId!==undefined)el.setPointerCapture(event.pointerId);}catch{}
            el.classList.add('held');if(pointers.size===1)this.system.press(this,input,this.system.ev('touch',input,event));
        };
        const up=(event,cancel=false)=>{
            if(!pointers.delete(event.pointerId??'pointer')||pointers.size)return;el.classList.remove('held');
            if(cancel)this.system.cancelInput(this,input);else this.system.release(this,input,this.system.ev('touch',input,event));
        };
        const listen=(type,handler,options)=>drops.push(this.system.listen(el,type,handler,options));
        listen('pointerdown',down);listen('pointerup',event=>up(event));listen('pointercancel',event=>up(event,true));listen('lostpointercapture',event=>up(event,true));
        listen('touchstart',event=>{if(event.cancelable)event.preventDefault();},{passive:false});
        let disposed=false;
        const dispose=()=>{if(disposed)return;disposed=true;drops.splice(0).forEach(drop=>drop());pointers.clear();el.classList.remove('held');if(el.style)el.style.touchAction=touchAction??'';this.system.cancelInput(this,input);delete this.elements[input];this.bindings.delete(input);};
        this.bindings.set(input,{dispose,pointers});return dispose;
    }
    drop(input){if(this.input_active.has(input)){this.spent.add(input);this.armed[input]=new Set();}this.elements[input]?.classList.remove('held');}
    cancel(){for(const binding of this.bindings.values())binding.pointers.clear();for(const el of Object.values(this.elements))el.classList.remove('held');cleanupAll([...Object.values(this.sticks).map(stick=>()=>stick.cancel()),()=>this.releaseAll()],'Touch cancellation failed');}
    dispose(){try{cleanupAll([()=>this.cancel(),...[...this.bindings.values()].map(binding=>()=>binding.dispose()),...Object.values(this.sticks).map(stick=>()=>stick.dispose())],'Touch disposal failed');}finally{this.sticks=Object.create(null);}}
}

export class gamepadInstance extends inputInstance {
    static BUTTONS=['gamepadA','gamepadB','gamepadX','gamepadY','gamepadLBumper','gamepadRBumper','gamepadLTrigger','gamepadRTrigger','gamepadBack','gamepadStart','gamepadLStickButton','gamepadRStickButton','gamepadDUp','gamepadDDown','gamepadDLeft','gamepadDRight'];
    constructor(system){super(system,'gamepad');this.index=null;this.pad=null;this.trigger_threshold=.4;this.left_stick_value=[0,0];this.right_stick_value=[0,0];this.left_trigger_value=0;this.right_trigger_value=0;this.suppressed=new Set();this.suppressed_buttons=new Set();}
    get connected(){return !!this.pad;}
    updateGamepads(){
        const previous=[...this.left_stick_value,...this.right_stick_value,this.left_trigger_value,this.right_trigger_value];
        const pads=this.system.read_gamepads()??[];let pad=this.index!==null?pads[this.index]:null;
        if(!pad?.connected)pad=[...pads].find(p=>p?.connected)??null;
        if(this.pad&&(!pad||pad.index!==this.pad.index)){this.releaseAll();this.suppressAnalog();this.suppressButtons();}
        if(!pad){this.pad=null;this.index=null;this.left_stick_value=[0,0];this.right_stick_value=[0,0];this.left_trigger_value=this.right_trigger_value=0;return;}
        this.pad=pad;this.index=pad.index;const A=pad.axes??[],B=pad.buttons??[];
        const finite=value=>Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
        this.left_stick_value=[finite(A[0]),finite(A[1])];this.right_stick_value=[finite(A[2]),finite(A[3])];
        this.left_trigger_value=Math.max(0,finite(B[6]?.value));this.right_trigger_value=Math.max(0,finite(B[7]?.value));
        for(const side of ['left','right'])if(this.suppressed.has(side+'_trigger')){
            if(this[side+'_trigger_value']<=.05)this.suppressed.delete(side+'_trigger');
            this[side+'_trigger_value']=0;
        }
        for(const side of ['left','right'])if(this.suppressed.has(side)){
            if(Math.hypot(...this[side+'_stick_value'])<=.15)this.suppressed.delete(side);
            this[side+'_stick_value']=[0,0];
        }
        const current=[...this.left_stick_value,...this.right_stick_value,this.left_trigger_value,this.right_trigger_value];
        if(current.some((value,index)=>Math.abs(value)>.15&&Math.abs(value-previous[index])>1e-4))this.system.active_device='gamepad';
        gamepadInstance.BUTTONS.forEach((name,index)=>{
            const button=B[index],on=!!button&&(button.pressed||button.value>this.trigger_threshold);
            if(this.suppressed_buttons.has(name)){if(!on){this.suppressed_buttons.delete(name);if(this.input_active.has(name))this.system.cancelInput(this,name);}return;}
            if(on!==this.input_active.has(name))on?this.system.press(this,name,this.system.ev('gamepad',name)):this.system.release(this,name,this.system.ev('gamepad',name));
        });
    }
    stick(which,dead_zone=.15){if(!['left','right'].includes(which))throw new TypeError('Stick must be left or right');return radialStick(this[which+'_stick_value'],dead_zone);}
    suppressAnalog(){for(const side of ['left','right']){this.suppressed.add(side);this.suppressed.add(side+'_trigger');this[side+'_stick_value']=[0,0];this[side+'_trigger_value']=0;}}
    suppressButtons(){for(const name of gamepadInstance.BUTTONS)this.suppressed_buttons.add(name);}
    rumble(ms,strength){try{const result=this.pad?.vibrationActuator?.playEffect('dual-rumble',{duration:ms,strongMagnitude:strength,weakMagnitude:strength});result?.catch(()=>{});}catch{}}
}
