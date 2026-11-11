import { gameProp } from '../basement/physics/index.mjs';

/** Furniture/fixture gameplay metadata; no local transform or integration. */
export class ApartmentProp extends gameProp {
    static entity_type = 'df_apartment_prop';
    get interactionType() { return this.data.interaction_type ?? null; }
    get roomId() { return this.data.room_id ?? null; }
    get noteId() { return this.data.note_id ?? null; }
    get decorType() { return this.data.appearance?.decorType ?? null; }
}
