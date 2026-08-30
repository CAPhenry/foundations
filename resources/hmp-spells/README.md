# hmp-spells

`hmp-spells` is Foundations's character-scoped spell entitlement and loadout layer. Server rules decide
which native Hogwarts Legacy spell locks remain unlocked; direct grants and managed bonus loadouts persist
on the active `hmp-core` character.

The resource does not reimplement casting. Its client forwards complete policies to the mod's native
`Spells.setPolicy` enforcer, which survives streamed level changes and suppresses bulk unlock banners.

## Rules

Rules use the same lower-number-is-stronger policy model as `hmp-doors`. A deny wins an equal-priority
tie. No matching allow means the spell remains locked.

```json
{
  "id": "auror-kit",
  "resource": "hmp-ministry",
  "priority": 500,
  "action": "allow",
  "spells": ["Stupefy", "Expelliarmus", "Protego"],
  "bonusLoadouts": 2,
  "match": {
    "groups": [{ "key": "job:auror", "minimumGrade": 2 }]
  }
}
```

`spells` accepts friendly catalog names, raw `Spell_*` lock IDs, or `"*"`. `bonusLoadouts` is valid on
allow rules and grants 0-3 additional spell diamonds. If neither a matching rule nor a personal override
manages loadouts, naturally earned native loadout perks are untouched.

Other resources can register owner-scoped rules at runtime:

```ts
const Spells = Imports.get("hmp-spells");
const unregister = Spells.rules.register({
    id: "dueling-club",
    resource: "hmp-dueling",
    priority: 700,
    action: "allow",
    spells: ["Levioso", "Accio", "Expelliarmus"],
    match: { groups: [{ key: "club:dueling" }] },
});
```

Runtime rules are removed when their owning resource stops. Call the returned function to unregister one
earlier.

## Character grants and loadouts

```ts
await Spells.grants.grant(player, "Incendio", {
    resource: "hmp-quests",
    actor: player,
    reason: "Completed the Incendio lesson",
});

await Spells.grants.revoke(player, "Incendio", { resource: "hmp-admin" });
await Spells.loadouts.set(player, 2, { resource: "hmp-progression" });
await Spells.loadouts.unmanage(player, { resource: "hmp-progression" });
```

Spell grants and loadout ownership are stored together under the active character's
`hmp-spells:entitlements` metadata key. They never leak between character slots.

Native spell locks are currently additive within a live game session. A revoked spell disappears from
Foundations policy immediately but may remain castable until reconnecting or travelling into a state that
rebuilds the game's lock manager. Managed bonus-loadout changes apply immediately. `unmanage` stops
Foundations from touching the native perks; it does not remove loadouts already granted to the save.

## Catalog and policy APIs

- `catalog.resolve/get/list` normalize names and raw lock IDs.
- `policy.resolve/sync/syncAll` inspect or push complete policies.
- `rules.register/unregister/clear/list/refresh` manage runtime rules.
- `grants.list/grant/revoke/clear` manage persistent character grants.
- `loadouts.get/set/unmanage` manage the 0-3 bonus diamonds.
- `status()` reports catalog, rule, synchronization, and lifecycle state.

The client resource also exposes `loadout`, `setLoadoutSlot`, and `cast` as thin wrappers around the
native production APIs for scripts running on the client.

## Advisory spell-cast event

Native local casts are forwarded to the server and re-emitted as `hmp:spells:cast`. The payload includes
the player, active character, native asset path, friendly name, resolved lock ID, current entitlement
verdict, and `advisory: true`.

This event is client-reported and therefore forgeable. It is rate-limited for operational safety, but it
must not authorize damage, currency, quest rewards, anti-cheat action, or other consequential state.

## Closed-testing command

Safe inspection is public:

```text
/spells status
/spells list [search]
/spells loadout
```

Members of a configured `adminGroups` entry may use:

```text
/spells grant <me|nick|#id> <SpellName>
/spells revoke <me|nick|#id> <SpellName>
/spells grants <me|nick|#id>
/spells clear <me|nick|#id>
/spells loadouts <me|nick|#id> <0-3>
/spells unmanage-loadouts <me|nick|#id>
/spells reload
```

Set `enableCommands` to false outside testing when scripts provide the management surface.
