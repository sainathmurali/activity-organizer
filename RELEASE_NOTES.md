Activity Organizer 4.0.1 prepares the extension for GNOME Extensions review.

- Use `version-name` for the visible release number and leave numeric submission
  version assignment to extensions.gnome.org.
- Destroy an open or closing group dialog synchronously when disabling.
- Clarify native popup-manager lifetime and remove an unnecessary reference.
- Shexli 0.2.1 reports zero findings on the submission ZIP.

The display name remains Activity Organizer after checking GNOME's naming and
trademark rules. The UUID and settings schema are unchanged, preserving settings
and saved groups.

For GNOME Shell 50. Install the `.shell-extension.zip` asset with
`gnome-extensions install --force PATH`, then log out and back in.

Restoration opens fresh app windows; app contents and internal tabs are managed
by the apps. Some applications cannot open additional windows. GNOME Extensions
submission/approval is separate from this GitHub release.
