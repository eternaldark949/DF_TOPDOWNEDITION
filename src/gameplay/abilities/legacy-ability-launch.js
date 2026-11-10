// Explicit legacy-world boundary. Delete when the classic NPC/city projectile owners retire.
// Balance and ability ownership are shared; this function never creates a surrogate native body.
function castAbilityProjectile(source, angle, abilityId, opts = {}) {
    if(source?.physics_system)throw new Error('Native actors cast through abilitySystem');
    if (!source.abilities?.hasAbility(abilityId)) return null;
    const definition=source.abilities.getDefinition(abilityId),origin=opts.origin??source;
    const shot=new ProjectileEntity({x:origin.x,y:origin.y,angle:angle+(Math.random()-.5)*definition.spread,
        isEnemy:opts.isEnemy??false,owner:source,color:definition.color,speed:definition.speed/60,
        damage:definition.damage,life:definition.lifetime*60,radius:definition.radius,penetrating:false});
    shot.abilityId=abilityId;
    return shot;
}
