# Install HMP Foundation

This guide is for a server owner installing the complete Foundation pack. Foundation is one versioned
unit: install all twenty-two `hmp-*` resources from the same release and upgrade them together.

## Before you begin

In this guide, `<server-root>` means the working directory used to launch the dedicated server. It is
normally the directory containing `HogwartsMPServer.exe` and must contain the `resources` and `data`
directories described below.

You need:

- a compatible HogwartsMP dedicated server from the [compatibility matrix](COMPATIBILITY.md);
- MySQL 8.x or MariaDB 10.6 or newer;
- permission to create an empty database and a database-scoped user;
- Windows clients using the supported Hogwarts Legacy build.

Node.js, npm, TypeScript, and this source repository are not required when installing a release ZIP.
Release resources already contain their bundled JavaScript dependencies.

## 1. Create the database

Follow [DATABASE.md](DATABASE.md). In short:

1. Create an empty `hogwartsmp` database using `utf8mb4`.
2. Create a non-root `hogwartsmp` database user with a unique password.
3. Grant that user privileges only on `hogwartsmp.*`.
4. Test the connection from the game-server machine.

Do not import a schema. Foundation creates and upgrades all of its own tables on startup.

## 2. Install the resource pack

Download the release ZIP and open its `hmp-foundation` directory. Copy every directory inside its
`resources` directory into `<server-root>/resources`.

The result must look like this:

```text
<server-root>/
├── HogwartsMPServer.exe
├── data/
└── resources/
    ├── hmp-mysql/
    │   ├── package.json
    │   └── dist/
    ├── hmp-core/
    │   ├── package.json
    │   └── dist/
    ├── ...
    └── hmp-admin/
        ├── package.json
        └── dist/
```

Do not leave an extra nesting level such as
`<server-root>/resources/hmp-foundation/resources/hmp-core`. There should be exactly twenty-two
top-level `hmp-*` directories.

If this server previously used the demonstration resources from the main mod repository, remove or
disable the overlapping resources listed under [Existing-resource overlap](#existing-resource-overlap).
Loading both stacks causes duplicate commands, selectors, input handlers, UI, and conflicting state.

## 3. Install the configuration

Copy the contents of the release's `examples/config/data` directory into `<server-root>/data`.

At minimum:

1. Configure `data/hmp-mysql.json`, or inject the equivalent `HMP_MYSQL_*` environment variables.
   Replace every `CHANGE_ME` value. See [DATABASE.md](DATABASE.md#configure-foundation).
2. Review `data/hmp-spawn.json` and verify its area and coordinates for the supported game build.
3. Review `data/hmp-characters.json`, especially whether character deletion should be enabled.
4. Review `data/hmp-admin.json` and decide which admin-group grades receive each capability.
5. Keep `data/hmp-pvp.json` deny-by-default and lethal mode disabled unless the server deliberately
   wants open-world lethal PvP.

The examples are safe starting points, not a complete gameplay configuration. Server-specific shops,
jobs, banks, interactions, activities, and other gameplay registrations belong in separate resources
that consume Foundation APIs.

### Environment variables and secrets

Environment variables must be present in the process that launches the server. Foundation does not
automatically read `environment.example` or `.env` files.

For closed testing before verified MafiaHub identities are available, set a unique admin bootstrap
secret of at least 16 bytes:

```text
HMP_ADMIN_BOOTSTRAP_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
HMP_ADMIN_REQUIRE_VERIFIED=true
HMP_ADMIN_UNSAFE_ASSERTED_BANS=false
```

This secret grants session-only access through the masked `/admin` prompt. Do not put it in chat,
commit it, or use it as a permanent staff identity system.

## 4. Start the server

Launch the server with `<server-root>` as its working directory. Relative paths such as
`data/hmp-mysql.json` are resolved from that directory, not from the executable's original location
or the Foundation repository.

For a direct Windows launch:

```powershell
Set-Location C:\HogwartsMPServer
$env:HMP_ADMIN_BOOTSTRAP_SECRET = "REPLACE_WITH_A_LONG_RANDOM_SECRET"
.\HogwartsMPServer.exe
```

If using a shortcut, set its **Start in** field to `<server-root>`. If using a service or process
manager, configure its working directory and environment there. Ensure MySQL/MariaDB is already ready
before starting HogwartsMP.

The current HogwartsMP loader discovers resources automatically. Manifests and dependencies establish
the supported order:

1. `hmp-mysql`
2. `hmp-lib`
3. `hmp-audio`
4. `hmp-ui`
5. `hmp-core`
6. `hmp-pvp`
7. `hmp-houses`
8. `hmp-characters`
9. `hmp-spawn`
10. `hmp-inventory`
11. `hmp-blips`
12. `hmp-banking`
13. `hmp-interact`
14. `hmp-activities`
15. `hmp-doors`
16. `hmp-emotes`
17. `hmp-shops`
18. `hmp-progression`
19. `hmp-spells`
20. `hmp-duels`
21. `hmp-jobs`
22. `hmp-admin`

If a server wrapper has a manual resource allowlist, include all twenty-two names and preserve this
order. `hmp-banking` and `hmp-interact` are independent peers at the same priority; their relative
order is not significant.

On first boot, wait for migrations to finish. Healthy logs include the MySQL connection followed by
ready messages from database-backed resources, for example:

```text
[hmp-mysql] connected to 127.0.0.1:3306/hogwartsmp
[hmp-core] Accounts, characters, groups and metadata are ready
[hmp-progression] Character progression, replay-safe rewards, and managed talents ready
```

Do not admit players if any Foundation resource logs `Startup failed`.

## 5. First-player checks

Use a disposable test account first:

- connect, create a character with `/characters`, select it, and reach the configured spawn;
- reconnect and confirm the same character is available;
- open `/inventory` and confirm native and configured custom items appear;
- run `/progression status` after selecting the character;
- open `/admin` as a normal player and confirm access is denied or the bootstrap prompt appears;
- enter the bootstrap secret only through the masked admin prompt and confirm the intended staff tools;
- confirm there is only one character selector, inventory UI, interaction prompt, and emote handler.

Use [CLOSED_TESTING.md](CLOSED_TESTING.md) for the full functional test pass.

## Existing-resource overlap

| Existing resource | Guidance |
|---|---|
| `charselect` | Do not load with `hmp-characters`; both own character selection and creation. |
| `interactables` | Do not load with `hmp-interact`; both can own the F interaction flow. |
| `rp-core`, `rp-inventory`, `rp-ui`, other `rp-*` | Treat as a separate RP stack. Do not combine persistence or authority models without an explicit bridge. |
| `roles` | Its roles are separate from `hmp-core` groups and do not grant Foundation admin capabilities. |
| `house`, `housepoints` | Do not load with `hmp-houses`; Foundation owns house membership and House Cup history. |
| `items` | Debug/native inventory commands may coexist, but are not recommended on a public server. |
| `audio`, `blips`, `doors`, `emotes`, `spells` | Do not load beside the matching `hmp-*` resource; both would own the same client system. |
| `progression`, `spellupgrades` | Do not load with `hmp-progression`; Foundation owns durable XP, talent points, and managed talents. |
| `duels`, `pvp` | Do not load with `hmp-duels`/`hmp-pvp`; port gamemode policy into the Foundation APIs. |
| `blips-dev`, `spellupgrades`, other probes | Keep diagnostic probes out of production. |
| `gamemode` | May remain only when its non-overlapping chat/environment features are intentionally wanted. |

## Troubleshooting

| Log or symptom | What it usually means | What to check |
|---|---|---|
| `hmp-mysql is not configured` | No enabled JSON file or environment connection settings were found. | Confirm `<server-root>/data/hmp-mysql.json` exists and that the process working directory is `<server-root>`. |
| `ECONNREFUSED` or connection timeout | Nothing is reachable at the configured host/port. | Start MySQL, check port/firewall, and remember that `127.0.0.1` inside a container means that container. |
| `Access denied for user` | Password or MySQL user-host pairing is wrong. | Test with the MySQL CLI from the game-server machine and inspect `SHOW GRANTS`. |
| `Unknown database` | The database itself was never created or its name differs. | Create the empty database and make `HMP_MYSQL_DATABASE`/JSON match exactly. |
| `Failed to open the referenced table 'hmp_characters'` | A dependent resource started without a completed `hmp-core` schema, often because packs were mixed or ordering was overridden. | Stop the server, install one complete release, restore manifest ordering, and inspect the `hmp-core` startup error first. |
| `Cannot add foreign key constraint` | Existing tables have an incompatible schema/engine, or resources are from different versions. | For a new install, use an empty database. Otherwise inspect migration history and restore the matching backup rather than editing constraints blindly. |
| `migration ... was modified after it was applied` | Code and recorded migration checksums do not match. | Install the exact pack version that owns the database; never edit `hmp_schema_migrations` to silence it. |
| Commands print `No character is active` | The player has not selected a Foundation character. | Run `/characters`, select or create a character, then retry. |
| Duplicate UI, commands, or input behavior | Legacy/mod demonstration resources are loaded with Foundation. | Make `<server-root>/resources` Foundation-only or use an explicit allowlist. |
| Configuration changes have no effect | The wrong data directory is being read or the server was not restarted. | Confirm the process working directory, file name, JSON validity, environment overrides, and restart server/client resources. |

If startup still fails, capture the first Foundation error—not only later dependency failures—plus the
sanitized MySQL target, pack version, database version, and relevant rows from `hmp_schema_migrations`.
Never post passwords, connection URLs, bootstrap secrets, player IPs, or identity tokens.

## Upgrade and rollback

1. Stop the server and prevent player connections.
2. Back up the Foundation database and `<server-root>/data/hmp-*.json`.
3. Read [CHANGELOG.md](CHANGELOG.md) and compare the new `examples/config` files with local settings.
4. Replace all twenty-two `hmp-*` directories together; do not merge old and new `dist` directories.
5. Start the server and let every migration and resource reach ready state before admitting players.
6. Restart clients after changing client-bearing resources.

Migrations are forward-only. A code rollback does not undo schema changes; restore the corresponding
database backup when a release requires a database rollback.

## Building from source

Server operators should prefer a release ZIP. Contributors building the pack from source need Node.js
22 or newer and npm:

```sh
npm ci
npm run verify
```

The ready-to-install output is written to `build/hmp-foundation`. Install that generated directory
using the same steps above. A source checkout's `resources` directory contains authoring files and is
not the supported deployment artifact.
