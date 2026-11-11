export const TAP = 0;
export const DOUBLETAP = 1;
export const HELD = 2;
export const PRESS = 3;
export const REPEAT = 4;
export const RELEASE = 5;

export function cleanupAll(tasks,message) {
    const errors=[];for(const task of tasks)try{task();}catch(error){errors.push(error);}
    if(errors.length)throw new AggregateError(errors,message);
}

export function radialStick(value, dead_zone = 0.15) {
    if (!Number.isFinite(dead_zone) || dead_zone < 0 || dead_zone >= 1) throw new TypeError('dead_zone must be in [0,1)');
    const [x,y] = value, magnitude = Math.hypot(x,y);
    if (!Number.isFinite(magnitude) || magnitude <= dead_zone) return {x:0,y:0,m:0};
    const m = Math.min(1,(magnitude-dead_zone)/(1-dead_zone));
    return {x:x/magnitude*m,y:y/magnitude*m,m};
}
