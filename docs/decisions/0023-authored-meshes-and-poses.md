# Authored meshes and joint poses (project schema v4)

Implemented 2026-10-18. The owner asked for the foundations to come first, so that later modeling work grows out of them instead of being bolted on ("Schema first" on the decision card). Decision 0022 made skinned meshes renderable; this record makes them ordinary authored content: stored in project JSON, validated at ingress, built and shared through the Directory, edited in Studio with the same controls and history as everything else, and kept apart from Play.

**Status:** schema v4, the generator contract, Directory-built authored meshes, joint poses and recipe editing in Studio are implemented. One generator exists (`mesh.tube`). The lofted 949 body is still stage 2 of the modeling plan and will arrive as a second generator through this same contract.

## The data model

Schema v4 adds two things to the project and nothing else:

```jsonc
{
  "schemaVersion": 4,
  "meshes": [
    // A mesh asset is a recipe: a named generator, its version and its parameters.
    { "id": "mesh:1", "name": "Tube", "generator": "mesh.tube", "generatorVersion": 1, "parameters": { "joints": 5 } }
  ],
  "assets": [{
    "parts": [{
      // A part's shape is a box (size in metres) or, new in v4, a mesh:
      // `mesh` names a mesh asset and `size` scales the mesh's own frame per axis.
      "shape": { "mesh": "mesh:1", "size": [1, 1, 1], "material": "material:1", "castShadow": true, "ambientBlocker": false }
    }]
  }],
  "scenes": [{ "entities": [{
    // Per-object joint offsets from rest, by part then joint. Rest is never stored.
    "poses": { "part:0": { "joint4": [0.3827, 0, 0, 0.9239] } }
  }]}]
}
```

Why this shape:

- **Meshes are data blocks, like materials.** Several geometry sources can name one mesh, and every placed object of a source shares it, exactly as materials are linked. A source's parts stay the unit of placement, materials and picking, so a mesh needed no new kind of object.
- **Recipes, not vertices.** A mesh asset stores how to build the mesh, not the mesh. JSON stays small and reviewable, and a project can be rebuilt bit-for-bit by any build. Explicit vertex meshes (polygon modeling, stage 6) will be another source behind the same `meshes` entry.
- **Poses belong to objects, offsets belong to rest.** Two placements of one rig can stand differently, so poses live on the placed entity. Each value is a unit quaternion relative to the joint's rest rotation (`local = rest × offset`), so zero is rest for every rig and a recipe change that keeps joint names keeps poses meaningful.
- **Only what differs is stored.** Rest joints and default parameters are omitted. An unposed figure has no `poses` key and a default tube has `"parameters": {}`.

**Ingress.** v3 projects upgrade by gaining `"meshes": []`; nothing else changes. v1 and v2 chain through the existing upgrades. Older versions may not carry mesh data. Shipped content (Atrium, the Freelancer street) is now stored as v4.

**Validation** (`engine/basement/project.js`) runs before any adoption, as for every other field:

- at most 256 mesh assets of at most 32 parameters (numbers, booleans or short strings) and 64 posed joints per part;
- every `shape.mesh` resolves, and every `poses` entry names a mesh part of the object's own source;
- pose values are unit quaternions;
- when the application supplies the generator catalog (`meshGenerators`), the generator and version must exist, its own check must accept the parameters (unknown keys included), and every posed joint must exist in the skeleton those parameters build. Atrium, Freelancer and Studio all supply it. Headless tools that do not still get the structural checks.

## One generator contract

`engine/penthouse/mesh-generators.js` is the single list of mesh sources. Each name has a descriptor and a matching Directory factory:

| Field | Purpose |
| --- | --- |
| `version` | Bumped whenever the same parameters would build different geometry. Stored with each recipe. |
| `label` | Display name for editor commands. |
| `parameters` | The parameter catalog: key, label, default value, limits, slider step, unit. Validation, defaults and Studio controls all read it. |
| `validate(parameters)` | Throws on unknown or out-of-range values. |
| `joints(parameters)` | The skeleton's joint names, so poses validate without building the mesh. |

`meshLibraries()` returns the factories (parameters in, CPU MeshData out), which Penthouse registers in the Directory beside `toy.assembly`. The tube's catalog is `TUBE_PARAMETERS` in `skinned-tube.js`, the one place its defaults and limits live. Adding a generator means one descriptor, one factory and one parameter catalog, under the same name and version.

## Directory: building and sharing

`AuthoredMeshes` (`engine/directory/authored-meshes.js`) is a scene's view of the project's mesh assets, the geometry counterpart of `MaterialLibrary`:

- `get(id)` resolves an authored mesh ID to a resident `GpuMesh`, leased through a `MeshLibrary` under the content key `generator@version:sorted parameters`. Equal recipes therefore share one GPU mesh across assets and scenes, whatever their IDs.
- `sync(definitions)` adopts edited recipes. A changed recipe has a new key, so the next `get()` builds the new shape.
- `retain(ids)` releases leases nothing in the scene uses any more. The scene calls it after its entities draw their new meshes, so a batch never meets a freed one.
- Without a renderer (Node tools) recipes still sync, but resolving one throws instead of pretending.

`SceneInstance` owns one. The assembly toy receives it as `meshes`, sets `shape.mesh` for mesh parts and gives each skinned part its own `SkeletonPose`. On every `apply()` the instance:

1. swaps a part's mesh when its recipe changed, with a fresh pose if the skeleton changed;
2. resets the pose, applies the object's authored offsets and calls `update()`;
3. releases recipes no part uses.

Runtime entity IDs survive recipe and pose edits. The renderer reaches the instance through `SceneWorld`, Atrium's layout and the Studio preview.

**Bounds.** `assetBounds(asset, meshBounds)` and `worldBounds(world)` measure a mesh part from its mesh's rest bounds scaled by `size`, instead of treating `size` as box extents. Studio placement passes the preview's resolver, so a tube lands with its tip on the ground. Posed silhouettes are not measured: framing and placement use rest bounds, and culling keeps using the conservative reach bound from decision 0022.

## Studio: poses and recipes in the shared inspector

There is no special pose editor. `engine/basement/properties.js` gained three descriptor fields, which any future nested property can use:

- `path`: where a value lives when it is nested (`["poses", partId, joint]`); reads tolerate missing containers and writes create them.
- `quaternion`: stored as a quaternion, shown and written as XYZ degrees. The transform rotation now uses this flag too, instead of a special case on its key.
- `omitDefault` with `keepContainers`: writing the default removes the value and any container it leaves empty, except the first `keepContainers` (a recipe keeps its required `parameters` object).

`poseProperties(partId, joints)` and `meshParameterProperties(catalog)` build descriptors from those. `editor/workspace/meshes.js` (`MeshPanel`) composes two ordinary `PropertyInspector`s beneath the selected object:

- **Joint pose.** Joint names come from the part's resident skeleton in the preview, so the panel knows no generator. Each edit is a normal focus session: previews apply live, Enter or blur commits one undo step, Escape cancels. Locked objects show their pose read-only. *Reset pose* clears one part's entry as one command.
- **Mesh recipe.** Controls come from the injected generator catalog. Like a linked material, an edit rebuilds every part using that mesh, and the note says how many there are. A recipe edit that would remove a posed joint is refused by validation and reported; the document stays unchanged.

One part selection (`session.surfacePart`) serves the material and mesh contexts. The Directory panel lists one *New … mesh* command per catalog entry; `session.createMeshAsset()` adds the recipe and a one-part geometry source as one command, and the ordinary place tool puts it in the scene. The application injects the catalog, so the session and panels name no generator.

## Play stays separate

Play already builds its scenes from a detached copy of the document through `SceneWorld`, with its own `SceneInstance`, leases and poses. Authored poses are therefore the starting pose in Play, and game code may pose a figure further in the Lobby's `animate` phase through `instance.part(objectId, partId).skin`, which never touches the document. Stopping Play rebuilds the preview from the unchanged document. No game animates a mesh yet; clips and an animation timeline are stage 5.

## Verification

Recorded in [the milestone record](../milestones/authored-meshes/README.md).

## Not yet implemented

- The lofted 949 body (stage 2) as a mesh generator, and garments as lofted layers.
- A Studio list of mesh assets independent of placed objects (recipes are edited through an object that uses them), deleting unused recipes, and renaming them.
- Pose editing in the viewport (rotation rings on joints), mirrored poses, IK, clips and the timeline.
- Joint translation or scale in poses; posed (rather than rest) bounds for framing and picking.
- Explicit vertex meshes as a mesh source.
