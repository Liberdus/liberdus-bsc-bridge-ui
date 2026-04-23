# Shared Wallet Library Plan

See also: `docs/wallet-reorg-library-plan/bridge-wallet-core-extraction-roadmap.md` for the detailed phase-by-phase implementation sequence inside this repo.

## Goal

Extract the reusable wallet core from `liberdus-bsc-bridge-ui` into a shareable library that can later be used by apps such as `WhaleSwap-UI`.

This document is about the extraction boundary and repo strategy, not about changing bridge functionality right now.

## Current Consumption Model

`liberdus-bsc-bridge-ui` is not currently using app-runtime packages for browser code.

What the repo is doing today:

- browser ESM app code under `js/`
- `index.html` loads `./js/bootstrap.js` as a module
- `ethers` is loaded from `./libs/ethers.umd.min.js`
- `package.json` is only being used for development tooling and tests

That means the first shared-library rollout should not assume npm-package consumption inside the bridge app.

## Current Bridge Shape

The bridge repo is already close to the right structure for extraction:

```text
js/wallet/metamask-connector.js
  discovery
  wallet normalization
  provider selection
  provider event binding

js/wallet/wallet-manager.js
  connected session state
  restore from storage
  disconnect behavior
  wallet events

js/wallet/network-manager.js
  bridge-specific network rules

js/components/header.js
  bridge-specific picker UI

js/wallet/wallet-popup.js
  bridge-specific connected-wallet popup

js/app.js
  composition/wiring
```

## What Is A Good Extraction Candidate

The best shared-library candidate is the wallet core only:

1. Discovery of injected wallets
2. Explicit wallet selection
3. Connect/disconnect
4. Silent restore
5. Connected wallet state
6. High-level wallet events

In current bridge terms, that mostly means:

- `js/wallet/metamask-connector.js`
- `js/wallet/wallet-manager.js`

## What Should Stay In The Bridge Repo

These pieces are app-specific and should not be moved into the first shared library:

- `js/components/header.js`
- `js/wallet/wallet-popup.js`
- `js/wallet/network-manager.js`
- bridge-specific contract wiring
- bridge-specific toasts/copy
- bridge-specific DOM event consumers

## Recommended Library Boundary

The first library should be UI-free and app-policy-light.

Recommended shared responsibilities:

- discover wallets
- return available wallets
- connect to a selected wallet
- restore a previous wallet session
- disconnect and clear state
- expose current state
- emit high-level wallet events

Recommended non-shared responsibilities:

- picker modal rendering
- connected-wallet popup rendering
- chain gating policy
- bridge contract behavior
- application-level DOM wiring

## Things To Move Around Before Extraction

The bridge repo is close, but a few cleanup steps would make extraction much cleaner.

## 1. Rename The Connector Internally

`MetaMaskConnector` is no longer MetaMask-specific in behavior. It is really an injected-wallet connector.

Recommended end state:

- file: `injected-wallet-connector.js`
- export: `InjectedWalletConnector`

This can be done with a compatibility alias first if desired.

## 2. Remove Direct `window.ethers` Dependence From The Shared Core

Right now the bridge wallet core builds `ethers.providers.Web3Provider` directly from `window.ethers`.

That is fine for the bridge app, but it makes sharing awkward because:

- bridge uses browser globals for ethers
- WhaleSwap imports `ethers` as a module

Recommended direction:

- keep the neutral core independent from ethers
- put `createWeb3Provider(eip1193Provider)` in an adapter layer
- let each app decide how that wrapper is created, while still allowing the adapter to live in the same shared repo

## 3. Remove Hardcoded Storage Keys From The Shared Core

The current manager stores to bridge-specific localStorage keys.

Recommended direction:

- pass storage keys as options
- or pass a storage adapter with namespaced keys

This avoids collisions and keeps app naming out of the shared package.

## 4. Replace DOM `CustomEvent` Dispatch In The Shared Core

The bridge manager currently dispatches document-level wallet events.

That works in the bridge app, but it should not be the library's native API.

Recommended direction:

- make the library expose subscribe/unsubscribe or an event emitter
- keep a bridge adapter that converts library events into DOM `CustomEvent`s

This also fits WhaleSwap better, since WhaleSwap already uses its own listener model.

## 5. Keep Network Policy Out Of The First Shared Package

`js/wallet/network-manager.js` is bridge-specific:

- source-chain oriented
- tied to `CONFIG.BRIDGE`
- tied to bridge UI gating behavior

That logic should stay in the bridge app, at least for the first extraction.

## Recommended Library Repo Shape

If a separate repo is created, keep it very small.

```text
liberdus-wallet-core/
  README.md
  src/
    core/
      injected-wallet-connector.js
      wallet-session.js
      index.js
    adapters/
      dom-events.js
      ethers5.js
      storage.js
  tests/
    injected-wallet-connector.test.js
    wallet-session.test.js
```

Optional development files such as `package.json` can exist in the library repo for tests/tooling, but bridge should not depend on consuming it as an npm-style runtime package.

The shared repo should also include consumer documentation so other repos know how to adopt it without reverse-engineering bridge internals.

Recommended consumer docs in the shared repo:

- what the library is responsible for
- what remains app-local
- required adapters or integration points
- example imports
- example boot/setup flow
- example connect / restore / disconnect flow
- how to handle `chainId` and wallet events
- what network policy is intentionally left to the dapp

## Recommended Public API Shape

Example shape only:

```js
const wallet = createWalletCore({
  storage,
  storageKeys,
});

wallet.load();
await wallet.restore();
wallet.getAvailableWallets();
await wallet.connect({ walletId });
await wallet.disconnect();
wallet.getState();
wallet.subscribe((event, data) => {});
```

If a consumer wants ethers-specific helpers, import them from the adapter module in the same repo instead of making them part of `wallet-core` itself:

```js
import { createWalletCore } from '@liberdus/wallet-core/core';
import { createEthers5Adapter } from '@liberdus/wallet-core/adapters/ethers5';

const walletCore = createWalletCore({ storage, storageKeys });
const walletClient = createEthers5Adapter({ walletCore, ethers: window.ethers });
```

## Repo Strategy Options

## Option 1: Internal Extraction First, Separate Repo Later

Recommended starting point.

Sequence:

1. Clean the boundaries inside bridge
2. Prove the shared API shape locally
3. Port WhaleSwap to the same shape
4. Extract into a separate repo only after the interface stops moving

Pros:

- less churn
- fewer premature packaging decisions
- easier to test against the current bridge suite

Cons:

- shared code is not immediately in its own repo

## Option 2: Create The Library Repo Immediately

This is viable, but it front-loads packaging decisions before both apps agree on the API.

Pros:

- immediate separation
- clear ownership boundary

Cons:

- higher chance of rework
- harder to stabilize the API on the first pass

## Recommendation

Use Option 1 first.

Do the internal cleanup in bridge and the organizational cleanup in WhaleSwap before creating a permanent shared repo.

## Browser Distribution Considerations

Both apps are browser-first ESM apps with little or no bundling. That matters.

The library should therefore avoid assuming a bundler-only or npm-package-only environment.

Practical options once the shared repo exists:

1. Vendor plain ESM files from the library repo into the bridge app
2. Pull the library repo in as a submodule or subtree under a served app directory such as `vendor/liberdus-wallet-core/`
3. Use an import map that points to a local served file path inside the app
4. Copy a built ESM artifact from the library repo into the app during a simple sync step

Avoid making the first version depend on framework-specific tooling.

## Recommended Extraction Sequence

The bridge app should start with an internal extraction, not with a new external repo dependency.

## Phase 1: Bridge Internal Cleanup

Without changing behavior:

- clarify connector naming
- inject provider creation
- inject storage behavior
- convert core event model to a generic emitter internally

## Phase 2: Bridge Adapter Layer

## Recommended Start Inside Bridge

Before any new repo is created, move toward an internal library-like folder inside bridge first.

Suggested internal shape:

```text
js/lib/wallet-core/
  injected-wallet-connector.js
  wallet-session.js
  index.js
```

Bridge should import from that internal folder first and prove the boundary there.

Only after that is stable should the code be moved to a new shared repository.

As this internal boundary stabilizes, start drafting the future consumer guide in parallel so the eventual shared repo ships with real integration instructions.

## How Bridge Should Use The New Repo Later

When the new repo is ready, bridge should still consume plain files under its own served tree.

Recommended patterns:

1. Vendor the library repo into `vendor/liberdus-wallet-core/`
2. Or pull it in via submodule/subtree under a served folder
3. Optionally add an import map alias that points to the vendored local path

Example import-map direction:

```html
<script type="importmap">
{
  "imports": {
    "@liberdus/wallet-core": "./vendor/liberdus-wallet-core/index.js"
  }
}
</script>
```

Then app code can import from a stable alias while still serving local files:

```js
import { createWalletCore } from '@liberdus/wallet-core';
```

This keeps the runtime model compatible with the current repo setup and avoids needing package-based runtime consumption.

The shared repo should not be considered complete until it includes a usage document for consuming repos.

Keep the bridge app behavior stable with thin adapters:

- DOM event adapter
- bridge storage-key adapter
- bridge ethers adapter

## Phase 3: WhaleSwap Organization Pass

Refactor WhaleSwap toward similar boundaries before importing the shared code.

That reduces the amount of bridge-specific thinking that leaks into WhaleSwap.

## Phase 4: Shared Repo Creation

Create the library repo after the boundaries are proven in both apps.

## Phase 5: Consumer Integration

1. Make bridge consume the shared library
2. Keep bridge UI/network pieces local
3. Make WhaleSwap consume the shared library
4. Keep WhaleSwap UI/network/contract pieces local

## Minimal Success Criteria

1. The shared package contains only the wallet core.
2. Bridge behavior does not regress.
3. WhaleSwap does not need bridge-specific UI or bridge-specific network policy.
4. The shared core works with both browser-global ethers and module-imported ethers through adapters.

## Summary

The bridge repo is already a strong extraction source, but the right move is not to extract the entire wallet area as-is.

Extract only the discovery/session core.

Keep UI, network policy, and app wiring in the app repos.

Clean the boundary first, then create the shared repo after both apps agree on the public surface.
