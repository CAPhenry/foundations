# HMP Foundation

HMP Foundation is the cohesive, versioned stack of common resources for HogwartsMP servers. Its
resources share the `hmp-` namespace, are designed and tested together, and remain independently
adoptable through normal resource dependencies.

This repository is separate from the MafiaHub C++ Framework used to build HogwartsMP. Foundation is
the server scripting layer built on top of that runtime.

## Resources

| Resource | Purpose |
|---|---|
| [`hmp-mysql`](resources/hmp-mysql) | Pooled, promise-based MySQL and MariaDB access. |

## Development

Node.js 22 or newer is required for Foundation's build tools. The generated resources target Node.js
22 and run on the newer embedded Node runtime shipped by HogwartsMP.

```sh
npm ci
npm test
npm run build
npm run package
```

`npm run package` writes a ready-to-load pack under `build/hmp-foundation/resources/`. Runtime
artifacts contain bundled dependencies: server owners do not run npm inside the game-server image.

## Versioning

Foundation releases have one pack version, while every resource retains its own manifest version.
A server distribution pins a Foundation release as a unit; resources use manifest dependencies when
they require another member of the stack.

## License

HMP Foundation uses the same [MafiaHub OSS license](LICENSE) as the main HogwartsMP mod repository.
