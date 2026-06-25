# melberg

Overview page for projects on `*.melberg.app`, with **no npm build required**.

The page fetches repositories from GitHub user `hmelberg` in the browser and maps them to subdomains.
This means new repos can appear automatically on `melberg.app` without running local tooling.

## Files

- `index.html`: main project overview page
- `app.js`: client-side loader (GitHub API + filtering + rendering)
- `projects.config.json`: exclusions, mapping, and manual entries
- `admin.html`: local admin editor for temporary override config
- `admin.js`: logic for admin override storage in browser localStorage
- `netlify.toml`: static deploy + cache headers

## How automatic updates work

1. Visitor opens `melberg.app`.
2. `app.js` fetches `projects.config.json`.
3. `app.js` fetches repos from `https://api.github.com/users/hmelberg/repos`.
4. Each repo maps to `https://<repo-or-mapped-subdomain>.melberg.app`.
5. Exclusions and manual overrides are applied.

If you add a new GitHub repository under `hmelberg`, it can show up automatically on next page load.

## Configure exceptions and mapping

Edit `projects.config.json`:

- `excludeRepos`: repo names to hide
- `excludeHosts`: full hostnames to hide
- `featuredHosts`: hostnames pinned to the top
- `featuredRepos`: repo names pinned to the top
- `repoToSubdomain`: map repo name to custom subdomain
- `manualProjects`: manually added projects (for special cases)
- `liveCheck`: check if target URLs respond; only available URLs are listed

Example:

```json
{
  "githubUser": "hmelberg",
  "baseDomain": "melberg.app",
  "excludeRepos": [".github", "private-repo-name"],
  "excludeHosts": ["admin.melberg.app"],
  "featuredHosts": ["stick.melberg.app"],
  "featuredRepos": ["microdata-api"],
  "repoToSubdomain": {
    "microdata-api": "micro"
  },
  "manualProjects": [
    {
      "name": "Stick",
      "hostname": "stick.melberg.app",
      "description": "Manual entry"
    }
  ],
  "liveCheck": {
    "enabled": true,
    "timeoutMs": 2200,
    "concurrency": 6
  }
}
```

### Live-check behavior

- If `liveCheck.enabled` is `true`, each project URL gets a lightweight availability probe.
- Projects without confirmed availability are excluded from the overview.

### Featured behavior

- Projects in `featuredHosts` or `featuredRepos` are always sorted first.
- Inside featured and non-featured groups, `sortBy` still applies.

## Admin page

Open `admin.html` to:

- edit and save a local override config in your browser
- clear the override
- load base config

This does not change files in GitHub. It is useful for quick testing before committing config changes.

## Netlify deploy

- Connect this folder/repository in Netlify.
- Build command: none
- Publish directory: `.`

`netlify.toml` already sets `publish = "."` and no-cache headers for config/js.

## Optional: force refresh from admin

Use the `Refresh now` button on the main page after changes in admin override mode.

## Notes

- This approach tracks GitHub repositories, not guaranteed live subdomains.
- If GitHub API rate limits are hit, the page may temporarily fail to refresh.
