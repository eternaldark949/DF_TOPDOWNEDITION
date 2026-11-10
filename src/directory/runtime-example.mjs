import { gameLevel } from '../runtime/game-level.mjs';
import { createGameRuntime } from './game-runtime.mjs';
import definitions from './game-assets/runtime-example.json' with { type: 'json' };

// Executable composition example, not another migration of a production scene.
class RuntimeExampleLevel extends gameLevel {
    prepare({ assets }) { return assets.getResource(`df_runtime_example:${this.level_id}`).data; }
    enter(context, definition) {
        this.definition = definition;
        for (const packet of definition.entities) context.createEntity(packet);
    }
}

export function createRuntimeExample(options = {}) {
    const engine = createGameRuntime({player:{template:'df:player_949',entity_type:'df_player',position:[100,180]},...options});
    engine.api.assets.registerLibrary(definitions);
    engine.registerLevel('room_a', RuntimeExampleLevel).registerLevel('room_b', RuntimeExampleLevel);
    const player = engine.api.session.player;
    engine.registerSystem('appearance', {
        render(context, blend, frame) {
            frame.clear(context.engine.active_level.definition.background);
            const hits = context.api.render.getVisibleEntities({blend});
            for (const { entity } of hits) {
                const pose = entity.getRenderState(blend), shape = entity.collision_shape;
                frame.submit({type:'shape',position:pose.position,rotation:pose.rotation,
                    geometry:shape.shape_type==='circle'?{type:'ellipse',radii:[shape.radius,shape.radius]}:{type:'rect',size:shape.dimensions},
                    material:{fill:entity.data.color??'#c9f6ef'}});
            }
        }
    });
    return { engine, player };
}
