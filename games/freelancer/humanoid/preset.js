/** Freelancer / 949's humanoid and the game's wardrobe. The JSON files are authoritative
 * and owner-editable; the generic generator, garment rules and their validation live in
 * Penthouse. 949's base look follows the 2D game (female canon, curls, no backpack by
 * default); her outfit here is a proposal for review, not an approved design. */
import data from "../content/humanoid-949.json" with { type: "json" };
import wardrobe from "../content/wardrobe.json" with { type: "json" };
import { validateHumanoid } from "../../../engine/penthouse/humanoid.js";
import { validateWardrobe, resolveOutfit } from "../../../engine/penthouse/garments.js";

export const FREELANCER_WARDROBE = validateWardrobe(wardrobe);
export const STELLA_949 = validateHumanoid(data);
// Fail at load, not at first draw, if the preset names a garment the wardrobe lacks.
resolveOutfit(STELLA_949.outfit, FREELANCER_WARDROBE);
