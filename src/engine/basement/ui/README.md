# uiSystem: screens as data

One overlay over the game for every screen: the main menu, the pause menu and its pages, the HUD, dialogue, the phone. A screen is a **context**: a record of items, a layout and transitions. Screens open along a stack, the menu actions move focus and press items, and items read live values. Nothing in the engine is named after a screen; what a screen does is in its data.

The engine makes one and hands it out as `engine.ui` (also `engine.basement.ui`). The Lobby runs it every poll in the input phase, paused or not, since it is how a pause ends.

## Quick start

```js
const ui = engine.ui;
ui.define({
    name: 'pause', modal: true, pauses_game: true, controls: 'menu', open_with: 'pause', focus: 'resume',
    transition: { in: { kind: 'fade', seconds: .3 }, out: { kind: 'fade', seconds: .2 } },
    items: [
        { id: 'title', type: 'label', text: 'Paused' },
        { id: 'resume', type: 'button', text: 'Resume', on_click: { close: 'pause' } },
        { id: 'music', type: 'toggle', text: 'Music', value: '{options.music}' },
        { id: 'quit', type: 'button', text: 'Quit', on_click: { event: 'quit' } }
    ]
});
engine.basement.controls.bind('pause', 'Escape', 'gamepadStart');   // the gameplay action that opens it
ui.setValue('options', { music: true });
ui.on('set', ({ path, value }) => { if (path === 'options.music') music.mute(!value); });
ui.on('quit', () => engine.loadLevel('title'));
```

That is a working pause menu: Escape opens it and pauses the game, arrows or the d-pad move focus, Enter or A presses, left and right flip the toggle, Escape or B goes back and the game runs again. The mouse hovers and clicks the same items.

From the Directory, screens are `screen` resources in a library and fonts are `font` resources:

```js
import { screensOf, fontsOf } from './engine/directory/index.mjs';
ui.define(screensOf(registry));
await ui.addFonts(fontsOf(registry));
```

## A screen

| Field | What it does |
| --- | --- |
| `name` | Lower case words joined by `_`; a page is `parent.page` (`pause.settings`) |
| `items` | The items, drawn in order |
| `layout` | `{ kind: list \| grid \| free, direction: column \| row, spacing: px \| "auto", align, justify, columns, wrap }`. `auto` spacing spreads the items evenly. `free` places each item by its `position` |
| `focus` | The item in focus on entry (else the first that can take it) |
| `transition` | `{ in: { kind: fade \| slide \| none, seconds, from }, out: {…} }`; `from` is the side a slide comes from |
| `pauses_game` | Pauses the game while open (reason `ui:<name>`) |
| `controls` | The input context to use while it is on top, such as `menu` |
| `modal` | Takes the menu actions and blocks clicks to what is beneath; Back closes it |
| `closes_on_back` | `false` keeps a modal screen open on Back (a main menu) |
| `open_with` | A gameplay action that opens it (`pause`) |
| `style`, `class`, `css` | Its look: CSS properties, class names, and CSS rules (text or a list) added to the page once |
| `layer` | Higher layers draw over lower ones, whatever order they opened in |

## An item

| Field | What it does |
| --- | --- |
| `id`, `type` | `type` is `button`, `label`, `list`, `slider`, `toggle`, `image`, `bar`, `panel` or `input` |
| `text` | What it says; `"{path}"` reads a value live: `"PP: {player.pp}"` |
| `value` | A toggle's, slider's, bar's or input's value. A lone `"{options.volume}"` binds it both ways: changing the item writes the value |
| `position` | `{ anchor: top_left \| top \| top_right \| left \| centre \| right \| bottom_left \| bottom \| bottom_right, offset: [x, y] }`, or leave it to the layout |
| `style`, `class` | Its look |
| `states` | Style laid over its own for `inactive`, `active` (a toggle that is on), `focus`, `hover`, `pressed` |
| `animations` | `{ enter, leave, hover, click, focus }`, each `{ name, seconds, delay, stagger, easing }`. Names: fade, slide_left, slide_right, slide_up, slide_down, pop, pulse, press, glow, shake. `stagger` delays each sibling a little more |
| `on_click`, `on_hover`, `on_focus`, `on_change` | What happens: one verb, or a list run in order (below) |
| `enabled`, `visible`, `focusable` | `true`, `false` or a `"{value}"` read live. Inactive and hidden items are skipped by focus |
| `items`, `layout` | A `panel` or `list` holds items and lays them out |
| `from`, `template`, `empty` | A `list` filled from a list value: one `template` item per entry, which reads `{item.x}` and `{index}`; `empty` is shown when there is none. Entries are `<list id>.<index>` |
| `min`, `max`, `step` | A slider's range (a bar's too: `max` defaults to 1) |
| `choices` | A slider that steps through values: `[1, 2]` or `[{ value, text }]` |
| `value_text`, `on_text`, `off_text` | How a slider shows its value (`"{value}%"`), and a toggle's words (ON and OFF) |
| `src`, `placeholder` | An image's picture; an input's hint |

### Verbs

| Action | Does |
| --- | --- |
| `{ "open": "pause.settings", "data": {…} }` | Opens a screen on top, with data it reads as `{data.x}` |
| `{ "back": true }` | Closes the top modal screen |
| `{ "close": "pause" }` | Closes that screen and every screen opened above it |
| `{ "event": "save", "data": {…} }` | Tells the game: `ui.on('save', e => …)`, `e` is `{ screen, item, value, data, entry }` |
| `{ "set": "options.volume", "value": 1 }` | Writes a value (without `value`, the item's own) |
| `{ "focus": "resume" }` | Moves focus |

Strings in `data` and `value` read `"{…}"` too, so a save slot's button can send `{ "event": "load", "data": { "slot": "{item.slot}" } }`.

## Calls

| Call | What it does |
| --- | --- |
| `ui.define(...screens)` | Adds screens from data, each checked (`readScreen`); a name defined again is replaced |
| `ui.open(name, data)` / `ui.close(name)` / `ui.back()` | Moves along the stack. `back()` is false when there is no modal screen to close |
| `ui.stack` / `ui.top` / `ui.isOpen(name)` / `ui.list()` | Reads it |
| `ui.focus(item)` / `ui.press(item)` | Moves focus; presses as a click would |
| `ui.get(item)` | `{ id, type, screen, text, value, enabled, visible, focused, hovered, pressed, count }` |
| `ui.set(item, key, value)` | Changes any data field of an open item live (not its id, type or children) |
| `ui.setValue(path, value)` / `ui.getValue(path)` | The store items read and write |
| `ui.provide(name, fn \| object)` | Live game data under a name: `ui.provide('clock', () => engine.time.text())` makes `{clock}` read it each poll. `null` removes it |
| `ui.on(event, fn)` | The game's own events, and `open`, `close`, `focus`, `click`, `change`, `set`. Returns a call that stops |
| `ui.addFonts(...fonts)` | Loads `{ family, src, weight, style }` fonts for the screens' CSS |
| `ui.updateState()` | The Lobby's call |

## Menu actions and input contexts

The menu actions are `ui_up`, `ui_down`, `ui_left`, `ui_right`, `ui_accept` and `ui_back`. They live in the controls' `menu` input context; when a game gives none, `UI_BINDINGS` is used: arrows and WASD (repeating while held), the d-pad, Enter, Space, E and A to accept, Escape, Backspace, B and Start to go back. A screen with `controls: 'menu'` switches to it while it is on top, and the game's bindings come back when it closes. Up and down move focus (a grid moves by rows), left and right change a focused toggle or slider and otherwise move focus too. Two presses between polls both count, in order.

## Drawing

Given a root element, each open screen is a `div.ui-screen[data-ui="<name>"]` and each item a `.ui-item.ui-<type>[data-ui-item="<id>"]` with the classes `is-focus`, `is-hover`, `is-pressed`, `is-inactive` and `is-active` as they change. Only what changed is written each poll. The root carries `data-ui-open="hud pause pause.settings"` and `data-ui-top`, for CSS across screens (a page hiding the menu beneath it). Transitions and animations use the Web Animations API. Without a root (`new gameEngine({ ui: false })`, or in Node) it keeps the state only, so every rule above can be tested without a page.

## Files and verification

- `ui-system.mjs`: the stack, focus, values, verbs and input.
- `ui-view.mjs`: the page elements, transitions and pointer.
- `values.mjs`: `readScreen`, the item types, anchors, animations and `UI_BINDINGS`.
- `tests/ui.test.mjs`: `node --test src/engine/basement/ui/tests/*.test.mjs`. `tools/test-preview.mjs` plays the game's screens in a browser.
