# Instructions for coding agents

Read [CODE_REQUIREMENTS.md](CODE_REQUIREMENTS.md) before writing, modifying, or reviewing project code. It records the owner's explicit requirements for descriptive names, line-by-line English explanations, JavaScript teaching comments, engine/game separation, behavior preservation, incremental verification, and a single offline HTML deliverable.

These requirements take precedence over generic preferences for terse code or comments that explain only “why.” Apply the acceptance review in that document before delivering changes. Do not claim existing code complies without inspecting it. Follow the user's current task scope; these files do not independently authorize a rewrite or publication.

Before adding world features, read [rewrite/ENGINE_CONTRACTS.md](rewrite/ENGINE_CONTRACTS.md).
Use shared scene geometry/height, ordinary body contacts, and depth-tested surface/light
declarations. Do not add gameplay-type collision pairs or late Canvas glow overlays as
repairs for missing engine behavior. Run the relevant deterministic and real-browser checks.
