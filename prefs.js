import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {parseGroups} from './lib/groups.js';
import {parseSessions, versionLabel} from './lib/sessions.js';

export default class OrganizerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(680, 760);
        const page = new Adw.PreferencesPage({title: 'Activity Organizer', icon_name: 'view-list-symbolic'});
        window.add(page);

        const behavior = new Adw.PreferencesGroup({title: 'Activities overview'});
        const show = new Adw.SwitchRow({
            title: 'Start with collapsed app stacks',
            subtitle: 'Click a stack to expand its windows. Click Back to return.',
        });
        settings.bind('collapse-on-overview', show, 'active', Gio.SettingsBindFlags.DEFAULT);
        behavior.add(show);
        const autosave = new Adw.SwitchRow({
            title: 'Automatically save custom group sessions',
            subtitle: 'Remember the apps and window counts when adding windows. Closing windows keeps the saved session.',
        });
        settings.bind('autosave-group-sessions', autosave, 'active', Gio.SettingsBindFlags.DEFAULT);
        behavior.add(autosave);
        page.add(behavior);

        const rules = new Adw.PreferencesGroup({
            title: 'Custom groups',
            description: 'Rules are checked from top to bottom; the first matching group wins. ' +
                'When both application IDs and title text are set, both must match. ' +
                'Empty rules leave a group available for manual assignments.',
        });
        page.add(rules);
        const appIds = new Adw.PreferencesGroup({
            title: 'Application IDs',
            description: 'Use exact desktop IDs in rules, for example org.gnome.Terminal.desktop. ' +
                'For browser work, match the window title as well (for example a project name). ' +
                'Individual browser tabs are not exposed to this extension.',
        });
        const apps = Gio.AppInfo.get_all().filter(app => app.should_show())
            .sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));
        const appRow = new Adw.ExpanderRow({title: 'Look up installed application IDs'});
        for (const app of apps) {
            if (app.get_id())
                appRow.add_row(new Adw.ActionRow({title: app.get_display_name(), subtitle: app.get_id()}));
        }
        appIds.add(appRow);
        page.add(appIds);

        const savedGroup = new Adw.PreferencesGroup({
            title: 'Saved sessions',
            description: 'Saved app/window versions survive closing apps, logging out, and rebooting. ' +
                'Use a group’s ↻ button in Activities to reopen it. App contents are managed by each app.',
        });
        page.add(savedGroup);
        let savedRows = [];
        const renderSaved = () => {
            savedRows.forEach(row => savedGroup.remove(row));
            savedRows = [];
            const add = row => { savedGroup.add(row); savedRows.push(row); };
            let sessions;
            try {
                sessions = parseSessions(settings.get_string('saved-sessions'));
            } catch (error) {
                const row = new Adw.ActionRow({title: 'Saved sessions could not be read', subtitle: error.message});
                const reset = new Gtk.Button({label: 'Reset saved sessions', valign: Gtk.Align.CENTER});
                reset.connect('clicked', () => { settings.reset('saved-sessions'); renderSaved(); });
                row.add_suffix(reset);
                add(row);
                return;
            }
            const groups = (() => { try { return parseGroups(settings.get_string('groups')); } catch { return []; } })();
            for (const session of sessions) {
                if (!session.versions.length)
                    continue;
                const group = groups.find(item => item.id === session.groupId);
                const row = new Adw.ExpanderRow({title: group?.name ?? 'Deleted group',
                    subtitle: `${session.versions.length} saved versions`});
                for (const version of session.versions) {
                    const counts = new Map();
                    for (const window of version.windows)
                        counts.set(window.appId, (counts.get(window.appId) ?? 0) + 1);
                    const description = [...counts].map(([id, count]) =>
                        `${apps.find(app => app.get_id() === id)?.get_display_name() ?? id} × ${count}`).join(' · ');
                    const item = new Adw.ActionRow({title: versionLabel(version), subtitle: description});
                    const remove = new Gtk.Button({label: 'Remove version', valign: Gtk.Align.CENTER});
                    remove.connect('clicked', () => {
                        const current = parseSessions(settings.get_string('saved-sessions'));
                        const updated = current.map(saved => saved.groupId === session.groupId ?
                            {...saved, versions: saved.versions.filter(entry => entry.id !== version.id)} : saved)
                            .filter(saved => saved.versions.length);
                        settings.set_string('saved-sessions', JSON.stringify(updated));
                        renderSaved();
                    });
                    item.add_suffix(remove);
                    row.add_row(item);
                }
                add(row);
            }
            if (!savedRows.length)
                add(new Adw.ActionRow({title: 'No saved sessions yet',
                    subtitle: 'Add windows to a custom group, or choose Save session version from its ⋯ menu.'}));
        };

        let rows = [];
        const toast = text => window.add_toast(new Adw.Toast({title: text}));
        const save = groups => settings.set_string('groups', JSON.stringify(groups));
        const read = () => parseGroups(settings.get_string('groups'));
        const split = text => [...new Set(text.split(',').map(value => value.trim()).filter(Boolean))];
        const render = () => {
            rows.forEach(row => rules.remove(row));
            rows = [];
            const add = row => { rules.add(row); rows.push(row); };
            let groups;
            try {
                groups = read();
            } catch (error) {
                const invalid = new Adw.ActionRow({title: 'Invalid group configuration', subtitle: error.message});
                const reset = new Gtk.Button({label: 'Restore defaults', valign: Gtk.Align.CENTER});
                reset.connect('clicked', () => {
                    settings.reset('groups');
                    render();
                });
                invalid.add_suffix(reset);
                add(invalid);
                return;
            }
            groups.forEach((group, index) => {
                const row = new Adw.ExpanderRow({
                    title: group.name,
                    subtitle: `${group.appIds.length} application IDs · ${group.titlePatterns.length} title matches`,
                });
                const name = new Adw.EntryRow({title: 'Group name', text: group.name});
                const ids = new Adw.EntryRow({title: 'Application IDs (comma separated)', text: group.appIds.join(', ')});
                const titles = new Adw.EntryRow({title: 'Title contains (comma separated)', text: group.titlePatterns.join(', ')});
                row.add_row(name);
                row.add_row(ids);
                row.add_row(titles);
                const actions = new Adw.ActionRow({title: 'Save rules or change priority'});
                const apply = new Gtk.Button({label: 'Apply', valign: Gtk.Align.CENTER});
                apply.add_css_class('suggested-action');
                apply.connect('clicked', () => {
                    if (!name.text.trim()) {
                        toast('Enter a group name.');
                        return;
                    }
                    const current = read();
                    const target = current.find(item => item.id === group.id);
                    if (!target)
                        return;
                    Object.assign(target, {
                        name: name.text.trim(), appIds: split(ids.text), titlePatterns: split(titles.text),
                    });
                    save(current);
                    row.title = target.name;
                    row.subtitle = `${target.appIds.length} application IDs · ${target.titlePatterns.length} title matches`;
                    toast('Group saved');
                });
                actions.add_suffix(apply);
                const up = new Gtk.Button({label: 'Move up', valign: Gtk.Align.CENTER, sensitive: index > 0});
                up.connect('clicked', () => {
                    const current = read();
                    const position = current.findIndex(item => item.id === group.id);
                    if (position > 0) {
                        [current[position - 1], current[position]] = [current[position], current[position - 1]];
                        save(current);
                        render();
                    }
                });
                actions.add_suffix(up);
                const remove = new Gtk.Button({label: 'Delete', valign: Gtk.Align.CENTER});
                remove.add_css_class('destructive-action');
                remove.connect('clicked', () => {
                    save(read().filter(item => item.id !== group.id));
                    try {
                        const sessions = parseSessions(settings.get_string('saved-sessions'));
                        settings.set_string('saved-sessions', JSON.stringify(sessions.filter(session => session.groupId !== group.id)));
                    } catch {
                        // Preserve malformed settings for the explicit reset control.
                    }
                    render();
                    renderSaved();
                    toast('Group deleted; its windows now follow the remaining rules.');
                });
                actions.add_suffix(remove);
                row.add_row(actions);
                add(row);
            });
            const newRow = new Adw.ActionRow({title: 'Add a group', subtitle: 'Work, Research, Personal, or a specific project'});
            const entry = new Gtk.Entry({placeholder_text: 'Group name', valign: Gtk.Align.CENTER});
            const create = () => {
                const name = entry.text.trim();
                if (!name) {
                    toast('Enter a group name.');
                    return;
                }
                save([...read(), {id: GLib.uuid_string_random(), name, appIds: [], titlePatterns: []}]);
                render();
            };
            entry.connect('activate', create);
            newRow.add_suffix(entry);
            const addButton = new Gtk.Button({label: 'Add', valign: Gtk.Align.CENTER});
            addButton.connect('clicked', create);
            newRow.add_suffix(addButton);
            add(newRow);
        };
        render();
        renderSaved();
    }
}
