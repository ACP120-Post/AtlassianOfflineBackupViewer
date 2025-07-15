# Third-party notices

The project source is under AGPL-3.0-only. Third-party packages and assets keep their own licenses; this file does not relicense them.

## Direct npm dependencies

The root lockfile records these direct package licenses:

| Packages | License recorded in `package-lock.json` |
|---|---|
| `@atlaskit/button`, `@atlaskit/css-reset`, `@atlaskit/icon`, `@atlaskit/lozenge`, `@atlaskit/spinner`, `@atlaskit/tokens` | Apache-2.0 |
| `@node-saml/node-saml`, `csv-parse`, `htmlparser2`, `react`, `react-dom`, `sanitize-html`, `yauzl` | MIT |
| `saxes` | ISC |
| `@playwright/test` | Apache-2.0 |
| `@vitejs/plugin-react`, `vite` | MIT |

Transitive packages also include Apache-2.0, MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, BlueOak-1.0.0, and CC-BY-4.0 licensed material. Consult the package metadata and license files installed by npm for the versions in the lockfile; include their notices when redistributing built bundles.

## Atlassian Design System

The viewer uses Atlaskit npm packages listed above, whose package metadata declares Apache-2.0. The Atlassian Sans and Atlassian Mono font files previously copied into this repository have been removed; the viewer uses system font stacks instead. No Atlassian font files are included in the source export or build.

Atlassian's [Design System license](https://atlassian.design/license/) grants use of ADS in connection with software that interoperates or integrates with Atlassian products and has additional restrictions. Review that agreement and the exact package notices before changing the ADS dependencies or redistributing other ADS assets. Do not treat this project's AGPL license as covering Atlassian material.
