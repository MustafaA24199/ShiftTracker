# Mustafa's Shift Tracker

Firefox extension source is in `Mustafa's Shift Tracker v1.5`.

## Automatic Firefox updates

Every push to `main` runs `.github/workflows/publish-firefox-update.yml`. The workflow:

1. appends the GitHub Actions run number to the base version in `manifest.json`;
2. validates and submits the extension to Mozilla for unlisted signing;
3. publishes the signed XPI as a GitHub release; and
4. updates `updates.json`, which installed copies of the extension check automatically.

The repository must contain these encrypted Actions secrets:

- `AMO_JWT_ISSUER` — the JWT issuer from Mozilla Add-ons API credentials.
- `AMO_JWT_SECRET` — the matching JWT secret.

Create the credentials at <https://addons.mozilla.org/developers/addon/api/key/> and add them under **Repository settings → Secrets and variables → Actions**. Never commit either value.

The base `version` in the source manifest must contain no more than three numeric parts (for example, `0.1.5`). The workflow creates unique releases such as `0.1.5.12` without modifying the source manifest.
