import {gameProp} from '../../engine/basement/physics/index.mjs';
/** The dropped bundle is owned here until pickup; the inherited body is the only live pose. */
export class WorldLoot extends gameProp{
 static entity_type='df_world_loot';
 get bundle(){return this.data.item_bundle;}
 get definition_id(){return this.bundle.records.find(record=>record.instance_id===this.bundle.root_instance_id).definition_id;}
}
