# Items and equipment API

`itemSystem` is the authoritative carried-item model. Directory installs the session's exact instance as `engine.api.items`, also available as `engine.api.session.items`. The classic playable host uses this same class through `game.items`; its `InventoryView` owns DOM presentation and drag order only. `currentWeapon` and `weaponMode` are derived getters. There are no writable inventory/equipment mirrors or `InventoryItem` action closures.

Definitions live in Directory: `game-db/items.json`, the `createItemCatalog()` adapter, and `game-item-rules.json`. Weapons/attachments keep their existing catalog IDs. Consumables use `consumable:bubbleTea`, `consumable:jeanSoda`, and `consumable:stellarLemonade`; notes use `note:<note_id>`. Augments, cosmetics, furniture, pets and garage ownership remain their existing domain registries, displayed alongside carried items by the inventory view.

## Identity and ownership

A definition ID identifies a type. An instance ID identifies one owned item. Two FP-X pistols have the same `definition_id` and different `instance_id` values. Equipment, mounts and mutations use **instance IDs**. `findItem(definition_id)` is an explicit first-copy lookup for rewards, catalog UI and old-save migration; it must not choose which duplicate to mutate implicitly.

```js
const {items} = engine.api;
const a = items.grantItem('pistol_fpx');
const b = items.grantItem('pistol_fpx');
items.setItemState(a.instance_id, {ammo: 3});
items.setItemState(b.instance_id, {ammo: 9});
items.equipItem(b.instance_id);
const equipped = items.getEquippedWeapon(); // the second pistol, ammo 9
```

`grantItem` returns null when capacity is full. Reserve an item for loot with `createItem` and receive it at pickup with `receiveItem`. Creating loot does not add it to the inventory. Instance IDs are allocated within `rules.owner_id`; each separate inventory must have a stable, distinct owner scope. Returning transfers retain their original IDs. Counter gaps are intentional; allocation does not recycle a reserved/dropped ID. `reset()` begins a new run; `clear()` preserves the counter within a run.

Carried records contain only `instance_id`, `definition_id`, `quantity`, `state`, `upgrades`, and `attachments`. Definitions, resolved stats, presentation and callbacks are not copied into save records. Views returned by reads are cached and deeply frozen; obtain a new view after mutation. The view's `id` is a read-only catalog ID for existing visual/stat readers; it is never an equipment key.

## Public methods

| Method | Contract |
|---|---|
| `getDefinition(definition_id)` | Frozen Directory definition; unknown IDs throw. |
| `hasItem(definition_id)`, `findItem(definition_id)` | Definition-level ownership query; first view or null. |
| `hasInstance(instance_id)`, `getItem(instance_id)`, `listItems()` | Exact ownership lookup and frozen views. Unknown `getItem` IDs throw. |
| `createItem(definition_id, {quantity=1,state={},upgrades={}}={})` | Allocate a frozen unowned record for loot/transfer. |
| `receiveItem(record)` | Receive an unmounted record without changing identity. Null if full; duplicate identities throw. |
| `grantItem(definition_id, options={})` | Create and receive. Matching stackable state/upgrades merge within `max_stack`; weapons/attachments never stack. |
| `removeItem(instance_id)` | Unequip, remove and return an unmounted record. Mounted children/parents require detach or extraction. |
| `extractItem(instance_id)` | Remove a root and all its mounted attachments as one transfer bundle. |
| `receiveBundle(bundle)` | Validate and receive that exact root/children atomically. Null if full. |
| `equipItem(instance_id)` | Equip an owned weapon or wear an attachment. False for routine incompatibility/full attachment slots. |
| `unequipItem(instance_id)`, `unequipSlot('weapon'\|'attachment')` | Remove equipment; the attachment slot includes active weapon mounts. |
| `getEquippedWeapon()`, `getEquippedAttachments()`, `getWeaponMode()` | Derived active views/mode; no weapon yields null/`none`. |
| `hasAttachment(effect)` | Effects from worn attachments and the selected weapon's mounts. Stowed mounts are inactive. |
| `attachToWeapon(weapon_id, attachment_id)`, `detachFromWeapon(weapon_id, attachment_id)` | One parent per mount; optional definition `compatible_modes`, shared active-slot limit. |
| `getParentWeapon(instance_id)`, `isEquipped(instance_id)` | Parent lookup uses a maintained map. `isEquipped` also reports mounts on stowed weapons so UI can detach them. |
| `setItemState(instance_id, patch)` | Validated, finite JSON state; e.g. ammunition/durability. No body or drawing handles. |
| `setFireMode(mode)` | Explicit debug/game override on the equipped instance. Modes: `normal`, `sniper`, `melee`, `fists`. |
| `setUpgrade(instance_id, upgrade_id, rank)` | Catalog-declared upgrade only, positive rank within maximum; zero removes it. |
| `consumeItem(instance_id, quantity=1)` | Consume a sufficient owned consumable stack and emit its declarative effect. Does not apply gameplay effects itself. |
| `snapshot()`, `load(snapshot)` | Detached JSON; validate everything before replacing the canonical inventory. |
| `clear()`, `reset(definition_ids=[])`, `importLegacy(record)` | Empty current run, initialize new run, or migrate catalog-only data. |
| `on(event, listener)`, `detach()` | Subscribe/unsubscribe or release listeners. |

Getters: `capacity`, `max_attachments`, `equipped_weapon_id`, `equipped_attachment_ids` (worn IDs; use `getEquippedAttachments` for active mounts too).

The default bag has ten non-attachment slots and two active attachment slots. A consumable stack occupies one bag slot. Stored attachments do not occupy bag slots; inventory is bounded to 10,000 instances. A mounted weapon transfers with its children; its contents do not create another inventory or physical body.

## State, upgrades and events

Item state is deliberately generic JSON. Only `fire_mode` has built-in weapon-specific validation. A future weapon policy must validate ammunition, wear and cooldown rules before changing that state; storing a value does not implement its behavior.

Optional definition upgrades use `{max_rank, modifiers:{stat:{add,multiply}}}`. For each numeric stat, additions sum by rank, then multipliers apply by rank; results clamp at zero and reject nonfinite values before mutation. Undeclared upgrades reject. No invented upgrade prices or balance values are added to the existing catalog.

Events: `items:acquired`, `items:removed`, `items:consumed`, `items:equipped`, `items:unequipped`, `items:changed`, `items:loaded`. Details carry instance/definition IDs as relevant; consume events include quantity/effect. Session forwards them and emits `session:changed` with `collection:'inventory'`. Events describe committed changes; listener errors propagate and do not roll back. Gameplay policy applies buff/note effects; UI responds to input/messages. Neither lives in the item record.

## Transfers and saves

```js
const bundle = source.extractItem(weapon.instance_id);
const received = destination.receiveBundle(bundle);
// If destination is full, the transfer coordinator retains the bundle as loot.
```

Inventory snapshots use format 1 with `records`, `order`, `equipment`, and allocation/configuration fields. Session snapshots use format 2 and embed that same inventory; they do not serialize a separate equipment ledger. Format-1 session counts migrate known definitions to instances. Classic saves write `inventory.model`; legacy item-ID lists migrate once, preserving duplicate weapons and translating equipment and UI order. A typed empty inventory stays empty. Invalid typed snapshots fail before live inventory/currency/map mutation. Historical classic saves that bypassed bag limits retain their contents by increasing imported capacity.

The physical loot entity, weapon execution/quick draw, melee/special-weapon rules and rich character artist are further conversions. This model adds no collision math, body integration, physics registry or spatial index. Physical attachments and combined mass remain Basement APIs, separate from item ownership.

Tests: `node --test tools/test-item-system.mjs`; generated-game callers: `node tools/test-item-callers.cjs`. Combat/crafting suites acquire and equip actual owned instances.
