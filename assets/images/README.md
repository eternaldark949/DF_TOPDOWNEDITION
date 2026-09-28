# Images

Drop `.png`, `.jpg`, `.webp`, `.gif` or `.svg` files here (subfolders are fine).
The build bakes them into the game file automatically.

A file's name, without the extension, is how the code finds it:

| File | Name in code |
|---|---|
| `assets/images/portrait_949.png` | `'portrait_949'` |
| `assets/images/signs/ollo.webp` | `'signs/ollo'` |

```js
drawAsset(ctx, 'portrait_949', x, y, 64, 64);   // draw it
const img = getImage('portrait_949');           // or get the Image itself
```

Tip: keep names lowercase with underscores, and export at the size you'll draw them.
