# Changesets

This repository uses Changesets to manage versioning, changelogs, and releases.

## Commands

- Create/edit a changeset: `npm run changelog`
- Apply versions and generate CHANGELOG: `npm run version`
- Publish to npm (builds first): `npm run release`

## Typical flow

1. Install dependencies:
   - `npm install`
2. Make your code changes on a branch.
3. Create a changeset describing the change and bump type:
   - `npm run changelog`
   - Select the package and choose patch/minor/major; write a summary.
   - Commit the generated `.md` file in `.changeset/`.
4. Merge your PR into the base branch.
5. On the base branch (main), cut a release:
   - Version and changelog: `npm run version`
     - This updates package.json versions and writes/updates `CHANGELOG.md`.
     - With `"commit": true` in config, a version commit is created automatically.
   - Push commits and tags (if any): `git push --follow-tags`
   - Publish: `npm run release` (requires `npm login`)
     - Uses `"access": "public"` per config.

## Configuration

See `.changeset/config.json` for settings:

- `changelog`: `@changesets/changelog-git` for git-style entries
- `commit`: `true` to auto-commit versioning changes
- `baseBranch`: `main`
- `access`: `public`
- `updateInternalDependencies`: `patch`

## Notes

- This is a single-package repo: `@aokiapp/aqn1`.
- Changesets files live under `.changeset/` and are committed to source control.
- `CHANGELOG.md` is generated/updated when you run `npm run version`.
