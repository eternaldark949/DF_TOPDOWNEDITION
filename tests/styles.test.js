/** Offline stylesheet packaging is a contract: no external dependencies or HTML termination. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { embedStyles } from "../tools/styles-module.js";
test("Local CSS embeds literally and safely; unsupported links and runtime imports fail", async () => {
  const root = await mkdtemp(join(tmpdir(), "etrnlnine-styles-"));
  try {
    const css = join(root, "theme.css"),
      entry = join(root, "index.html"),
      html = '<link rel="stylesheet" href="./theme.css">';
    await writeFile(
      css,
      '/* @import in a comment is inert */\np::after{content:"$& </style>"}',
    );
    const result = await embedStyles(html, entry, root);
    assert.ok(result.includes("$&"));
    assert.ok(result.includes("\\3c /style>"));
    assert.equal(result.match(/<\/style>/g).length, 1);
    for (const value of [
      '@import "other.css";',
      "x{background:url(https://example.org/a)}",
    ]) {
      await writeFile(css, value);
      await assert.rejects(
        embedStyles(html, entry, root),
        /runtime dependencies/,
      );
    }
    for (const href of ["https://example.org/a.css", "../outside.css"])
      await assert.rejects(
        embedStyles(`<link rel="stylesheet" href="${href}">`, entry, root),
        /local project/,
      );
    await assert.rejects(
      embedStyles("<link href='./theme.css' rel='stylesheet'>", entry, root),
      /Unsupported/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
