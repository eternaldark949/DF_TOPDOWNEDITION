/** Freelancer / 949's humanoid proportions. The JSON is authoritative and owner-editable;
 * the generic generator and its validation live in Penthouse. These starting values are
 * a proposal for the silhouette review, not an approved character design. */
import data from "../content/humanoid-949.json" with { type: "json" };
import { validateHumanoid } from "../../../engine/penthouse/humanoid.js";

export const STELLA_949 = validateHumanoid(data);
