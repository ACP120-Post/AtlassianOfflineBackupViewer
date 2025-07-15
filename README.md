# Confluence Backup Viewer

A read-only local viewer for Confluence Cloud CSV ZIP backups, with Jira backup support. The Node.js application includes SAML SSO, user import, per-user permission management, and signed license-key checks.

Copyright © 2026 ACP120 GmbH. The viewer is licensed under **AGPL-3.0-only**. See [LICENSE](LICENSE), [COPYRIGHT.md](COPYRIGHT.md), [LICENSING.md](LICENSING.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Run locally

Requirements: Node.js 24 and npm.

```sh
npm install
npm start
```

Open <http://localhost:3000>. The server binds to `127.0.0.1`. Put backup ZIP files in `./backups`, or pass a directory explicitly:

```sh
npm start -- --backup-dir ./backups --cache-dir ./.cache --port 3000
```

The first run creates a local admin account (`admin` / `admin`); change its password before use. The viewer does not connect to Confluence or Jira. Backups are read locally and are never modified.

## Licensed features and support

The SAML SSO, identity-import, and per-user permission-management code is visible in this repository, licensed under AGPL-3.0-only, and included in the standard build. Using these features in the official build requires a valid Marketplace-issued license key (including a trial key where available); licenses are obtained through the [Atlassian Marketplace](https://marketplace.atlassian.com/apps/1045655402/backup-viewer-for-confluence?hosting=cloud&tab=overview). Global product visibility settings remain available to the local administrator without a license.

ACP120 provides product support only to customers with an active paid Marketplace license. License revenue funds ongoing maintenance and support, including the AI credits used to deliver support. These product terms do not change the source's AGPL license; see [LICENSING.md](LICENSING.md) for source-distribution obligations.

## Source

The internal Forge app issues license keys and is not included in this public repository. It is separate from the Node.js viewer source published here.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). AGPL requires source availability to users of modified network versions; it does not require changes to be sent upstream.

## Development checks

```sh
npm test
npm run build
npm run test:browser
```

Browser checks require Google Chrome. For detailed product behavior and known export limits, see [README.de.md](README.de.md) (German).
