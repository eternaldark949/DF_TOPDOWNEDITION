// ===== LV1 LOBBY =====
/**
 * Travel between levels through their exits. Each step it notes the exit the leading traveller
 * stands in (a map level's `exitAt`); `travel()` then loads the exit's target level, carrying the
 * travellers: the leader is placed just inside the exit leading back, the rest beside it. An exit marked
 * `auto` travels on contact. The game says who travels (`get_travellers`: leader first, each must be a
 * session or retained entity: the runtime retires level entities on the way out) and may veto an exit (`can_travel`). The current and
 * previous level ids are plain state, saved with the game and given back with `loadState`.
 */
export class travelSystem {
    #context = null; #get; #can; #listeners = new Set(); #pending = null;
    exit = null; previous_level = null;
    constructor({ get_travellers, can_travel = () => true } = {}) {
        if (typeof get_travellers !== 'function' || typeof can_travel !== 'function') throw new TypeError('travelSystem needs get_travellers (and an optional can_travel) function');
        this.#get = get_travellers; this.#can = can_travel;
    }
    attach(context) { this.#context = context; }
    detach() { this.#context = null; this.#listeners.clear(); }
    get traveling() { return this.#pending !== null; }
    #travellers() { return (this.#get(this.#context) ?? []).filter(e => e && !e.destroyed); }
    afterPhysics(context) {
        const level = context.engine.active_level, [leader] = this.#travellers();
        const exit = leader && typeof level?.exitAt === 'function' && !this.#pending ? level.exitAt(leader) : null;
        const offer = exit ? { target: exit.target, label: exit.label, auto: exit.auto, available: context.engine.listLevels().includes(exit.target) && !!this.#can(exit, context) } : null;
        const changed = (offer?.target ?? null) !== (this.exit?.target ?? null);
        this.exit = offer;
        if (changed) for (const listener of this.#listeners) listener(offer);
        if (offer?.auto && offer.available) this.travel().catch(() => {});
    }
    levelLeaving() { this.exit = null; }
    /** Calls `listener(exit | null)` whenever the exit under the leader changes. Returns an unsubscribe function. */
    onExitChanged(listener) { if (typeof listener !== 'function') throw new TypeError('Listener must be a function'); this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
    /**
     * Loads `target` (default: the offered exit's), carrying the travellers. Resolves to the new level;
     * rejects if there is no exit to take or the load fails (the runtime then has the old level unloaded
     * only if entry itself failed, as loadLevel documents).
     */
    async travel(target = this.exit?.available ? this.exit.target : null) {
        const context = this.#context;
        if (!context) throw new Error('travelSystem is detached');
        if (this.#pending) return this.#pending;
        if (typeof target !== 'string') throw new Error('There is no exit to take here');
        const from = context.engine.active_level?.level_id ?? null, travellers = this.#travellers().map(e => e.entity_id);
        this.#pending = context.engine.loadLevel(target, { arrival: { from }, travellers });
        try { const level = await this.#pending; this.previous_level = from; return level; }
        finally { this.#pending = null; }
    }
    saveState() { return { level_id: this.#context?.engine.active_level?.level_id ?? null, previous_level: this.previous_level }; }
    loadState(state) { if (!state || (state.previous_level !== null && typeof state.previous_level !== 'string')) throw new TypeError('Invalid travel state'); this.previous_level = state.previous_level; }
}
