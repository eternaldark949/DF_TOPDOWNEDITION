// ===== LV0 BASEMENT =====
import { bodyRecord, bindBody } from './state.mjs';

/** A handle, never a second mutable copy of physical state. */
export class physicsBody {
    constructor(record) { bindBody(this, record); Object.defineProperty(this, 'body_id', { value: record.id, enumerable: true }); Object.freeze(this); }
    // Frozen copies of just the vector: reading a position never copies the whole state.
    get position() { return Object.freeze([...bodyRecord(this).position]); }
    get rotation() { return bodyRecord(this).rotation; }
    get linear_velocity() { return Object.freeze([...bodyRecord(this).velocity]); }
    get angular_velocity() { return bodyRecord(this).angular_velocity; }
    getState(result = {}) { return bodyRecord(this).world._readBody(this, result); }
    getRenderState(blend, result = {}) { return bodyRecord(this).world._renderBody(this, blend, result); }
    setPosition(position, options = {}) { return bodyRecord(this).world._command(this, 'position', { position, ...options }); }
    setRotation(rotation, options = {}) { return bodyRecord(this).world._command(this, 'rotation', { rotation, ...options }); }
    setLinearVelocity(velocity, options = {}) { return bodyRecord(this).world._command(this, 'velocity', { velocity, ...options }); }
    /** Up (+) or down (-) speed in world units a second: a jump, a toss, a drop. */
    setVerticalVelocity(vertical_velocity) { return bodyRecord(this).world._command(this, 'vertical_velocity', { vertical_velocity }); }
    setAngularVelocity(angular_velocity) { return bodyRecord(this).world._command(this, 'angular_velocity', { angular_velocity }); }
    applyForce(force, options = {}) { return bodyRecord(this).world._command(this, 'force', { force, ...options }); }
    applyTorque(torque) { return bodyRecord(this).world._command(this, 'torque', { torque }); }
    applyImpulse(impulse, options = {}) { return bodyRecord(this).world._command(this, 'impulse', { impulse, ...options }); }
    applyAngularImpulse(angular_impulse) { return bodyRecord(this).world._command(this, 'angular_impulse', { angular_impulse }); }
    applyImpact(packet) { return bodyRecord(this).world._command(this, 'impact', packet); }
    stopMovement() { return bodyRecord(this).world._command(this, 'stop', {}); }
    wakeBody() { return bodyRecord(this).world._command(this, 'wake', {}); }
    sleepBody() { return bodyRecord(this).world._command(this, 'sleep', {}); }
}
