import { identifier, jsonCopy, nonnegative } from './values.mjs';

const recordNames = ['inventory', 'equipment', 'quests', 'roster', 'progression'];

/** Persistent game records and a reference to the official player, never a body or health mirror. */
export class gameSession {
    #state; #context = null; #listeners = new Map(); #playerPacket;
    constructor({ player, state } = {}) {
        this.#playerPacket = jsonCopy(player ?? {template:'df:player_949', entity_type:'df_player'});
        this.#state = this.#validate(state ?? {format_version:1, player_entity_id:null, currency:0, inventory:{}, equipment:{}, quests:{}, roster:{}, progression:{}});
    }
    #validate(state) {
        const copy = jsonCopy(state);
        if (copy.format_version !== 1 || Object.keys(copy).some(key => !['format_version','player_entity_id','currency',...recordNames].includes(key))) throw new TypeError('Unsupported session snapshot');
        if (copy.player_entity_id !== null && (!Number.isSafeInteger(copy.player_entity_id) || copy.player_entity_id < 1)) throw new TypeError('Invalid player entity ID');
        nonnegative(copy.currency, 'currency');
        for (const name of recordNames) if (!copy[name] || Array.isArray(copy[name]) || typeof copy[name] !== 'object') throw new TypeError(`Invalid session record: ${name}`);
        for (const count of Object.values(copy.inventory)) if (!Number.isSafeInteger(count) || count < 0) throw new TypeError('Inventory counts must be nonnegative safe integers');
        return copy;
    }
    get player_entity_id() { return this.#state.player_entity_id; }
    get player() { return this.#context?.api.elements.fetchEntity(this.player_entity_id) ?? null; }
    get currency() { return this.#state.currency; }
    attach(context) {
        if (this.#context) throw new Error('Session is already attached');
        if (this.player_entity_id !== null) {
            const existing = context.api.elements.fetchEntity(this.player_entity_id);
            if (!existing || existing.entity_type !== 'df_player' || existing.destroyed) throw new Error('Session player must resolve to an official live Player');
            context.engine.retainEntity(existing);
        } else {
            const player = context.createEntity(this.#playerPacket, {lifetime:'session'});
            if (player.entity_type !== 'df_player') { player.destroy(); throw new TypeError('Session requires a Player entity'); }
            this.#state.player_entity_id = player.entity_id;
        }
        this.#context = context;
    }
    detach() { this.#context = null; this.#listeners.clear(); }
    snapshot() { return jsonCopy(this.#state); }
    getRecord(collection, key) { this.#collection(collection); identifier(key); const value=this.#state[collection][key]; return value === undefined ? undefined : jsonCopy(value); }
    setRecord(collection, key, value) {
        this.#collection(collection); identifier(key);
        if (collection === 'inventory') throw new TypeError('Use addItem to change inventory counts');
        const copy = jsonCopy(value); this.#state[collection][key] = copy;
        this.emit('session:changed', {collection, key}); return this;
    }
    #collection(name) { if (!recordNames.includes(name)) throw new TypeError(`Unknown session collection: ${name}`); }
    addItem(item_id, count = 1) {
        identifier(item_id);
        const total=(this.#state.inventory[item_id] ?? 0)+count;
        if (!Number.isSafeInteger(count) || !Number.isSafeInteger(total) || total < 0) throw new TypeError('Inventory change must leave a nonnegative safe integer count');
        this.#state.inventory[item_id]=total; this.emit('session:changed',{collection:'inventory',key:item_id}); return total;
    }
    changeCurrency(amount) {
        if (!Number.isFinite(amount)) throw new TypeError('Currency change must be finite');
        const total=nonnegative(this.currency+amount,'currency'); this.#state.currency=total;
        this.emit('session:changed',{collection:'currency'}); return total;
    }
    on(event, listener) {
        identifier(event); if (typeof listener !== 'function') throw new TypeError('Listener must be a function');
        const listeners=this.#listeners.get(event) ?? new Set(); this.#listeners.set(event,listeners); listeners.add(listener);
        return () => { listeners.delete(listener); if(!listeners.size)this.#listeners.delete(event); };
    }
    emit(event, detail = {}) {
        identifier(event); const packet=Object.freeze({...jsonCopy(detail),event});
        for (const listener of [...(this.#listeners.get(event) ?? [])]) listener(packet);
    }
}
