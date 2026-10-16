/** Build-time stylesheet embedding for the same offline HTML delivery contract as modules.
 * The supported subset is explicit local links and self-contained CSS: no hidden imports,
 * font/image URL fetches or external stylesheets may slip into a delivered editor. */
import { readFile } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
export async function embedStyles(html, entry, root) {
  const boundary = resolve(root) + sep;
  for (const match of html.matchAll(
    /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g,
  )) {
    const href = match[1],
      file = resolve(dirname(entry), href);
    if (!href.startsWith(".") || !file.startsWith(boundary))
      throw new Error("Stylesheets must be local project files");
    const css = await readFile(file, "utf8"),
      tokens = css.replace(/\/\*[\s\S]*?\*\//g, "");
    if (/@import\b|\burl\s*\(/i.test(tokens))
      throw new Error("Stylesheets must have no runtime dependencies");
    // CSS's own escape keeps a quoted closing-style value from terminating its HTML container.
    html = html.replace(
      match[0],
      () => `<style>\n${css.replace(/<\/style/gi, "\\3c /style")}\n</style>`,
    );
  }
  if (/<link\b[^>]*rel=["']stylesheet["']/i.test(html))
    throw new Error("Unsupported stylesheet link syntax");
  return html;
}
