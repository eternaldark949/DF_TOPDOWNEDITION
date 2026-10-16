/** Studio / command-to-art mapping. Penthouse supplies vectors/decorators, Directory
 * supplies the registered catalog; Studio alone decides which commands show which art. */
import { IconControls } from "../../engine/penthouse/icon-controls.js";
export function studioIconography(root, library) {
  const controls = new IconControls(library);
  try {
    for (const element of root.querySelectorAll("[data-icon]"))
      controls.set(element, element.dataset.icon, element.textContent.trim(), {
        compact: element.dataset.iconOnly === "true",
      });
    return controls;
  } catch (error) {
    controls.dispose();
    throw error;
  }
}
