# Wallet module submodule

Vendored at `vendor/liberdus-wallet-module/`. The parent repo stores a git submodule pointer to a specific commit in [liberdus-wallet-module](https://github.com/Liberdus/liberdus-wallet-module).

## Setup

```bash
git clone --recurse-submodules https://github.com/Liberdus/liberdus-bsc-bridge-ui.git
# already cloned:
git submodule update --init --recursive
```

## Bump

```bash
./scripts/bump-wallet-module.sh
./scripts/bump-wallet-module.sh --ref v0.2.0
./scripts/bump-wallet-module.sh --no-commit
```

Inspect the current pin:

```bash
git submodule status vendor/liberdus-wallet-module
```

## Deploy

Run `git submodule update --init --recursive` before rsync/deploy so vendor files exist on disk.

## See also

- [Integration plan (#109)](https://github.com/Liberdus/liberdus-bsc-bridge-ui/issues/109)
- [liberdus-token-ui docs/SUBMODULE.md](https://github.com/Liberdus/liberdus-token-ui/blob/main/docs/SUBMODULE.md) for manual update commands and troubleshooting
