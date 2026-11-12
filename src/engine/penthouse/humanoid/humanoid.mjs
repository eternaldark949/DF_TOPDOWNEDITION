// ===== LV3 PENTHOUSE =====
// THE PROCEDURAL HUMANOID: a person made only of engine parts. A character body, a rig on it, the
// Directory's skeleton, clips, locomotion and figure, and Basement IK and physical chains. It
// stands, walks when its body moves, reaches, looks, can go limp in the arms, and draws itself as
// plain render packets. It is stepped by whoever owns it (`updateState()`), and never steps a world.
import { physicsSystem } from '../../basement/physics/index.mjs';
import { validateSkeleton, validateClipSet, validateLocomotion, validateFigure } from '../../directory/index.mjs';

const SIDES = Object.freeze(['l', 'r']);
const side = value => { if (!SIDES.includes(value)) throw new TypeError('A side is l or r'); return value; };
const strip = ({ kind, ...data }) => data;

export class humanoid {
    #physics; #kit; #arms = new Set();
    /**
     * `physics` is the world; its data source must hold `template` (the engine registry from
     * `createEngineRegistry()` does). Pass `entity` instead to take over a humanoid restored from a save.
     * Any other fields are the body's packet (position, rotation, name, data…). `height` scales the skeleton.
     */
    constructor(physics, { template = 'engine:humanoid', entity = null, height = 1, ...packet } = {}) {
        if (!(physics instanceof physicsSystem)) throw new TypeError('A humanoid needs a physics world');
        this.#physics = physics;
        const source = physics.elements.asset_library;
        const assets = entity ? entity.assets : source.resolveTemplate(template).assets ?? {};
        for (const slot of ['skeleton', 'clips', 'locomotion', 'figure']) if (!assets[slot]) throw new TypeError(`Template ${template} has no ${slot} asset`);
        const skeleton = validateSkeleton(source.getResource(assets.skeleton)), clips = validateClipSet(source.getResource(assets.clips));
        this.#kit = { locomotion: validateLocomotion(source.getResource(assets.locomotion)), figure: validateFigure(source.getResource(assets.figure)) };
        if (entity) {
            this.entity = entity; this.rig = physics.rigs.getRig(entity);
            if (!this.rig) throw new TypeError('The restored entity has no rig');
            for (const chain of physics.rigs.getPhysicalChains(entity)) if (chain.chain_id.startsWith('arm_')) this.#arms.add(chain.chain_id.slice(4));
        } else {
            if (!Number.isFinite(height) || height <= 0) throw new TypeError('A humanoid height is a positive number');
            const definition = strip(structuredClone(skeleton)), root = definition.joints.find(joint => joint.parent == null);
            root.scale = (root.scale ?? [1, 1]).map(v => v * height);
            this.entity = physics.elements.createCharacter({ ...packet, template });
            this.rig = physics.rigs.createRig(this.entity, { definition, clips: clips.clips });
            this.rig.play(this.#kit.locomotion.idle);
        }
        const joints = new Set(this.rig.definition.getJointNames());
        for (const part of this.#kit.figure.parts) if (!joints.has(part.joint) || (part.to && !joints.has(part.to))) throw new TypeError(`Figure part ${part.part} names a joint the skeleton lacks`);
    }

    /** Stands or walks by how fast the body is going; walking runs on distance, so a blocked body stops stepping. */
    updateState() {
        const { idle, walk, stride, moving_speed } = this.#kit.locomotion, [vx, vy] = this.entity.linear_velocity;
        if (Math.hypot(vx, vy) > moving_speed) this.rig.play(walk, { fade: .15, distance_per_cycle: stride });
        else this.rig.play(idle, { fade: .25 });
        return this;
    }

    /** Puts a hand on a world point with two-bone IK, elbow outward. `weight` blends it in. */
    reachFor(hand, target, { weight = 1 } = {}) {
        side(hand); this.rig.setIkGoal('reach_' + hand, { solver: 'two_bone', joints: ['shoulder_' + hand, 'elbow_' + hand, 'hand_' + hand], target, space: 'world', weight, bend: hand === 'l' ? 1 : -1 });
        return this;
    }
    release(hand) { side(hand); this.rig.removeIkGoal('reach_' + hand); return this; }
    /** Turns the head toward a world point, at most `max_angle` from where the clip holds it. */
    lookAt(target, { max_angle = 1.2, weight = 1 } = {}) { this.rig.setIkGoal('look', { solver: 'look_at', joints: ['head'], target, space: 'world', max_angle, weight }); return this; }
    stopLooking() { this.rig.removeIkGoal('look'); return this; }

    /**
     * Makes an arm physical: upper arm and forearm become hinged bodies that follow the pose but
     * swing, trail and take hits. `follow_torque` 0 is a limp arm.
     */
    setPhysicalArm(arm, on, { follow_rate = 20, follow_torque = 1e5, mass = 1 } = {}) {
        side(arm); const id = 'arm_' + arm;
        if (on && !this.#arms.has(arm)) { this.#physics.rigs.createPhysicalChain(this.entity, { chain_id: id, joints: ['shoulder_' + arm, 'elbow_' + arm, 'hand_' + arm], radius: 2.5, mass, follow_rate, follow_torque }); this.#arms.add(arm); }
        else if (!on && this.#arms.has(arm)) { this.#physics.rigs.removePhysicalChain(this.entity, id); this.#arms.delete(arm); }
        return this;
    }
    get physical_arms() { return [...this.#arms]; }

    /**
     * The figure as render packets in world space, back to front: `{part, shape, center, rotation,
     * radius | radii}` for circles and ellipses and `{part, shape, from, to, radius}` for capsules.
     * Sizes carry the rig's scale. Reading never advances anything.
     */
    getRenderPacket({ blend = 1 } = {}) {
        const pose = this.#physics.rigs.getPose(this.entity, { blend, world_space: true }).joints, state = this.entity.getRenderState(blend);
        const parts = this.#kit.figure.parts.map(p => {
            const at = pose[p.joint], size = Math.abs(at.scale[1]);
            if (p.shape === 'capsule') return { part: p.part, shape: 'capsule', from: at.position, to: pose[p.to].position, radius: p.radius * size };
            return { part: p.part, shape: p.shape, center: at.position, rotation: at.rotation, ...(p.shape === 'circle' ? { radius: p.radius * size } : { radii: [p.radii[0] * Math.abs(at.scale[0]), p.radii[1] * size] }) };
        });
        return { entity_id: this.entity.entity_id, position: state.position, rotation: state.rotation, parts };
    }

    /** Removes the body, which removes its rig, IK goals and physical arms. */
    remove() { this.entity.destroy(); }
}
