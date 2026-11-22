// The native HUD owns the stick elements; Controls owns touch capture and geometry.
export function mountPreviewSticks(ui, controls, weapons) {
    const item = id => ui.root.querySelector('[data-ui="hud"] [data-ui-item="' + id + '"]');
    const aim = item('touch_aim');
    const face = state => { aim.dataset.stickState = state; };
    controls.touch.stick('move', {
        zone: item('touch_move'), base: item('touch_move_base'), knob: item('touch_move_knob'),
        anchor: 'touch', travel: 60, base_radius: 64, edge: 80
    });
    controls.touch.stick('aim', {
        zone: aim, knob: item('touch_aim_knob'), anchor: 'centre', travel: 74,
        ring: [62, 45], input: 'touchAimFire',
        onStart: () => face('aiming'),
        onMove: sample => face(sample.out ? (weapons.firesOnRelease() ? 'armed' : 'firing') : 'aiming'),
        onEnd: (sample, event) => {
            if (!event.cancelled && sample.out && weapons.firesOnRelease()) {
                weapons.releaseShot([Math.cos(sample.angle), Math.sin(sample.angle)]);
            }
            face('idle');
        }
    });
    face('idle');
}
