import gunnerRules from './game-gunner-rules.json' with {type:'json'};
import enemies from './game-db/enemies.json' with {type:'json'};
import definitions from './game-db/items.json' with {type:'json'};

/** Concrete item definitions stay in the Directory; gameplay receives plain catalog data. */
export function createItemCatalog(items=definitions,{enemy_kinds=enemies.kinds}={}) {
    const catalog=structuredClone(items.gear);
    for(const [id,item] of Object.entries(items.consumables??{})){
        // The classic loader adds these callbacks to its table. Catalogs carry
        // declarative effects; callbacks remain in the explicit gameplay policy.
        const {unlockCheck,onActivate,onExpire,...data}=item;
        catalog[`consumable:${id}`]={...structuredClone(data),type:'consumable',stackable:true,max_stack:99,desc:item.description??item.desc??'',effect:{kind:'buff',buff_id:id}};
    }
    for(const [id,item] of Object.entries(items.notes??{}))catalog[`note:${id}`]={...structuredClone(item),type:'intel',name:item.title??id,desc:item.description??'',effect:{kind:'note',note_id:id}};
    const gun=enemy_kinds.ganger.gun;
    catalog.pistol_ganger={name:'Ganger sidearm',type:'weapon',weaponMode:'normal',icon:'🔫',stats:{fireRate:gun.fireRate,damage:gun.damage,projectileColor:gun.color,projectileSpeed:gun.speed,spread:gun.spread,penetrating:gun.penetrating??false,sticky:gun.sticky??false}};
    const rotary=gunnerRules.gun,gunner=enemy_kinds.gatling_gunner;
    catalog.gatling_gunner={name:'Gatling rotary',type:'weapon',weaponMode:'normal',stats:{fireRate:gunner.burst_delay,damage:rotary.damage,projectileColor:rotary.color,projectileSpeed:rotary.speed,projectileLife:rotary.life,spread:rotary.spread}};
    return catalog;
}
