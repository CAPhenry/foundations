# hmp-banking

`hmp-banking` is Foundations's server-authoritative account and money-ledger layer. It provides one
personal account per character and currency, registered organization accounts, atomic internal
transfers, native-cash deposits and withdrawals, idempotent references, recent activity, and a
server-driven banking menu.

Foundations calls the player-facing currency **Galleons**. Hogwarts Legacy stores that scalar
internally in an inventory item named `Knuts`; `hmp-inventory` bridges it through the canonical name
`native:galleons`, with `native:knuts` retained as a compatibility alias. Physical Galleons remain in
the character inventory until deposited. Bank balances are separate MySQL state; this distinction
makes theft, cash-only vendors, account payments and later payroll possible without pretending
carried money and banked money are the same thing.

## Personal accounts

The first request creates the active character's Galleons account. Later requests return the same
account with its current balance:

```ts
const Banking = Imports.get("hmp-banking");

const account = await Banking.accounts.personal(player);
console.log(account.number, account.balance); // HMP-00000001, 0

await Banking.ui.open(player);
```

Public account numbers are stable `HMP-...` identifiers. `accounts.byNumber(number)` resolves them;
the UI resolves the recipient and currency on the server and never accepts a client-supplied balance.

## Trusted ledger operations

Server resources can credit, debit, or transfer funds. Every call records its owning resource and can
provide a stable idempotency key:

```ts
await Banking.transactions.credit(account, 50, {
    resource: "hmp-quests",
    reference: `quest-reward:${questId}:${characterId}`,
    actor: player,
    memo: "Quest reward",
    metadata: { questId },
});

await Banking.transactions.transfer(source, destination, 15, {
    resource: "hmp-jobs",
    reference: `payroll:${runId}:${characterId}`,
    memo: "Auror salary",
});
```

A completed reference can be replayed only with the exact same operation and returns the original
transaction without moving money again. Reusing it with a different amount, account, type, actor,
currency, or resource is rejected.

These transaction methods are privileged server APIs and intentionally do not perform player access
checks. Player-facing code should use `accounts.can(...)`, the bundled UI, or its own equivalent
authorization before calling them.

## Physical Galleons

Deposits remove native Galleons from the active character and credit the selected account. Withdrawals
debit the account and grant native Galleons:

```ts
await Banking.cash.deposit(player, account, 25, { reference: "bank-counter:deposit:123" });
await Banking.cash.withdraw(player, account, 10, { reference: "bank-counter:withdraw:124" });
```

Only currencies with a registered `cashItem` can use this bridge. The built-in currency definition is:

```ts
{
    id: "galleons",
    resource: "hmp-banking",
    label: "Galleons",
    symbol: "Ⓖ",
    cashItem: "native:galleons",
}
```

## Organization accounts

Jobs, businesses, schools and government resources can register persistent organization accounts.
Rules use character/account groups from `hmp-core`; matching any rule that includes the requested
permission grants its base access. `manage` implies every permission.

```ts
const unregister = Banking.organizations.register({
    id: "ministry",
    resource: "hmp-jobs",
    label: "Ministry of Magic",
    currency: "galleons",
    rules: [
        {
            group: "job:auror",
            minimumGrade: 2,
            permissions: ["view", "deposit", "withdraw", "transfer"],
        },
        {
            group: "job:ministry",
            minimumGrade: 5,
            permissions: ["manage"],
        },
    ],
    allow: async ({ player, permission }) => {
        // Optional additional server-side policy.
        return permission !== "withdraw" || !isAccountFrozenForReview(player);
    },
});

const ministry = await Banking.accounts.organization("ministry");
```

Unregistering removes the runtime definition and access policy, not its balance or audit history.
Registering it again reconnects the same persistent account. Definitions are automatically removed
when their owning resource stops.

## Using bank balances in hmp-shops

The provider factory returns an object structurally compatible with `hmp-shops`:

```ts
const Shops = Imports.get("hmp-shops");

const unregisterCurrency = Shops.currencies.register(Banking.providers.shops({
    id: "bank-galleons",
    resource: "hmp-economy",
    currency: "galleons",
    label: "Banked Galleons",
}));
```

A shop can then declare `currency: "bank-galleons"`. Purchase debits and sale credits inherit the
shop transaction's reference, so compensation and replay remain auditable without duplicate moves.

## Custom ledger currencies

Currencies without a native cash item can still back accounts, transfers, payroll and shop providers:

```ts
Banking.currencies.register({
    id: "galleons",
    resource: "hmp-economy",
    label: "Galleons",
    symbol: "ⓖ",
});
```

Register currencies before organizations or personal accounts that reference them. Currency
definitions are presentation and exchange metadata; balances and ledger rows remain in MySQL.

## Consistency and recovery

Credits, debits and account-to-account transfers lock the affected accounts in a stable order and
commit their balance changes with the ledger inside one MySQL transaction.

Native inventory cannot join that database transaction. Cash exchange therefore uses a pending
ledger row and compensates failures. A crash at the exact boundary between the game inventory and
MySQL can leave a pending row for an administrator to reconcile. The row records whether its account
movement was applied, making that state observable instead of hiding it.

Character switching is refused while a player-bound banking movement or native-cash exchange is
active. An idle banking menu closes cleanly when the character changes, preventing one character's
account context from leaking into the next session.

Trusted administration code can inspect and explicitly resolve that evidence:

```ts
const pending = await Banking.transactions.pending(50);
await Banking.transactions.reconcile(reference, "complete");
await Banking.transactions.reconcile(reference, "compensate", "Cash was not delivered");
await Banking.transactions.reconcile(reference, "fail", "Cash never left the character");
```

`complete` applies a not-yet-applied movement or finalizes an applied one. `compensate` reverses an
applied movement. `fail` is accepted only before an account movement was applied; these decisions
are deliberately explicit because the server cannot infer what happened to native inventory during
a process crash.

## Events

- `hmp:banking:transaction` after any completed trusted ledger operation;
- `hmp:banking:deposited` after a completed native-cash deposit;
- `hmp:banking:withdrawn` after a completed native-cash withdrawal;
- `hmp:banking:transferred` after a transfer completed through the bundled UI.
- `hmp:banking:reconciled` after an operator resolves a pending transaction.

## Exports

- `accounts`
- `organizations`
- `currencies`
- `transactions`
- `cash`
- `providers`
- `ui`
- `status`
