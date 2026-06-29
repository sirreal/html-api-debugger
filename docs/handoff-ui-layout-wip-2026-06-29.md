# HTML API Debugger UI Layout WIP Handoff

## Current State

This is a WIP commit for exploring cleaner information architecture for the single HTML API Debugger admin view.

The current branch adds three alternate admin pages:

- `admin.php?page=html-api-debugger-workbench`
- `admin.php?page=html-api-debugger-compare`
- `admin.php?page=html-api-debugger-focus`

The variants are registered in `html-api-debugger/html-api-debugger.php`, rendered through `html-api-debugger/interactivity.php`, and styled in `html-api-debugger/style.css`. `html-api-debugger/main.mjs` also applies the layout class from the `page` query parameter as a fallback, because the running local PHP process appeared to serve stale template output during the session.

## User Feedback

The user said the variants "don't really work in the plugin" but that the design direction is useful.

Specific preferences:

- Likes the boxes around the different panels.
- Likes the Workbench layout direction.
- Wants a cleaner, less cluttered view.
- Wants simple standard web platform tech, but still elegant, crisp, clean, and uncluttered.
- Does not want Dashicons in the copy buttons.
- The tree output layouts must remain untouched.

## Important Constraints

- Do not run `wp-env`. The user manages the local WordPress environment.
- Do not modify the tree rendering layout or tree text shape.
- Avoid relying on icon libraries for core controls unless explicitly approved.
- Redact local credentials from any committed docs.
- The current JS layout fallback is acceptable for WIP exploration, but should not be the long-term design if PHP output is reliable after the server refreshes.

## Verification Done

Static checks passed after the WIP changes:

- `php -l html-api-debugger/html-api-debugger.php`
- `php -l html-api-debugger/interactivity.php`
- `vendor/bin/phpcs html-api-debugger/html-api-debugger.php html-api-debugger/interactivity.php`
- `./node_modules/.bin/tsc -p .`
- `./node_modules/.bin/biome check html-api-debugger/main.mjs html-api-debugger/style.css`
- `git diff --check`

Live screenshots were captured through headless Chrome as a client only:

- `/tmp/html-api-debugger-workbench-v2.png`
- `/tmp/html-api-debugger-compare-v2.png`
- `/tmp/html-api-debugger-focus-v2.png`

Those screenshots are temporary and not committed.

## Suggested Next Steps

1. Stop treating the three variants as candidates to ship. Use them as prototypes.
2. Consolidate toward one Workbench-style layout.
3. Keep panel boxes, but reduce vertical clutter and visual weight.
4. Decide which panels should be visible on first load. Likely primary: input/context, rendered preview, and tree comparison.
5. Move secondary material like normalized HTML, document info, processed HTML, share links, and debug response behind a quieter secondary area or disclosure.
6. Remove the JS layout fallback once PHP is serving current templates reliably, unless variants remain useful for continued comparison.
7. Re-test the actual plugin page in the user-managed local WordPress environment.

## Suggested Skills

- `codebase-design`: useful for deciding the final module/interface shape for the page generator and layout variants.
- `diagnose`: useful if the running plugin continues serving stale PHP or asset output.
- `browser:control-in-app-browser`: use if the in-app browser becomes available in the next session; otherwise headless Chrome/CDP worked as a fallback client.
