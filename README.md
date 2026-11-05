# Activity Organizer

Mission Control-style **window stacks in the GNOME Activities overview**, for GNOME Shell 50. Press Super or use the hot corner: VS Code windows stack together, browser windows stack together, Files windows stack together, and so on.

This replaces the overview's window arrangement. It is not a sidebar or a separate window list.

Author identity: [sainathmurali](https://github.com/sainathmurali), using the same `sainathmurali.github.io` namespace and `bionichuman` donation entry as Top Panel Note.

![Default Activities compared with the same 13 windows organized into four app stacks](docs/images/showcase.png)

The showcase uses real captures with the extension disabled/enabled in an isolated GNOME session. The same 13 windows are open in both views, with sample documents. The combined graphic was composed with the built-in image-generation tool; the unmodified [default](docs/images/default-activities.png) and [organized](docs/images/organized-activities.png) captures are also available.

## Using stacks

- Each app has one overlapping stack with an app label and window count. Rear windows peek out behind the front window.
- Click a stack (or its label) to expand its windows across the overview. Other stacks hide while it is expanded.
- Click an expanded window to activate it. Native window titles, close controls, workspace navigation, and window dragging remain available.
- Click **Back** or the expanded stack's label to collapse it. The default view has no redundant App stacks button.
- A single app window opens directly when clicked; its label can still expand it.

Stacks are per workspace and monitor, following GNOME's native window membership. They do not mix windows from unrelated workspaces into one desktop.

## Custom groups

Drag a window directly onto another window or a stack to group them without creating a saved group first. Dropping onto an automatic app stack creates a **temporary group**. Dropping onto an existing group adds to that group. Dragging a collapsed stack moves its windows together; expand first to select one window. Starting a drag from an expanded group reveals other stacks as drop destinations. The source window remains selected throughout that drag.

Temporary groups are labeled **(temporary)**, do not appear in preferences or the saved-group toolbar, and are not written to saved sessions. They survive ordinary overview open/close cycles while the extension stays enabled, and disappear when emptied, disabled, or logged out. Right-click their stack or its header and choose **Save as reusable group…** to name and save the current app/window membership. **Ungroup windows** dissolves a temporary group without closing its windows.

Click **+ Group** in the overview to create a named group, such as Work or Project Atlas. Drag a window onto that group's name in the toolbar, or right-click a window and choose **Add to Work**. A custom group can contain windows from different apps, and expands exactly like an app stack. Empty groups remain available as drop targets in the toolbar.

For example, Work can contain one VS Code window, two browser windows, and a Files window. Other windows from those apps stay in their automatic app stacks. Expand an app stack first to choose a particular rear window for a custom group.

Expand a stack and click **Move ▾** on a window to choose **Remove from group** or **Move to another group**. Removing returns the window to its app stack, even when a rule would match it. **Group ▾** adds an app-stack window to a custom group. The same actions are available by right-click. **Use automatic grouping rules** clears a manual override.

Right-click a collapsed stack or its header, or use **⋯**, for group actions. **Close all windows in group** requests normal app-window closure; apps can show their usual unsaved-document prompts. Saved groups retain their last session for reopening. An expanded window's menu also offers **Group actions…**. The same group menu moves the stack to another workspace, including a new workspace. Pinned windows remain pinned.

Group definitions and saved sessions persist across logout and reboot. By default, adding, moving, or removing windows updates an automatic save of each affected group. Closing windows keeps the last saved session available for reopening. Use **⋯ → Save session version** to retain a separate snapshot; up to ten versions are kept per group. **Save as reusable group** turns an app stack into a saved group.

Choose a **Reopen** version from the group's **⋯** menu, or click an empty saved group's **↻** toolbar button. The extension opens the saved number of windows for each application and places the new windows into that group on the current workspace. Existing windows already in that group count toward the total. It opens fresh app windows; documents, browser pages, internal tabs, window geometry, and app state are not restored. Apps that cannot create another window or are no longer installed are reported without deleting the saved version. Preferences lists saved versions and lets you remove them.

Group names use inline toolbar buttons, with **More** for overflow. The toolbar does not scroll. Right-click is intercepted before GNOME's window click/drag gestures, and opens its menu on release. When leaving Activities, windows return in the desktop's real stacking order. Windows hidden by an expanded stack fade back into the desktop during the transition.

## Preferences and rules

Open **⚙** in the overview toolbar, or run:

```sh
gnome-extensions prefs activityOrganizer@sainathmurali.github.io
```

Rename/delete groups, change rule priority, and configure exact application IDs and window-title fragments. Use the installed application ID lookup to find IDs for your apps. Expand a group, edit its fields, then press **Apply**.

Rules are case insensitive. Comma separated values within a field are alternatives; when both app IDs and title fragments are filled, both must match. The first matching group wins. Groups with empty rules only accept manual assignments. Custom groups take priority over automatic app stacks, and manual assignments override rules.

Example: application ID `code.desktop` and title contains `Atlas` automatically groups matching VS Code project windows. Use your installed app's actual ID. Commas cannot be included within an individual match.

The preference **Start with collapsed app stacks** resets expansion when you enter Activities. Turning it off preserves expansion for as long as GNOME keeps that workspace overview alive.

The grouped items are app **windows**, as shown in Activities. Internal browser/editor/terminal tabs remain inside their apps. A browser's exposed window title may change when its active tab changes, which can affect title-based rules.

## Install or update

Requirements: GNOME Shell **50**, GTK 4/libadwaita, GJS, `gnome-extensions`, and `glib-compile-schemas`. There are no npm dependencies. Node is only used for developer checks.

From this directory, build and install:

```sh
mkdir -p dist
npm run pack
gnome-extensions install --force dist/activityOrganizer@sainathmurali.github.io.shell-extension.zip
```

Log out and log back in to load the newly installed or updated code, then:

```sh
gnome-extensions enable activityOrganizer@sainathmurali.github.io
```

The packaged ZIP in `dist/` is release 4.1.0 under `activityOrganizer@sainathmurali.github.io`. The release uses `version-name`; extensions.gnome.org assigns its own numeric submission version. The earlier `activity-organizer@local` prototype is a separate extension and should be disabled if installed. Building or testing does not enable the extension in your desktop session.

To restore GNOME's original layout:

```sh
gnome-extensions disable activityOrganizer@sainathmurali.github.io
```

## Validation

```sh
npm test
npm run check
npm run pack
```

Unit tests cover app/custom grouping, rule priority and overrides, stack geometry, saved-version validation and retention, window-count restoration, and automatic-save updates. The isolated GNOME test also exercises visible move/remove menus, persistence after closing windows and re-enabling the extension, restoration with fresh helper windows, duplicate prevention, and cancellation on disable. Helper launch/identity adapters stand in for installed desktop apps during restoration tests.

An isolated **GNOME Shell 50.6** smoke test uses six actual test windows to verify native stacks, expansion, focus, native overlays, group drop handlers, workspace moves, preferences, disable/re-enable, method restoration, and window cleanup. With animations enabled it sends Escape through a virtual keyboard and checks desktop Z order and hidden-window opacity during exit. Synthetic right-button press/release events exercise the capture handler; the headless virtual pointer otherwise dismisses Activities mid-test. Physical right-click and touch/drag behavior still need desktop verification, along with multiple monitors and other overview extensions. The headless compositor still emits allocation warnings around overview/app-grid transitions; the assertions verify behavior, not measured frame pacing.

Repeat that smoke test in a disposable headless compositor:

```sh
timeout 60s dbus-run-session -- gnome-shell-test-tool \
  --headless \
  --extension dist/activityOrganizer@sainathmurali.github.io.shell-extension.zip \
  tests/shell-smoke.js
```

This uses temporary extension/settings directories. Captures default to `/tmp/activity-organizer-current-stacks.png` and `-expanded.png`. Override the prefix with `ACTIVITY_ORGANIZER_SCREENSHOT`. The preferences harness locates GNOME's private support library in common Fedora/Debian library paths.

The smoke test also covers temporary window-on-window grouping, group-header drops, revealing destinations during drag, promotion to a saved group, group closing, and removal of the default App stacks button. Physical pointer movement still needs desktop testing; native drag handlers and signals are exercised directly in the test.

To recreate the public before/after screenshots with real apps and harmless sample documents (requires gedit, Text Editor, Files, and Calculator):

```sh
timeout 90s dbus-run-session -- gnome-shell-test-tool --headless \
  --extra-filter Gedit --extra-filter org.gnome.TextEditor \
  --extra-filter org.gnome.Nautilus --extra-filter org.gnome.Calculator \
  --extension dist/activityOrganizer@sainathmurali.github.io.shell-extension.zip \
  tests/showcase.js
```

This writes `/tmp/activity-organizer-default-activities.png` and `/tmp/activity-organizer-organized-activities.png`, verifies the same windows appear in both views, and leaves your desktop extension settings unchanged. The source documents are created under `/tmp/activity-organizer-showcase-sample`. The showcase composition prompt is in `docs/images/showcase-prompt.txt`.

Only GNOME 50 is declared supported. The extension uses GNOME's native `WindowPreview` actors and changes the `WorkspaceLayout` slot calculation using `InjectionManager`. Disable restores the methods, preview flags/icons, decorations, timers, and signals. Extensions that also replace the overview window layout may conflict. For errors, inspect `journalctl --user -f -o cat`.

References: [GNOME extension development](https://gjs.guide/extensions/development/creating.html), [method overrides](https://gjs.guide/extensions/topics/extension.html), [GNOME 50 workspace layout](https://github.com/GNOME/gnome-shell/blob/gnome-50/js/ui/workspace.js).

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
