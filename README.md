# handwritten.blog plugin for Supernote

This repository contains the open-source Supernote client for
[handwritten.blog](https://handwritten.blog). It sends the pages of one explicitly open
NOTE to the user's blog as a private draft.

The plugin is built with Supernote's official plugin SDK. It is unofficial and is not
endorsed by Supernote or Ratta.

## How it fits together

```text
Supernote NOTE
  -> the user taps “Send to handwritten.blog”
  -> the official SDK saves and renders the open NOTE
  -> this plugin uploads the rendered pages
  -> handwritten.blog creates or updates one private draft
```

The handwritten.blog service and backend are separate from this client and are not part of
this repository.

## Availability and compatibility

The source is public, but the handwritten.blog Supernote integration is still a
hardware-gated pilot. The installable package is available only to enabled accounts, and
builds from this repository are for development and controlled testing until supported
device and firmware combinations have passed the hardware acceptance matrix.

Nothing is published automatically. Authors review the resulting private draft before
adding it to their blog.

## Security and privacy model

The plugin does not ask for a Supernote password, OTP, Cloud token, or access to the user's
Cloud library. It does not upload the native `.note` file.

Pairing uses a short-lived, one-time code from handwritten.blog. The returned upload
credential exists only in the JavaScript process and is scoped to this Supernote import
endpoint; restarting the plugin or tablet may require pairing again.

For every explicit send, the plugin:

1. asks the official SDK to save the open NOTE;
2. renders its pages as PNGs in the SDK-provided plugin directory;
3. hashes every page and the ordered revision;
4. uploads the complete ordered page set over HTTPS; and
5. removes the temporary rendered PNGs.

Some PluginHost versions do not expose the SDK's `saveCurrentNote` function. On those
hosts, the plugin renders the persisted NOTE instead and warns the author to verify that
the private draft includes their latest strokes. A failed save still stops the send; this
fallback applies only when the host function itself is unavailable.

If the path-based NOTE page-count bridge is unavailable, the plugin uses the SDK's
current-document page count. Other missing runtime capabilities produce a named compatibility
error instead of the unhelpful `undefined is not a function`; report that message together with
the device model and firmware version.

Any failed pair or send also displays a sanitized diagnostic trace with the plugin version,
attempted stages, host capabilities, error value and JavaScript stack. Photograph the complete
trace together with the device model and firmware version. Pairing codes, bearer credentials,
URLs, NOTE paths and generated identifiers are redacted from the report.

## Build

Node.js 18 or later is required.

```sh
npm ci
npm run lint
npx tsc --noEmit
npm test -- --runInBand
./buildPlugin.sh
```

The test suite includes an app-level PluginHost compatibility matrix for missing save, path,
page-count, storage, renderer and rendered-file readback capabilities, plus diagnostic trace
formatting and redaction coverage.

The installable package is written to `build/outputs/HandwrittenBlog.snplg`. For a
non-production device test, change `API_BASE_URL` in `src/api.ts` to the HTTPS acceptance
endpoint before building.

Copy the `.snplg` file to the tablet's `MyStyle` directory, then install it from
Settings → Apps → Plugins → Add Plugin. See Supernote's
[plugin guide](https://docs.supernote.com/en/first-plugin) for the official template,
packaging, and installation instructions.

## Device contract

- The toolbar action is registered only in NOTE.
- `saveCurrentNote` runs before the current path, page count, or renderer is used when the
  host provides it. Otherwise the plugin renders the persisted NOTE and shows a review
  warning after upload.
- Pages are rendered zero-based with `generateNotePng`, sent one-based as
  `page-0001.png`, `page-0002.png`, and so on.
- A stable random source UUID is stored as empty directory markers under the SDK-provided
  plugin directory. A renamed NOTE requires choosing its former name, so mutable paths do
  not silently create a second post.
- Rendered PNGs are removed after upload.
- The upload credential lives only in the JavaScript process.

## License

The plugin is available under the [MIT License](LICENSE).
