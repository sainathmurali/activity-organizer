# Changelog

## Version 4.1.0

- Drop windows directly onto another window or stack to create temporary groups.
- Drop onto group thumbnails or headers to add windows; collapsed stacks move together and expanded stacks let you select a window.
- Reveal other stacks during a selected-window drag and preserve that selection while the source collapses.
- Promote a temporary group to a named, saved group from its right-click menu.
- Add right-click group actions, including normal closure of all group windows and ungrouping temporary groups.
- Remove the redundant App stacks button from the default view; show Back only while expanded.
- Add a real default-Activities versus organized-stacks showcase and its source captures.

## Version 4.0.1

- Prepare metadata for GNOME Extensions review using `version-name` instead of a developer-assigned numeric version.
- Make dialog teardown synchronous on disable, including during its closing animation.
- Clarify native popup-manager ownership and remove its unnecessary retained reference.
- Check the submission ZIP with Shexli 0.2.1: zero findings.

## Version 4

- Save app/window counts in persistent custom-group sessions, with automatic saves and up to ten saved versions.
- Reopen fresh app windows into a saved group, counting existing group members to avoid duplicates.
- Add visible per-window Group/Move menus with removal and direct moves between groups.
- Update automatic saves when membership changes and retain snapshots when windows close.
- Manage saved versions in preferences and cancel pending launches when disabled.

## Version 3

- Native overlapping app stacks and expandable custom groups in Activities.
- Inline group drop targets with overflow, captured right-click menus, and improved desktop return order.
