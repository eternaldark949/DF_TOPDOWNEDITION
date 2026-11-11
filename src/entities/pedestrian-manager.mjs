import { Pedestrian } from './pedestrians.mjs';
/** Population and waypoint policy only. No positions, obstacle cache or sensing grid. */
export class PedestrianManager {
    #network = new Map();
    constructor(world, { random = Math.random, hooks = {} } = {}) {
        Object.defineProperty(this, 'physics', { value: world }); this.random = random; this.hooks = hooks;
        if (!world.elements.listEntityTypes().includes(Pedestrian.entity_type)) world.elements.registerEntityType(Pedestrian.entity_type, Pedestrian);
    }
    setNetwork(network) {
        const next = new Map(), crossingIds = new Map();
        for (const node of network.nodes ?? []) {
            if (node.id === undefined || next.has(node.id)) throw new TypeError('Sidewalk nodes need unique ids');
            const position = node.position ?? [node.x, node.y];
            if (position.length !== 2 || !position.every(Number.isFinite)) throw new TypeError('Invalid sidewalk position');
            let crossing_id = node.crosswalk_id ?? node.crosswalkData?.id ?? null;
            if (node.crosswalkData && crossing_id === null) {
                if (!crossingIds.has(node.crosswalkData)) crossingIds.set(node.crosswalkData, `crosswalk:${crossingIds.size}`);
                crossing_id = crossingIds.get(node.crosswalkData);
            }
            next.set(node.id, Object.freeze({ id: node.id, position: Object.freeze([...position]), connections: Object.freeze([...(node.connections ?? [])]),
                crossing_id, signal_id: node.signal_id ?? null }));
        }
        for (const n of next.values()) for (const id of n.connections) if (!next.has(id)) throw new TypeError(`Unknown sidewalk connection: ${id}`);
        this.#network = next;
    }
    setSignal(signal_id, state) {
        this.physics.traffic.setSignal(signal_id, state);
    }
    spawnAtNode(node_id, packet = {}) {
        const node = this.#network.get(node_id); if (!node) throw new TypeError('Unknown sidewalk node');
        const cap = this.physics.elements.asset_library.getResource('df_street:rules').data.max_pedestrians;
        if (this.getPedestrians().length >= cap) return null;
        const definition = this.physics.elements.asset_library.getTemplate('df_street:pedestrian');
        if (!this.physics.isPlacementClear(definition.collision_shape, node.position, { include_ghosts: false })) return null;
        const appearances = this.physics.elements.asset_library.getResource('df:pedestrian_appearances').data;
        const appearance_id = packet.data?.appearance_id ?? appearances[Math.floor(this.random() * appearances.length)].name;
        if (!appearances.some(a => a.name === appearance_id)) throw new TypeError('Unknown pedestrian appearance');
        const pedestrian = this.physics.elements.createCharacter({ ...packet, template: 'df_street:pedestrian', entity_type: Pedestrian.entity_type, position: node.position,
            data: { ...packet.data, appearance_id, node_id, target_node_id: null, previous_node_id: null } });
        pedestrian.connectGameplay(this.hooks); return pedestrian;
    }
    getPedestrians(results = []) { return this.physics.elements.getEntities({ entity_type: Pedestrian.entity_type }, results); }
    getVisiblePedestrians(bounds, results = []) {
        results.length = 0;
        for (const hit of this.physics.queryEntitiesInBounds({ bounds })) if (hit.entity instanceof Pedestrian) results.push(hit.entity);
        return results;
    }
    reconnectGameplay() { for (const p of this.getPedestrians()) p.connectGameplay(this.hooks); }
    updateState(seconds) {
        for (const p of this.getPedestrians()) {
            if (!p.active || p.data.state === 'dead') continue;
            if (this.physics.getAttachmentState(p)) { p.updateState(seconds); continue; }
            const d = p.data;
            if (d.arrived) { d.previous_node_id = d.node_id; d.node_id = d.target_node_id; d.target_node_id = null; d.arrived = false; d.state = 'idle'; }
            const from = this.#network.get(d.node_id); if (!from) { p.updateState(seconds); continue; }
            if (d.target_node_id === null) {
                let choices = from.connections.filter(id => id !== d.previous_node_id);
                if (!choices.length) choices = from.connections;
                d.target_node_id = choices.length ? choices[Math.floor(this.random() * choices.length)] : null;
            }
            const to = this.#network.get(d.target_node_id), crossing = !!to && from.crossing_id !== null && from.crossing_id === to.crossing_id;
            const signal_id = from.signal_id ?? to?.signal_id;
            p.updateState(seconds, { target: to?.position, crossing, signal: signal_id ? this.physics.traffic.getSignal(signal_id) : 'go' });
        }
    }
    clearStreet() { for (const p of this.getPedestrians()) p.destroy(); }
    reset() { this.clearStreet(); this.#network.clear(); }
}
