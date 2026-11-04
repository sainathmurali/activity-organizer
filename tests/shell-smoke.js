// Isolated GNOME compositor integration test; does not touch the desktop session.
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import {WorkspaceLayout} from 'resource:///org/gnome/shell/ui/workspace.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

export const METRICS = {};
function check(value, message) {
    if (!value)
        throw new Error(message);
}
function stableHelperIdentity(organizer) {
    // PerfHelper has no desktop file: Shell gives it a new window:<n> app ID
    // after its last window closes. Production desktop apps have stable IDs.
    const liveItems = organizer._liveItems;
    organizer._liveItems = function () {
        return liveItems.call(this).map(item => ({...item,
            appId: item.appId.startsWith('window:') ? 'org.gnome.Shell.PerfHelper.desktop' : item.appId}));
    };
}
async function screenshot(suffix) {
    const path = GLib.getenv('ACTIVITY_ORGANIZER_SCREENSHOT') ?? '/tmp/activity-organizer-current';
    const stream = Gio.File.new_for_path(`${path}-${suffix}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
    const shot = new Shell.Screenshot();
    await new Promise((resolve, reject) => shot.screenshot(false, stream, (object, result) => {
        try { object.screenshot_finish(result); resolve(); } catch (error) { reject(error); }
    }));
    stream.close(null);
}
async function rightClick(preview, organizer) {
    const [x, y] = preview.window_container.get_transformed_position();
    const [width, height] = preview.window_container.get_transformed_size();
    // Exercise capture without the headless pointer warp dismissing Activities.
    const event = type => ({type: () => type, get_button: () => Clutter.BUTTON_SECONDARY,
        get_coords: () => [x + width / 2, y + height / 2]});
    check(organizer._captureContextClick(event(Clutter.EventType.BUTTON_PRESS)) === Clutter.EVENT_STOP,
        'Right press should be consumed before native click/drag gestures');
    organizer._captureContextClick(event(Clutter.EventType.BUTTON_RELEASE));
    await Scripting.sleep(180);
}
async function preferences(extension) {
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE});
    launcher.setenv('GSETTINGS_BACKEND', 'memory', true);
    const libraryDir = ['/usr/lib64/gnome-shell', '/usr/lib/gnome-shell', '/usr/lib/x86_64-linux-gnu/gnome-shell']
        .find(path => Gio.File.new_for_path(`${path}/girepository-1.0/Shew-0.typelib`).query_exists(null));
    check(libraryDir, 'Could not find GNOME preferences support library');
    launcher.setenv('GI_TYPELIB_PATH', `${libraryDir}/girepository-1.0:${GLib.getenv('GI_TYPELIB_PATH') ?? ''}`, true);
    launcher.setenv('LD_LIBRARY_PATH', `${libraryDir}:${GLib.getenv('LD_LIBRARY_PATH') ?? ''}`, true);
    const path = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('prefs-smoke.js').get_path();
    const process = launcher.spawnv(['gjs', '-m', path, extension.path]);
    const [, stdout, stderr] = await new Promise((resolve, reject) => {
        process.communicate_utf8_async(null, null, (object, result) => {
            try { resolve(object.communicate_utf8_finish(result)); } catch (error) { reject(error); }
        });
    });
    check(process.get_successful(), `Preferences failed: ${stderr}`);
    print(stdout);
}

export async function run() {
    await Scripting.sleep(1500);
    while (Main.layoutManager._startingUp)
        await Scripting.sleep(100);
    const extension = Main.extensionManager.lookup('activityOrganizer@sainathmurali.github.io');
    let organizer = extension?.stateObj;
    check(organizer?._injections, `Extension failed to enable: ${extension?.error}`);
    stableHelperIdentity(organizer);
    new Gio.Settings({schema_id: 'org.gnome.desktop.search-providers'}).set_boolean('disable-external', true);
    for (let i = 0; i < 6; i++)
        await Scripting.createTestWindow({width: 800, height: 540});
    await Scripting.waitTestWindows();
    // Mapping/focusing the helper app can dismiss GNOME's startup overview.
    // Let that transition finish before entering the overview under test.
    await Scripting.sleep(800);
    Main.overview.hide();
    await Scripting.sleep(400);
    Main.overview.show();
    await Scripting.sleep(600);
    while (Main.overview.animationInProgress)
        await Scripting.sleep(50);
    check(Main.overview.visible && !organizer._exiting, 'Overview must finish entering before input checks');
    let record = [...organizer._layouts.values()].find(item => item.specs.some(spec => spec.windows.length === 6));
    check(record, 'Six windows from one app should be a single native overview stack');
    check(!organizer._panel, 'There must not be a sidebar');
    const app = record.specs[0];
    let windows = app.windows;
    const seat = global.stage.get_context().get_backend().get_default_seat();
    const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    check(record.layout.getFocusChain().length === 1, 'Only the front window should be focusable');
    const [first, second] = record.layout._windowSlots;
    check(first[0] < second[0] + second[2] && second[0] < first[0] + first[2], 'Collapsed windows should overlap');
    check(record.toolbar.get_children().every(child => !(child instanceof St.ScrollView)), 'Toolbar must not contain a scrollbar');
    await rightClick(windows.at(-1).preview, organizer);
    check(organizer._menu?.isOpen, 'Right-click should open the collapsed window menu');
    check(!record.expandedId, 'Right-click must not expand the stack');
    organizer._menu.close();
    await Scripting.sleep(150);
    // The same _activate method handles native mouse clicks and Enter.
    windows.at(-1).preview._activate();
    await Scripting.sleep(350);
    check(Main.overview.visible, 'First click should expand instead of activating a window');
    check(record.specs[0].expanded, 'App stack should expand');
    check(record.layout.getFocusChain().length === 6, 'Expanded windows should all be focusable');
    check(windows[0].preview.overlayEnabled, 'Expanded windows should retain native close/title controls');
    await rightClick(windows[0].preview, organizer);
    check(organizer._menu?.isOpen, 'Right-click should open an expanded window menu');
    organizer._menu.close();
    await Scripting.sleep(150);
    await screenshot('expanded');
    record.toolbar.get_first_child().emit('clicked', 1);
    await Scripting.sleep(350);
    check(!record.expandedId, 'All app stacks should collapse the view');
    // Exercise a drop target and manual assignment into mixed custom groups.
    const targets = record.toolbar.get_children()[1];
    check(targets.get_first_child()._delegate.acceptDrop(windows[0].preview), 'Work drop target should accept a window');
    organizer._assign(windows[1].key, 'work');
    organizer._assign(windows[2].key, 'personal');
    organizer._assign(windows[3].key, 'personal');
    await Scripting.sleep(400);
    check(record.specs.length === 3, 'Expected Work, Personal, and an automatic app stack');
    check(record.specs.find(spec => spec.customId === 'work').windows.length === 2, 'Custom stack should contain assigned windows');
    organizer._saveSession('work');
    organizer._expand(record, 'custom:work');
    await Scripting.sleep(350);
    const windowAction = record.windowActions.get(windows[0].preview);
    check(windowAction.actor.visible, 'Expanded windows need a visible grouping menu');
    windowAction.actor.emit('clicked', 1);
    organizer._menu._getMenuItems().find(item => item.label?.text === 'Move to Personal').activate(null);
    await Scripting.sleep(350);
    check(organizer._groupItems('work').length === 1 && organizer._groupItems('personal').length === 3,
        'Move action must update both groups');
    check(organizer._versions('work').find(version => version.automatic).windows.length === 1,
        'Moving out must update the automatic save');
    organizer._windowMenu(windows[0].preview);
    organizer._menu._getMenuItems().find(item => item.label?.text === 'Remove from group').activate(null);
    await Scripting.sleep(350);
    check(organizer._groupItems('personal').length === 2, 'Remove action must return a window to its app stack');
    organizer._assign(windows[0].key, 'work');
    await Scripting.sleep(350);
    await screenshot('stacks');
    // Verify a window's right-click menu and a group-level workspace operation.
    organizer._windowMenu(windows[0].preview);
    check(organizer._menu.isOpen, 'Window grouping menu should open');
    organizer._menu.close();
    // Exercise a real Escape key with animations enabled, while other stacks are
    // hidden by an expanded group. They must fade back in before the landing.
    organizer._expand(record, 'custom:work');
    await Scripting.sleep(350);
    const hidden = record.specs.find(spec => spec.hidden).windows[0].preview;
    check(hidden.opacity === 0, 'Other stacks should be hidden during expansion');
    keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Escape, Clutter.KeyState.RELEASED);
    await Scripting.sleep(80);
    check(organizer._exiting, 'Escape should start the exit transition');
    check(hidden.opacity > 0 && hidden.opacity < 255, 'Hidden windows should fade back in during the exit');
    const expectedOrder = global.display.sort_windows_by_stacking([...record.layout._windows.keys()].map(preview => preview.metaWindow));
    const actualOrder = record.layout._container.get_children().filter(actor => record.layout._windows.has(actor)).map(preview => preview.metaWindow);
    check(actualOrder.every((window, index) => window === expectedOrder[index]), 'Landing Z order must match the desktop');
    await Scripting.sleep(400);
    Main.overview.show();
    await Scripting.sleep(600);
    record = [...organizer._layouts.values()].find(item => item.specs.some(spec => spec.customId === 'work'));
    check(record, 'Stacks should return after reopening Activities');
    windows = record.specs.flatMap(spec => spec.windows);
    const workspace = global.workspace_manager.get_workspace_by_index(1);
    const work = record.specs.find(spec => spec.customId === 'work');
    organizer._moveStack(work, workspace);
    await Scripting.sleep(500);
    check(work.windows.every(item => item.key.get_workspace() === workspace), 'Moving a stack should move all its windows');
    organizer._newGroup();
    check(organizer._dialog, 'Create group dialog should open');
    organizer._dialog.close();
    await Scripting.sleep(300);
    Main.overview.searchEntry.set_text('Settings');
    await Scripting.sleep(200);
    Main.overview.searchEntry.set_text('');
    Main.overview.dash.showAppsButton.checked = true;
    await Scripting.sleep(300);
    Main.overview.dash.showAppsButton.checked = false;
    await Scripting.sleep(300);
    await preferences(extension);
    organizer._saveSession('work');
    const savedWork = JSON.stringify(organizer._versions('work'));
    // Disable must restore both the layout hook and modified native preview state.
    const patchedSlots = WorkspaceLayout.prototype._getWindowSlots;
    await Main.extensionManager.disableExtension('activityOrganizer@sainathmurali.github.io');
    check(WorkspaceLayout.prototype._getWindowSlots !== patchedSlots, 'Original native layout method must be restored');
    check(organizer._layouts.size === 0, 'Decorations and layout records should be removed');
    await Scripting.sleep(300);
    const survivingPreviews = windows.filter(item => !item.preview._destroyed);
    check(survivingPreviews.every(item => item.preview.reactive && item.preview._icon.visible), 'Native previews should be restored');
    await Main.extensionManager.enableExtension('activityOrganizer@sainathmurali.github.io');
    await Scripting.sleep(300);
    organizer = extension.stateObj;
    stableHelperIdentity(organizer);
    check(organizer._layouts.size > 0, 'Stacks should work after enabling again');
    check(JSON.stringify(organizer._versions('work')) === savedWork, 'Saved versions must survive re-enabling');
    await Scripting.destroyTestWindows();
    await Scripting.sleep(1000);
    check([...organizer._layouts.values()].every(item => item.specs.length === 0), 'Closed windows should leave no stale stacks');
    check(JSON.stringify(organizer._versions('work')) === savedWork, 'Closing windows must retain saved versions');
    let launches = 0;
    const launch = organizer._launchSavedWindow;
    organizer._launchSavedWindow = () => {
        launches++;
        Scripting.createTestWindow({width: 800, height: 540});
    };
    organizer._restoreSession('work', organizer._versions('work')[0]);
    for (let i = 0; organizer._restoreTimer && i < 65; i++)
        await Scripting.sleep(100);
    check(!organizer._restoreTimer && launches === 2 && organizer._groupItems('work').length === 2,
        `Saved group must reopen and assign the saved number of app windows: ${JSON.stringify({
            launches, timer: organizer._restoreTimer, count: organizer._groupItems('work').length,
            active: organizer._restoreActive?.appId, live: organizer._liveItems().map(item => item.appId),
            saved: organizer._versions('work')[0].windows})}`);
    organizer._restoreSession('work', organizer._versions('work')[0]);
    check(!organizer._restoreTimer && launches === 2, 'Reopening a complete group must not duplicate windows');
    organizer._launchSavedWindow = launch;
    organizer._restoreSession('work', {...organizer._versions('work')[0], windows: [
        ...organizer._versions('work')[0].windows, organizer._versions('work')[0].windows[0]]});
    await Main.extensionManager.disableExtension('activityOrganizer@sainathmurali.github.io');
    check(!organizer._restoreTimer && !organizer._restoreQueue.length && !organizer._restoreActive,
        'Disable must cancel pending restoration');
    await Scripting.destroyTestWindows();
    print('Activity Organizer native stack smoke checks passed');
}
