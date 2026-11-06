Activity Organizer 4.2.0 adds GNOME Shell 46–49 alongside Shell 50.

Supported versions: 46, 47, 48, 49, 50.

The overview layout, overlay/focus, activation, and drag/drop contracts were checked against the native JavaScript from all five upstream release branches. Unit tests, strict schema validation, and Shexli 0.2.1 pass with zero findings.

Only Shell 50.6 has been tested in a live compositor here. The compatibility harness uses backend substitutes and does not replace desktop testing on 46–49.

The preferences hint now uses the current Back button label. Documentation has been simplified.

The UUID and settings schema are unchanged. Install the .shell-extension.zip asset and log out and back in to load the update. GNOME Extensions submission and approval are separate from this GitHub release.
