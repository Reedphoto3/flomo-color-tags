# Project collaboration rules

- Keep the extension compatible with Manifest V3 and prefer no build dependencies.
- Keep all tag detection and coloring local to the browser.
- Never upload flomo content or include private memo text or personal tags in fixtures.
- Starter templates must be explicitly applied by the user and must not silently replace existing rules.
- Optional automatic coloring features must be disabled by default and preserve explicit user rules.
- Do not commit directly to `main`.
- Do not create GitHub Releases before version 1.0.
- Keep Chrome and Vivaldi compatibility in scope.
- Keep `settingsVersion` independent from the extension version; increment it only when the persisted settings structure changes.
- After changes, run `npm test`.
