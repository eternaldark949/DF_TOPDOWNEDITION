/** Content/lifecycle contract. A level never owns a world, clock or collision solver. */
export class gameLevel {
    constructor({ level_id } = {}) {
        if (typeof level_id !== 'string' || !level_id.trim()) throw new TypeError('A level requires level_id');
        Object.defineProperty(this, 'level_id', { value: level_id, enumerable: true });
    }
    // Preparation may be asynchronous. Its context contains assets, not a live world.
    prepare({ assets }, options) { return options; }
    enter(context, prepared) {}
    beforePhysics(context, seconds) {}
    afterPhysics(context, seconds) {}
    render(context, blend, frame) {}
    leave(context) {}
    disposePrepared(prepared) {}
}
