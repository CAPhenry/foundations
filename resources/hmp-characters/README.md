# hmp-characters

`hmp-characters` is the creation and selection experience for `hmp-core`. It presents a focused
character-card UI when a player's world and account session are both ready, opens Hogwarts Legacy's
native character creator, and persists the resulting appearance against the selected character.

The bundled renderer uses the same portrait-card presentation as HogwartsMP's original wardrobe
selector. Cards appear immediately, then their saved appearances are rendered locally and filled in
one at a time. Portraits are cached by appearance for the client session; a missing or failed capture
falls back to character initials instead of blocking selection.

## Responsibilities

- `hmp-core` owns character IDs, slots, account ownership and lifecycle.
- `hmp-characters` owns the selection UI and the `appearance`/`transmog` character metadata keys.
- Future inventory, housing, progression and location resources own their own character-keyed data.

There is no second character database and no nickname-as-identity fallback.

## Join flow

1. The server waits for `hmp:session:ready`, client UI readiness and `worldReady`.
2. Existing characters are sent as small card records. A new account enters creation automatically.
   Appearance blobs follow as one bounded message per character so the selector never waits for every
   portrait before becoming usable.
3. Selection calls `hmp-core.characters.select` and remembers the last character on the account.
4. During `hmp:character:loading`, the stored appearance is applied and its native reload acknowledgement is awaited before transmog is restored and the core emits `loaded`.

After creator confirmation, the server records the current appearance revision and waits for a newer
`playerAppearanceChanged` publication. That publication is emitted only after the game's native
normalization has settled, so character cards receive the same complete look used by live players.

Portrait cards call the Framework-provided client `Portrait` API directly. They do not require or
load the mod repository's standalone `portrait` resource. The supported HogwartsMP client supplies
the off-screen avatar asset used by that API; unsupported clients degrade to initials.

Use `/characters` to reopen the selector after joining. Other resources can use the server export:

```js
const Characters = Imports.get("hmp-characters");
await Characters.ui.open(player, { mode: "wardrobe" });
```

## Switch policy

Before switching away from an active character, the resource emits `hmp:character:may-switch` with:

```js
{ player, from, to, allow: true, reason: "" }
```

A custody, combat or other policy resource may set `allow = false` and provide a player-facing
`reason`. Initial selection is not treated as a switch.

After a successful selection it emits `hmp:character:selected` with `{ session, character }`.

## Configuration

Optional `data/hmp-characters.json`:

```json
{
  "autoOpenOnJoin": true,
  "allowDelete": true,
  "allowCloseWithActiveCharacter": true,
  "command": "characters",
  "appearanceTimeoutMs": 6000,
  "title": "Choose Your Wizard",
  "subtitle": "Every story begins with a name."
}
```

Environment overrides are available through `HMP_CHARACTERS_CONFIG`,
`HMP_CHARACTERS_AUTO_OPEN`, `HMP_CHARACTERS_ALLOW_DELETE` and `HMP_CHARACTERS_COMMAND`.
