# Presentation and linked materials · shared foundations

**Bloom controls update:** [decision 0014](0014-bloom-art-direction.md) expands shaping ranges, exposes scatter/soft knee, and adds haze/recipes.

Implemented 2026-10-16 following the owner's request to separate shared HDR work from bloom and begin material editing. Supersedes HDR ownership/API and inline-appearance/schema limitations in decisions 0007/0012. House boundaries, native WebGL and the single Lobby scheduler remain unchanged.

## What the scene actually contains

The renderer draws a real shared **unit-cube mesh**, instanced with world transforms/dimensions. Authored assemblies combine those boxes into buildings, props and figures. This is not yet an arbitrary-mesh/triangle importer, mesh-data editor, skeletal mesh system or per-face material-slot editor. Each box part currently has one material on all its faces.

Previously each shape stored inline RGB and an emission multiplier. Now the project contains a **linked material library**. Parts reference material IDs; placements can override those bindings without copying source geometry. The shared contextual inspector edits materials as data blocks, with the same property controls/history used for transforms and lights. No separate material-editor screen is introduced.

## Renderer ownership

- **`Presentation`** owns scene HDR/MSAA targets, depth resolve, exposure, final colour encoding and guide depth restoration. It has no bloom import or effect-specific configuration.
- **`Bloom`** owns only its reduction/reconstruction textures, filter programs and settings. It borrows a resolved scene colour texture during submission and returns a filtered texture valid until its own reconfigure/resize/dispose. It never owns a scene framebuffer, exposure or final composition.
- **`Renderer`** orders the passes: AO/shadows → forward scene → shared resolve → optional bloom filter → presentation → authoring guides. A failure restores normal framebuffer/depth state. No extra loop or renderer bypass.
- **`FloatTargets`** centralizes transactional GL target allocation/cleanup. **`HdrTargets`** owns scene colour/depth/MSAA; **`BloomTargets`** owns the effect pyramid. Allocation/refusal/disposal are independent.
- **`fullscreen-shaders.js`** supplies the same vertex-ID triangle to AO, bloom and presentation; **`presentation-shaders.js`** owns final composition.
- **Penthouse `AppearanceControls`** is the shared **Image & effects** panel used by Studio and Freelancer. Exposure writes to Presentation; bloom settings write to Bloom. There are no old exposure/target aliases on Bloom.

```js
const renderer = engine.basement.renderer;
renderer.presentation.configure({ mode: 'hdr', exposure: 1.25 });
renderer.bloom.configure({ mode: 'off' }); // HDR remains available with no bloom
renderer.bloom.configure({ mode: 'low', strength: 0.85 });
renderer.presentation.configure({ mode: 'direct' }); // explicit direct path bypasses effects
```

Engine construction accepts `presentation: {mode:'auto', exposure:1.25}` separately from `bloom`. **Auto** requests HDR when bloom is enabled; **HDR** explicitly requests it independently; **Direct** bypasses HDR/effects. Unsupported or refused HDR retains antialiased direct rendering. Presentation failure retry requires explicit Presentation configuration (the shared quality control requests a retry) or context restoration. Effect failure can fall back to the unfiltered HDR scene without discarding a working presentation stage.

Both default Off bloom/Auto presentation and the current tone curve preserve the original direct image. Zero bloom strength produces a matched HDR reference without pyramid submissions. Disabling bloom releases the filter; explicit HDR keeps the scene resources. Changing bloom quality retains the HDR scene target and presentation program. AO and shadows retain their own independent ownership and budgets.

Profiler details/counters distinguish **presentation targets** from **bloom targets**; their estimated bytes must be added for the combined image-pipeline budget. `renderer.presentation` measures shared stage CPU submission; `renderer.bloom` measures filtering only. Post draws and instance/line-buffer bytes retain their existing meanings. GPU timing still covers the full frame; CPU scopes do not measure GPU completion.

## Standard material and universal emission

There is one implemented material model: opaque diffuse surface lighting with independent emission. Every material exposes:

| Property | Meaning / bounds |
| --- | --- |
| `id`, `name` | Stable project identity and editable display name |
| `baseColor` | Linear diffuse RGB, each channel 0–16 |
| `emissionColor` | Independent linear emissive RGB, each channel 0–16 |
| `emissionStrength` | Relative radiance gain, 0–32; zero disables emission |

Emission is a **universal property**, not a special material type. Dark stone or glass-coloured geometry can emit a different colour. New materials start with white emission colour and zero strength. This matches the desired workflow of keeping an ordinary surface and adding emission when needed.

Emission bypasses ambient/direct lighting attenuation and seeds HDR bloom. It does **not** automatically create a point light or illuminate neighbouring surfaces through GI; authored lights still provide direct illumination. Transparent glass, metallic/roughness/specular response, textures, shader-node graphs and GI remain future rendering capabilities. The editor does not expose dummy controls for features the shader cannot render.

```json
{
  "id": "material:gold-sign",
  "name": "Champagne lettering",
  "baseColor": [0.12, 0.08, 0.03],
  "emissionColor": [1.0, 0.62, 0.22],
  "emissionStrength": 3.0
}
```

Basement `material.js` validates/copies numerical material data. `material-authoring.js` defines pure data commands and usage queries. Directory `MaterialLibrary` lazily compiles independent runtime copies for used material IDs; shapes in one scene share their resolved objects. It updates numerical values in place, retaining geometry identity, and drops compiled values with no remaining scene users. It owns no GPU material textures/program per material. Separate scene/Play lifetimes get independent runtime copies; authoring objects never become mutable simulation storage.

Lit instance records now contain **20 floats / 80 bytes**, including independent emissive RGB radiance. Shadow records remain **16 floats / 64 bytes**, with material values excluded. Shared material edits update visible packed values through the existing dirty-range mechanism; they do not reconstruct geometry or invalidate unchanged shadow maps.

## JSON version 2 and editing

Version 2 adds project `materials`, changes `part.shape` appearance to `material: '<id>'`, and permits per-placement `materialOverrides: { '<part-id>': '<material-id>' }`. Size, transform, shadow/AO flags, collisions, scene/placement IDs and game metadata remain separate. Materials and overrides validate before preview/import/adoption.

**Materials tab:** select a material independently of an object, edit its name/base/emission, create a new material or duplicate a definition. The usage notice counts placed part users across all scenes, including users outside the current viewport.

**Object inspector:** choose a **Surface part**, assign an existing material, and edit the linked definition in the same inspector. **Make single user for this instance** duplicates the material and redirects every currently matching part in that placement. Other placements keep the original; no geometry asset copy is required. Assigning an existing material changes the chosen part only. Overrides belong to the placement, not to the source assembly or unrelated instances.

Numeric/name focus sessions are undoable commands. Escape cancels; invalid values never reach runtime geometry. Assignment, private copy and creation use the same bounded document history and monotonic authored-ID allocator. Export/import/recovery and Play preserve IDs/bindings; Play receives detached data. Material selection is an explicit inspector context, avoiding collisions with object/light IDs and leaving camera state outside document history.

A bounded **one-time ingress migration** accepts validated version-one projects, grouping equal inline appearances **within each source asset**, preserving base colour and emissive radiance. It does not accidentally link unrelated assets simply because their colours match. Import/recovery/ProjectDocument adopt canonical version 2; authored sources and exported documents are version 2. There are no version-one branches or legacy colour/emission aliases in the renderer. The explicit Freelancer authoring recipe emits upgraded data; normal builds still never regenerate authored content.

Current limits remain 512 KiB/package, 4,096 source parts and at most 4,096 material definitions, with existing scene/placement budgets. Unused definitions remain authored assets available in the library; compiled runtime values are lazy and scene-scoped. General external material/texture streaming remains future work.

## Ownership and lifecycle

SceneInstance owns its runtime material library and placed assembly membership. Preview disposal, prepared-world disposal and cancelled cooperative preparation release both. Source data stays with the project/package. Changing materials retains unaffected runtime part IDs and collider membership. Context loss only rebuilds GPU instance/frame resources; authored and compiled numerical material data remain sufficient to restore the scene.

[Verification and previews](../milestones/materials/README.md) distinguish native pixels, document operations, resource lifecycle and software/emulated-device limitations. The next agreed lighting work remains scalable light storage/selection for 60–100 contributing lights, without conflating emission, authored lamp counts and shadow-map budgets.

## Source map for future edits

| Editing point | Responsible source |
| --- | --- |
| HDR lifetime, exposure, resolve and final display | [Presentation](../../engine/basement/presentation.js), [HDR targets](../../engine/basement/hdr-targets.js), [composition shader](../../engine/basement/presentation-shaders.js) |
| Bloom quality/filter, independent of presentation | [Bloom](../../engine/basement/bloom.js), [filter targets](../../engine/basement/bloom-targets.js), [settings](../../engine/basement/bloom-settings.js) |
| Material bounds, copying, binding commands | [Material](../../engine/basement/material.js), [authoring functions](../../engine/basement/material-authoring.js) |
| JSON contract and one-time upgrade | [Project schema](../../engine/basement/project.js) |
| Scene-scoped shared numerical values and geometry bindings | [MaterialLibrary](../../engine/directory/material-library.js), [SceneInstance](../../engine/directory/scene-instance.js) |
| Shared numeric field metadata and controls | [Properties](../../engine/basement/properties.js), [PropertyInspector](../../engine/penthouse/property-inspector.js) |
| Contextual material UI and library navigation | [MaterialPanel](../../editor/workspace/materials.js), [WorkspacePanels](../../editor/workspace/panels.js) |
| Shared viewport appearance widget | [AppearanceControls](../../engine/penthouse/appearance-controls.js) |

Extend the responsible layer when adding a capability. Adding surface response belongs in the material/shader contract before exposing controls; adding a display effect must not move scene ownership back into that effect. Keep game-specific palettes and behavior in their existing game/example packages.
