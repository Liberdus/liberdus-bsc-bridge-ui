# Wallet module submodule

`liberdus-bsc-bridge-ui` vendors [`liberdus-wallet-module`](https://github.com/Liberdus/liberdus-wallet-module) as a git submodule at:

```text
vendor/liberdus-wallet-module/
```

The parent repo stores a **pointer** to a specific commit in the wallet module repo. Updating the submodule means moving that pointer and committing the change in `liberdus-bsc-bridge-ui`.

## First-time setup

Clone with submodules:

```bash
git clone --recurse-submodules https://github.com/Liberdus/liberdus-bsc-bridge-ui.git
```

If the repo is already cloned:

```bash
git submodule update --init --recursive
```

Verify the wallet files are present:

```bash
test -f vendor/liberdus-wallet-module/index.js && echo OK
```

## Update to latest `main`

From the repo root:

```bash
./scripts/bump-wallet-module.sh
```

That script:

1. Fetches the latest commit from the submodule's tracked branch
2. Stages `vendor/liberdus-wallet-module`
3. Creates a commit in `liberdus-bsc-bridge-ui`

Use `--no-commit` if you only want to update and stage locally:

```bash
./scripts/bump-wallet-module.sh --no-commit
```

## Pin to a tag or commit

```bash
./scripts/bump-wallet-module.sh --ref v0.2.0
./scripts/bump-wallet-module.sh --ref d393766
```

## Manual update (equivalent commands)

Latest remote commit:

```bash
git submodule update --init --recursive vendor/liberdus-wallet-module
git submodule update --remote vendor/liberdus-wallet-module
git add vendor/liberdus-wallet-module
git commit -m "chore: bump liberdus-wallet-module submodule"
```

Specific tag or commit:

```bash
cd vendor/liberdus-wallet-module
git fetch origin --tags
git checkout v0.2.0
cd ../..
git add vendor/liberdus-wallet-module
git commit -m "chore: bump wallet module to v0.2.0"
```

## Inspect current pin

```bash
git submodule status vendor/liberdus-wallet-module
git -C vendor/liberdus-wallet-module log -1 --oneline
```

## Deploy note

Static deploy hosts must copy the vendored wallet files as plain assets. Run `git submodule update --init --recursive` in the source repo before rsync/deploy so `vendor/liberdus-wallet-module/**` is present on disk.

## Troubleshooting

### Empty `vendor/liberdus-wallet-module` after clone

```bash
git submodule update --init --recursive
```

### Submodule shows modified content inside vendor path

From repo root:

```bash
git submodule update --init vendor/liberdus-wallet-module
```

## Related

- Integration plan: [issue #109](https://github.com/Liberdus/liberdus-bsc-bridge-ui/issues/109)
- Reference implementation: [liberdus-token-ui `docs/SUBMODULE.md`](https://github.com/Liberdus/liberdus-token-ui/blob/main/docs/SUBMODULE.md)
