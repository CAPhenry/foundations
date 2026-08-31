# hmp-npcs

`hmp-npcs` is the Foundation-owned NPC boundary. It exposes the enemy identifiers verified against
the Framework catalog, validates spawn requests, tracks ownership by resource, and destroys a
resource's NPCs automatically when that resource stops.

## Configuration

Copy `examples/config/data/hmp-npcs.json` to `<server-root>/data/hmp-npcs.json` to override the
default limits. `maximumPerResource` may not exceed `maximumManagedNpcs`.

## Server API

```ts
const npcs = Imports.get("hmp-npcs");

const enemy = npcs.spawn({
  resource: "my-gamemode",
  enemyId: "Goblin_Grunt",
  position: { x: 100, y: 200, z: 300 },
  disposition: "hostile",
  ownerId: player.id,
  maxHealth: 250,
  scale: 1.1
});

npcs.catalog.list();
npcs.get(enemy.id);
npcs.destroy(enemy.id, "my-gamemode");
npcs.clear("my-gamemode");
```

Wave composition, encounter behavior, rewards, and boss rules belong to the consuming gamemode.
The catalog documents inert or encounter-dependent entries but does not hide them.
