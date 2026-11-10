import { gameCharacter } from '../basement/physics/index.mjs';
const services = new WeakMap();

/** Gameplay identity and health. The inherited body/controller own every physical value. */
export class Player extends gameCharacter {
    static entity_type = 'df_player';
    connectGameplay({ game, buff_system } = {}) { services.set(this, { game, buff_system }); return this; }
    get buffSystem() { return services.get(this)?.buff_system; }
    get visible() { return this.data.visible !== false; }
    set visible(value) { this.data.visible = !!value; }
    get hp() { return this.data.health; }
    set hp(value) { this.data.health = value; }
    get maxHp() { return this.data.max_health; }
    set maxHp(value) { this.data.max_health = value; }
    get dead() { return this.hp <= 0; }
    get alliance() { return 'friendly'; }
    get radius() { return this.collision_shape.radius; }
    get isHidden() { return !!this.data.hidden; }
    set isHidden(value) { this.data.hidden = !!value; }
    syncHealth(health, maximum=this.maxHp??100) { this.data.health = health; this.data.max_health = maximum; }
    takeDamage(amount, { impulse } = {}) {
        const game = services.get(this)?.game;
        if (this.dead || game?.flitState?.active) return false;
        this.hp = Math.max(0, this.hp - amount);
        if (impulse) this.body.applyImpulse(impulse);
        if (game) { game.playerHealth = this.hp; game.lastHurtAt = game.physics_system.simulation_tick * game.physics_system.config.fixed_step; }
        return true;
    }
}
