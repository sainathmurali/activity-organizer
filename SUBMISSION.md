# GNOME Extensions submission

Upload `dist/activityOrganizer@sainathmurali.github.io.shell-extension.zip` at
https://extensions.gnome.org/upload/ while signed in to the extension owner's account.

- Name: Activity Organizer
- UUID: `activityOrganizer@sainathmurali.github.io`
- Supported Shell versions: 46, 47, 48, 49, 50
- Source repository: https://github.com/sainathmurali/activity-organizer
- License: GPL-3.0-or-later
- Donation: https://www.buymeacoffee.com/bionichuman

The ZIP contains runtime JavaScript, stylesheet, metadata, schema source, and
license. Developer tests and build files stay in the source repository.
GNOME Extensions assigns its own extension version when accepting an upload.
The visible release number is supplied by `version-name` (4.2.0).
This package has been prepared for submission; it has not been submitted or
approved by GNOME Extensions.

The extension overrides `WorkspaceLayout` slot calculation and native preview
interaction using `InjectionManager`. It restores those methods and modified
actors, disconnects signals, destroys custom controls, and removes pending
sources on disable. Saved sessions use GSettings and desktop application IDs;
there are no external services, background daemons, or bundled dependencies.

Validation: Node grouping/layout/session tests, JavaScript syntax checks,
strict schema validation, and an isolated GNOME Shell 50.6 test with real helper
windows. The restore test substitutes the helper launcher and stable app ID.
Physical pointer/touch behavior, multiple monitors, app-specific new-window
support, and interaction with other overview extensions need desktop testing.
See README for the repeatable test command and known headless warnings.

Shexli 0.2.1 reports zero findings on the 4.2.0 submission ZIP. See
`REVIEW_CHECKS.md` for the checks, analyzer environment, and naming decision.

Shell 46–50 native JavaScript contracts were checked against the corresponding
upstream sources. Only Shell 50.6 was tested in a live compositor; full desktop
testing on 46–49 is still recommended.

For the website picture upload use `docs/images/showcase.png`. It compares
default Activities with the extension disabled against organized app stacks,
using the same 13 real windows with sample documents. Original source captures
are included in that directory. The media belongs outside the runtime ZIP.
