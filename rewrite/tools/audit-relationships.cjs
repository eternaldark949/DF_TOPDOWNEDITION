/**
 * WORKING-GAME AUDIT — parse every original JavaScript source without executing it.
 * Record declarations, global dependencies, calls, property access, prototype assembly,
 * browser events/timers, DOM lookups, storage, map data, and save-schema field paths.
 * This is evidence for migration, not a claim to resolve arbitrary JavaScript runtime
 * targets. Dynamic dispatch remains explicitly marked. Generated data is compressed;
 * no game or engine runtime file is changed and no playable artifact is rebuilt.
 * Development dependencies: acorn 8.19.0 and acorn-walk 8.3.5, supplied through NODE_PATH.
 */
const fs = require('node:fs');
// Build portable source/output paths rather than relying on the caller's directory.
const path = require('node:path');
// Source hashes make every audit record traceable to a concrete input snapshot.
const crypto = require('node:crypto');
// Compress generated evidence; ordinary Node can read it later without parser dependencies.
const zlib = require('node:zlib');
// Parse actual JavaScript syntax, including nested functions and computed properties.
const acorn = require('acorn');
// Visit AST nodes with their ancestor context; AST means the parsed syntax tree.
const walk = require('acorn-walk');

/** Read a named command-line value, or return its explicit default. */
function argument(name, fallback) {
    // Find the option by its exact spelling rather than guessing positional arguments.
    const index = process.argv.indexOf(name);
    // Return the following value when supplied; nullish fallback preserves an empty string for validation.
    return index < 0 ? fallback : process.argv[index + 1] ?? fallback;
}

// Require the original game snapshot rather than accidentally scanning the rewrite as its baseline.
const sourceRoot = path.resolve(argument('--source', '.'));
// Keep generated documentation/evidence under a distinct output folder.
const outputRoot = path.resolve(argument('--output', 'rewrite/audit'));
// All source links use this pinned commit; a moving branch would invalidate line evidence.
const sourceCommit = argument('--commit', '');
// A complete Git commit hash is mandatory for a reviewable relationship map.
if (!/^[a-f0-9]{40}$/.test(sourceCommit)) {
    // Stop before writing files with ambiguous source provenance.
    throw new Error('Supply --commit with the original source snapshot commit SHA.');
}

/** Return sorted files under a folder recursively; missing folders produce an empty list. */
function filesUnder(directory) {
    // Missing optional folders are represented explicitly rather than crashing discovery.
    if (!fs.existsSync(directory)) {
        // There are no source files to inventory at this address.
        return [];
    }
    // Keep the current recursive result independent from any parent's list.
    const result = [];
    // “of” visits directory-entry values; stop after every child name has been examined.
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        // Resolve this child's actual filesystem location.
        const filename = path.join(directory, entry.name);
        // Subdirectories need the same discovery operation before the final sort.
        if (entry.isDirectory()) {
            // Append discovered path values without depending on operating-system enumeration order.
            result.push(...filesUnder(filename));
        } else {
            // Only actual files belong in this source inventory.
            result.push(filename);
        }
    }
    // Stable path ordering makes repeated audit output comparable.
    return result.sort();
}

/** Express a source file relative to the pinned repository root using GitHub-style slashes. */
function relativeName(filename) {
    // Replace platform separators without changing the actual source path's spelling.
    return path.relative(sourceRoot, filename).split(path.sep).join('/');
}

// Parse runtime source and development scripts separately, retaining their respective coverage roles.
const filenames = [...filesUnder(path.join(sourceRoot, 'src')), ...filesUnder(path.join(sourceRoot, 'tools')), ...filesUnder(path.join(sourceRoot, '.github/workflows')), ...(['README.md', 'DFAB V8.html'].filter((name) => fs.existsSync(path.join(sourceRoot, name))).map((name) => path.join(sourceRoot, name)))];
// Keep exact text and syntax trees private to this generation process, not in the compressed evidence.
const modules = [];
// A WeakMap associates metadata with AST objects without creating serializable syntax-tree cycles.
const functionMetadata = new WeakMap();
// Each lexical scope owns names bound by declarations/parameters, preventing false global edges.
const scopeBindings = new WeakMap();
// Declaration identifiers are not reads of their own variable names.
const bindingIdentifiers = new WeakSet();
// Project-wide definitions share the classic-script global scope in original build order.
const globalDefinitions = new Map();
// Semantic method names identify prototype contributions spread across many original files.
const methodsByName = new Map();
// Class inheritance supports candidate lookup of inherited this.method calls.
const parentClasses = new Map();
// Constructor-assigned instance fields give conservative type evidence for this.ui.method, etc.
const fieldTypes = new Map();
// Global singleton construction gives conservative type evidence for game.method calls.
const singletonTypes = new Map();
// The resulting object contains evidence only, not mutable original game objects.
const evidence = {
    // Bump this when the serialized structure changes, independently from game save versions.
    schemaVersion: 1,
    // Pin all findings to the working-game commit inspected.
    sourceCommit,
    // Record parser versions used to interpret actual syntax.
    parser: {acorn: require('acorn/package.json').version, walk: require('acorn-walk/package.json').version},
    // Coverage roles are attached to each file record.
    files: [],
    // Function/method/class/global declarations retain exact source locations.
    definitions: [],
    // Cross-file uses of statically identifiable project global names.
    globalReferences: [],
    // All unshadowed global identifier reads/writes include same-file clock/state access.
    globalAccesses: [],
    // Array/Map/Set-style and Object.assign writes need review beyond direct assignments.
    mutationCandidates: [],
    // Every syntactic call/new expression retains caller, raw receiver, and candidate targets.
    calls: [],
    // Property reads/writes are grouped later by owner/path/access with occurrence lines.
    members: [],
    // Prototype contributions must preserve source assembly order during migration.
    registrations: [],
    // Parent/child classes remain explicit even when implementation spans files.
    inheritance: [],
    // Browser timers/events/promises are lifecycle dependencies, not only ordinary call edges.
    lifecycle: [],
    // Literal/dynamic DOM lookups and original HTML bindings.
    dom: [],
    // Storage operations preserve save/settings/cache ownership boundaries.
    storage: [],
    // Return-object contracts in original serializers/default/snapshot functions remain separately traceable.
    serializationFields: [],
    // Registry object keys expose original map IDs, transitions, and other source data relationships.
    registries: [],
    // Save schema field paths are source contracts, not inferred replacement schemas.
    saveFields: [],
    // Authored property values and branch literals retain relationships hidden in map/story databases.
    dataRelationships: [],
    // Arithmetic-shaped expressions identify math/service extraction candidates without assuming numeric types.
    calculations: [],
    // Binary asset names/sizes/SHA identities come from the pinned Git tree, not downloaded audio payloads.
    assets: [],
    // Original script order is extracted from the real build tool rather than alphabetical paths.
    buildOrder: []
};

/** Return whether an AST node introduces a function scope. */
function isFunction(node) {
    // Function kinds share lexical parameters but arrows inherit this from their enclosing function.
    return ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type);
}

/** Obtain or allocate one scope's set of bound variable names. */
function bindingsFor(scope) {
    // Reuse the same set so declarations discovered later still affect earlier references.
    if (!scopeBindings.has(scope)) {
        // A Set holds each local name once, regardless of repeated var declarations.
        scopeBindings.set(scope, new Set());
    }
    // Return the actual scope-owned set for declaration registration or lookup.
    return scopeBindings.get(scope);
}

/** Register every identifier in a JavaScript binding pattern, including destructuring. */
function bindPattern(pattern, scope) {
    // Optional catch bindings and anonymous expressions may have no identifier at all.
    if (!pattern) {
        // Missing patterns contribute no lexical names.
        return;
    }
    // An ordinary identifier is the base case for array/object destructuring recursion.
    if (pattern.type === 'Identifier') {
        // Mark its AST node so declaration syntax is not mistaken for a global read.
        bindingIdentifiers.add(pattern);
        // Keep the declared name in its actual owning lexical scope.
        bindingsFor(scope).add(pattern.name);
        // No nested patterns remain inside a plain identifier.
        return;
    }
    // Destructuring shapes contain only these binding-bearing child positions.
    const children = pattern.type === 'ArrayPattern' ? pattern.elements : pattern.type === 'ObjectPattern' ? pattern.properties.map((property) => property.type === 'RestElement' ? property.argument : property.value) : [pattern.argument ?? pattern.left];
    // “of” supplies nested binding patterns and stops after the pattern's children.
    for (const child of children) {
        // Apply identical identifier registration to this destructured subpattern.
        bindPattern(child, scope);
    }
}

/** Find the nearest enclosing lexical scope; var ignores block boundaries. */
function enclosingScope(ancestors, functionOnly = false) {
    // Walk ancestors backward from the current node, decreasing one position to reach each parent.
    for (let ancestorIndex = ancestors.length - 1; ancestorIndex >= 0; ancestorIndex -= 1) {
        // Read this candidate parent syntax node.
        const ancestor = ancestors[ancestorIndex];
        // Functions/programs always bind names; blocks/catches additionally bind let/const.
        if (isFunction(ancestor) || ancestor.type === 'Program' || (!functionOnly && ['BlockStatement', 'CatchClause', 'ForStatement', 'ForOfStatement', 'ForInStatement'].includes(ancestor.type))) {
            // Return the nearest matching owner rather than leaking locals into the global graph.
            return ancestor;
        }
    }
    // A malformed/unsupported context must remain explicit instead of inventing an owner.
    return null;
}

/** Return a stable readable member path, preserving computed access instead of guessing its value. */
function expressionPath(node, module) {
    // Optional AST positions have no receiver to describe.
    if (!node) {
        // Empty paths remain distinguishable from known project symbols.
        return '';
    }
    // Ordinary identifiers already provide their source spelling.
    if (node.type === 'Identifier') {
        // Do not expand abbreviations by guessing what their author intended.
        return node.name;
    }
    // this is resolved separately using the enclosing method's actual owner.
    if (node.type === 'ThisExpression') {
        // Retain this keyword until enough static type evidence exists.
        return 'this';
    }
    // Optional chaining wraps the ordinary member/call expression in a ChainExpression.
    if (node.type === 'ChainExpression') {
        // Read its actual receiver expression through the same path formatter.
        return expressionPath(node.expression, module);
    }
    // Noncomputed properties and literal computed keys can be named exactly.
    if (node.type === 'MemberExpression') {
        // Obtain the receiver before appending the current property step.
        const receiver = expressionPath(node.object, module);
        // Literal string/number keys have known spellings even when bracket syntax was used.
        const property = !node.computed ? node.property.name : node.property.type === 'Literal' ? String(node.property.value) : null;
        // Dynamic key expressions remain visible and unresolved in the evidence.
        return property === null ? `${receiver}[${module.source.slice(node.property.start, node.property.end).slice(0, 100)}]` : `${receiver}.${property}`;
    }
    // Calls as receivers and other expressions have runtime results with no statically proven type.
    return `<${module.source.slice(node.start, node.end).replace(/\s+/g, ' ').slice(0, 100)}>`;
}

/** Find the closest already named function/method enclosing a node. */
function enclosingFunction(ancestors, exclude = null) {
    // Search from nearest parent outward, decreasing the ancestor index each repetition.
    for (let ancestorIndex = ancestors.length - 1; ancestorIndex >= 0; ancestorIndex -= 1) {
        // Read the candidate ancestor's known metadata.
        const node = ancestors[ancestorIndex];
        // The declaration currently being named must not consider itself its own parent.
        if (node !== exclude && functionMetadata.has(node)) {
            // Return the closest concrete function owner and its source location.
            return functionMetadata.get(node);
        }
    }
    // Top-level operations run during script initialization rather than inside a function.
    return null;
}

/** Derive a semantic name for a declaration without executing its surrounding JavaScript. */
function nameFunction(node, ancestors, module) {
    // Parent syntax determines whether a function is a method, assignment, variable, or callback.
    const parent = ancestors[ancestors.length - 2];
    // The closest outer function separates same-named nested helpers from project globals.
    const outer = enclosingFunction(ancestors, node);
    // Class method definitions explicitly state their static/prototype owner.
    if (parent?.type === 'MethodDefinition') {
        // Locate the nearest class declaration/expression containing this method.
        const classNode = [...ancestors].reverse().find((ancestor) => ['ClassDeclaration', 'ClassExpression'].includes(ancestor.type));
        // Named source classes are preserved; anonymous class owners remain visibly unresolved.
        const className = classNode?.id?.name ?? '<anonymous-class>';
        // Literal/computed method keys follow the same uncertainty rule as member calls.
        const methodName = parent.computed ? parent.key.value ?? '<computed>' : parent.key.name ?? parent.key.value;
        // Getters/setters share a property name but represent distinct executable definitions.
        const suffix = ['get', 'set'].includes(parent.kind) ? `#${parent.kind}` : '';
        // Return explicit ownership so this.method candidates can later follow class inheritance.
        return {name: `${className}${parent.static ? '' : '.prototype'}.${methodName}${suffix}`, receiverType: className, receiverStatic: parent.static, kind: parent.kind};
    }
    // Object literal functions include engineMixin and ordinary reusable object libraries.
    if (parent?.type === 'Property' && parent.value === node) {
        // Obtain the source property's actual key spelling where possible.
        const propertyName = parent.computed ? parent.key.value ?? '<computed>' : parent.key.name ?? parent.key.value;
        // Read the object literal whose property owns this function.
        const objectIndex = ancestors.length - 3;
        // Calls such as engineMixin({ ... }) declare GameEngine prototype methods explicitly.
        const objectOwner = ancestors[objectIndex - 1];
        // engineMixin is a source assembly operation, not an inferred folder convention.
        if (objectOwner?.type === 'CallExpression' && expressionPath(objectOwner.callee, module) === 'engineMixin') {
            // Preserve getter/setter distinctions within the original mixin contributions.
            const suffix = ['get', 'set'].includes(parent.kind) ? `#${parent.kind}` : '';
            // All such methods use the same GameEngine receiver as the class body.
            return {name: `GameEngine.prototype.${propertyName}${suffix}`, receiverType: node.type === 'ArrowFunctionExpression' ? outer?.receiverType ?? null : 'GameEngine', receiverStatic: node.type === 'ArrowFunctionExpression' ? outer?.receiverStatic ?? false : false, kind: parent.kind};
        }
        // Object.assign(Some.prototype, {...}) is another explicit prototype extension form.
        if (objectOwner?.type === 'CallExpression' && expressionPath(objectOwner.callee, module) === 'Object.assign') {
            // Read its first argument as the exact extension target.
            const target = expressionPath(objectOwner.arguments[0], module);
            // A prototype target proves this receiver's class without guessing parameter types.
            return {name: `${target}.${propertyName}`, receiverType: target.endsWith('.prototype') ? target.slice(0, -10) : target, receiverStatic: !target.endsWith('.prototype'), kind: parent.kind};
        }
        // Nested object-library names are built from their enclosing source declaration and property keys.
        const propertyParts = [String(propertyName)];
        // Walk toward the declaration, stopping when a non-property/object wrapper is encountered.
        for (let ancestorIndex = objectIndex - 1; ancestorIndex >= 0; ancestorIndex -= 1) {
            // Examine the next owner of this object literal.
            const owner = ancestors[ancestorIndex];
            // An enclosing property adds one known object-library path segment.
            if (owner.type === 'Property') {
                // Prefix the key rather than reversing the source's ownership hierarchy.
                propertyParts.unshift(String(owner.key.name ?? owner.key.value ?? '<computed>'));
            } else if (owner.type === 'VariableDeclarator') {
                // A named object variable establishes the root of this library's method address.
                propertyParts.unshift(owner.id.name ?? '<destructured>');
                // Stop after the first declaration that actually owns this nested object.
                break;
            } else if (!['ObjectExpression'].includes(owner.type)) {
                // Unknown wrappers retain a local property name rather than inventing a global root.
                break;
            }
        }
        // An outer receiver is inherited only by arrows; ordinary object methods have their own this.
        return {name: propertyParts.join('.') + (['get', 'set'].includes(parent.kind) ? '#' + parent.kind : ''), receiverType: propertyParts.length > 1 ? propertyParts.slice(0,-1).join('.') : null, receiverStatic: true, kind: parent.kind};
    }
    // A function assigned directly to a property preserves that exact static target name.
    if (parent?.type === 'AssignmentExpression' && parent.right === node) {
        // Read the assigned path rather than using an often-anonymous function expression name.
        const target = expressionPath(parent.left, module);
        // Explicit prototype assignment establishes the corresponding this receiver.
        return {name: target, receiverType: target.includes('.prototype.') ? target.split('.prototype.')[0] : target.includes('.') ? target.split('.').slice(0,-1).join('.') : null, receiverStatic: target.includes('.') && !target.includes('.prototype.'), kind: 'assignment'};
    }
    // Named declarations/variables retain their source names within any surrounding function.
    const localName = node.id?.name ?? (parent?.type === 'VariableDeclarator' ? parent.id.name : null);
    // Known local names remain distinct from anonymous callbacks at the same source line.
    if (localName) {
        // Prefix nested helpers with their enclosing owner so unrelated local names do not merge.
        return {name: outer ? `${outer.name}/${localName}` : localName, receiverType: node.type === 'ArrowFunctionExpression' ? outer?.receiverType ?? null : null, receiverStatic: node.type === 'ArrowFunctionExpression' ? outer?.receiverStatic ?? false : false, kind: 'function'};
    }
    // Anonymous callbacks retain a stable source offset, including when several occur on one line.
    return {name: `${outer?.name ?? '<script>'}/callback@${module.lineOffset + node.loc.start.line}:${node.loc.start.column}`, receiverType: node.type === 'ArrowFunctionExpression' ? outer?.receiverType ?? null : null, receiverStatic: node.type === 'ArrowFunctionExpression' ? outer?.receiverStatic ?? false : false, kind: 'callback'};
}

/** Report whether a project-global name is hidden by an enclosing local declaration. */
function shadowed(name, ancestors) {
    // Visit ancestor scopes backward so the closest local declaration takes precedence.
    for (let ancestorIndex = ancestors.length - 1; ancestorIndex >= 0; ancestorIndex -= 1) {
        // Program bindings belong to the shared classic-script global namespace, not local shadowing.
        const ancestor = ancestors[ancestorIndex];
        // Any nested lexical binding blocks the global inference for this name.
        if (ancestor.type !== 'Program' && scopeBindings.get(ancestor)?.has(name)) {
            // Keep this reference local instead of drawing a false cross-file relationship.
            return true;
        }
    }
    // No local scope binds this source spelling.
    return false;
}

/** Return source coordinates and the exact enclosing execution owner for a syntax node. */
function location(node, module, ancestors) {
    // Anonymous top-level operations remain assigned to script initialization explicitly.
    const owner = enclosingFunction(ancestors);
    // Keep all line references in the original source, including extracted HTML inline scripts.
    return {file: module.file, line: node.loc.start.line + module.lineOffset, endLine: node.loc.end.line + module.lineOffset, owner: owner?.id ?? `${module.file}:<script>`};
}

/** Add a named top-level definition to the shared original script namespace. */
function addGlobal(name, record) {
    // Multiple definitions are kept as versions, not silently replaced by the last parsed file.
    if (!globalDefinitions.has(name)) {
        // Allocate a source-location list for this unique source spelling.
        globalDefinitions.set(name, []);
    }
    // Keep every declaration for later load-order/override analysis.
    globalDefinitions.get(name).push(record.id);
}

// Read build order from the actual original build tool before parsing runtime definitions.
const buildSource = fs.readFileSync(path.join(sourceRoot, 'tools/build.mjs'), 'utf8');
// The declared SCRIPTS array is an ordinary literal; parsing it avoids fragile comment/quote matching.
const buildTree = acorn.parse(buildSource, {ecmaVersion: 'latest', sourceType: 'module', locations: true});
// simple visits each matching declaration once; the callback extracts only actual array literal entries.
walk.simple(buildTree, {
    /** Record the original script filenames in their authored dependency order. */
    VariableDeclarator(node) {
        // Ignore every declaration except the original SCRIPTS array.
        if (node.id.name === 'SCRIPTS' && node.init?.type === 'ArrayExpression') {
            // Generated @assets is retained as a placeholder rather than fabricated as a source file.
            evidence.buildOrder = node.init.elements.map((element) => element.value === '@assets' ? '@assets' : `src/${element.value}`);
        }
    }
});
// HTML owns a plain loader script in addition to the inert ordered script blocks.
evidence.buildOrder.unshift('src/app/boot-loader.js');
// The original HTML's head script runs before the final loader starts activating deferred source blocks.
evidence.buildOrder.unshift('src/index.html:<inline-head>');

// Original build strings declare these runtime globals before their consuming script blocks.
for (const generatedName of ['ASSETS','DFAB_BUILD']) {
    // Locate their actual emitted declaration text in the original build source.
    const offset = buildSource.indexOf(`const ${generatedName}`);
    // Every synthetic binding must point to concrete source evidence rather than an invented file.
    if (offset < 0) throw new Error(`Generated binding not found: ${generatedName}`);
    // Count source newline boundaries before the actual build declaration string.
    const line = buildSource.slice(0,offset).split('\n').length;
    // Preserve origin/type so generated payloads are not misrepresented as manually authored source modules.
    const record = {id:`tools/build.mjs:${line}:${generatedName}:generated`,file:'tools/build.mjs',line,endLine:line,name:generatedName,kind:'generated-binding',role:'generated-runtime'};
    // Keep the generated binding in both the declaration inventory and shared runtime namespace.
    evidence.definitions.push(record);
    // Runtime reads of these names can now cite their actual generation dependency.
    addGlobal(generatedName,record);
}

// “of” reads discovered file paths once each and stops after runtime/development source coverage.
for (const filename of filenames) {
    // File roles and hashes remain useful even for HTML/CSS that is not JavaScript.
    const file = relativeName(filename);
    // Read exact UTF-8 input, including existing source comments.
    const source = fs.readFileSync(filename, 'utf8');
    // Keep the actual source byte count separate from character/line counts.
    const bytes = Buffer.byteLength(source);
    // Record identity without copying full original source into the generated evidence.
    const fileRecord = {file, bytes, lines: source.split('\n').length, sha256: crypto.createHash('sha256').update(source).digest('hex'), role: file.startsWith('tools/') ? 'development' : 'runtime-resource', parseStatus: 'not-javascript'};
    // Every discovered original input belongs to the inventory, including source documentation.
    evidence.files.push(fileRecord);
    // Ordinary JavaScript files parse as classic scripts except .mjs development modules.
    if (/\.(?:js|cjs|mjs)$/.test(file)) {
        // Parser failures must remain explicit coverage gaps, never silently skipped source.
        try {
            // Retain locations for every discovered syntax relationship.
            const comments = [];
            // Capture actual source comments separately from inferred architectural ownership.
            const tree = acorn.parse(source, {onComment: comments, ecmaVersion: 'latest', sourceType: file.endsWith('.mjs') ? 'module' : 'script', locations: true, allowHashBang: true});
            // This parsed module participates in subsequent declaration and relationship passes.
            modules.push({file, source, tree, comments, lineOffset: 0, role: file.startsWith('tools/') ? 'development' : 'runtime'});
            // Successful syntax coverage is distinct from manual behavior review or runtime execution.
            fileRecord.parseStatus = 'parsed';
        } catch (error) {
            // A concrete parser error and source position let a later pass close the coverage gap.
            fileRecord.parseStatus = `error: ${error.message}`;
        }
    }
    // HTML also supplies an early executable script and inline event handlers.
    if (file === 'src/index.html') {
        // Match actual inline script bodies without treating ordinary HTML text as JavaScript.
        const scriptExpression = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
        // matchAll advances through complete script matches until the original HTML has no more.
        for (const match of source.matchAll(scriptExpression)) {
            // Count source lines before this inline body to preserve original file citations.
            const bodyStart = match.index + match[0].indexOf('>') + 1;
            // The parser's first line starts after this many original HTML newline boundaries.
            const lineOffset = source.slice(0, bodyStart).split('\n').length - 1;
            // Inline head code is real runtime code and receives the same AST inventory.
            modules.push({file, source: match[1], tree: acorn.parse(match[1], {ecmaVersion: 'latest', locations: true}), lineOffset, role: 'inline-runtime'});
        }
        // Record original inline event expressions even when their target resolves only at runtime.
        for (const match of source.matchAll(/\b(on\w+)\s*=\s*["']([^"']+)["']/gi)) {
            // Preserve the literal handler and exact original HTML line rather than claiming it was executed.
            evidence.dom.push({file, line: source.slice(0, match.index).split('\n').length, kind: 'inline-handler', event: match[1], expression: match[2]});
            // Parse the handler expression too; it runs on its event, not during HTML initialization.
            modules.push({file,source:match[2],tree:acorn.parse(match[2],{ecmaVersion:'latest',locations:true,allowReturnOutsideFunction:true}),lineOffset:source.slice(0,match.index).split('\n').length-1,role:'inline-handler'});
        }
        // Literal markup IDs are an independent source for DOM ownership/lookup comparison.
        for (const match of source.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
            // Keep duplicate IDs visible as separate source occurrences.
            evidence.dom.push({file, line: source.slice(0, match.index).split('\n').length, kind: 'markup-id', value: match[1]});
        }
    }
}

// “of” supplies parsed modules and stops after every successful JavaScript/inline-script parse.
for (const module of modules) {
    // First register lexical declarations; references can appear earlier than their declarations.
    walk.fullAncestor(module.tree, (node, state, ancestors) => {
        // A declaration binds its pattern in the nearest appropriate lexical scope.
        if (node.type === 'VariableDeclarator') {
            // Locate the declaration kind to distinguish function-scoped var from block-scoped let/const.
            const declaration = ancestors[ancestors.length - 2];
            // The current declarator itself cannot own the declaration's scope.
            const scope = enclosingScope(ancestors.slice(0, -1), declaration.kind === 'var');
            // Destructuring can bind several names, all of which must shadow correctly.
            bindPattern(node.id, scope);
            // Only direct identifiers receive named shared-global definition records here.
            if (scope?.type === 'Program' && node.id.type === 'Identifier') {
                // Top-level variable definitions are separately identifiable from executable function bodies.
                const record = {id: `${module.file}:${module.lineOffset + node.loc.start.line}:${node.start}:binding`, file: module.file, line: module.lineOffset + node.loc.start.line, endLine: module.lineOffset + node.loc.end.line, name: node.id.name, kind: 'global-binding', initializer: node.init?.type ?? null, role: module.role};
                // Record its declaration before resolving any cross-file uses.
                evidence.definitions.push(record);
                // Development scripts have independent Node scopes, not game-browser global bindings.
                if (!module.role.startsWith('development')) addGlobal(node.id.name, record);
            }
        }
        // Function parameters/names must not masquerade as references to global game objects.
        if (isFunction(node)) {
            // Named declarations bind in the surrounding scope; expressions bind their names only internally.
            if (node.id) bindPattern(node.id, node.type === 'FunctionDeclaration' ? enclosingScope(ancestors.slice(0, -1)) : node);
            // “of” visits parameter patterns, stopping after all positional/destructured/default parameters.
            for (const parameter of node.params) bindPattern(parameter, node);
        }
        // Class declarations can hide a global superclass spelling inside an enclosing helper scope.
        if (['ClassDeclaration', 'ClassExpression'].includes(node.type) && node.id) {
            // A named class expression's name belongs only to itself.
            bindPattern(node.id, node.type === 'ClassDeclaration' ? enclosingScope(ancestors.slice(0, -1)) : node);
        }
        // Catch parameters have block lifetime and can shadow project global names.
        if (node.type === 'CatchClause') bindPattern(node.param, node);
    });
    // fullAncestor runs bottom-up; collect functions first, then name outer owners before their children.
    const functions = [];
    // Every actual function body participates, including callbacks and accessor methods.
    walk.fullAncestor(module.tree, (node, state, ancestors) => {
        // Retain a copy of the ancestor array because the walker reuses its traversal stack.
        if (isFunction(node)) functions.push({node, ancestors: ancestors.slice()});
    });
    // Ascending source span size places enclosing functions before their nested callback bodies.
    functions.sort((first, second) => first.node.start - second.node.start || second.node.end - first.node.end);
    // “of” supplies each actual function syntax node and finishes after all bodies in this source module.
    for (const item of functions) {
        // Resolve the function's declared/prototype/object/callback ownership from real syntax.
        const semantic = nameFunction(item.node, item.ancestors, module);
        // Exact line/start offsets keep duplicate wrapper definitions independently addressable.
        const record = {id: `${module.file}:${item.node.loc.start.line + module.lineOffset}:${item.node.start}`, file: module.file, line: item.node.loc.start.line + module.lineOffset, endLine: item.node.loc.end.line + module.lineOffset, name: semantic.name, kind: semantic.kind, receiverType: semantic.receiverType, receiverStatic: semantic.receiverStatic ?? false, role: module.role, parameters: item.node.params.map((parameter) => module.source.slice(parameter.start, parameter.end))};
        // A directly adjacent original comment is source evidence, not a newly invented explanation.
        const syntaxParent = item.ancestors[item.ancestors.length - 2];
        // Method keys/assignment targets precede their function node; start at that wrapper's declaration.
        const declarationStart = ['Property','MethodDefinition','AssignmentExpression'].includes(syntaxParent?.type) ? syntaxParent.start : item.node.start;
        // Search source comments backward, stopping at the nearest comment before this declaration.
        for (let commentIndex = (module.comments?.length ?? 0) - 1; commentIndex >= 0; commentIndex -= 1) {
            // Read the actual parsed comment span rather than searching arbitrary string contents.
            const comment = module.comments[commentIndex];
            // Later comments belong inside/after this function and cannot describe its declaration.
            if (comment.end > declarationStart) continue;
            // Only whitespace may separate a truly adjacent comment from the declaration wrapper.
            if (!module.source.slice(comment.end,declarationStart).trim()) record.originalComment = comment.value.replace(/\s+/g,' ').trim().slice(0,1000);
            // The nearest preceding comment decides adjacency, so no earlier comment should be substituted.
            break;
        }
        // Later passes use this record to assign calls/state accesses to their real execution owner.
        functionMetadata.set(item.node, record);
        // Keep actual executable definitions distinct from top-level binding declarations.
        evidence.definitions.push(record);
        // A directly top-level function declaration is also a shared classic-script global.
        if (item.node.type === 'FunctionDeclaration' && enclosingScope(item.ancestors.slice(0, -1))?.type === 'Program' && module.role !== 'development') addGlobal(item.node.id.name, record);
        // Methods and object-library functions can be candidate targets for statically named member calls.
        record.staticIndexEligible = module.role !== 'development' && !record.name.includes('/') && !shadowed(record.name.split('.')[0], item.ancestors);
        // engineMixin/prototype contributions are explicit original assembly relationships.
        if (module.role !== 'development' && record.name.startsWith('GameEngine.prototype.')) evidence.registrations.push({file: record.file, line: record.line, name: record.name, definition: record.id});
    }
    // Discover class and constructor-field type evidence after execution owners are named.
    walk.fullAncestor(module.tree, (node, state, ancestors) => {
        // Inheritance is a direct source relationship, even if no constructor runs during this audit.
        if (['ClassDeclaration', 'ClassExpression'].includes(node.type) && node.id) {
            // Preserve the declared superclass expression rather than guessing dynamic constructors.
            const parent = node.superClass ? expressionPath(node.superClass, module) : null;
            // Keep the class as its own source declaration in the inventory.
            const record = {...location(node, module, ancestors), id: `${module.file}:${node.loc.start.line + module.lineOffset}:${node.start}:class`, name: node.id.name, kind: 'class', parent, role: module.role};
            // Record this class without collapsing it into its constructor method.
            evidence.definitions.push(record);
            // A top-level original class participates in cross-file identifier resolution.
            if (enclosingScope(ancestors.slice(0, -1))?.type === 'Program' && module.role !== 'development') addGlobal(node.id.name, record);
            // Static inheritance lookup follows only a known identifier superclass.
            if (parent && module.role !== 'development' && enclosingScope(ancestors.slice(0, -1))?.type === 'Program') {
                // Preserve direct parent names for candidate method lookup.
                parentClasses.set(node.id.name, parent);
                // Keep source evidence for the inheritance edge itself.
                evidence.inheritance.push({...location(node, module, ancestors), child: node.id.name, parent});
            }
        }
        // Constructor assignments provide conservative receiver type evidence.
        if (module.role !== 'development' && node.type === 'AssignmentExpression' && node.right.type === 'NewExpression' && node.right.callee.type === 'Identifier') {
            // The surrounding method determines what this.field actually belongs to.
            const owner = enclosingFunction(ancestors);
            // Obtain the exact left-hand path and constructed class spelling.
            const left = expressionPath(node.left, module);
            // A known class receiver makes direct this.field construction unambiguous.
            if (owner?.receiverType && /^this\.[\w$]+$/.test(left)) recordType(fieldTypes, `${owner.receiverType}.${left.slice(5)}`, node.right.callee.name);
            // An unshadowed global assignment can establish the game's actual singleton type.
            if (node.left.type === 'Identifier' && !shadowed(node.left.name, ancestors)) recordType(singletonTypes, node.left.name, node.right.callee.name);
        }
        // Top-level new Class() variable initializers provide the same global singleton evidence.
        if (module.role !== 'development' && node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'NewExpression' && node.init.callee.type === 'Identifier' && enclosingScope(ancestors.slice(0, -1))?.type === 'Program') recordType(singletonTypes, node.id.name, node.init.callee.name);
    });
}

// Index only shared runtime declarations; local object methods and Node test fixtures are separate scopes.
for (const definition of evidence.definitions) {
    // Known runtime globals prove the semantic method's root belongs to the classic game namespace.
    const root = definition.name.split('.')[0];
    // Callback/local names remain in the declaration inventory without contaminating global dispatch.
    if (definition.staticIndexEligible && globalDefinitions.has(root)) {
        // Keep all actual prototype/library versions rather than replacing earlier wrapper targets.
        if (!methodsByName.has(definition.name)) methodsByName.set(definition.name, []);
        // This index is conservative source evidence, not runtime branch reachability.
        methodsByName.get(definition.name).push(definition.id);
    }
}

/** Preserve every observed constructed class at one field/singleton address. */
function recordType(collection, address, className) {
    // Different source branches may construct different classes at the same address.
    if (!collection.has(address)) collection.set(address, new Set());
    // Do not overwrite an earlier observed type with the last file parsed.
    collection.get(address).add(className);
}

/** Resolve conservative static call candidates; never treat an unknown runtime receiver as proven. */
function candidateTargets(rawPath, ancestors) {
    // A direct project-global function/library member can be named without this inference.
    const root = rawPath.split(/[.\[]/)[0];
    // Local variables with matching names must not be resolved as shared project globals.
    if (root !== 'this' && shadowed(root, ancestors)) return [];
    // The exact known method/library name is the strongest candidate evidence.
    if (methodsByName.has(rawPath)) return methodsByName.get(rawPath);
    // A direct global function call resolves to its executable definitions, not its variable binding record.
    if (!rawPath.includes('.') && globalDefinitions.has(rawPath)) return globalDefinitions.get(rawPath);
    // The enclosing receiver proves this only for class/prototype methods and lexical arrows.
    const owner = enclosingFunction(ancestors);
    // Split literal property steps; a computed key must remain unresolved.
    const parts = rawPath.split('.');
    // Constructor observations can contain more than one source branch's possible type.
    let receivers = root === 'this' ? new Set(owner?.receiverType ? [owner.receiverType] : []) : new Set(singletonTypes.get(root) ?? []);
    // Static class/object methods use Class.member; constructed service fields use instances.
    let staticReceiver = root === 'this' && owner?.receiverStatic;
    // Unknown receivers and dynamic keys remain recorded without guessed targets.
    if (!receivers.size || rawPath.includes('[') || rawPath.includes('<')) return [];
    // Follow known constructed service fields, increasing one property until the final method.
    for (let propertyIndex = 1; propertyIndex < parts.length - 1; propertyIndex += 1) {
        // Collect all observed types reached through this particular intermediate field.
        const nextReceivers = new Set();
        // “of” visits possible receiver class values and stops after this source-backed set.
        for (const receiver of receivers) {
            // “of” visits observed constructor types; unknown fields supply an empty iterable.
            for (const fieldType of fieldTypes.get(`${receiver}.${parts[propertyIndex]}`) ?? []) {
                // Keep each possible type once without claiming it executes on every branch.
                nextReceivers.add(fieldType);
            }
        }
        // Advance to the next ownership step using only the accumulated source evidence.
        receivers = nextReceivers;
        // Constructor-assigned intermediate fields always provide instances, even from a static service owner.
        staticReceiver = false;
        // One unknown intermediate result prevents any proven final receiver type.
        if (!receivers.size) return [];
    }
    // Keep declaration candidates from every observed receiver type, without duplicate IDs.
    const targets = new Set();
    // “of” visits source-backed receiver values and stops after all possible constructed classes.
    for (const initialReceiver of receivers) {
        // Search the nearest class implementation before its parents.
        let receiver = initialReceiver;
        // A visited set makes even malformed source inheritance cycles finite.
        const visited = new Set();
        // Each repetition either finds an implementation or advances to a new superclass.
        while (receiver && !visited.has(receiver)) {
            // Mark this class before following any parent relationship.
            visited.add(receiver);
            // Build the normal JavaScript prototype member address.
            const name = `${receiver}${staticReceiver ? '' : '.prototype'}.${parts[parts.length - 1]}`;
            // Keep all declaration versions belonging to the most-derived matching method.
            if (methodsByName.has(name)) {
                // “of” visits definition IDs, ending after all versions at this class address.
                for (const target of methodsByName.get(name)) targets.add(target);
                // A derived implementation shadows inherited implementations for this receiver observation.
                break;
            }
            // Continue with the actual declared superclass instead of any same-named unrelated method.
            receiver = parentClasses.get(receiver);
        }
    }
    // Return only source-backed candidates; unknown runtime values are still explicitly unresolved.
    return [...targets];
}

/** Collect nested object-literal key paths without interpreting values or executing callbacks. */
function objectFields(node, prefix = '') {
    // Only explicit object structure yields statically known schema keys.
    if (node?.type !== 'ObjectExpression') return [];
    // A schema can contain ordinary properties, computed properties, and spreads.
    const fields = [];
    // “of” visits actual source property entries and stops after the object literal's properties.
    for (const property of node.properties) {
        // Spreads/computed expressions remain visible as dynamic schema contributions.
        if (property.type === 'SpreadElement' || property.computed) {
            // Preserve the uncertainty instead of inventing the runtime expanded keys.
            fields.push(`${prefix}<dynamic>`);
            // Continue with the next explicit source property.
            continue;
        }
        // Source key spelling may be an identifier or a quoted literal.
        const name = String(property.key.name ?? property.key.value);
        // Nested keys describe a path under the current object owner.
        const field = prefix ? `${prefix}.${name}` : name;
        // Keep the parent key as well as any nested object children.
        fields.push(field, ...objectFields(property.value, field));
    }
    // Return original schema paths; no replacement defaults are fabricated.
    return fields;
}

// Group repetitive property observations while retaining every occurrence line and its execution owner.
const memberGroups = new Map();
// “of” visits parsed modules, stopping after every source file and inline runtime block.
for (const module of modules) {
    // Each traversal records syntax relationships after all declarations/type evidence are available.
    walk.fullAncestor(module.tree, (node, state, ancestors) => {
        // Common source-location information is attached to every relationship kind.
        const site = location(node, module, ancestors);
        // Global clocks/settings can be read and written within their defining file too.
        if (module.role !== 'development' && node.type === 'Identifier' && !bindingIdentifiers.has(node) && globalDefinitions.has(node.name) && !shadowed(node.name,ancestors)) {
            // Parent syntax distinguishes assignment/update from an ordinary global read.
            const parent = ancestors[ancestors.length-2];
            // Compound assignment and increment consume the prior value before replacing it.
            const access = parent?.type === 'AssignmentExpression' && parent.left === node ? (parent.operator === '=' ? 'write' : 'read-write') : parent?.type === 'UpdateExpression' ? 'read-write' : 'read';
            // Record source-backed clock/shared-state access separately from cross-file dependency edges.
            evidence.globalAccesses.push({...site,name:node.name,access,value:parent?.right ? module.source.slice(parent.right.start,parent.right.end).replace(/\s+/g,' ').slice(0,180) : null});
        }
        // Unshadowed project global reads identify file-to-file dependencies beyond explicit function calls.
        if (module.role !== 'development' && node.type === 'Identifier' && !bindingIdentifiers.has(node) && globalDefinitions.has(node.name) && !shadowed(node.name, ancestors)) {
            // Exclude definitions in this same file from the cross-file-use list.
            const candidates = globalDefinitions.get(node.name).filter((identifier) => !identifier.startsWith(`${module.file}:`));
            // A real cross-file declaration candidate contributes a dependency relationship.
            if (candidates.length) evidence.globalReferences.push({...site, name: node.name, targets: candidates});
        }
        // Member paths reveal shared-state readers/writers even when no function is called.
        if (node.type === 'MemberExpression') {
            // The immediate parent distinguishes a field write from an ordinary read.
            const parent = ancestors[ancestors.length - 2];
            // Preserve exact literal/computed ownership paths without expanding dynamic keys.
            const member = expressionPath(node, module);
            // The root spelling alone does not prove a local game parameter is the global singleton.
            const rootName = member.split(/[.\[]/)[0];
            // Record whether this access has a known receiver, a project-global root, or only a local/host name.
            const receiverEvidence = rootName === 'this' ? (enclosingFunction(ancestors)?.receiverType ?? 'unknown-this') : globalDefinitions.has(rootName) && !shadowed(rootName,ancestors) && module.role !== 'development' ? 'project-global' : 'local-or-host';
            // Assignment operators other than = read the old value before writing the new one.
            const access = parent?.type === 'UnaryExpression' && parent.operator === 'delete' ? 'delete' : parent?.type === 'AssignmentExpression' && parent.left === node ? (parent.operator === '=' ? 'write' : 'read-write') : parent?.type === 'UpdateExpression' ? 'read-write' : 'read';
            // Group only identical file/function/path/access tuples, retaining source occurrence lines.
            const key = JSON.stringify([module.file, site.owner, member, access]);
            // Allocate a fact record for the first occurrence of this exact relationship.
            if (!memberGroups.has(key)) memberGroups.set(key, {...site, path: member, receiverEvidence, access, lines: [], writes: []});
            // Read the actual grouped record rather than copying its growing occurrence list.
            const record = memberGroups.get(key);
            // Preserve each occurrence; repeated lines can contain multiple distinct source operations.
            record.lines.push(site.line);
            // Accessors execute through property reads/writes even when there is no explicit call expression.
            record.getterCandidates = module.role === 'development' || ['write','delete'].includes(access) ? [] : candidateTargets(member + '#get', ancestors);
            // A setter is a separate executable owner from an ordinary assignment to a plain field.
            record.setterCandidates = module.role === 'development' || ['read','delete'].includes(access) ? [] : candidateTargets(member + '#set', ancestors);
            // Writes additionally expose source value expressions and whether a new object replaces state.
            if (access !== 'read') record.writes.push({line: site.line, operator: parent.operator, value: parent.right ? module.source.slice(parent.right.start, parent.right.end).replace(/\s+/g, ' ').slice(0, 180) : parent.operator, valueType: parent.right?.type ?? 'update'});
        }
        // Calls and construction are executable dependency edges, including unresolved dynamic receivers.
        if (['CallExpression', 'NewExpression'].includes(node.type)) {
            // Preserve what the source actually calls, before conservative receiver/type inference.
            const callee = expressionPath(node.callee, module);
            // Record literal arguments as evidence for event names, map IDs, storage keys, and factories.
            const literals = node.arguments.map((argument) => argument.type === 'Literal' ? argument.value : null);
            // Conservative targets are declaration candidates, not a claim every branch executes.
            const targets = module.role === 'development' ? [] : candidateTargets(callee, ancestors);
            // Keep all call sites, not just the easy statically resolved subset.
            evidence.calls.push({...site, sourceRole:module.role, callee, construct: node.type === 'NewExpression', targets, literalArguments: literals, argumentExpressions: node.arguments.map((argument) => module.source.slice(argument.start, argument.end).replace(/\s+/g, ' ').slice(0, 140)), computed: callee.includes('[') || callee.includes('<')});
            // Collection mutator spellings are candidates, not proof of arbitrary method side effects.
            if (/\.(push|pop|shift|unshift|splice|sort|reverse|copyWithin|fill|set|add|delete|clear)$/.test(callee)) evidence.mutationCandidates.push({...site,kind:'member-mutator-spelling',callee,container:callee.slice(0,callee.lastIndexOf('.'))});
            // Bulk descriptor/assignment APIs can mutate a referenced object without a member assignment node.
            if (['Object.assign','Object.defineProperty','Object.defineProperties','Reflect.set','Reflect.deleteProperty'].includes(callee)) evidence.mutationCandidates.push({...site,kind:'bulk-object-write',callee,container:expressionPath(node.arguments[0],module)});
            // Lifecycle calls need explicit cancel/ownership review during migration.
            if (/(^|\.)(requestAnimationFrame|cancelAnimationFrame|setTimeout|clearTimeout|setInterval|clearInterval|requestIdleCallback|cancelIdleCallback|addEventListener|removeEventListener|observe|disconnect|then|catch|finally|subscribe)$/.test(callee)) evidence.lifecycle.push({...site, callee, literalArguments: literals, callbackDefinitions: node.arguments.filter(isFunction).map((callback) => functionMetadata.get(callback)?.id).filter(Boolean)});
            // Literal IDs/selectors are distinguishable from runtime-created/dynamic DOM queries.
            if (/\.(getElementById|querySelector|querySelectorAll|getElementsByClassName)$/.test(callee)) evidence.dom.push({...site, kind: 'lookup', callee, value: literals[0], dynamic: literals[0] === null});
            // Local/session storage and IndexedDB all preserve externally visible state across execution.
            if (/(localStorage|sessionStorage|indexedDB|CacheDB|\.serialize|\.deserialize|\.save|\.load)/.test(callee)) evidence.storage.push({...site, callee, literalArguments: literals});
            // Literal registry registration expresses data-to-factory relationships, even without imports.
            if (/\.(register|registerMap|registerScene|registerBuilding|set)\b/.test(callee) && literals[0] !== null) evidence.registries.push({...site, name: callee, key: literals[0], kind: 'registration-call'});
        }
        // Object registries supply authored keys; classify through actual source declaration names.
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'ObjectExpression' && /(MAP|ROOM|SCENE|STORY|MISSION|WEAPON|ITEM|BRAND|APPEARANCE|LOOK|REGISTR|CONFIG|SHOP|MUSIC|CONTACT|ROLE|RECIPE)/.test(node.id.name)) evidence.registries.push({...site, name: node.id.name, kind: 'object-keys', fields: objectFields(node.init)});
        // Named fields in authored object data often connect maps, items, actors, scenes, and factories.
        if (node.type === 'Property' && !node.computed && /id|map|target|destination|transition|factory|type|kind|weapon|item|quest|mission|scene|character|npc|appearance|style|parent|area|building|landmark|requires|reward|effect|sound|track|music|route|pool|next|source|slot|category|faction|image|font|asset|audio/i.test(String(node.key.name ?? node.key.value))) {
            // Literal values and identifier factory references are facts; expressions retain their source text.
            evidence.dataRelationships.push({...site, kind:'property-value', key: node.key.name ?? node.key.value, value: node.value.type === 'Literal' ? node.value.value : module.source.slice(node.value.start,node.value.end).replace(/\s+/g,' ').slice(0,160), valueType:node.value.type});
        }
        // Named branches contain game-specific dispatch relationships absent from any import statement.
        if (node.type === 'SwitchCase' && node.test?.type === 'Literal') {
            // Find the exact source selector so case values are not mistaken for unrelated registry keys.
            const selector = [...ancestors].reverse().find((ancestor) => ancestor.type === 'SwitchStatement');
            // Preserve original map/weapon/state dispatch data without claiming the branch is reachable.
            evidence.dataRelationships.push({...site, kind:'switch-case', selector:expressionPath(selector.discriminant,module), value:node.test.value});
        }
        // Identifier comparisons expose explicit map/story/item gates in ordinary conditional code.
        if (node.type === 'BinaryExpression' && ['===','!==','==','!='].includes(node.operator) && (node.left.type === 'Literal' || node.right.type === 'Literal')) {
            // Retain the exact comparison so a reviewer can distinguish engine checks from named game rules.
            evidence.dataRelationships.push({...site, kind:'comparison', expression:module.source.slice(node.start,node.end).replace(/\s+/g,' ').slice(0,180)});
        }
        // Operators alone do not prove numeric types: plus may also concatenate UI/story strings.
        if (node.type === 'BinaryExpression' && ['+','-','*','/','%','**','<<','>>','>>>','&','|','^'].includes(node.operator)) {
            // Preserve all arithmetic-shaped sites for ownership review rather than silently moving string assembly.
            evidence.calculations.push({...site, operator:node.operator, expression:module.source.slice(node.start,node.end).replace(/\s+/g,' ').slice(0,180)});
        }
        // The actual save-schema return object is a concrete legacy compatibility contract.
        if (node.type === 'ReturnStatement' && node.argument?.type === 'ObjectExpression') {
            // Follow the real execution owner rather than matching unrelated comments containing save.
            const owner = enclosingFunction(ancestors);
            // Keep explicit original schema keys for the principal save schema method.
            // Other source serializers/default builders expose component-level return-object contracts.
            if (owner && /serialize|saveGame|saveMap|getDefaultSaveValues|snapshot/i.test(owner.name)) evidence.serializationFields.push({...site, method:owner.name, fields:objectFields(node.argument)});
            if (owner?.name === 'GameEngine.prototype.getSaveSchema') evidence.saveFields.push({...site, fields: objectFields(node.argument)});
        }
    });
}
// Serialize grouped member evidence after retaining all source occurrences.
evidence.members = [...memberGroups.values()];
// Source assembly order distinguishes method-definition versions and later prototype overrides.
const orderByFile = new Map(evidence.buildOrder.map((file, index) => [file, index]));
// Keep method contributions in actual load order, then original source line order.
evidence.registrations.sort((first, second) => (orderByFile.get(first.file) ?? 9999) - (orderByFile.get(second.file) ?? 9999) || first.line - second.line);
// Record conservative field/global type evidence alongside the relationships it supports.
evidence.typeEvidence = {fields: Object.fromEntries([...fieldTypes].map(([name, types]) => [name, [...types]])), singletons: Object.fromEntries([...singletonTypes].map(([name, types]) => [name, [...types]]))};
// The pinned Git tree records binary assets without downloading or re-encoding their contents.
const treeFilename = path.resolve(argument('--tree', path.join(sourceRoot,'SOURCE_TREE.json')));
// A full local checkout can omit this optional remote metadata input without pretending binary coverage exists.
if (fs.existsSync(treeFilename)) {
    // Read the explicitly recorded repository tree snapshot.
    const sourceTree = JSON.parse(fs.readFileSync(treeFilename,'utf8'));
    // A different commit would mix asset/source provenance and invalidate this audit.
    if (sourceTree.commit !== sourceCommit) throw new Error('Asset tree commit differs from --commit.');
    // Index expected byte identities for source, tools, resources, and the original playable artifact.
    const expectedFiles = new Map(sourceTree.files.map((file) => [file.path,file]));
    // “of” supplies inventoried input records and stops after every actual inspected file.
    for (const file of evidence.files) {
        // A manifest entry must exist before this source input can claim pinned byte identity.
        const expected = expectedFiles.get(file.file);
        // Read the original bytes, preserving their exact newline/encoding representation.
        const bytes = fs.readFileSync(path.join(sourceRoot,file.file));
        // Git blob SHA-1 includes its byte-count header, not only the source text hash.
        const blob = crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
        // Mismatched/missing identities invalidate the pinned-source audit instead of becoming silent drift.
        if (!expected || blob !== expected.sha) throw new Error(`Pinned source mismatch: ${file.file}`);
        // Keep successful byte verification explicit for later coverage/query tools.
        file.gitBlobSha = blob;
    }
    // Keep source asset identities and sizes; README files are documentation, not embedded media payloads.
    evidence.assets = sourceTree.files.filter((file) => file.path.startsWith('assets/')).map((file) => ({...file, embedded:!file.path.toLowerCase().endsWith('readme.md')}));
}
// Report exact coverage counts rather than calling static extraction complete runtime knowledge.
evidence.coverage = {
    // Include all discovered source/development resource files, not only successful AST parses.
    inventoriedFiles: evidence.files.length,
    // Runtime/development inline blocks are counted as parse units independently from files.
    parsedUnits: modules.length,
    // Concrete parser failures remain a visible acceptance blocker for syntax coverage.
    parseFailures: evidence.files.filter((file) => file.parseStatus.startsWith('error:')),
    // Every call expression is retained, whether its runtime target could be inferred or not.
    calls: evidence.calls.length,
    // Unresolved includes host APIs/local callbacks/dynamic dispatch; it does not mean missing game code.
    callsWithoutStaticTarget: evidence.calls.filter((call) => !call.targets.length).length,
    // Runtime and test code are counted separately; host/native calls are not missing project functions.
    runtimeCalls: evidence.calls.filter((call) => call.sourceRole !== 'development').length,
    // Runtime function bodies include methods/accessors/callbacks, not mere global variable declarations.
    runtimeFunctions: evidence.definitions.filter((definition) => definition.role !== 'development' && !['class','global-binding','generated-binding'].includes(definition.kind)).length,
    // Include only exact pinned source inputs when a Git-tree manifest was supplied.
    verifiedInputFiles: evidence.files.filter((file) => file.gitBlobSha).length,
    // This audit never claims to prove branch reachability or execute every original game behavior.
    runtimeExhaustivenessProven: false
};
// Create the evidence folder only after extraction has completed successfully.
fs.mkdirSync(outputRoot, {recursive: true});
// JSON is compact generated data; gzip keeps detailed evidence practical to store and query.
const serialized = JSON.stringify(evidence);
// A fixed compression level avoids platform-time metadata and preserves deterministic output.
fs.writeFileSync(path.join(outputRoot, 'relationships.json.gz'), zlib.gzipSync(serialized, {level: 9}));
// A small uncompressed summary supports quick review without loading the full detailed graph.
fs.writeFileSync(path.join(outputRoot, 'coverage.json'), JSON.stringify({...evidence.coverage, sourceCommit, definitions: evidence.definitions.length, globalReferences: evidence.globalReferences.length, members: evidence.members.length, inheritance: evidence.inheritance.length, prototypeContributions: evidence.registrations.length, lifecycleSites: evidence.lifecycle.length, domSites: evidence.dom.length, storageSites: evidence.storage.length}, null, 2) + '\n');
// Print concrete output/coverage so incomplete extraction cannot be mistaken for a successful audit.
console.log(JSON.stringify({outputRoot, ...evidence.coverage, definitions: evidence.definitions.length, compressedBytes: fs.statSync(path.join(outputRoot, 'relationships.json.gz')).size}, null, 2));
