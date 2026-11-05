# Submission checks for 4.1.0

## Name and metadata

The submission display name remains **Activity Organizer**. GNOME recommends a
short descriptive name that avoids conflicts with another extension. It also
prohibits trademarked names and phrases without express permission. Apple lists
**Mission Control** as a registered trademark, so this review does not adopt
“Mission Control / Activity Organizer” as the extension's name.

- [Metadata naming rules](https://gjs.guide/extensions/overview/anatomy.html#name)
- [Review metadata rules](https://gjs.guide/extensions/review-guidelines/review-guidelines.html#metadata-json-must-be-well-formed)
- [Review trademark rules](https://gjs.guide/extensions/review-guidelines/review-guidelines.html#copyrights-and-trademarks)
- [Apple trademark list](https://www.apple.com/legal/intellectual-property/trademark/appletmlist.html)

The UUID remains `activityOrganizer@sainathmurali.github.io`, using the author's
existing namespace. The settings schema and saved-group data are unchanged.
`version-name` is `4.1.0`; the deprecated numeric `version` field is omitted so
extensions.gnome.org can assign its submission number. The source URL points to
the public repository. Only Shell 50 is declared supported.

## Automated checks

- `npm test`: grouping, rule overrides, stack geometry, saved-version retention,
  restore counts, and explicit removal from automatic saves pass.
- `npm run check`: JavaScript syntax and strict GSettings schema validation pass.
- `npm run pack`: runtime-only submission ZIP builds successfully, including
  schema XML and GPL license, with no compiled schemas or bundled dependencies.
- Isolated GNOME Shell 50.6 smoke test: preferences, grouping, visible move/remove
  menus, workspace moves, right-click handler, Escape desktop order, saved-group
  persistence/restoration, duplicate prevention, and disable/re-enable pass.
- The smoke test also disables while a group dialog is closing and verifies
  synchronous destruction and callback cleanup.
- Temporary window-on-window groups, selected-window dragging from expanded
  stacks, group-header drops, promotion to saved groups, normal group closing,
  and the default toolbar without the App stacks button pass.
- A separate isolated showcase run captures 13 real app windows before and after
  enabling the extension, verifying that the window set is unchanged.
- Shexli **0.2.1** on the built ZIP: **clean, zero findings**. The full report is
  supplied alongside the release assets as `shexli-report.json`.

To repeat Shexli in a separate virtual environment:

```sh
python3 -m venv /tmp/activity-organizer-shexli-venv
/tmp/activity-organizer-shexli-venv/bin/pip install 'shexli==0.2.1' 'tree-sitter==0.25.2' 'tree-sitter-javascript==0.25.0'
/tmp/activity-organizer-shexli-venv/bin/shexli dist/activityOrganizer@sainathmurali.github.io.shell-extension.zip --format json
```

The initially selected tree-sitter 0.26.0 crashed inside the analyzer while
walking syntax nodes. Version 0.25.2 runs the same unmodified Shexli rules
successfully; no findings are suppressed. Shexli runs locally and does not
upload the source.

## Lifecycle review

Shell modifications start in `enable()`. `disable()` restores injected methods
and preview properties, destroys custom controls/menus/dialogs, disconnects
signals, and cancels refresh/restore sources. PopupMenuManager is a native JS
helper with no `destroy()` method: menu destruction invokes its `removeMenu()`
cleanup. The extension retains the menu, which it destroys on replacement and
disable, rather than retaining a redundant manager reference.

The submission contains readable JavaScript and GPL-3.0-or-later licensing. GTK
and libadwaita are confined to preferences. No clipboard access, telemetry,
privileged subprocesses, or external network services are used at runtime.

## Limits

These checks do not constitute approval by GNOME's reviewers. The headless test
emits compositor/portal/allocation warnings and does not measure frame pacing.
Physical pointer/touch, multiple monitors, app-specific new-window behavior,
and other overview extensions still need desktop testing. Restore tests use
real helper windows with a stable identity/launcher adapter. App documents and
internal tabs are not restored. The developer submitting the extension must
understand and be able to explain the code as required by the review rules.
