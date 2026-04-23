# Wallet Core Phased Extraction Roadmap

See also: `docs/wallet-library-extraction-plan.md` for the higher-level extraction boundary, repo strategy, and packaging guidance.

## Goal

Extract the reusable multi-provider wallet connection core from `liberdus-bsc-bridge-ui` in small, testable steps.

This roadmap is intentionally phased so the bridge app can keep working while the wallet core is gradually reshaped into a library.

## Current Repo Consumption Model

The bridge app is not currently consuming browser code as runtime packages.

Current reality:

- browser ESM files live under `js/`
- `index.html` loads `./js/bootstrap.js` as a module
- `ethers` is loaded from `./libs/ethers.umd.min.js`
- `package.json` is only being used for dev/test tooling

So this roadmap should not start from an npm-package mental model.

## Core Decision Summary

The shared library should be for wallet connection and wallet session state only.

It should include:

- injected wallet discovery
- multi-provider wallet selection
- connect
- silent restore
- disconnect
- active wallet/account state
- current wallet chain ID
- wallet event subscription
- access to the active EIP-1193 provider

It should not include:

- picker modal UI
- connected-wallet popup UI
- bridge-specific network policy
- bridge-specific contract wiring
- bridge-specific toast copy
- bridge-specific DOM wiring
- app decisions about when to switch networks

## Important Clarification: Chain ID vs Network Policy

The library should know the wallet's current chain ID.

That is normal and expected for a wallet/session library.

The library should therefore handle:

- reading `eth_chainId`
- storing `chainId` in wallet state
- updating state when `chainChanged` fires
- exposing `getChainId()` or equivalent

The library should not own network policy.

That means the library should not decide:

- which chain is required
- whether mismatch is acceptable
- whether mismatch counts as disconnected
- when `wallet_switchEthereumChain` should be called
- whether switching happens on connect, on selection, or only on write-time

That policy belongs in the dapp.

## Current Bridge Layout

```text
js/wallet/metamask-connector.js
  discovery
  provider normalization
  multi-provider selection
  provider event binding

js/wallet/wallet-manager.js
  connected session state
  restore from storage
  disconnect behavior
  wallet DOM events

js/wallet/network-manager.js
  bridge-specific source-chain policy
  tx gating
  switch/add-network flow

js/components/header.js
  bridge-specific connect button + wallet picker

js/wallet/wallet-popup.js
  bridge-specific connected-wallet popup
```

## Extraction Boundary

### Shared wallet-core candidate

- `js/wallet/metamask-connector.js`
- `js/wallet/wallet-manager.js`

### Must remain app-local

- `js/wallet/network-manager.js`
- `js/components/header.js`
- `js/wallet/wallet-popup.js`
- contract manager integration
- bridge-specific `document` event consumers

## Recommended Public Shape For The Future Library

Example shape only:

```js
const walletCore = createWalletCore({
  storage,
  storageKeys,
});

walletCore.load();
await walletCore.restore();
walletCore.getAvailableWallets();
await walletCore.connect({ walletId });
await walletCore.disconnect();
walletCore.getState();
walletCore.getChainId();
walletCore.getEip1193Provider();
walletCore.subscribe((event, data) => {});
```

If a consumer wants ethers-specific helpers, that should happen through a separate adapter in the same shared repo, for example:

```js
import { createWalletCore } from '@liberdus/wallet-core/core';
import { createEthers5Adapter } from '@liberdus/wallet-core/adapters/ethers5';

const walletCore = createWalletCore({ storage, storageKeys });
const walletClient = createEthers5Adapter({ walletCore, ethers: window.ethers });
```

## Locked Decision For Question 3

The minimum shared `wallet-core` API should expose wallet/session state and raw EIP-1193 access, not ethers-specific provider or signer objects as part of the core contract.

That means the shared core should own:

- wallet discovery
- available wallet listing
- wallet lookup by id
- explicit connect by wallet id
- silent restore
- disconnect
- current session state
- current `chainId`
- active EIP-1193 provider access
- neutral wallet lifecycle events

The shared core should not own:

- ethers `getProvider()`
- ethers `getSigner()`
- DOM `CustomEvent` dispatch as the primary interface
- network switching policy
- UI concerns
- app-specific storage naming

### Why this is the preferred boundary

EIP-1193 is the shared wallet boundary. Ethers is an app/client-library choice layered on top of that boundary.

Keeping ethers out of the core:

- avoids forcing one client library on every consumer
- avoids version lock-in across repos
- keeps the core smaller and easier to test
- avoids bridge-specific runtime assumptions such as direct `window.ethers` dependency
- still allows bridge and WhaleSwap to expose ethers-shaped helpers through adapters

### Practical implication for bridge

Bridge may continue exposing `getProvider()` and `getSigner()` during migration, but those should be implemented by a bridge adapter or facade on top of the neutral core rather than by the core itself.

## When Separation Actually Starts

It is useful to distinguish between different kinds of separation.

Conceptual separation starts in Phase 2:

- discovery/provider-selection responsibilities are separated from connected session responsibilities

Architectural separation becomes real in Phase 3:

- the core stops depending directly on bridge-specific assumptions such as `window.ethers`, bridge-specific storage keys, and DOM events

Physical separation inside `bsc-bridge-ui` starts in Phase 5:

- the neutral core moves into `js/lib/wallet-core/`
- bridge imports that internal core through a clearer boundary

External separation into a new shared repo starts in Phase 8:

- only after bridge is already consuming the internal core successfully

Bridge consuming the new shared repo through local served files happens in Phase 8.5:

- the shared repo is vendored, synced, or pulled into a served folder
- bridge imports it through local paths or an import-map alias

Short version:

- Phase 2: conceptual separation
- Phase 3: real architectural separation
- Phase 5: internal file/folder separation
- Phase 8: separate repo

## Recommended Starting Point

If implementation starts now, the safest starting order is:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3

Practical interpretation:

- start with Phase 0 if you want to confirm baseline behavior and test coverage first
- start with Phase 1 only if you already trust the current wallet test coverage enough to begin with a no-behavior-change cleanup pass

So:

- safest start: Phase 0
- simplest start if baseline coverage already feels sufficient: Phase 1

## Locked Decision For Early Phases

The early bridge phases should preserve the current bridge-facing wallet API and behavior.

That means the internal refactor phases should reorganize the wallet code without changing the contract the rest of the bridge app already depends on.

The goal is to keep these concerns separate:

- internal extraction work
- public API or user-visible behavior changes

## Locked Decision For Question 2

Use strict backward compatibility during Phases 0-4.

That means:

- keep the preserved bridge contract stable during the early internal refactor phases
- allow compatibility exports, adapters, and shims when they reduce migration risk
- do not treat temporary internal cleanup as permission to break bridge-facing behavior

Important distinction:

- temporary internal compatibility can be removed later when bridge no longer needs it
- consumer-facing compatibility should only be removed during an explicit migration phase after consumers are updated

## Preserved Bridge Contract For Phases 0-4

During Phases 0-4, preserve the following bridge-facing contract.

### Imperative manager API

Keep these methods and state semantics stable:

- `load()`
- `init()`
- `connect({ walletId, userInitiated })`
- `disconnect()`
- `isConnected()`
- `getAddress()`
- `getChainId()`
- `getProvider()`
- `getSigner()`
- `getLastSelectedWalletId()`
- `getAvailableWallets()`
- `getEip1193Provider()`
- `isConnecting` as a readable state flag

### DOM event contract

Keep these DOM events stable because multiple bridge components depend on them:

- `walletConnected`
- `walletDisconnected`
- `walletAccountChanged`
- `walletChainChanged`
- `walletProvidersChanged`

Keep the current event detail shape stable:

- `detail.event`
- `detail.data`

### Session and restore semantics

Keep these behaviors stable during the early phases:

- explicit wallet selection on connect
- silent restore on startup when a valid stored session can be resolved
- no silent restore after explicit user disconnect
- no ambiguous silent restore when multiple wallets are available
- fallback from stale last-selected wallet to stored session wallet or stored address matching
- retry restore when a wallet is announced after startup
- account changes update session state
- chain changes update session state
- disconnect clears active session state

### State shape conventions

Keep these conventions stable:

- `chainId` remains exposed as a number
- `getProvider()` continues returning the provider shape bridge code expects
- `getSigner()` continues returning the signer shape bridge code expects
- connected wallet data continues carrying `address`, `chainId`, `walletType`, `walletId`, and `walletName`

### Persistence compatibility

Treat the current storage-backed restore behavior as part of the early-phase compatibility contract.

That means:

- preserve current restore behavior during Phases 0-4
- preserve current storage key usage unless a later explicit phase changes it intentionally
- avoid changing restore semantics and storage semantics during naming or boundary-cleanup phases

### What is not part of the preserved contract

These details may change during the refactor:

- the internal `MetaMaskConnector` name
- the current connector/manager file split
- direct DOM event dispatch from inside the neutral core
- direct `window.ethers` usage inside the neutral core
- private method names and internal class structure

## Recommended Branching Model

For this phased extraction, stacked branches are a good fit.

Recommended pattern:

- create one branch per phase
- make each new phase branch on top of the previous phase branch
- keep each phase small and merge them in order

Example branch sequence:

- `wallet-core-phase-0-baseline`
- `wallet-core-phase-1-rename-connector`
- `wallet-core-phase-2-discovery-session-split`
- `wallet-core-phase-3-adapters`
- `wallet-core-phase-4-neutral-events`

That means:

- Phase 2 branches from Phase 1
- Phase 3 branches from Phase 2
- and so on

This works well because the phases are intentionally dependent on the previous phase's boundary cleanup.

## Important Workflow Note For Stacked Branches

Stacked branches are useful here, but only if they are kept small and landed in order.

Recommended workflow:

1. open a branch for the current phase
2. keep the phase narrowly scoped
3. test that phase in isolation
4. merge it
5. rebase the next phase branch onto updated `main` after the previous phase lands

Avoid letting a long branch stack drift for too long without merging, because that increases rebase and review overhead.

## Phase 0: Freeze Behavior

### Purpose

Lock the current bridge behavior before changing structure.

### Work

- review the current wallet tests
- identify gaps before structural edits
- document the bridge-facing API, event, and persistence contract that Phases 0-4 must preserve
- keep the bridge behavior unchanged

### Tests to rely on

- `tests/metamaskConnector.multiWallet.test.js`
- `tests/walletManager.multiProvider.test.js`
- `tests/header.walletPicker.test.js`

### Exit criteria

- current behavior is understood
- test suite protects the multi-provider flow
- the preserved bridge contract for Phases 0-4 is documented
- no structural changes yet

## Phase 1: Rename And Clarify Internals

### Purpose

Make names match actual responsibilities.

### Work

- rename `MetaMaskConnector` internally toward `InjectedWalletConnector`
- keep a compatibility export if needed during the transition
- update comments so the file no longer looks MetaMask-specific
- do not change the preserved bridge-facing contract during this phase

### Why this phase matters

The connector already supports multiple injected wallets. The old name creates the wrong mental model for future extraction.

### Exit criteria

- naming reflects generic injected-wallet behavior
- no functional changes
- tests still pass

## Phase 2: Separate Discovery From Session

### Purpose

Split provider discovery/selection from connected session management.

### Work

- keep discovery in the connector layer
- keep connected state, restore, disconnect, and session metadata in the manager layer
- reduce responsibility overlap between the two

### The target split

Connector owns:

- discovered wallets
- wallet lookup by id
- selected provider connection
- raw provider listeners

Session layer owns:

- address
- chain ID
- provider wrapper
- signer
- persisted restore metadata
- connection lifecycle
- high-level wallet events

### Exit criteria

- each layer has a clear responsibility
- no UI code depends on connector internals directly
- tests still pass

## Phase 3: Introduce Adapters Inside Bridge

### Purpose

Remove app-specific assumptions from the future shared core without changing user behavior.

### Work

- inject or layer `createWeb3Provider(eip1193Provider)` through an adapter instead of using `window.ethers` directly in the neutral core
- inject storage access or storage keys instead of hardcoding bridge-specific keys in the neutral core
- define an internal event emitter interface instead of making the core depend on `document.dispatchEvent`
- keep any ethers-specific wrapping outside the neutral core boundary

### Why this phase matters

This is where the code stops being bridge-only and starts becoming extractable.

### Exit criteria

- the core can be instantiated with adapters
- bridge behavior remains unchanged through bridge-specific adapters
- no direct `window.ethers` dependency remains in the neutral core path

## Phase 4: Neutral Event Model With Bridge DOM Adapter

### Purpose

Keep the library generic while preserving the bridge app's current event flow.

### Work

- replace direct DOM event dispatch in the core with a neutral subscribe/unsubscribe or emitter model
- add a bridge adapter that translates core events into the current DOM `CustomEvent` names

### Example split

Core emits:

- `connected`
- `disconnected`
- `accountChanged`
- `chainChanged`
- `providersChanged`

Bridge adapter dispatches:

- `walletConnected`
- `walletDisconnected`
- `walletAccountChanged`
- `walletChainChanged`
- `walletProvidersChanged`

### Exit criteria

- bridge UI still receives the same DOM events
- the core is no longer tied to the DOM
- tests still pass

## Phase 5: Extract Neutral Core To An Internal Folder

### Purpose

Practice extraction without the extra complexity of a separate repository or package-based runtime consumption.

### Work

- move the neutral wallet core into an internal library-like folder inside `bsc-bridge-ui`
- keep bridge adapters local to the bridge app
- begin drafting consumer-facing documentation for the eventual shared repo while the internal API is still being proven
- remove temporary internal compatibility shims only when bridge no longer depends on them and tests still pass

### Suggested shape

```text
js/lib/wallet-core/
  core/
    injected-wallet-connector.js
    wallet-session.js
    index.js
  adapters/
    bridge-ethers.js
```

### Why this phase matters

It proves the import boundaries before creating a cross-repo maintenance burden.

### Exit criteria

- bridge imports the internal wallet core instead of the old direct files
- tests still pass
- extraction feels mostly like import-path updates, not logic surgery
- any removed compatibility in this phase is limited to dead internal refactor shims, not bridge-facing behavior

## Phase 6: Make Bridge Consume The Internal Core

### Purpose

Verify that bridge can run unchanged on top of the extracted boundary.

### Work

- wire bridge `header.js`, `wallet-popup.js`, and `network-manager.js` to the new internal core interface
- keep the user-visible behavior unchanged
- keep bridge-specific ethers wrapping in a bridge adapter or facade instead of moving it into the neutral core

### Important note

This is still not the moment to move network policy into the core.

`network-manager.js` should remain bridge-specific because it answers app-policy questions like:

- what chain is required
- when tx actions are enabled
- when network switching should happen

### Exit criteria

- bridge runs on the internal core
- wallet picker still works
- restore still works
- disconnect still works
- bridge network switching still lives in bridge code

## Phase 7: Optional Shared Low-Level Chain Helper

### Purpose

Decide whether any tiny chain helper is worth sharing separately.

### Candidate shared utility

Only low-level helpers, if both apps truly need them:

- `switchToChain(provider, chainConfig)`
- `addChain(provider, chainConfig)`
- chain ID normalization helpers

### Important limit

Even if these helpers are shared, policy still belongs in the dapp.

The helper should not decide:

- whether to switch
- when to switch
- whether mismatch is acceptable

### Exit criteria

- optional only
- separate from the main wallet-core responsibility

## Phase 8: Create A Separate Repository Only After The API Stabilizes

### Purpose

Avoid premature package design.

### Work

- create a dedicated repository only after bridge successfully consumes the internal core
- move the proven internal folder into the new repo
- keep adapters and app-specific wiring in each consumer app
- do not require bridge to consume the new repo as an npm package
- add a consumer guide so other repos know how to use the new repo

### Suggested repo shape

```text
liberdus-wallet-core/
  README.md
  src/
    core/
      injected-wallet-connector.js
      wallet-session.js
      index.js
    adapters/
      storage.js
  tests/
    injected-wallet-connector.test.js
    wallet-session.test.js
```

Optional development files such as `package.json` can exist in the library repo for its own tooling, but bridge should not rely on package-style runtime consumption.

Recommended consumer docs in the shared repo:

- responsibilities of the wallet-core
- non-goals and what must remain app-local
- required adapters/integration inputs
- how `core/` and `adapters/` are separated inside the same repo
- example initialization
- example connect / restore / disconnect flow
- event model and `chainId` handling
- guidance for app-level network policy

### Exit criteria

- library API already proven in bridge
- repo creation is mostly packaging and publishing work
- the shared repo includes enough usage documentation for another repo to integrate it without reading bridge implementation details

## Phase 8.5: Bring The New Repo Back Into Bridge As Served Files

### Purpose

Use the new repo in bridge in a way that matches the current app architecture.

### Work

- vendor or sync the shared repo into a served folder such as `vendor/liberdus-wallet-core/`
- or pull it in as a submodule/subtree under a served directory
- optionally add an import map alias for cleaner imports
- update bridge imports to target the vendored local path or import-map alias

### Example direction

```html
<script type="importmap">
{
  "imports": {
    "@liberdus/wallet-core": "./vendor/liberdus-wallet-core/index.js"
  }
}
</script>
```

```js
import { createWalletCore } from '@liberdus/wallet-core';
```

### Exit criteria

- bridge is consuming the new repo through local served files
- no npm-style runtime dependency is required
- bridge behavior is unchanged

## Phase 9: Port WhaleSwap Only After Wallet/Network Decoupling Work

### Purpose

Avoid forcing WhaleSwap onto a shared core before its own wallet/network model is ready.

### Recommended sequencing for WhaleSwap

WhaleSwap should first land its wallet/network behavior changes:

- `#147`
- `#153`
- `#154`
- umbrella `#152`

Then do a light internal organization pass.

Then adopt the shared wallet core.

### Why this matters

If WhaleSwap consumes the library too early, the shared API may end up shaped around WhaleSwap's pre-decoupling behavior instead of the cleaner target model.

## Phase 10: Migrate Consumers And Remove Remaining Legacy Compatibility

### Purpose

Remove backward-compatibility layers deliberately, only after the shared API is proven and consumer repos have migrated.

### Work

- identify any remaining temporary compatibility exports, aliases, wrappers, and legacy bridge adapters
- migrate bridge and any other consumer repo to the final supported wallet-core interface
- remove legacy compatibility paths only after those consumers no longer depend on them
- update consumer documentation to reflect the final supported interface instead of transitional paths

### Important distinction

By this phase, the goal is to remove:

- temporary rename aliases
- compatibility exports kept only for the refactor
- transitional wrappers that were preserving old internal shapes

This phase is not a license to remove stable library behavior accidentally. If a consumer-facing interface is still intended to be supported, it remains part of the final contract.

### Exit criteria

- no remaining temporary backward-compatibility shims are required
- consumer repos are using the intended final interface
- the shared repo documentation reflects the final supported integration path

## Browser Distribution Considerations

Both apps are browser-first ESM apps.

That means the final library should avoid assuming a bundler-only or package-only environment.

Practical options:

1. plain ESM files vendored into each app
2. submodule/subtree under a served app directory
3. import map alias pointing at a local served file path
4. built ESM artifact copied into each app

Do not make the first version depend on framework-specific tooling.

## Testing Strategy By Phase

### Structural phases

For phases 1 through 6:

- existing wallet discovery tests should continue to pass
- existing restore tests should continue to pass
- existing picker tests should continue to pass

### New tests worth adding during extraction

- adapter-based provider creation works with no `window.ethers`
- neutral event emitter emits the same logical lifecycle as current DOM events
- storage namespace can be configured
- `chainChanged` updates state correctly without requiring network policy in the core

### Post-extraction integration checks

Bridge:

- connect via selected wallet
- silent restore
- disconnect
- provider announcement after startup
- chain change updates wallet state

WhaleSwap later:

- connected state is independent from selected network
- wrong-network connected users remain connected
- write-time preflight still handles switching

## Acceptance Criteria For The Final Library

The final shared wallet-core should:

1. support multiple injected wallets
2. expose current wallet `chainId`
3. remain independent from app-specific network policy
4. work with either browser-global ethers or imported ethers through adapters
5. avoid direct DOM dependency
6. avoid bridge-specific storage naming
7. be usable by both bridge and WhaleSwap without forcing shared UI
8. allow optional client-library helpers in the same repo without making them part of the neutral core contract

## What Success Looks Like

At the end of this roadmap:

- `bsc-bridge-ui` keeps its current picker, popup, and network manager
- the extracted core only handles wallet connection/session state
- the core exposes `chainId`, but the dapp decides what to do with it
- network switching remains in app-level code
- extraction happens in small steps, each of which can be tested before the next one
- temporary backward-compatibility shims are removed only after explicit consumer migration

## Optional Future Plans

After the neutral `wallet-core` is stable and adopted, it may make sense to add separate optional client-library adapters.

Examples:

- `wallet-client-ethers5`
- `wallet-client-ethers6`
- `wallet-client-viem`

These are not part of the first extraction goal.

Their role would be to sit on top of `wallet-core` and provide client-library-specific conveniences such as:

- wrapping the active EIP-1193 provider
- exposing `getProvider()`
- exposing `getSigner()`
- handling library-specific rebinding behavior

Why keep this as a future optional step:

- the first extraction should stabilize the wallet/session boundary before adding another layer of shared abstraction
- current Liberdus repos are not standardized enough to make one client-library contract the core default
- bridge and WhaleSwap can still use app-local adapters first, then converge later if a shared client adapter proves worthwhile
