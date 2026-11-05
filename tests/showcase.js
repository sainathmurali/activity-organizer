// Capture genuine default/organized Activities views in a disposable session.
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

export const METRICS = {};
const uuid = 'activityOrganizer@sainathmurali.github.io';
const directory = '/tmp/activity-organizer-showcase-sample';
const liveWindows = () => global.get_window_actors().map(actor => actor.meta_window).filter(window => !window.skip_taskbar);

async function capture(name) {
    const stream = Gio.File.new_for_path(`/tmp/activity-organizer-${name}.png`)
        .replace(null, false, Gio.FileCreateFlags.NONE, null);
    const screenshot = new Shell.Screenshot();
    await new Promise((resolve, reject) => screenshot.screenshot(false, stream, (object, result) => {
        try { object.screenshot_finish(result); resolve(); } catch (error) { reject(error); }
    }));
    stream.close(null);
}

export async function run() {
    while (Main.layoutManager._startingUp)
        await Scripting.sleep(100);
    new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'}).set_boolean('show-banners', false);
    new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}).set_string('color-scheme', 'prefer-dark');
    new Gio.Settings({schema_id: 'org.gnome.desktop.search-providers'}).set_boolean('disable-external', true);
    await Main.extensionManager.disableExtension(uuid);
    Main.overview.hide();
    for (const folder of ['Projects', 'Research', 'Design', 'Notes']) {
        const path = `${directory}/${folder}`;
        GLib.mkdir_with_parents(`${path}/Archive`, 0o755);
        GLib.file_set_contents(`${path}/Brief.md`, `# ${folder}\n\nActivity Organizer demo workspace\n\n## Overview\n\nKeep related windows together.\nMove between focused work and the big picture.\n\n## Today\n\n- Review the project brief\n- Gather references and notes\n- Plan the next iteration\n- Share a clean workspace\n\n## Working notes\n\nThis is a sample document for the public screenshot.\nNo personal files are shown.\n`);
        GLib.file_set_contents(`${path}/Tasks.md`, `# ${folder} — tasks\n\n[ ] Explore the initial ideas\n[ ] Review the outline\n[ ] Organize the working files\n[ ] Prepare the next version\n\n## Next steps\n\nStart with the most useful task.\nKeep the windows you need close at hand.\n`);
        for (const name of ['Meeting notes.txt', 'References.txt', 'Roadmap.txt', 'Checklist.txt', 'Ideas.txt'])
            GLib.file_set_contents(`${path}/${name}`, `${folder} — sample ${name}\n`);
    }
    const processes = [];
    const launch = args => processes.push(Gio.Subprocess.new(args, Gio.SubprocessFlags.NONE));
    for (const folder of ['Projects', 'Research', 'Design', 'Notes']) {
        launch(['gedit', '--standalone', '--new-window', `${directory}/${folder}/Brief.md`]);
        launch(['gnome-text-editor', '--standalone', `${directory}/${folder}/Tasks.md`]);
        launch(['nautilus', '--new-window', `${directory}/${folder}`]);
        await Scripting.sleep(350);
    }
    launch(['gnome-calculator', '--equation=1280*720']);
    for (let i = 0; liveWindows().length < 13 && i < 80; i++)
        await Scripting.sleep(150);
    print(`Showcase mapped ${liveWindows().length} real sample app windows`);
    if (liveWindows().length < 10)
        throw new Error('Not enough real app windows mapped for the comparison');
    await Scripting.sleep(800);
    Main.overview.show();
    await Scripting.sleep(1500);
    const before = new Set(liveWindows());
    await capture('default-activities');
    Main.overview.hide();
    await Scripting.sleep(400);
    await Main.extensionManager.enableExtension(uuid);
    const extension = Main.extensionManager.lookup(uuid).stateObj;
    extension._settings.set_string('groups', '[]');
    Main.overview.show();
    await Scripting.sleep(1500);
    if (liveWindows().length !== before.size || liveWindows().some(window => !before.has(window)))
        throw new Error('The comparison must show exactly the same app windows');
    await capture('organized-activities');
    print('Activity Organizer real before/after showcase captures saved');
    Main.overview.hide();
    for (const process of processes)
        process.force_exit();
}
