# Nix development and local test runbook

This project includes a root `flake.nix` so you can get the required Node.js development environment with `nix develop`.

The flake supports:

- Apple Silicon macOS: `aarch64-darwin`
- Intel macOS: `x86_64-darwin`
- ARM64 Linux: `aarch64-linux`
- x86_64 Linux: `x86_64-linux`

It provides:

- Node.js 22
- npm
- Git
- curl
- CA certificates

The project itself requires Node.js 22.12 or newer.

## 1. Clone the repository

```bash
git clone https://github.com/kodyka/jazz-tools-mcp-v2.git
cd jazz-tools-mcp-v2
```

Until PR #1 is merged, check out the feature branch:

```bash
git fetch origin
git checkout feat/mvp-alpha-server-connector
git pull origin feat/mvp-alpha-server-connector
```

After PR #1 is merged, use `main`:

```bash
git checkout main
git pull origin main
```

## 2. Verify Nix

```bash
nix --version
```

On Apple Silicon you can also confirm the current Nix system:

```bash
nix eval --impure --raw --expr builtins.currentSystem
echo
```

Expected output on an Apple Silicon Mac:

```text
aarch64-darwin
```

Expected output on an Intel Mac:

```text
x86_64-darwin
```

## 3. Enter the development shell

From the repository root:

```bash
nix develop
```

The shell prints the active Node and npm versions and the recommended verification commands.

Verify manually if desired:

```bash
node --version
npm --version
```

## 4. Install npm dependencies

Still inside the `nix develop` shell:

```bash
npm install --no-audit --no-fund
```

This installs the project dependencies, including:

- `jazz-tools@alpha`
- `jazz-napi@alpha`
- MCP TypeScript SDK
- TypeScript tooling

`jazz-napi` publishes a native Apple Silicon build, so the real Jazz integration test can run on an `aarch64-darwin` Mac without building Jazz from Rust source.

## 5. Type-check

```bash
npm run check
```

Expected result: exit code `0` with no TypeScript errors.

## 6. Run all tests

```bash
npm test
```

This includes the real Jazz integration test. It automatically:

1. starts an in-memory Jazz server through the official Jazz NAPI runtime;
2. deploys a test schema and permissions;
3. connects the MCP connector using the admin-secret path;
4. performs insert/query/update/delete;
5. shuts the temporary server down.

You do not need to configure an app ID or secret for this test.

Expected final test summary includes:

```text
fail 0
```

## 7. Build

```bash
npm run build
```

Verify the generated entry point:

```bash
ls -la dist/index.js
```

## 8. Leave the Nix shell

```bash
exit
```

## Fast path

After cloning and checking out the branch, the complete interactive flow is:

```bash
nix develop
npm install --no-audit --no-fund
npm run check
npm test
npm run build
exit
```

## One-command verification without staying in the shell

From the repository root you can run the entire verification through the flake in one command:

```bash
nix develop -c bash -lc 'npm install --no-audit --no-fund && npm run check && npm test && npm run build'
```

If `node_modules` already exists and you only want to run the tests:

```bash
nix develop -c npm test
```

Or run type-check + tests + build without reinstalling dependencies:

```bash
nix develop -c bash -lc 'npm run check && npm test && npm run build'
```

## If flakes are not enabled in your Nix installation

Most current Nix installations enable flakes, but if `nix develop` reports that `nix-command` or `flakes` are experimental features, run:

```bash
nix --extra-experimental-features 'nix-command flakes' develop
```

The equivalent one-command test is:

```bash
nix --extra-experimental-features 'nix-command flakes' develop -c bash -lc 'npm install --no-audit --no-fund && npm run check && npm test && npm run build'
```

## Updating the Nix input

The flake currently follows `NixOS/nixpkgs` `nixos-unstable`.

If a `flake.lock` exists and you want to update it:

```bash
nix flake update
```

Then re-enter the environment:

```bash
nix develop
```

## Manual MCP Inspector test

After the automated tests pass, continue with the full local MCP test guide:

```text
docs/local-testing-runbook.md
```

That guide covers starting `jazz-tools@alpha server`, deploying your own Jazz schema, launching MCP Inspector, and manually exercising the read/write MCP tools.
