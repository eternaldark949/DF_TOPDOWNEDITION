# Session handoff — 7 October 2026

This branch updates the modular source and the generated `DFAB V8.html` to match the user-approved cumulative game. The [change catalogue](CHANGELOG.md) describes completed changes and deferred plans; [PR text](PULL_REQUEST.md) is ready to paste. [Body studies](body-review/README.md) remain preview-only.

The branch is based on main at `cb31f3c5c3c07505e145ccd280977b79fa2bd0b0`. The supplied standalone was not an exact repository commit. The first commit reconciles its pre-existing improvements into `src/`; the second contains this session’s approved refinements. This separation makes the baseline carry-over reviewable instead of presenting it as newly requested work.

The original embedded images/audio, source order and build tooling are retained. Run `node tools/build.mjs --check` to verify the generated game. Its SHA-256 is `d38c84b950ec3722d24acaf9faaabfd37988355aae04268095068ce8c9be21f1`, exactly matching `DFAB-V8-scrapyard-bounded-animation.html` from this session.

The download ZIP contains the Git bundle, a combined binary-capable patch, the playable game, 46 images/animations/videos, the body review material, selected validation reports and lossless history for 30 builds. Media filenames in the catalogue refer to that archive. The Git branch includes the two body comparison sheets; earlier media and generated concepts remain archive references.

Mechanical weapon wear, magazine/reload rules and nightclub timing work remain deferred. Unlimited firing is preserved. Existing saves can be exported and imported when changing browser origin or file location.
