# Wallet Library Extraction Plan

## Goal

Extract the reusable wallet core from `liberdus-bsc-bridge-ui` into a shareable library that can later be used by apps such as `WhaleSwap-UI`.

This document is about the extraction boundary and repo strategy, not about changing bridge functionality right now.

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

- inject a `createWeb3Provider(eip1193Provider)` function into the shared core
- let each app decide how that wrapper is created

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
  package.json
  README.md
  src/
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

## Recommended Public API Shape

Example shape only:

```js
const wallet = createWalletCore({
  createWeb3Provider,
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

The library should therefore avoid assuming a bundler-only environment.

Practical options once the shared repo exists:

1. Publish plain ESM files and consume them through import maps
2. Use a local package dependency plus import-map entries
3. Vendor/copy a built ESM artifact into each app during a simple build step

Avoid making the first version depend on framework-specific tooling.

## Recommended Extraction Sequence

## Phase 1: Bridge Internal Cleanup

Without changing behavior:

- clarify connector naming
- inject provider creation
- inject storage behavior
- convert core event model to a generic emitter internally

## Phase 2: Bridge Adapter Layer

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
