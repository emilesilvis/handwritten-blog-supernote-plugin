# handwritten.blog for Supernote

Private, user-triggered Supernote plugin spike. While a NOTE is open, the plugin saves it,
renders each page through the official SDK, verifies an ordered SHA-256 manifest, and sends
only the rendered PNGs to a private handwritten.blog draft.

The project was generated from Supernote's official React Native 0.79.2 template. It does
not log in to Supernote Cloud, upload `.note` files, or persist the handwritten.blog bearer.

## Build

```sh
npm ci
npm run lint
npx tsc --noEmit
npm test -- --runInBand
./buildPlugin.sh
```

The installable package is written to `build/outputs/HandwrittenBlog.snplg` (the ignored
`build/` directory is regenerated locally). For a non-production device spike, change
`API_BASE_URL` in `src/api.ts` to the HTTPS acceptance endpoint before building.

The production Docker build regenerates that package and places it at the same path inside
the application image. Signed-in authors with the `supernote_plugin` feature can download it
from the Supernote setup screen; it is not exposed as a public static file. Set
`SUPERNOTE_PLUGIN_PACKAGE_PATH` only when a deployment stores the built package elsewhere.

Copy the `.snplg` file to the tablet's `MyStyle` directory, then install it from
Settings → Apps → Plugins → Add Plugin. The official installation and packaging guide is
<https://docs.supernote.com/en/first-plugin>.

## Device contract

- The toolbar action is registered only in NOTE.
- `saveCurrentNote` runs before the current path, page count, or renderer is used.
- Pages are rendered zero-based with `generateNotePng`, sent one-based as
  `page-0001.png`, `page-0002.png`, and so on.
- A stable random source UUID is stored as empty directory markers under the SDK-provided
  plugin directory. A renamed NOTE requires choosing its former name, so mutable paths do
  not silently create a second post.
- Rendered PNGs live under the plugin directory and are removed after upload.
- The upload bearer lives only in the JavaScript process. A plugin/device restart may
  require a new one-time pairing code until secure Keystore-backed plugin storage is proven.

See [`docs/supernote-plugin-spike.md`](../docs/supernote-plugin-spike.md) for the server
contract, rollout controls, and the hardware acceptance matrix.
