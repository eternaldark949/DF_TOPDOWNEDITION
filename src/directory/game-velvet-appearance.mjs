        /**
         * =====================================================================
         *  VELVET CAT — Dreampunk Feline Companion
         * =====================================================================
         * A small velvet-furred cat that follows 949 through the city.
         * Procedurally rendered, curious idle behaviors, rides in vehicles.
         * Acquired once, persists via questState.hasVelvetCat.
         */
        // Retained coat options for future customization. Palette records and semantic colors are immutable.
        // Eye, muzzle, nose, inner-ear and whisker colors remain part of the shared feline artwork.
export const VELVET_CAT_PALETTES = Object.freeze({
            default: Object.freeze({
                id: 'default', label: 'Default plum',
                colors: Object.freeze({
                    tailBase: "#211226",
                    tailMiddle: "#2f1c35",
                    tailTip: "#190d20",
                    tailNap: "rgba(123,87,142,.18)",
                    raisedPaw: "#3a2440",
                    pawTop: "#2b1932",
                    pawShadow: "#160b1c",
                    pawRim: "rgba(108,75,120,.24)",
                    legShade: "#1b0e23",
                    bodyTop: "#35223d",
                    bodyMiddle: "#27152e",
                    bodyShade: "#1b0d22",
                    bodyDeep: "#120a19",
                    napStart: "rgba(125,91,147,0)",
                    napHighlight: "rgba(143,109,160,.10)",
                    napShade: "rgba(118,84,139,.055)",
                    napEnd: "rgba(118,84,139,0)",
                    furStroke: "rgba(164,126,180,.065)",
                    bodyRim: "rgba(110,78,128,.23)",
                    earTip: "#211126",
                    earMiddle: "#3b2541",
                    earBase: "#24142d",
                    earRim: "rgba(151,103,147,.20)",
                    headTop: "#382440",
                    headMiddle: "#2c1934",
                    headShadow: "#190e22",
                    cheekFur: "rgba(133,92,150,.21)",
                    groomArm: "#24122c",
                })
            }),
            tinge: Object.freeze({
                id: 'tinge', label: 'Velvet tinge',
                colors: Object.freeze({
                    tailBase: "#2b1226",
                    tailMiddle: "#3d1c31",
                    tailTip: "#200d1e",
                    tailNap: "rgba(134,78,117,.18)",
                    raisedPaw: "#46223a",
                    pawTop: "#35172d",
                    pawShadow: "#1a0b1b",
                    pawRim: "rgba(122,70,105,.24)",
                    legShade: "#240e23",
                    bodyTop: "#442039",
                    bodyMiddle: "#30142c",
                    bodyShade: "#210d21",
                    bodyDeep: "#150a18",
                    napStart: "rgba(137,82,120,0)",
                    napHighlight: "rgba(155,93,127,.10)",
                    napShade: "rgba(133,75,112,.055)",
                    napEnd: "rgba(133,75,112,0)",
                    furStroke: "rgba(171,113,145,.065)",
                    bodyRim: "rgba(123,70,107,.23)",
                    earTip: "#2b1126",
                    earMiddle: "#482239",
                    earBase: "#2f1329",
                    earRim: "rgba(156,92,128,.20)",
                    headTop: "#452139",
                    headMiddle: "#36172f",
                    headShadow: "#210d21",
                    cheekFur: "rgba(145,83,123,.21)",
                    groomArm: "#2d1128",
                })
            }),
            full: Object.freeze({
                id: 'full', label: 'Full velvet color',
                colors: Object.freeze({
                    tailBase: "#581832",
                    tailMiddle: "#70203d",
                    tailTip: "#330f25",
                    tailNap: "rgba(190,89,126,.18)",
                    raisedPaw: "#7a2542",
                    pawTop: "#5e1935",
                    pawShadow: "#310e24",
                    pawRim: "rgba(174,78,111,.24)",
                    legShade: "#3e1029",
                    bodyTop: "#8a2545",
                    bodyMiddle: "#681d39",
                    bodyShade: "#49132d",
                    bodyDeep: "#330f25",
                    napStart: "rgba(188,83,119,0)",
                    napHighlight: "rgba(204,104,139,.10)",
                    napShade: "rgba(171,71,108,.055)",
                    napEnd: "rgba(171,71,108,0)",
                    furStroke: "rgba(215,132,157,.065)",
                    bodyRim: "rgba(174,76,104,.23)",
                    earTip: "#4e1430",
                    earMiddle: "#79243f",
                    earBase: "#561730",
                    earRim: "rgba(179,88,115,.20)",
                    headTop: "#8e2d4d",
                    headMiddle: "#671e3a",
                    headShadow: "#350f25",
                    cheekFur: "rgba(188,91,124,.21)",
                    groomArm: "#4d142e",
                })
            }),
        });

        /* Velvet's body is one flexible spine (rump to neck) bent into an arc, with a width profile per pose:
           standing, sitting (bunched haunches), loafing, sleeping (curled), stretching. Four legs step from it in
           a walk, trot or gallop chosen by speed; a nine-segment tail, the head, ears, eyes and whiskers all move
           on springs in update(). draw() only reads that state (and notes where her eyes are for drawEyeShine). Widths are half-widths at VELVET_T along the spine. */
export const VELVET_T = [0, .12, .28, .5, .72, .88, 1];
export const VELVET_PROFILES = {
            stand:   [2.6, 5.5, 6.1, 4.1, 5.4, 4.7, 3.1],
            sit:     [5.2, 7.5, 7.6, 6.2, 5.3, 4.8, 3.6],
            loaf:    [4.2, 6.4, 6.8, 6.7, 6.4, 5.6, 4.0],
            sleep:   [3.6, 6.2, 6.8, 6.6, 6.2, 5.4, 4.0],
            stretch: [4.0, 6.2, 6.0, 4.0, 4.4, 4.2, 3.0]
        };
        // Foot positions (body-local, from the spine's neck end) for the rest poses: [front dx, front dy, hind t, hind out].
        // Gait phase offsets per leg [LH, LF, RH, RF] in cycles, the share of a cycle each foot is down, and how far it sweeps.
export const VELVET_GAITS = [
            { off: [0, .25, .5, .75], duty: .62, stride: 8.5 },   // walk: lateral sequence
            { off: [0, .5, .5, 1], duty: .5, stride: 11 },        // trot: diagonal pairs
            { off: [0, .55, .1, .65], duty: .34, stride: 19 }     // gallop: rotary, hinds then fores
        ];
export const VELVET_TAIL_SEGS = 9;

