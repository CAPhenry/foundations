# hmp-duels

`hmp-duels` is Foundation's consensual, non-lethal one-on-one wizard duel resource. A challenge is a
private `hmp-activities` invitation; accepting creates an exclusive two-player session scoped to the
same game area and virtual world. `hmp-pvp` then authorizes only that agreed pair while allowing other
PvP resources to own their own matches or zones.

The duel rule has higher priority than `hmp-pvp`'s open-world lethal fallback. Duel participants therefore
remain floored and kneel-finished even when staff enable lethal mode for everyone outside the pair. When a
duel ends, its client presentation restores the current `hmp-pvp` targeting/team snapshot rather than
blindly clearing a server-wide lethal relationship.

The client uses the native `Pvp` duel context, targetability gate, hostile relationship, opponent
meter, health-recovery control, and retail near-death kneel. Damage remains server-arbitrated. The KO
decision returns `minHp`, so the victim applies the floor against live health instead of trusting the
server's potentially stale vitals report.

Commands:

```text
/duel <playerId|exact nickname>
/duel accept
/duel decline
/duel cancel
/duel forfeit
/duel status
```

Challenge consent uses `hmp-ui`, whose bundled Arcanum renderer remains the default and whose external
renderer contract lets server owners replace the presentation. Input focus and control ownership are
therefore handled by `hmp-ui`/`hmp-lib`, not by duel-specific browser code.

The activity session owns exclusivity, invitation expiry, location compatibility, and disconnect
cleanup. This prevents one challenger from reserving several opponents or an old acceptance from
overwriting a newer duel pair.
