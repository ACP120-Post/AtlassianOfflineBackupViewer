# Licensing

The Confluence Backup Viewer source maintained by this project is licensed under **GNU AGPL-3.0-only**. The complete license is in [`LICENSE`](LICENSE); `package.json` declares the same SPDX identifier. The ordinary build includes the viewer, SAML SSO, identity import, per-user permission management, and signed-key checks.

The SSO, identity-import, user-switching, per-user product-permission, and Jira identity-mapping source is public under AGPL and included in the standard build. In ACP120's official build, using these features requires a valid Marketplace-issued license key (including a trial key where available); licenses are obtained through the [Atlassian Marketplace](https://marketplace.atlassian.com/apps/1045655402/backup-viewer-for-confluence?hosting=cloud&tab=overview). Global product visibility settings remain available to the local administrator without a license. ACP120 provides product support only to customers with an active paid Marketplace license. License revenue funds maintenance and support, including the AI credits used to provide support. These product terms do not change the source code's AGPL license.

For modified versions offered for remote network interaction, AGPL requires the corresponding source to be made available to those users under AGPL terms. AGPL does not require changes to be sent upstream.

The internal Forge licence-key issuer is stored in the private development repository under `forge-licence/` and is excluded from the public viewer export. Its signing key must never be included in any repository. The public viewer contains only the public verification key.

Third-party packages and assets retain their own licenses; this project does not relicense them. Atlassian Sans and Atlassian Mono font files have been removed, and the viewer uses system font stacks. The Atlaskit package notices and Atlassian Design System terms are documented in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

The public GitHub repository contains the full SSO-enabled viewer source. Its release boundary excludes the Forge app, local configuration and data, example ZIP archives, and private repository history.
