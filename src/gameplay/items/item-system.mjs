import itemRules from '../../directory/game-item-rules.json' with {type:'json'};
import { identifier, jsonCopy, validateModifiers } from '../values.mjs';

const modes=['normal','sniper','melee','fists'];
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const integer=(value,name,min=0)=>{if(!Number.isSafeInteger(value)||value<min)throw new TypeError(`${name} must be a safe integer >= ${min}`);return value;};

/** One authoritative inventory record. UI, equipped views and saves read this model. */
export class itemSystem {
    #data; #catalog; #rules; #views=new Map(); #listeners=new Map(); #notify; #parents=new Map();
    constructor({data={},catalog,rules=itemRules,on_event}={}) {
        this.#rules=jsonCopy(rules);integer(rules.capacity,'capacity');integer(rules.max_attachments,'max_attachments');identifier(rules.owner_id);
        if(!catalog||typeof catalog!=='object'||Array.isArray(catalog))throw new TypeError('An item catalog is required');
        this.#catalog=freeze(jsonCopy(catalog));
        for(const [id,def] of Object.entries(this.#catalog)){
            identifier(id);if(!['weapon','attachment','consumable','collectible','intel'].includes(def.type))throw new TypeError(`Unknown item type: ${id}`);
            if(def.type==='weapon'&&!modes.includes(def.weaponMode??'normal'))throw new TypeError(`Unknown weapon mode: ${id}`);
            if(def.max_stack!==undefined)integer(def.max_stack,'max_stack',1);
            if(def.stackable&&['weapon','attachment'].includes(def.type))throw new TypeError('Weapons and attachments require unique instances');
        }
        this.#notify=on_event;this.#data=data;
        if(!Object.keys(data).length)Object.assign(data,this.#empty());
        this.#validate(data);this.#indexParents();
    }
    #indexParents(){this.#parents.clear();for(const record of Object.values(this.#data.records))for(const child of record.attachments)this.#parents.set(child,record.instance_id);}
    #empty(){return {format_version:1,owner_id:this.#rules.owner_id,next_instance_id:1,capacity:this.#rules.capacity,max_attachments:this.#rules.max_attachments,records:{},order:[],equipment:{weapon:null,attachments:[]}};}
    #definition(id){identifier(id);const def=this.#catalog[id];if(!def)throw new Error(`Unknown item definition: ${id}`);return def;}
    getDefinition(id){return this.#definition(id);}
    #record(id){identifier(id);const record=this.#data.records[id];if(!record)throw new Error(`Unknown owned item instance: ${id}`);return record;}
    #validateRecord(record){
        if(!record||Object.keys(record).some(key=>!['instance_id','definition_id','quantity','state','upgrades','attachments'].includes(key)))throw new TypeError('Invalid item record fields');
        identifier(record?.instance_id);const def=this.#definition(record.definition_id);integer(record.quantity,'quantity',1);
        if(record.quantity>(def.stackable?(def.max_stack??999):1))throw new TypeError('Invalid item stack size');
        if(!record.state||typeof record.state!=='object'||Array.isArray(record.state)||!record.upgrades||typeof record.upgrades!=='object'||Array.isArray(record.upgrades)||!Array.isArray(record.attachments))throw new TypeError('Invalid item state');
        if(record.state.fire_mode!==undefined&&(!modes.includes(record.state.fire_mode)||def.type!=='weapon'))throw new TypeError('Invalid item fire mode');
        for(const [id,rank] of Object.entries(record.upgrades)){identifier(id);integer(rank,'upgrade rank',1);const upgrade=def.upgrades?.[id];if(!upgrade||rank>(upgrade.max_rank??1))throw new TypeError(`Unknown or invalid upgrade: ${id}`);validateModifiers(upgrade.modifiers??{});}
        if(def.type!=='weapon'&&record.attachments.length)throw new TypeError('Only weapons can mount attachments');
        this.#stats(record,def);return def;
    }
    #stats(record,definition){
        const stats=jsonCopy(definition.stats??{});
        const modifiers={};
        for(const [key,rank] of Object.entries(record.upgrades))for(const [stat,modifier] of Object.entries(definition.upgrades[key].modifiers??{})){
            const total=modifiers[stat]??={add:0,multiply:1};total.add+=(modifier.add??0)*rank;total.multiply*=(modifier.multiply??1)**rank;
        }
        for(const [stat,modifier] of Object.entries(modifiers)){const base=stats[stat]??0;if(!Number.isFinite(base))throw new TypeError('Upgrades require numeric stats');stats[stat]=Math.max(0,(base+modifier.add)*modifier.multiply);if(!Number.isFinite(stats[stat]))throw new TypeError('Modified stats must be finite');}
        return stats;
    }
    #compatible(weapon,attachment){const allowed=attachment.compatible_modes;return !allowed||allowed.includes(weapon.weaponMode??'normal');}
    #validate(data){
        jsonCopy(data);if(data.format_version!==1||!data.records||typeof data.records!=='object'||Array.isArray(data.records)||!Array.isArray(data.order)||!data.equipment||!Array.isArray(data.equipment.attachments))throw new TypeError('Unsupported inventory snapshot');
        identifier(data.owner_id);if(data.owner_id!==this.#rules.owner_id)throw new TypeError('Inventory owner scope mismatch');integer(data.next_instance_id,'next_instance_id',1);integer(data.capacity,'capacity');integer(data.max_attachments,'max_attachments');
        if(data.order.length>10000)throw new RangeError('Inventory exceeds 10000 instance budget');
        if(new Set(data.order).size!==data.order.length||data.order.length!==Object.keys(data.records).length)throw new TypeError('Inventory order must list every instance exactly once');
        let slots=0;const attached=new Set(),prefix=`${data.owner_id}:item:`;
        for(const id of data.order){const record=data.records[id];if(record?.instance_id!==id)throw new TypeError('Inventory instance identity mismatch');const def=this.#validateRecord(record);if(def.type!=='attachment')slots++;
            if(id.startsWith(prefix)){const serial=Number(id.slice(prefix.length));if(!Number.isSafeInteger(serial)||serial<1||serial>=data.next_instance_id)throw new TypeError('Invalid inventory instance counter');}
            if(record.attachments.length>data.max_attachments)throw new TypeError('Too many mounted attachments');
            for(const child of record.attachments){identifier(child);const item=data.records[child],childDef=item&&this.#definition(item.definition_id);if(!childDef||childDef.type!=='attachment'||attached.has(child)||!this.#compatible(def,childDef))throw new TypeError('Invalid or duplicate mounted attachment');attached.add(child);}
        }
        if(slots>data.capacity)throw new TypeError('Inventory capacity exceeded');
        const equipped=data.equipment;
        if(equipped.weapon!==null){const item=data.records[equipped.weapon];if(!item||this.#definition(item.definition_id).type!=='weapon')throw new TypeError('Equipped weapon must reference an owned weapon instance');}
        if(new Set(equipped.attachments).size!==equipped.attachments.length)throw new TypeError('Duplicate equipped attachment');
        for(const id of equipped.attachments){const item=data.records[id];if(!item||this.#definition(item.definition_id).type!=='attachment'||attached.has(id))throw new TypeError('Equipped attachment must have one owner');}
        if(equipped.attachments.length+(equipped.weapon?data.records[equipped.weapon].attachments.length:0)>data.max_attachments)throw new TypeError('Attachment slot limit exceeded');
        return data;
    }
    get capacity(){return this.#data.capacity;}
    get max_attachments(){return this.#data.max_attachments;}
    get equipped_weapon_id(){return this.#data.equipment.weapon;}
    get equipped_attachment_ids(){return Object.freeze([...this.#data.equipment.attachments]);}
    hasInstance(id){return typeof id==='string'&&Object.hasOwn(this.#data.records,id);}
    hasItem(definition_id){return this.#data.order.some(id=>this.#data.records[id].definition_id===definition_id);}
    findItem(definition_id){const id=this.#data.order.find(id=>this.#data.records[id].definition_id===definition_id);return id?this.getItem(id):null;}
    getItem(id){
        const record=this.#record(id),prior=this.#views.get(id);if(prior?.record===record)return prior.value;
        const definition=this.#definition(record.definition_id),stats=this.#stats(record,definition);
        const value=freeze({...jsonCopy(record),id:record.definition_id,name:definition.name??record.definition_id,type:definition.type,icon:definition.icon??'',description:definition.desc??'',effect:definition.stats?.effect??definition.effect??null,weaponMode:record.state.fire_mode??definition.weaponMode??null,stats});
        this.#views.set(id,{record,value});return value;
    }
    listItems(){return Object.freeze(this.#data.order.map(id=>this.getItem(id)));}
    getEquippedWeapon(){return this.equipped_weapon_id?this.getItem(this.equipped_weapon_id):null;}
    getEquippedAttachments(){const mounted=this.equipped_weapon_id?this.#record(this.equipped_weapon_id).attachments:[];return Object.freeze([...this.#data.equipment.attachments,...mounted].map(id=>this.getItem(id)));}
    getWeaponMode(){return this.getEquippedWeapon()?.weaponMode??'none';}
    hasAttachment(effect){return this.getEquippedAttachments().some(item=>item.effect===effect);}
    getParentWeapon(id){const parent=this.#parents.get(id);return parent?this.getItem(parent):null;}
    isEquipped(id){return this.equipped_weapon_id===id||this.#data.equipment.attachments.includes(id)||this.#parents.has(id);}
    #changed(event,detail={}){for(const listener of [...(this.#listeners.get(event)??[])])listener(Object.freeze({event,...jsonCopy(detail)}));this.#notify?.(event,detail);}
    on(event,listener){identifier(event);if(typeof listener!=='function')throw new TypeError('Listener must be a function');const list=this.#listeners.get(event)??new Set();list.add(listener);this.#listeners.set(event,list);return ()=>list.delete(listener);}
    detach(){this.#listeners.clear();}
    #allocate(){const serial=this.#data.next_instance_id;integer(serial+1,'next_instance_id',1);this.#data.next_instance_id++;return `${this.#data.owner_id}:item:${serial}`;}
    createItem(definition_id,{quantity=1,state={},upgrades={}}={}){
        const record={instance_id:`${this.#data.owner_id}:item:${this.#data.next_instance_id}`,definition_id,quantity,state:jsonCopy(state),upgrades:jsonCopy(upgrades),attachments:[]};this.#validateRecord(record);record.instance_id=this.#allocate();return freeze(record);
    }
    receiveItem(packet){
        const record=jsonCopy(packet);const def=this.#validateRecord(record);if(this.hasInstance(record.instance_id))throw new Error('Item instance is already owned');
        if(record.attachments.length)throw new TypeError('Transfer mounted items as an inventory snapshot or detach them first');
        if(!this.#canFit(def))return null;
        const prefix=`${this.#data.owner_id}:item:`;if(record.instance_id.startsWith(prefix)){const serial=Number(record.instance_id.slice(prefix.length));integer(serial,'instance serial',1);integer(serial+1,'next_instance_id',1);this.#data.next_instance_id=Math.max(this.#data.next_instance_id,serial+1);}
        this.#data.records[record.instance_id]=record;this.#data.order.push(record.instance_id);this.#changed('items:acquired',{instance_id:record.instance_id,definition_id:record.definition_id});return this.getItem(record.instance_id);
    }
    #canFit(def,count=1){return this.#data.order.length+count<=10000&&(def.type==='attachment'||this.#data.order.filter(id=>this.#definition(this.#record(id).definition_id).type!=='attachment').length<this.capacity);}
    grantItem(definition_id,options={}){
        const def=this.#definition(definition_id),quantity=options.quantity??1;integer(quantity,'quantity',1);
        if(def.stackable){const item=this.listItems().find(item=>item.definition_id===definition_id&&item.quantity+quantity<=(def.max_stack??999)&&JSON.stringify(item.state)===JSON.stringify(options.state??{})&&JSON.stringify(item.upgrades)===JSON.stringify(options.upgrades??{}));if(item){this.#data.records[item.instance_id]={...this.#record(item.instance_id),quantity:item.quantity+quantity};this.#changed('items:acquired',{instance_id:item.instance_id,definition_id});return this.getItem(item.instance_id);}}
        if(!this.#canFit(def))return null;
        return this.receiveItem(this.createItem(definition_id,options));
    }
    removeItem(id){
        const item=this.#record(id);if(item.attachments.length)throw new Error('Detach mounted attachments before removing their weapon');
        if(this.#parents.has(id))throw new Error('Detach an attachment before removing it');
        const packet=freeze(jsonCopy(item));if(this.isEquipped(id))this.unequipItem(id);
        delete this.#data.records[id];this.#data.order=this.#data.order.filter(key=>key!==id);this.#views.delete(id);this.#changed('items:removed',{instance_id:id,definition_id:item.definition_id});return packet;
    }
    extractItem(id){
        const root=this.#record(id);if(this.#parents.has(id))throw new Error('Detach an attachment before transferring it separately');
        const ids=[id,...root.attachments],bundle=freeze(jsonCopy({format_version:1,root_instance_id:id,records:ids.map(key=>this.#record(key))}));
        if(this.isEquipped(id))this.unequipItem(id);
        for(const key of ids){delete this.#data.records[key];this.#views.delete(key);this.#parents.delete(key);}this.#data.order=this.#data.order.filter(key=>!ids.includes(key));
        this.#changed('items:removed',{instance_id:id,definition_id:root.definition_id});return bundle;
    }
    validateBundle(bundle){
        const copy=jsonCopy(bundle);if(copy.format_version!==1||!Array.isArray(copy.records)||!copy.records.length)throw new TypeError('Invalid item bundle');
        const data=this.#empty();data.capacity=copy.records.length;data.max_attachments=Math.max(this.max_attachments,copy.records.length);
        for(const record of copy.records){this.#validateRecord(record);if(Object.hasOwn(data.records,record.instance_id))throw new TypeError('Duplicate item bundle identity');data.records[record.instance_id]=record;data.order.push(record.instance_id);const prefix=`${data.owner_id}:item:`;if(record.instance_id.startsWith(prefix))data.next_instance_id=Math.max(data.next_instance_id,Number(record.instance_id.slice(prefix.length))+1);}
        const root=data.records[copy.root_instance_id];if(!root||new Set([root.instance_id,...root.attachments]).size!==copy.records.length||copy.records.some(record=>record!==root&&!root.attachments.includes(record.instance_id)))throw new TypeError('Invalid bundle root/children');
        this.#validate(data);return true;
    }
    receiveBundle(bundle){
        const copy=jsonCopy(bundle);if(copy.format_version!==1||!Array.isArray(copy.records)||!copy.records.length)throw new TypeError('Invalid item bundle');
        identifier(copy.root_instance_id);const root=copy.records.find(record=>record.instance_id===copy.root_instance_id);if(!root)throw new TypeError('Missing bundle root');
        const expected=new Set([root.instance_id,...root.attachments]);if(expected.size!==copy.records.length||copy.records.some(record=>!expected.has(record.instance_id)))throw new TypeError('Bundle must contain exactly the root and its attachments');
        for(const record of copy.records){this.#validateRecord(record);if(this.hasInstance(record.instance_id))throw new Error('Transferred item is already owned');}
        if(!this.#canFit(this.#definition(root.definition_id),copy.records.length))return null;
        const state=this.snapshot(),prefix=`${state.owner_id}:item:`;
        for(const record of copy.records){state.records[record.instance_id]=record;state.order.push(record.instance_id);if(record.instance_id.startsWith(prefix)){const serial=Number(record.instance_id.slice(prefix.length));integer(serial,'instance serial',1);state.next_instance_id=Math.max(state.next_instance_id,integer(serial+1,'next_instance_id',1));}}
        this.#validate(state);for(const key of Object.keys(this.#data))delete this.#data[key];Object.assign(this.#data,state);this.#views.clear();this.#indexParents();
        this.#changed('items:acquired',{instance_id:root.instance_id,definition_id:root.definition_id});return this.getItem(root.instance_id);
    }
    consumeItem(id,quantity=1){const item=this.#record(id),def=this.#definition(item.definition_id);integer(quantity,'quantity',1);if(def.type!=='consumable'||quantity>item.quantity)return false;
        if(quantity===item.quantity)this.removeItem(id);else this.#data.records[id]={...item,quantity:item.quantity-quantity};this.#changed('items:consumed',{instance_id:id,definition_id:item.definition_id,quantity,effect:def.effect??null});return true;}
    equipItem(id){
        const item=this.#record(id),def=this.#definition(item.definition_id),equipment=this.#data.equipment;
        if(def.type==='weapon'){if(equipment.attachments.length+item.attachments.length>this.max_attachments)return false;equipment.weapon=id;}
        else if(def.type==='attachment'){
            if(this.#parents.has(id))return false;
            if(equipment.attachments.includes(id))return true;
            if(this.getEquippedAttachments().length>=this.max_attachments)return false;
            equipment.attachments.push(id);
        }else return false;
        this.#changed('items:equipped',{instance_id:id,definition_id:item.definition_id,slot:def.type});return true;
    }
    unequipItem(id){if(!this.hasInstance(id)||!this.isEquipped(id))return false;const slot=this.equipped_weapon_id===id?'weapon':'attachment';const parent=this.#parents.get(id);if(parent)this.detachFromWeapon(parent,id);if(slot==='weapon')this.#data.equipment.weapon=null;else this.#data.equipment.attachments=this.#data.equipment.attachments.filter(key=>key!==id);this.#changed('items:unequipped',{instance_id:id,slot});return true;}
    unequipSlot(slot){if(slot==='weapon'){if(this.equipped_weapon_id)this.unequipItem(this.equipped_weapon_id);}else if(slot==='attachment'){for(const item of this.getEquippedAttachments())this.unequipItem(item.instance_id);}else throw new TypeError('Unknown equipment slot');}
    setItemState(id,patch){if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new TypeError('Item state patch must be a record');const record=this.#record(id),state={...record.state,...jsonCopy(patch)},next={...record,state};this.#validateRecord(next);this.#data.records[id]=next;this.#changed('items:changed',{instance_id:id});return this.getItem(id);}
    setFireMode(mode){if(!modes.includes(mode))throw new TypeError('Invalid weapon mode');if(!this.equipped_weapon_id)return false;this.setItemState(this.equipped_weapon_id,{fire_mode:mode});return true;}
    setUpgrade(id,upgrade_id,rank){const record=this.#record(id),upgrades={...record.upgrades};identifier(upgrade_id);integer(rank,'rank');if(rank)upgrades[upgrade_id]=rank;else delete upgrades[upgrade_id];const next={...record,upgrades};this.#validateRecord(next);this.#data.records[id]=next;this.#changed('items:changed',{instance_id:id});}
    attachToWeapon(weapon_id,attachment_id){
        const weapon=this.#record(weapon_id),attachment=this.#record(attachment_id),def=this.#definition(weapon.definition_id),other=this.#definition(attachment.definition_id);
        if(def.type!=='weapon'||other.type!=='attachment'||!this.#compatible(def,other))return false;
        if(this.isEquipped(attachment_id)||this.#parents.has(attachment_id)||weapon.attachments.length>=this.max_attachments||this.equipped_weapon_id===weapon_id&&this.getEquippedAttachments().length>=this.max_attachments)return false;
        this.#data.records[weapon_id]={...weapon,attachments:[...weapon.attachments,attachment_id]};this.#parents.set(attachment_id,weapon_id);this.#changed('items:changed',{instance_id:weapon_id});return true;
    }
    detachFromWeapon(weapon_id,attachment_id){const weapon=this.#record(weapon_id);if(!weapon.attachments.includes(attachment_id))return false;this.#data.records[weapon_id]={...weapon,attachments:weapon.attachments.filter(id=>id!==attachment_id)};this.#parents.delete(attachment_id);this.#changed('items:changed',{instance_id:weapon_id});return true;}
    snapshot(){return jsonCopy(this.#data);}
    load(snapshot){const copy=jsonCopy(snapshot);this.#validate(copy);for(const key of Object.keys(this.#data))delete this.#data[key];Object.assign(this.#data,copy);this.#views.clear();this.#indexParents();this.#changed('items:loaded');}
    clear(){const data=this.#empty();data.next_instance_id=this.#data.next_instance_id;this.load(data);}
    reset(ids=[]){const data=this.#empty(),draft=new itemSystem({data,catalog:this.#catalog,rules:this.#rules});for(const id of ids)if(!draft.grantItem(id))throw new Error('Default loadout exceeds inventory capacity');this.load(draft.snapshot());}
    importLegacy({items=[],equippedWeaponId=null,equippedId=null,equippedAttachments,equippedAttachmentId=null}={}){
        if(!Array.isArray(items)||items.some(id=>typeof id!=='string'))throw new TypeError('Legacy items must be catalog IDs');
        const data=this.#empty();data.capacity=Math.max(data.capacity,items.filter(id=>this.#definition(id).type!=='attachment').length);
        const draft=new itemSystem({data,catalog:this.#catalog,rules:this.#rules});for(const id of items)if(!draft.grantItem(id))throw new Error('Legacy inventory exceeds capacity');
        const weapon=draft.findItem(equippedWeaponId??equippedId);if(weapon?.type==='weapon')draft.equipItem(weapon.instance_id);
        for(const id of [...new Set(equippedAttachments??(equippedAttachmentId?[equippedAttachmentId]:[]))]){const item=draft.findItem(id);if(item?.type==='attachment')draft.equipItem(item.instance_id);}
        this.load(draft.snapshot());
    }
}
