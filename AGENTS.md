# Working in ETRNLNINE

Read README.md and the applicable docs/decisions records (First Light, Between Worlds, and Profiler) before changing source. The owner's house architecture and commenting requirements govern this branch.

- Basement defines reusable mechanisms; Lobby alone owns runtime scheduling; Directory manages registered libraries/worlds/resource ownership; Penthouse supplies reusable toys. ETRNLNINE remains a small composition root.
- Game/example rules and content stay outside engine/. Engine code never imports them or looks up game DOM IDs.
- No Canvas 2D rendering or asset/text preparation, runtime frameworks, CDN requirements, competing animation-frame loops, hidden game globals, prototype patches, or alternate renderer bypasses.
- Comment files, classes, functions, shaders, configuration, meaningful blocks, ownership, units, lifecycles, and editing points generously. Keep explanations accurate as code changes.
- Move misplaced responsibilities to their appropriate home in the same coherent change. No god objects, bandaid classes, or bolted-on exceptions; a wrapper is not a repaired boundary.
- Every instance owns mutable state, registrations, and cleanup. Shared resources require explicit leases. Repeated create/dispose and pause/focus changes must remain safe.
- Keep adopted decisions, implementation status, and open proposals distinct. Do not claim planned systems or scaffolds are implemented.
- Run npm test and npm run build after relevant source changes. Use npm run test:browser for rendering/input/lifecycle changes when Playwright/Chromium are available; see the decision guide for setup and environmental limitations.
- Commit the rebuilt dist HTML with source changes. Record real verification results and limitations; emulated mobile and software WebGL do not prove physical-device performance.

For world work, preserve active/preparation ownership and final-boundary validation. Readiness promises resolve without resource values; use the owned ticket.value. Never move actor membership from an asynchronous completion or retain borrowed world resources after releasing their ticket.

For profiling, register static bounded names once and close synchronous scopes in finally. Do not poll or wait for GPU completion in hot paths. Own provider/view subscriptions, distinguish CPU/interval/GPU measurements, and label buffer sizes and capture-time versus historical data accurately.
