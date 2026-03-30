# liberdus-bsc-bridge-ui

Skeleton UI for the Liberdus vault bridge app.

## Current Scope

### Functional now
- Header + wallet connect button
- Injected browser wallet flow with explicit wallet selection, silent restore, and disconnect
- Config-driven source-network gating (no switch on connect; no popup network switching)
- Read-only contract wiring to:
  - `0x1469f20C91da50BF9Cc82d7cFB9A8D9EF1dEe86a`
- Contract status tab with live reads for:
  - `getChainId`, `token`, `REQUIRED_SIGNATURES`, `bridgeOutEnabled`, `halted`, `maxBridgeOutAmount`, `getVaultBalance`, `signers(0..3)`

### Placeholder only (coming next)
- Bridge Out interaction flow
- Multisig operation request/signature flows
- Action tab business logic

## Local Run

Use any static server (ES modules require HTTP, not `file://`).

```bash
cd /home/bui/shared/liberdus/liberdus-bsc-bridge-ui
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Project Layout

- `index.html` app shell
- `css/` shared reference styles
- `js/app.js` bootstrap + global manager wiring
- `js/wallet/` injected-wallet discovery, connection, and network management
- `js/contracts/contract-manager.js` ABI/provider/contract wiring
- `js/components/` tabs + header + toast components
- `abi/vault.json` full Vault ABI (manually defined from `Vault.sol`)

## Configuration

Edit `js/config.js` to change network/contract settings:

- `CONFIG.RUNTIME.PROFILE` selects `dev` or `prod`
- `PROFILES.<profile>.SOURCE_NETWORK` and `PROFILES.<profile>.DESTINATION_NETWORK`
- `PROFILES.<profile>.SOURCE_CONTRACT` and `PROFILES.<profile>.DESTINATION_CONTRACT`
- `PROFILES.<profile>.BRIDGE.OBSERVER_URL`
- Runtime source aliases `CONFIG.NETWORK` and `CONFIG.CONTRACT` are derived from `SOURCE_*` for source-chain internals
- Canonical bridge runtime config lives at `CONFIG.BRIDGE.CHAINS.{SOURCE,DESTINATION}` and `CONFIG.BRIDGE.CONTRACTS.{SOURCE,DESTINATION}`

Wallet connect only requests account access. If the wallet is on the wrong chain, the app stays connected and tx actions will prompt a switch to the configured source network when used.

## Next Implementation Steps

1. Implement Bridge Out tx path (`approve` + `bridgeOut`).
2. Implement operations tab actions (`requestOperation`, `submitSignature`).
3. Add richer success/error transaction UX and status polling.
