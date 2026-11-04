# Map database and transition catalog

These are the static MAP_DATA definitions in the pinned original, not a claim that the static database contains every live transition. Building harvesting, city generation, entity factories and story branches add runtime content in map-loading.js and map-entities.js. `map-definitions.json` retains all static fields; expressions remain source text rather than being executed. Inspect `dataRelationships` for named map branches/calls outside this database.

## sdc

Source: `src/world/maps.js:6`. Southern Dimensions City; 13200 × 13200 world units; outdoor; spawn {"x":1200,"y":550}.

No static transitions declared here.

## ethereal_plane

Source: `src/world/maps.js:22`. The Ethereal Plane; 1200 × 1200 world units; indoor; spawn {"x":600,"y":1000}.

- To `sdc`: Return to Body; source rectangle 550, 1100, 100, 50; other properties {"x":550,"y":1100,"w":100,"h":50,"target":"sdc","label":"Return to Body"}.

## apt_949

Source: `src/world/maps.js:30`. Silver Queen Apartments; 1400 × 900 world units; indoor; spawn {"x":1050,"y":370}.

- To `sdc`: Exit to City; source rectangle 620, 860, 160, 40; other properties {"x":620,"y":860,"w":160,"h":40,"target":"sdc","label":"Exit to City"}.

## hotel_lobby

Source: `src/world/maps.js:59`. Double Nights Hotel | Lobby; 1000 × 1200 world units; indoor; spawn {"x":500,"y":1100}.

- To `sdc`: Exit Hotel; source rectangle 400, 1150, 200, 50; other properties {"x":400,"y":1150,"w":200,"h":50,"target":"sdc","label":"Exit Hotel"}.
- To `hotel_suite`: Use Elevator; source rectangle 50, 300, 100, 500; other properties {"x":50,"y":300,"w":100,"h":500,"target":"hotel_suite","label":"Use Elevator","quiet":true}.
- To `hotel_suite`: Use Elevator; source rectangle 850, 300, 100, 500; other properties {"x":850,"y":300,"w":100,"h":500,"target":"hotel_suite","label":"Use Elevator","quiet":true}.

## keepers_hill

Source: `src/world/maps.js:82`. Somewhere between the realms; 1800 × 2800 world units; indoor; spawn {"x":900,"y":2450}.

No static transitions declared here.

## keepers_parlor

Source: `src/world/maps.js:87`. The Keeper's parlor; 900 × 700 world units; indoor; spawn {"x":450,"y":600}.

No static transitions declared here.

## van_interior

Source: `src/world/maps.js:93`. En route to Double Nights; 400 × 820 world units; indoor; spawn {"x":200,"y":460}.

No static transitions declared here.

## hotel_suite

Source: `src/world/maps.js:98`. Penthouse Suite; 1400 × 1000 world units; indoor; spawn {"x":200,"y":500}.

- To `hotel_lobby`: Elevator; source rectangle 50, 400, 50, 200; other properties {"x":50,"y":400,"w":50,"h":200,"target":"hotel_lobby","label":"Elevator"}.
- To `church_boss`: Strange Portal; source rectangle 1120, 50, 120, 200; other properties {"x":1120,"y":50,"w":120,"h":200,"target":"church_boss","label":"Strange Portal"}.

## medbay_sw

Source: `src/world/maps.js:114`. Dr. Yin's Clinic; 800 × 800 world units; indoor; spawn {"x":400,"y":600}.

- To `sdc`: Exit Clinic; source rectangle 350, 720, 100, 80; other properties {"x":350,"y":720,"w":100,"h":80,"target":"sdc","label":"Exit Clinic"}.

## moon_city_nightclub

Source: `src/world/maps.js:134`. Moon City Nightclub; 1600 × 1200 world units; indoor; spawn {"x":800,"y":1130}.

- To `sdc`: Exit Nightclub; source rectangle 740, 1170, 120, 30; other properties {"x":740,"y":1170,"w":120,"h":30,"target":"sdc","label":"Exit Nightclub"}.

## church_boss

Source: `src/world/maps.js:161`. Abandoned Church; 1200 × 1400 world units; outdoor; spawn {"x":600,"y":1250}.

- To `hotel_suite`: Exit Church; source rectangle 550, 1320, 100, 80; other properties {"x":550,"y":1320,"w":100,"h":80,"target":"hotel_suite","label":"Exit Church"}.

## enni_cole_interior

Source: `src/world/maps.js:187`. Enni Cole; 3250 × 1400 world units; indoor; spawn {"x":1000,"y":1300}.

- To `sdc`: Exit to City; source rectangle 850, 1320, 300, 80; other properties {"x":850,"y":1320,"w":300,"h":80,"target":"sdc","label":"Exit to City"}.
- To `enni_cole_upper`: Upstairs; source rectangle 880, 50, 240, 60; other properties {"x":880,"y":50,"w":240,"h":60,"target":"enni_cole_upper","label":"Upstairs","quiet":true}.

## enni_cole_upper

Source: `src/world/maps.js:221`. Enni Cole | Upper Floor; 2000 × 1100 world units; indoor; spawn {"x":1000,"y":200}.

- To `enni_cole_interior`: Downstairs; source rectangle 900, 50, 200, 70; other properties {"x":900,"y":50,"w":200,"h":70,"target":"enni_cole_interior","label":"Downstairs","quiet":true}.

## cozy_cafe_interior

Source: `src/world/maps.js:241`. Cozy Cafe; 1200 × 1000 world units; indoor; spawn {"x":600,"y":900}.

- To `sdc`: Exit to City; source rectangle 500, 920, 200, 80; other properties {"x":500,"y":920,"w":200,"h":80,"target":"sdc","label":"Exit to City"}.

## auto_shop

Source: `src/world/maps.js:266`. Torque Auto — Service Bay; 1400 × 1000 world units; indoor; spawn {"x":700,"y":900}.

- To `sdc`: Exit to City; source rectangle 600, 920, 200, 80; other properties {"x":600,"y":920,"w":200,"h":80,"target":"sdc","label":"Exit to City"}.

## neural_sys_interior

Source: `src/world/maps.js:293`. Neural Systems — Identity Atelier; 1000 × 800 world units; indoor; spawn {"x":500,"y":700}.

- To `sdc`: Exit Neural Systems; source rectangle 400, 720, 200, 80; other properties {"x":400,"y":720,"w":200,"h":80,"target":"sdc","label":"Exit Neural Systems"}.

## biggs_arena

Source: `src/world/maps.js:329`. Biggs Amusement Park — Crash Royale; 900 × 900 world units; indoor; spawn {"x":450,"y":820}.

- To `sdc`: Exit Biggs Park; source rectangle 350, 840, 200, 60; other properties {"x":350,"y":840,"w":200,"h":60,"target":"sdc","label":"Exit Biggs Park"}.

## house_of_death

Source: `src/world/maps.js:377`. The House of Death; 1800 × 1500 world units; indoor; spawn {"x":900,"y":1420}.

- To `sdc`: Leave the House; source rectangle 830, 1470, 140, 30; other properties {"x":830,"y":1470,"w":140,"h":30,"target":"sdc","label":"Leave the House"}.

## demoness_palace

Source: `src/world/maps.js:413`. The Demoness Palace; 1800 × 1400 world units; indoor; spawn {"x":900,"y":1320}.

- To `sdc`: Leave the Palace; source rectangle 830, 1370, 140, 30; other properties {"x":830,"y":1370,"w":140,"h":30,"target":"sdc","label":"Leave the Palace"}.

## ollo_test

Source: `src/world/maps.js:443`. OllO Plaza; 2000 × 1500 world units; outdoor; spawn {"x":1000,"y":1200}.

- To `sdc`: Return to City; source rectangle 400, 1450, 1200, 50; other properties {"x":400,"y":1450,"w":1200,"h":50,"target":"sdc","label":"Return to City"}.

## ollo_interior

Source: `src/world/maps.js:467`. OllO Lounge; 800 × 600 world units; indoor; spawn {"x":400,"y":500}.

- To `ollo_test`: Exit to Plaza; source rectangle 300, 560, 200, 40; other properties {"x":300,"y":560,"w":200,"h":40,"target":"ollo_test","label":"Exit to Plaza"}.

