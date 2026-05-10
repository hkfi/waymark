# Release Policy

Waymark uses stable releases gated by intentional version bumps.

## Policy

- `main` should stay releasable, but not every merge to `main` publishes an app update.
- A GitHub Release is published when a merged change bumps the app version.
- Releases include signed Tauri updater artifacts with updater metadata attached to the GitHub Release.
- macOS builds are ad-hoc code-signed until Apple Developer ID signing and notarization are configured.
- The app may check for updates in the background, but install is always an explicit user click.
- When a newer signed version is available, the app shows an update button at the left end of the title bar.
- The app updater only installs a newer signed version from the configured GitHub Release endpoint.

## Versioning

Keep these files on the same SemVer version:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Use this release scale while Waymark is pre-`1.0`:

- Patch, such as `0.1.1`: bug fixes, visual polish, dependency updates, and internal hardening.
- Minor, such as `0.2.0`: meaningful user-facing features or workflow changes.
- Major, `1.0.0` and later: stable file contracts and stricter SemVer expectations.

Do not publish workspace file-contract changes casually. If a release changes file behavior or compatibility, document it in release notes and update the architecture/file-contract docs in the same change.

## Agent Checklist

When an AI agent decides a change should ship as a desktop app update:

1. Choose patch or minor using the policy above.
2. Run `pnpm version:set -- <semver>` to update `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` together.
3. Refresh lockfiles if the version change affects them.
4. Run `pnpm build` and `cargo check --manifest-path src-tauri/Cargo.toml`.
5. Mention the version bump in the final summary, PR description, or release notes.

When a change should not trigger a desktop release, do not bump the app version.

## GitHub Release Automation

The release workflow runs on pushes to `main`. It publishes only when `src-tauri/tauri.conf.json` has a new version compared with the previous `main` commit. Manual dispatch also publishes the current version.

The macOS app is currently ad-hoc signed with `bundle.macOS.signingIdentity = "-"`. This prevents the bundle from being completely unsigned, which is especially important for Apple Silicon downloads, but it is not Apple notarization. First launch from a browser download may still require approving Waymark in macOS Privacy & Security or clearing quarantine manually:

```bash
xattr -dr com.apple.quarantine /Applications/Waymark.app
```

Normal no-warning macOS distribution requires Apple Developer ID signing and notarization.

Required repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: the updater private key content.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: optional; leave unset or empty if the key has no password.

Future macOS notarized releases also require Apple signing/notarization secrets such as `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID` or App Store Connect API credentials, and `APPLE_TEAM_ID`.

Only the public updater key is committed in `src-tauri/tauri.conf.json`. Never commit the private key.

For local signed bundle verification, set the private key content before building:

```bash
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/waymark-updater.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD= pnpm tauri build --debug
```
