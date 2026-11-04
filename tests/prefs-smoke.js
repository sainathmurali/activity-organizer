// Invoked by shell-smoke.js with an installed extension directory.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource'));
Adw.init();
const directory = Gio.File.new_for_path(ARGV[0]);
const [, bytes] = directory.get_child('metadata.json').load_contents(null);
const metadata = JSON.parse(new TextDecoder().decode(bytes));
metadata.dir = directory;
metadata.path = directory.get_path();
const {default: Preferences} = await import(directory.get_child('prefs.js').get_uri());
const preferences = new Preferences(metadata);
const window = new Adw.PreferencesWindow();
preferences.fillPreferencesWindow(window);

function check(value, message) {
    if (!value)
        throw new Error(message);
}

function widgets(parent) {
    const children = [parent];
    for (let child = parent.get_first_child(); child; child = child.get_next_sibling())
        children.push(...widgets(child));
    return children;
}

let all = widgets(window);
check(all.some(widget => widget instanceof Adw.SwitchRow), 'Missing overview preference');
check(all.filter(widget => widget instanceof Adw.EntryRow).length === 6, 'Expected two editable groups');
const name = all.find(widget => widget instanceof Gtk.Entry && widget.placeholder_text === 'Group name');
check(name, 'Missing add-group entry');
name.text = 'Research';
all.find(widget => widget instanceof Gtk.Button && widget.label === 'Add').emit('clicked');
const settings = preferences.getSettings();
check(JSON.parse(settings.get_string('groups')).length === 3, 'Add group did not save');
all = widgets(window);
const entries = all.filter(widget => widget instanceof Adw.EntryRow);
entries[0].text = 'Project Atlas';
all.find(widget => widget instanceof Gtk.Button && widget.label === 'Apply').emit('clicked');
check(JSON.parse(settings.get_string('groups'))[0].name === 'Project Atlas', 'Apply did not save');
all.find(widget => widget instanceof Gtk.Button && widget.label === 'Delete').emit('clicked');
check(JSON.parse(settings.get_string('groups')).length === 2, 'Delete did not save');
window.destroy();
settings.set_string('saved-sessions', JSON.stringify([{groupId: 'personal', versions: [{
    id: 'saved-test', createdAt: '2026-11-04T07:00:00.000Z', automatic: false,
    windows: [{appId: 'org.gnome.Nautilus.desktop', title: 'Files'}],
}]}]));
const savedWindow = new Adw.PreferencesWindow();
preferences.fillPreferencesWindow(savedWindow);
const removeVersion = widgets(savedWindow).find(widget => widget instanceof Gtk.Button && widget.label === 'Remove version');
check(removeVersion, 'Saved session versions must have a removal control');
removeVersion.emit('clicked');
check(JSON.parse(settings.get_string('saved-sessions')).length === 0, 'Remove version must persist');
savedWindow.destroy();
print('Activity Organizer preferences smoke checks passed');
