import definitions from './game-db/items.json' with {type:'json'};

/** Concrete item definitions stay in the Directory; gameplay receives plain catalog data. */
export function createItemCatalog(items=definitions) {
    const catalog=structuredClone(items.gear);
    for(const [id,item] of Object.entries(items.consumables??{})){
        // The classic loader adds these callbacks to its table. Catalogs carry
        // declarative effects; callbacks remain in the explicit gameplay policy.
        const {unlockCheck,onActivate,onExpire,...data}=item;
        catalog[`consumable:${id}`]={...structuredClone(data),type:'consumable',stackable:true,max_stack:99,desc:item.description??item.desc??'',effect:{kind:'buff',buff_id:id}};
    }
    for(const [id,item] of Object.entries(items.notes??{}))catalog[`note:${id}`]={...structuredClone(item),type:'intel',name:item.title??id,desc:item.description??'',effect:{kind:'note',note_id:id}};
    return catalog;
}
