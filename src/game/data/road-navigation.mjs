/**
 * The city's lane network as Basement navigation road data.
 *
 * Each city lane becomes one directed navigation lane between two nodes
 * (`<lane>:in` where it starts, `<lane>:out` where it ends). Each turn path
 * through a junction becomes a connector lane from the incoming lane's `:out`
 * node to the outgoing lane's `:in` node. Routes can therefore only take turns
 * that the city actually has. The output is plain data: it can be stored in
 * the Directory or built from a live network, and holds no references to it.
 */
export function roadNavigationData(network, { speed_limit = 180, turn_speed_limit = 90, turn_samples = 6, profiles = ['car'] } = {}) {
    if (!network?.lanes || !network?.turnPaths) throw new TypeError('roadNavigationData needs a built road network (lanes and turnPaths)');
    const nodes = [], lanes = [], seen = new Set(), point = p => [p.x, p.y];
    const node = (node_id, position) => { if (!seen.has(node_id)) { seen.add(node_id); nodes.push({ node_id, position }); } };
    for (const lane of network.lanes) {
        if (!(lane.length > 1e-6)) continue;
        node(`${lane.id}:in`, point(lane.start)); node(`${lane.id}:out`, point(lane.end));
        lanes.push({ lane_id: lane.id, from: `${lane.id}:in`, to: `${lane.id}:out`, speed_limit, profiles: [...profiles], road_id: lane.roadId });
    }
    for (const turn of network.turnPaths) {
        const from = `${turn.fromLaneId}:out`, to = `${turn.toLaneId}:in`;
        if (!seen.has(from) || !seen.has(to)) continue;
        const points = [];
        for (let i = 1; i < turn_samples; i++) {
            const p = point(turn.getPoint(i / turn_samples)), last = points.at(-1);
            if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) points.push(p);
        }
        lanes.push({ lane_id: turn.id, from, to, points, speed_limit: turn_speed_limit, profiles: [...profiles], turn: turn.turnType });
    }
    return { nodes, lanes };
}

/** Registers road data (from roadNavigationData or the Directory) on a world's navigation. */
export function loadRoadNavigation(roads, data) {
    for (const n of data.nodes) roads.addNode(n.node_id, { position: n.position });
    for (const l of data.lanes) roads.addLane(l.lane_id, { from: l.from, to: l.to, points: l.points ?? [], speed_limit: l.speed_limit, profiles: l.profiles, cost_scale: l.cost_scale ?? 1 });
    return roads.getStatistics();
}
