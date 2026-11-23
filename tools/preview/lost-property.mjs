// The preview's lost-property interaction uses native entities, the world clock and HUD bindings.
const SEARCH_RANGE = 60;
const STARTING_PERSONICS = 100;
const EMPTY = 'EMPTY. SOMEONE BEAT YOU TO IT.';
const SAVE_KEY = 'dfab.preview.lost_property.v1';

export function lostProperty({ engine, walker, canInteract }) {
    const { ui, time } = engine;
    const { elements } = engine.basement.physics;
    let balance = STARTING_PERSONICS, claims = new Map(), props = [], target = null;
    let currentDay = '', noticeLeft = 0;
    const date = () => [time.year, time.month, time.day].join('-');
    const key = prop => engine.active_level.level_id + ':' + prop.get('authored_id');

    function refresh() {
        currentDay = date();
        for (const prop of props) prop.set('searched', claims.get(key(prop)) === currentDay);
    }

    function notify(message) {
        noticeLeft = 3.5;
        ui.setValue('loot.notice', message);
    }

    function nearby() {
        if (!canInteract()) return null;
        let nearest = null, distance = SEARCH_RANGE;
        for (const prop of props) {
            const gap = walker.distanceTo(prop);
            if (gap < distance) { nearest = prop; distance = gap; }
        }
        return nearest;
    }

    function publishTarget(next) {
        if (target === next) return;
        target = next;
        ui.setValue('loot.prompt', target ? 'Search · ' + target.get('loot').label : '');
    }

    return {
        get balance() { return balance; },
        levelEntered() { props = elements.getEntities({ tag: 'lost_property' }); refresh(); },
        levelLeaving() {
            props = [];
            publishTarget(null);
            ui.setValue('loot.notice', '');
            noticeLeft = 0;
        },
        afterPhysics(context, seconds) {
            if (props.length && date() !== currentDay) refresh();
            publishTarget(nearby());
            if (noticeLeft > 0) {
                noticeLeft -= seconds;
                if (noticeLeft <= 0) ui.setValue('loot.notice', '');
            }
        },
        search() {
            const prop = nearby();
            if (!prop) return false;
            if (date() !== currentDay) refresh();
            const id = key(prop);
            if (claims.get(id) === currentDay) {
                notify(EMPTY);
                return true;
            }
            const { minimum, maximum, messages } = prop.get('loot');
            const amount = minimum + Math.floor(Math.random() * (maximum - minimum + 1));
            claims.set(id, currentDay);
            prop.set('searched', true);
            balance += amount;
            notify('+' + amount + ' PERSONICS — ' + messages[Math.floor(Math.random() * messages.length)]);
            return true;
        },
        state() { return { balance, claims: [...claims] }; },
        restore(state) {
            balance = state?.balance ?? STARTING_PERSONICS;
            claims = new Map(state?.claims ?? []);
            refresh();
        },
        notify
    };
}

export function readPreviewSave() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw), clock = save.clock;
    if (save.version !== 1 || typeof save.level !== 'string' || !Array.isArray(save.position) ||
        save.position.length !== 2 || !save.position.every(Number.isFinite) || !Number.isFinite(save.rotation) ||
        !clock || ![clock.year, clock.month, clock.day].every(Number.isInteger) ||
        !Number.isFinite(clock.time_of_day) || clock.time_of_day < 0 || clock.time_of_day >= 86400 ||
        !Number.isFinite(clock.speed) || clock.speed < 0 ||
        !Number.isSafeInteger(save.loot?.balance) || save.loot.balance < 0 || !Array.isArray(save.loot.claims) ||
        !save.loot.claims.every(entry => Array.isArray(entry) && entry.length === 2 && entry.every(value => typeof value === 'string'))) {
        throw new TypeError('Invalid preview save');
    }
    return save;
}

export function writePreviewSave(save) {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...save, version: 1 }));
}
