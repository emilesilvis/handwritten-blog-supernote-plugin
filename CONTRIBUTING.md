# Contributing

Bug reports and focused pull requests are welcome. Keep NOTE contents, pairing codes,
upload credentials, device identifiers, private signing keys, and device passwords out of
issues, test fixtures, commits, and build logs.

Before opening a pull request, run:

```sh
npm ci
npm run lint
npx tsc --noEmit
npm test -- --runInBand
./buildPlugin.sh
```

Changes to rendering, notebook identity, authentication, temporary-file cleanup, or
supported firmware require tests and a real-device validation plan.
