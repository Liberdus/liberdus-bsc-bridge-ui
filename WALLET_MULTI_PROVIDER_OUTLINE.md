# Wallet Multi-Provider Connect Outline

## Goal

Add a simple wallet selection flow that works when multiple browser wallets are installed, without introducing a wallet UI library.

This outline is meant to be a phased skeleton for:

- `liberdus-bsc-bridge-ui`
- `WhaleSwap-UI`

## Recommendation

Try the first implementation in `liberdus-bsc-bridge-ui`.

Reasons:

- It is the smaller codebase.
- The wallet flow is concentrated in fewer files.
- It already has `EIP-6963` discovery hooks, so we do not need to add discovery from scratch.
- The current bug is already visible there, so validation is straightforward.

`WhaleSwap-UI` should be the second implementation. It has a larger app surface and more wallet-dependent UI state, but the same architecture can be reused after the bridge repo proves out.

## Shared Architecture

Keep the wallet layer simple and split it into three responsibilities:

1. Discovery
2. Selection
3. Connection

Minimal internal shape:

```js
{
  id,
  name,
  icon,
  rdns,
  provider,
  source, // 'eip6963' | 'legacy'
  flags: {
    isMetaMask,
    isBraveWallet,
    isCoinbaseWallet
  }
}
```

Minimal API skeleton:

```js
walletDiscovery.load()
walletDiscovery.getWallets()
walletDiscovery.getWalletById(id)
walletDiscovery.connect(walletId)
walletDiscovery.restoreLastWallet()
walletDiscovery.disconnect()
```

Rules:

- Do not auto-pick a provider only from `isMetaMask`.
- Do not prompt a wallet during app boot.
- Only call `eth_requestAccounts` after the user clicks a specific wallet option.
- Persist the last selected wallet id locally.
- On page load, restore only by checking `eth_accounts` on the previously selected provider.
- Keep `window.ethereum` fallback only for older browsers or wallets that do not announce through `EIP-6963`.

## Phase 0: Quick Bug Fix

Goal: stop Brave from being accidentally treated as MetaMask in the bridge repo.

Smallest safe patch:

- Stop auto-selecting the last announced `EIP-6963` provider.
- If we remain MetaMask-only for the moment, match MetaMask more strictly.
- Do not treat `isMetaMask === true` as sufficient by itself.
- Prefer explicit provider identity fields such as `rdns`, `name`, or known metadata.

This phase is useful if we want a quick regression fix before the full picker lands.

## Phase 1: Discovery Registry

Goal: collect all available wallets in one place.

Tasks:

- Add a small wallet discovery module or extend the existing connector/service.
- Listen for `eip6963:announceProvider`.
- Dispatch `eip6963:requestProvider` on load.
- Normalize announced providers into a stable wallet list.
- Deduplicate by `uuid` first, then `rdns`, then a generated fallback id.
- Add legacy fallback from `window.ethereum` and `window.ethereum.providers`.
- Expose a read-only list of discovered wallets to the UI.

Output of this phase:

- We can log or render the discovered wallets.
- We still do not need to change the entire app flow yet.

## Phase 2: Simple Picker Modal

Goal: replace implicit provider choice with an explicit user choice.

Tasks:

- On `Connect Wallet`, open a small modal instead of immediately requesting accounts.
- Render one button per discovered wallet.
- Show name and icon only.
- Keep copy short: `Choose a wallet`.
- If no wallets are found, show a plain fallback message.
- When a wallet button is clicked:
  - save the selected wallet id
  - call `eth_requestAccounts` on that provider
  - build the ethers `Web3Provider`
  - continue with the existing connected flow

Keep the first version intentionally narrow:

- No grouping
- No install links
- No sorting rules beyond stable insertion order
- No mobile deep-link work yet

## Phase 3: Restore and Disconnect

Goal: make reconnect behavior predictable.

Tasks:

- Save `lastSelectedWalletId` in local storage.
- On app boot:
  - rediscover wallets
  - find the previously selected wallet
  - call `eth_accounts`
  - if authorized, restore session silently
- On disconnect:
  - clear connected state
  - keep or clear `lastSelectedWalletId` depending on desired UX

Suggested default:

- Keep `lastSelectedWalletId`
- Clear account/session state
- Do not auto-prompt on reload

## Phase 4: Basic Test Matrix

Minimum behavior to test:

- One wallet installed
- MetaMask + Brave installed
- No wallets installed
- Previously selected wallet still installed
- Previously selected wallet missing
- User rejects connect request
- User disconnects in wallet UI
- Chain changes after connection

Important assertions:

- No wallet prompt on page load
- No dependence on provider order alone
- Clicking a wallet button requests accounts on that exact provider
- Restore uses `eth_accounts`, not `eth_requestAccounts`

## Repo-Specific Skeleton

### `liberdus-bsc-bridge-ui`

Current useful files:

- `js/wallet/metamask-connector.js`
- `js/wallet/wallet-manager.js`
- `js/components/header.js`
- `css/header.css`

Suggested first-pass file plan:

- Add or rename connector logic so it manages multiple injected wallets, not only MetaMask.
- Add a tiny picker UI component or keep it inside `header.js` for the first pass.
- Keep `wallet-manager.js` responsible for connected state only.
- Move provider discovery and selection into the connector layer.

Good first incremental sequence:

1. Discovery registry only, console-log visible wallets.
2. Picker modal with fake selection rendering.
3. Real connect from selected wallet.
4. Silent restore from last selected wallet.

### `WhaleSwap-UI`

Current useful files:

- `js/services/WalletManager.js`
- `js/components/WalletUI.js`
- `css/components/wallet.css`

Suggested first-pass file plan:

- Add discovery support to `WalletManager.js` or a new `InjectedWalletDiscovery` helper.
- Update `WalletUI.js` so connect opens a picker first.
- Remove reliance on `resolveInjectedProvider()` choosing a single provider up front.
- Keep the rest of the app listening to the same wallet events.

Good second-step sequence:

1. Port the discovery/selection layer proven in the bridge repo.
2. Swap `connect()` from single-provider mode to selected-provider mode.
3. Preserve existing wallet event notifications so app components do not need a large rewrite.

## Suggested First Implementation Target

Start in `liberdus-bsc-bridge-ui`.

It is the easier repo for the first implementation because:

- fewer files are involved
- the connect button is simpler
- the wallet state is less coupled to the rest of the app
- `EIP-6963` is already partly wired in

If the bridge repo implementation feels good, then port the same pattern into `WhaleSwap-UI`.
