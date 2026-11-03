# Code requirements: readable, explainable, separated engine and game

## Purpose and authority

This document records the owner's explicit requirements for code written or refactored for Dimensions: Freelancer and its engine. These are acceptance requirements, not optional style suggestions. Apply them to human-facing source code, including implementation, tests, and build tools that are added or changed.

The owner knows Python and is learning JavaScript. They often work from a phone. Source code must let them regain their bearings, follow execution, understand language choices, and maintain the project without an AI explanation or external research for ordinary operations.

Do not substitute conventional advice to “avoid obvious comments” for these requirements. Deliberately explaining statements in English is wanted. The owner's G7 Python files and `dfab-hw-0.0.0.html` illustrate their preferences; unfinished experiments in those files are not requirements to reproduce defects or incomplete behavior.

## 1. Explain the purpose before the implementation

Begin every module, class, function, method, constructor, and meaningful callback with an explanation. Put a module explanation at the top of its source file; place other explanations immediately above their declarations. Explain:

- What this unit does and why it exists.
- Which concern it owns and where it fits in the engine or game.
- Its inputs, their meanings and units, and any defaults.
- What it returns, including what failure or “nothing found” returns.
- What state it reads or changes, including effects on other objects.
- When it runs and what must already be initialized.
- Why this approach is used, where that choice is not evident.

Scale the explanation to the operation. A simple getter can have a short explanation covering its purpose, source, and return value. A renderer needs enough detail to explain its stages, coordinate spaces, and dependencies. Do not replace concrete explanations with decorative headings or specialist terminology.

## 2. Explain executable code in execution order

Write a comment immediately above every executable statement or meaningful operation. Explain the code back in plain English: what is obtained, where it comes from, what happens to it, and why the next operation needs it.

- Explain declarations, assignments, calls, calculations, conditions, loops, early returns, mutations, and returned expressions.
- For multi-line statements, explain the individual arguments, conditions, or calculation stages when they have distinct meanings. Prefer named intermediate steps over a dense expression.
- Explain each branch's condition and why the branch is taken.
- Explain what a call provides to the next step; do not merely repeat its function name.
- Explain each configuration/data property with an adjacent comment describing its meaning, units, and effect where applicable.
- Blank lines, braces, punctuation, and closing delimiters do not need standalone comments. Every actual operation does.
- Keep comments accurate when changing code. Outdated explanations fail this standard.
- Explain technical terms at first use. “Affine quad,” “bake,” “hull,” “emissive,” or “mitre” alone is not an explanation.

Comments should teach the real behavior. Do not invent intent, claim a performance improvement without evidence, or describe unimplemented features as working. Mark uncertainty explicitly when existing intent cannot be established.

## 3. Explain JavaScript choices, including loops

Do not assume familiarity with JavaScript because the owner understands programming. Explain relevant differences from Python at the point of use, including:

- `this`, `new`, constructors, instance ownership, and callback binding.
- `const` versus `let`: a constant binding does not freeze its referenced object.
- Object properties versus array values; object versus `Map` when the distinction matters.
- Destructuring, spread syntax, arrow functions, and closures if used.
- Strict equality, truthiness, null/undefined, optional chaining, and nullish defaults if used.
- Object references versus copied primitive values, and replacement versus mutation.
- Promises, `await`, event callbacks, and browser frame scheduling if used.
- Canvas paths, transforms, clipping, drawing contexts, and coordinate spaces if used.

For every loop, explain its source, current item or index, termination, progression, and the reason for that loop form. Explain nested loops separately and identify what each dimension represents.

### Value iteration: `for...of`

```javascript
// Visit each value in the buildingTiers array, one tier at a time.
// “of” reads array values, like Python's “for tier in tiers”.
// buildingTier names the current value; const prevents reassigning
// that variable during this repetition but does not freeze the tier.
// Stop after the array's iterator has supplied all its values.
for (const buildingTier of buildingTiers) {
    // Read the current tier's unique identifier.
    const buildingTierId = buildingTier.id;

    // Store this tier under its identifier so supporting tiers can
    // be found by name instead of searching through the array again.
    buildingTiersById[buildingTierId] = buildingTier;
}
```

### Counting: the three-part `for` loop

```javascript
// Start windowIndex at zero, representing the first window.
// Before each repetition, check that it is below windowCount.
// After each repetition, increase it by one.
// Use an index because window placement depends on its numbered slot.
// Stop once windowIndex reaches windowCount; that limit is excluded.
for (
    let windowIndex = 0;
    windowIndex < windowCount;
    windowIndex += 1
) {
    // Add half a slot to place this window in its slot's center,
    // multiply by the distance between slots, then add the wall start.
    const windowCenterX = wallStartX + (windowIndex + 0.5) * windowSpacing;

    // Draw this window at its calculated center and the current row height.
    drawWindow(windowDrawingContext, windowCenterX, windowTopY);
}
```

### Property enumeration: `for...in`

`for...in` enumerates enumerable string property keys, including inherited enumerable properties. It does not read array values like Python's `for item in items`. Do not use it for ordinary array-value iteration. Prefer `Object.keys()`, `Object.values()`, or `Object.entries()` with `for...of` when they express the intended own-property iteration more clearly. If using `for...in`, explain why keys are needed and how inherited properties are handled.

For `Object.entries()`, explain that it provides pairs containing each own enumerable string property's key and value. Explain any destructuring that names those two parts. For `while`, explain what changes the condition so the loop can finish.

Do not hide these explanations in a separate glossary while leaving the relevant loops unexplained.

## 4. Use descriptive names and explicit steps

- Names must state what the value represents or the operation does.
- Prefer `buildingTier`, `wallArtworkDrawingContext`, `wallPerimeterLength`, and `getOrCreateTierArtwork()` over `t`, `d`, `L`, and `_tkArt()`.
- Avoid single-letter variables, unexplained initials, compressed chains, multiple statements on one line, and nested ternary expressions.
- Name coordinate spaces and units: for example, `roofHeightDesignUnits`, `worldPositionX`, and `elapsedSeconds`.
- Name intermediate calculations so the owner can inspect and understand each step.
- Preserve established public names where compatibility requires it. Document an adapter or alias rather than silently breaking references or saves.
- Do not expand a name by guessing incorrectly: `ctx` is a drawing context, not a count. Explain the actual role.

## 5. Separate implementation, coordination, and game content

The engine assembles selected components, connects them, and coordinates execution. It must not absorb all component implementations or specific game content.

- **Elements:** managed objects and their own state/behavior, such as characters, vehicles, and building instances.
- **Systems:** implementations responsible for a concern, such as input, weather, collision, rendering, audio, and time.
- **Tools:** supporting utilities, diagnostics, and reusable helpers.
- **Engine coordination:** construction, dependency connections, lifecycle, and scheduling.
- **Game:** specific characters, locations, quests, dialogue, starting conditions, equipment, and game rules.
- **Test harness:** scenarios that exercise features; not the production home for weather, movement, or other system implementations.

Predictable hierarchies such as `engine.elements.createCharacter(...)` are intentional and acceptable. Explicit parent references such as `parent_system` and `parent_engine` are acceptable. Do not flatten or rename them merely because they are verbose or nested. Evaluate actual ownership and dependencies.

Define ownership of state and provide clear operations for other components. Avoid moving a god object's methods into several files while leaving the same unrestricted shared responsibilities. Avoid replacing it with a god-sized game entry point or test function.

## 6. Make initialization and references understandable

- Document what each component requires before it can initialize or run.
- Where components need one another, create them first, connect dependencies second, and start execution after connection is complete.
- Explain that the right-hand constructor call finishes before its result is assigned to the left-hand attribute.
- Explain that storing an object reference keeps access to that object, not an automatically synchronized path through other attributes.
- Mutating an existing parent object does not require refreshing its reference. Replacing that parent or a referenced dependency may require reconnecting.
- Avoid redundant copies of changing state. Use an explicit lookup, property, or documented connection strategy as appropriate.
- Give recurring frame scheduling a clear owner. Document deliberate additional schedules and how they start and stop.

## 7. Explain rendering as concrete stages

Building/rendering code must make it possible to locate and understand:

1. Reading the building ID and configuration.
2. Reading section shapes, heights, and floor information, distinguishing them.
3. Creating or obtaining canvases and their drawing contexts.
4. Painting wall backgrounds and individual windows, doors, and trim.
5. Saving artwork for reuse, if applicable; explain “baking” as drawing once into a reusable image.
6. Dividing artwork into pieces; distinguish perspective subdivision from repeated texture patterns.
7. Projecting coordinates and applying canvas transforms.
8. Ordering visible sections and drawing roofs or rooftop objects.
9. Adding lighting, shadows, reflections, and explaining what is skipped.

For a rectangle, explain the origin and the meaning of its x, y, width, and height arguments. For projection, explain the source and destination coordinate spaces and how height affects position. Explain short-lived drawing state and why it is saved/restored.

## 8. Preserve behavior and verify as work proceeds

A structural refactor must preserve existing gameplay, content, tuning, controls, rendering intent, and save compatibility unless the owner requests a change. Do not quietly remove a feature, simplify a calculation, or fix a behavior merely because it looks unusual. Record discovered defects separately from structural changes.

- Establish the original behavior and relevant existing checks before moving a subsystem.
- Make internal stages reviewable and test each migrated responsibility as work proceeds.
- Use appropriate automated checks and browser checks. Where useful, compare matching saves, scenes, inputs, and seeded runs with the original.
- Passing mocked tests does not establish identical visuals, real touch behavior, or device performance. State the actual verification limits.
- Explain any remaining uncertainty or failing check honestly.
- Do not require the owner to download and manually test every intermediate development attempt.

## 9. Deliver one playable file

Maintain modular source where useful, but build the engine, game, and required assets into one offline playable HTML deliverable. Source modularity must not require the owner to collect or download many files to play a test build. Do development and verification in the workspace before presenting the deliverable. Do not add external runtime dependencies that undermine offline use without an explicit requirement.

## 10. Acceptance review before delivery

Review the changed source against all of these questions:

- Can the owner identify each unit's purpose and why it exists before reading its implementation?
- Does every executable statement or meaningful operation have an accurate adjacent English explanation?
- Are property meanings, units, state ownership, inputs, outputs, and side effects clear?
- Does every loop explain what it reads, how it progresses and stops, and why that syntax was chosen?
- Are JavaScript-specific mechanisms explained where encountered?
- Can the data path be followed from source value through intermediate steps to result?
- Are names descriptive without requiring abbreviation decoding?
- Are engine coordination, systems, elements, tools, game content, and test scaffolding separated by responsibility?
- Are initialization order and reference lifetime explicit?
- Has relevant behavior been checked, with limitations reported accurately?
- Is the playable result available as one offline HTML file when implementation is delivered?

Do not declare this standard satisfied solely because comments are numerous, files are smaller, or tests pass. The owner must be able to read the source and understand the operations without needing AI to translate them.

## Scope for future work

Follow this standard for new and changed code immediately. When refactoring a selected module, bring that module's implementation up to the standard rather than commenting only the newly added lines. Existing unmodified code is not automatically compliant. This document authorizes no rewrite, behavior change, deployment, or publication by itself; follow the current task's scope.
