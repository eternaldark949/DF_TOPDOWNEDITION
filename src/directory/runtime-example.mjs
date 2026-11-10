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
    const engine = createGameRuntime(options);
    engine.api.assets.registerLibrary(definitions);
    engine.registerLevel('room_a', RuntimeExampleLevel).registerLevel('room_b', RuntimeExampleLevel);
    const player = engine.createEntity({ template:'df:player_949', entity_type:'df_player', position:[100,180] }, { lifetime:'session' });
    engine.registerSystem('input', { beforePhysics(context) { player.setMovement(context.api.controls.direction('move')); } });
    engine.registerSystem('canvas', {
        render(context, blend, canvas) {
            if (!canvas) return;
            const ctx = canvas.getContext('2d'), world = context.api.physics;
            ctx.fillStyle = context.engine.active_level.definition.background; ctx.fillRect(0,0,canvas.width,canvas.height);
            const hits = world.queryEntitiesInBounds({ bounds:{left:0,top:0,right:canvas.width,bottom:canvas.height}, bounds_type:'render' });
            for (const { entity } of hits) {
                const pose = entity.getRenderState(blend), shape = entity.collision_shape;
                ctx.save(); ctx.translate(...pose.position); ctx.rotate(pose.rotation); ctx.fillStyle = entity.data.color ?? '#c9f6ef';
                if (shape.shape_type === 'circle') { ctx.beginPath(); ctx.arc(0,0,shape.radius,0,Math.PI*2); ctx.fill(); }
                else { const [width,height] = shape.dimensions; ctx.fillRect(-width/2,-height/2,width,height); }
                ctx.restore();
            }
        }
    });
    return { engine, player };
}
