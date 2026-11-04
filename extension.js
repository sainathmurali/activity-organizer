import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {WorkspaceLayout} from 'resource:///org/gnome/shell/ui/workspace.js';
import {WindowPreview} from 'resource:///org/gnome/shell/ui/windowPreview.js';
import {parseGroups, groupForWindow, UNGROUPED} from './lib/groups.js';
import {makeStacks, layoutStacks} from './lib/stacks.js';
import {parseSessions, snapshotWindows, saveVersion, clearAutomaticVersion, planRestore, versionLabel} from './lib/sessions.js';

function row(styleClass = '') {
    return new St.BoxLayout({style_class: styleClass});
}
function textLabel(text, styleClass = '') {
    const actor = new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER});
    actor.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return actor;
}
function button(text, action) {
    const actor = new St.Button({label: text, can_focus: true, style_class: 'ao-control'});
    actor.connect('clicked', action);
    return actor;
}
function allocate(actor, bounds) {
    const box = new Clutter.ActorBox();
    box.set_origin(bounds.x, bounds.y);
    box.set_size(Math.max(1, bounds.width), Math.max(1, bounds.height));
    actor.allocate(box);
}

export default class ActivityOrganizer extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._tracker = Shell.WindowTracker.get_default();
        this._appSystem = Shell.AppSystem.get_default();
        this._layouts = new Map();
        this._previewState = new Map();
        this._previewGroups = new WeakMap();
        this._assignments = new Map();
        this._windowSignals = new Map();
        this._signals = [];
        this._pending = 0;
        this._exiting = false;
        this._rightClickPreview = null;
        this._dialogClosedId = 0;
        this._groups = [];
        this._sessions = [];
        this._restoreTimer = 0;
        this._restoreQueue = [];
        this._restoreActive = null;
        this._restoreErrors = [];
        this._readGroups();
        this._readSessions();
        this._injections = new InjectionManager();
        const owner = this;
        this._injections.overrideMethod(WorkspaceLayout.prototype, '_getWindowSlots', () => function (box) {
            return owner._slots(this, box);
        });
        this._injections.overrideMethod(WorkspaceLayout.prototype, 'vfunc_allocate', original => function (container, box) {
            original.call(this, container, box);
            owner._allocateDecorations(this, box);
        });
        this._injections.overrideMethod(WorkspaceLayout.prototype, '_syncOpacities', original => function () {
            original.call(this);
            owner._sync(this);
        });
        this._injections.overrideMethod(WorkspaceLayout.prototype, '_syncOverlay', original => function (preview) {
            original.call(this, preview);
            owner._syncPreview(preview);
            const record = owner._layouts.get(this);
            if (record)
                record.toolbar.visible = this._metaWorkspace?.active ?? true;
        });
        this._injections.overrideMethod(WorkspaceLayout.prototype, 'getFocusChain', original => function () {
            return original.call(this).filter(preview => preview.reactive);
        });
        this._injections.overrideMethod(WindowPreview.prototype, '_activate', original => function () {
            const info = owner._previewGroups.get(this);
            if (info && !info.group.expanded && (info.group.customId || info.group.windows.length > 1) && !this._closeRequested) {
                owner._expand(info.record, info.group.id);
                return;
            }
            original.call(this);
        });
        this._injections.overrideMethod(WindowPreview.prototype, '_restack', original => function () {
            original.call(this);
            const info = owner._previewGroups.get(this);
            if (info && !owner._exiting)
                owner._restack(info.record);
        });
        this._connect(this._settings, 'changed', () => {
            this._readGroups();
            this._readSessions();
            this._queueRefresh();
        });
        this._connect(Main.overview, 'showing', () => {
            this._exiting = false;
            if (this._settings.get_boolean('collapse-on-overview')) {
                for (const record of this._layouts.values())
                    record.expandedId = null;
            }
            this._refresh();
        });
        this._connect(Main.overview, 'hiding', () => this._prepareExit());
        this._connect(global.stage, 'captured-event', (_stage, event) => this._captureContextClick(event));
        this._connect(global.display, 'window-created', () => this._queueRefresh());
        this._connect(this._tracker, 'tracked-windows-changed', () => this._queueRefresh());
        const visit = actor => {
            if (actor.layout_manager instanceof WorkspaceLayout)
                this._ensureLayout(actor.layout_manager);
            for (const child of actor.get_children())
                visit(child);
        };
        visit(Main.layoutManager.overviewGroup);
        this._refresh();
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }
    _readGroups() {
        try {
            this._groups = parseGroups(this._settings.get_string('groups'));
        } catch (error) {
            console.error(`Activity Organizer: ${error.message}`);
        }
    }
    _readSessions() {
        try {
            this._sessions = parseSessions(this._settings.get_string('saved-sessions'));
            this._sessionsValid = true;
        } catch (error) {
            this._sessionsValid = false;
            console.error(`Activity Organizer saved sessions: ${error.message}`);
        }
    }
    _liveItems() {
        return global.get_window_actors().map(actor => actor.meta_window).filter(window => !window.skip_taskbar)
            .map(window => {
                const app = this._tracker.get_window_app(window);
                return {key: window, appId: app?.get_id() ?? window.get_wm_class() ?? 'unknown',
                    title: window.get_title() ?? ''};
            });
    }
    _groupItems(groupId) {
        return this._liveItems().filter(item =>
            groupForWindow(item, this._groups, this._assignments.get(item.key)) === groupId);
    }
    _saveSession(groupId, automatic = false, clearIfEmpty = false) {
        if (!this._sessionsValid)
            return;
        const windows = snapshotWindows(this._groupItems(groupId));
        if (!windows.length) {
            if (automatic && clearIfEmpty) {
                this._sessions = clearAutomaticVersion(this._sessions, groupId);
                this._settings.set_string('saved-sessions', JSON.stringify(this._sessions));
            }
            return;
        }
        const next = saveVersion(this._sessions, groupId, {
            id: GLib.uuid_string_random(), createdAt: new Date().toISOString(), automatic, windows,
        });
        if (next !== this._sessions) {
            this._sessions = next;
            this._settings.set_string('saved-sessions', JSON.stringify(next));
        }
        if (!automatic)
            Main.notify('Activity Organizer', `Saved ${windows.length} windows in ${this._groups.find(group => group.id === groupId)?.name ?? 'group'}.`);
    }
    _versions(groupId) {
        return this._sessions.find(session => session.groupId === groupId)?.versions ?? [];
    }
    _ensureLayout(layout) {
        let record = this._layouts.get(layout);
        if (record)
            return record;
        record = {layout, expandedId: null, decorations: new Map(), windowActions: new Map(), specs: [], signature: null};
        this._layouts.set(layout, record);
        record.toolbar = row('ao-toolbar');
        layout._container.add_child(record.toolbar);
        record.destroyId = layout._container.connect('destroy', () => {
            this._layouts.delete(layout);
            for (const [preview, state] of this._previewState) {
                if (state.layout === layout)
                    this._previewState.delete(preview);
            }
        });
        return record;
    }
    _watchWindows() {
        const windows = global.get_window_actors().map(actor => actor.meta_window);
        const live = new Set(windows);
        for (const [window, ids] of this._windowSignals) {
            if (!live.has(window)) {
                ids.forEach(id => window.disconnect(id));
                this._windowSignals.delete(window);
                this._assignments.delete(window);
            }
        }
        for (const window of windows) {
            if (this._windowSignals.has(window))
                continue;
            this._windowSignals.set(window, [
                window.connect('notify::title', () => this._queueRefresh()),
                window.connect('unmanaged', () => this._queueRefresh()),
            ]);
        }
    }
    _queueRefresh() {
        if (this._pending)
            return;
        this._pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
            this._pending = 0;
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }
    _refresh() {
        this._watchWindows();
        // Keep Shell's frozen window slots intact throughout the exit animation.
        if (this._exiting)
            return;
        for (const record of this._layouts.values()) {
            record.layout._needsLayout = true;
            record.layout.layout_changed();
        }
    }
    _items(layout) {
        const order = global.display.sort_windows_by_stacking(layout._sortedWindows.map(preview => preview.metaWindow));
        const positions = new Map(order.map((window, index) => [window, index]));
        return [...layout._sortedWindows].sort((a, b) => positions.get(a.metaWindow) - positions.get(b.metaWindow)).map(preview => {
            const window = preview.metaWindow;
            const app = this._tracker.get_window_app(window);
            return {
                key: window, preview, app,
                appId: app?.get_id() ?? window.get_wm_class() ?? 'unknown',
                appName: app?.get_name() ?? window.get_wm_class() ?? 'Application',
                title: window.get_title() ?? '',
                width: preview.boundingBox.width, height: preview.boundingBox.height,
            };
        });
    }
    _slots(layout, containerBox) {
        const record = this._ensureLayout(layout);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const box = containerBox.copy();
        const area = {x: box.x1 + 12 * scale, y: box.y1 + 64 * scale,
            width: Math.max(1, box.get_width() - 24 * scale),
            height: Math.max(1, box.get_height() - 76 * scale)};
        const stacks = makeStacks(this._items(layout), this._groups, this._assignments);
        if (!stacks.some(stack => stack.id === record.expandedId))
            record.expandedId = null;
        record.specs = layoutStacks(stacks, area, record.expandedId, scale);
        this._toolbar(record, Math.max(1, box.get_width() - 48 * scale));
        record.toolbarBounds = {x: box.x1 + 24 * scale, y: box.y1 + 8 * scale,
            width: Math.max(1, box.get_width() - 48 * scale), height: 42 * scale};
        const present = new Set(record.specs.map(group => group.id));
        for (const [id, decoration] of record.decorations) {
            if (!present.has(id)) {
                decoration.actor.destroy();
                record.decorations.delete(id);
            }
        }
        const slots = [];
        for (const group of record.specs) {
            this._decoration(record, group);
            for (const slot of group.slots) {
                const preview = slot.item.preview;
                this._trackPreview(preview, layout);
                this._previewGroups.set(preview, {record, group, front: slot.front});
                let action = record.windowActions.get(preview);
                if (!action) {
                    const actor = button('Group ▾', () => this._windowMenu(preview, actor));
                    layout._container.add_child(actor);
                    action = {actor};
                    record.windowActions.set(preview, action);
                }
                action.actor.label = group.customId ? 'Move ▾' : 'Group ▾';
                action.expanded = group.expanded && !group.hidden;
                const width = Math.min(100 * scale, slot.width);
                const [, height] = action.actor.get_preferred_height(width);
                action.bounds = {x: slot.x + 6 * scale, y: slot.y + 6 * scale, width, height};
                layout._syncOverlay(preview);
                slots.push([slot.x, slot.y, slot.width, slot.height, preview]);
            }
        }
        for (const [preview, state] of this._previewState) {
            if (state.layout === layout && !layout._windows.has(preview)) {
                this._restorePreview(preview, state);
                this._previewState.delete(preview);
                this._previewGroups.delete(preview);
                record.windowActions.get(preview)?.actor.destroy();
                record.windowActions.delete(preview);
            }
        }
        this._sync(layout);
        if (!this._exiting)
            this._restack(record);
        return slots;
    }
    _toolbar(record, width) {
        const signature = JSON.stringify([this._groups.map(group => [group.id, group.name, this._versions(group.id)[0]?.id]), record.expandedId, Math.floor(width)]);
        if (signature === record.signature)
            return;
        // Overview changes the workspace allocation on every animation frame.
        // Rebuilding themed controls during that allocation invalidates the
        // parent again and makes the transition stutter.
        if (record.signature && Main.overview.animationInProgress)
            return;
        record.signature = signature;
        record.toolbar.destroy_all_children();
        const back = button(record.expandedId ? '← All app stacks' : 'App stacks', () => this._expand(record, null));
        const create = button('+ Group', () => this._newGroup());
        const preferences = button('⚙', () => { Main.overview.hide(); this.openPreferences(); });
        record.toolbar.add_child(back);
        const targets = row('ao-targets');
        targets.x_expand = true;
        record.toolbar.add_child(targets);
        record.toolbar.add_child(create);
        record.toolbar.add_child(preferences);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const available = Math.max(0, width - [back, create, preferences].reduce((sum, actor) => sum + actor.get_preferred_width(-1)[1], 0) - 48 * scale);
        const choices = [];
        for (const group of this._groups) {
            const target = button(`${group.name}${this._versions(group.id).length ? ' ↻' : ''}`, () => {
                if (record.specs.some(spec => spec.id === `custom:${group.id}`))
                    this._expand(record, `custom:${group.id}`);
                else if (this._versions(group.id).length)
                    this._savedSessionMenu(target, group.id);
            });
            target.accessible_name = `${group.name}: drop windows here, or reopen a saved session`;
            this._dropTarget(target, group.id);
            targets.add_child(target);
            choices.push({group, target, width: target.get_preferred_width(-1)[1] + 8 * scale});
        }
        const more = button('More ▾', () => {
            const menu = this._popup(more);
            for (const {group} of overflow)
                menu.addAction(group.name, () => {
                    if (record.specs.some(spec => spec.id === `custom:${group.id}`))
                        this._expand(record, `custom:${group.id}`);
                    else if (this._versions(group.id).length)
                        this._restoreSession(group.id, this._versions(group.id)[0]);
                });
            menu.open();
        });
        targets.add_child(more);
        const needsOverflow = choices.reduce((sum, choice) => sum + choice.width, 0) > available;
        let remaining = available - (needsOverflow ? more.get_preferred_width(-1)[1] + 8 * scale : 0);
        const overflow = [];
        for (const choice of choices) {
            if (choice.width <= remaining) {
                remaining -= choice.width;
            } else {
                overflow.push(choice);
                choice.target.destroy();
            }
        }
        if (!overflow.length)
            more.destroy();
    }
    _decoration(record, group) {
        let decoration = record.decorations.get(group.id);
        if (!decoration) {
            const header = row('ao-stack-header');
            const icon = group.app?.create_icon_texture(24) ?? new St.Icon({icon_name: 'folder-symbolic', icon_size: 24});
            header.add_child(icon);
            const toggle = button('', () => this._expand(record, record.expandedId === group.id ? null : group.id));
            toggle.x_expand = true;
            header.add_child(toggle);
            const menu = button('⋯', () => this._stackMenu(menu, record, group.id));
            menu.accessible_name = `Actions for ${group.name}`;
            header.add_child(menu);
            record.layout._container.add_child(header);
            decoration = {actor: header, header, toggle};
            record.decorations.set(group.id, decoration);
            if (group.customId)
                this._dropTarget(header, group.customId);
        }
        decoration.toggle.label = `${group.name}  ·  ${group.windows.length}${group.expanded ? '  ▴' : group.windows.length > 1 ? '  ▾' : ''}`;
        decoration.toggle.accessible_name = `${group.name}, ${group.windows.length} windows, ${group.expanded ? 'collapse' : 'expand'}`;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const [, naturalWidth] = decoration.actor.get_preferred_width(-1);
        const width = Math.min(naturalWidth, Math.max(1, group.bounds.width - 16 * scale));
        const [, height] = decoration.actor.get_preferred_height(width);
        decoration.bounds = {x: group.bounds.x + (group.bounds.width - width) / 2,
            y: group.expanded ? group.bounds.y : group.bounds.y + group.bounds.height - height - 6 * scale,
            width, height};
        decoration.actor.visible = !group.hidden;
    }
    _allocateDecorations(layout, box) {
        const record = this._layouts.get(layout);
        if (!record?.toolbarBounds)
            return;
        const scale = layout._windowSlotsBox ? box.get_width() / layout._windowSlotsBox.get_width() : 1;
        const place = (actor, bounds) => allocate(actor, {x: bounds.x * scale, y: bounds.y * scale,
            width: bounds.width * scale, height: bounds.height * scale});
        // Shell freezes slot computation during exit. Our controls still need
        // allocation on every pass, just like native previews, including after
        // hover/style changes. Otherwise the whole workspace stays invalid.
        place(record.toolbar, record.toolbarBounds);
        for (const action of record.windowActions.values())
            place(action.actor, action.bounds);
        for (const decoration of record.decorations.values()) {
            if (decoration.bounds)
                place(decoration.actor, decoration.bounds);
        }
    }
    _trackPreview(preview, layout) {
        if (this._previewState.has(preview))
            return;
        this._previewState.set(preview, {layout, reactive: preview.reactive,
            canFocus: preview.can_focus, iconVisible: preview._icon.visible});
    }
    _captureContextClick(event) {
        const type = event.type();
        if (type !== Clutter.EventType.BUTTON_PRESS && type !== Clutter.EventType.BUTTON_RELEASE)
            return Clutter.EVENT_PROPAGATE;
        if (event.get_button() !== Clutter.BUTTON_SECONDARY)
            return Clutter.EVENT_PROPAGATE;
        if (type === Clutter.EventType.BUTTON_RELEASE && this._rightClickPreview) {
            const preview = this._rightClickPreview;
            this._rightClickPreview = null;
            if (!preview._destroyed)
                this._windowMenu(preview);
            return Clutter.EVENT_STOP;
        }
        if (type !== Clutter.EventType.BUTTON_PRESS || !Main.overview.visible || this._exiting || this._dialog || this._menu?.isOpen ||
            Main.overview.searchEntry.get_text() || Main.overview.dash.showAppsButton.checked)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        let actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        while (actor && !this._previewState.has(actor))
            actor = actor.get_parent();
        // Native preview children can be picked through their workspace actor
        // during scale transitions. Hit-test the rendered front surface as well.
        if (!actor) {
            for (const preview of this._previewState.keys()) {
                if (preview._destroyed || !preview.mapped || !preview.reactive || !preview.opacity)
                    continue;
                const [left, top] = preview.window_container.get_transformed_position();
                const [width, height] = preview.window_container.get_transformed_size();
                if (x >= left && x <= left + width && y >= top && y <= top + height)
                    actor = preview;
            }
        }
        if (!actor)
            return Clutter.EVENT_PROPAGATE;
        this._rightClickPreview = actor;
        // Consume before the preview's native click/drag gestures claim the press.
        return Clutter.EVENT_STOP;
    }
    _syncPreview(preview) {
        const info = this._previewGroups.get(preview);
        if (!info)
            return;
        const collapsed = !info.group.expanded;
        preview.reactive = !info.group.hidden && (!collapsed || info.front);
        preview.can_focus = preview.reactive;
        preview._icon.visible = !collapsed;
        if (collapsed || info.group.hidden || this._exiting)
            preview.overlayEnabled = false;
        const progress = info.record.layout._stateAdjustment.value;
        const opacity = preview.metaWindow.showing_on_its_workspace() ? 255 : progress * 255;
        // Hidden stacks must rejoin the desktop continuously, rather than pop in
        // when Shell reveals the real windows at the end of the animation.
        preview.opacity = Math.round(opacity * (info.group.hidden ? (this._exiting ? 1 - progress : 0) : 1));
    }
    _sync(layout) {
        const record = this._layouts.get(layout);
        if (!record)
            return;
        const alpha = Math.round(255 * layout._stateAdjustment.value * Math.max(0, Math.min(1, 2 - layout._overviewAdjustment.value)));
        record.toolbar.opacity = alpha;
        record.toolbar.visible = layout._metaWorkspace?.active ?? true;
        for (const decoration of record.decorations.values())
            decoration.actor.opacity = alpha;
        for (const action of record.windowActions.values()) {
            action.actor.visible = action.expanded && !this._exiting;
            action.actor.opacity = alpha;
        }
        for (const preview of layout._windows.keys())
            this._syncPreview(preview);
    }
    _restack(record) {
        const container = record.layout._container;
        const desired = [...record.decorations.values()].map(decoration => decoration.actor);
        for (const group of record.specs) {
            for (const item of group.windows) {
                if (!item.preview.inDrag && item.preview.get_parent() === container)
                    desired.push(item.preview);
            }
        }
        desired.push(...[...record.windowActions.values()].map(action => action.actor), record.toolbar);
        let previous = null;
        for (let index = 0; index < desired.length; index++) {
            const actor = desired[index];
            if (container.get_child_at_index(index) !== actor) {
                if (previous)
                    container.set_child_above_sibling(actor, previous);
                else
                    container.set_child_below_sibling(actor, null);
            }
            previous = actor;
        }
    }
    _prepareExit() {
        this._exiting = true;
        this._rightClickPreview = null;
        this._menu?.close();
        for (const record of this._layouts.values()) {
            const previews = new Map([...record.layout._windows.keys()].map(preview => [preview.metaWindow, preview]));
            const order = global.display.sort_windows_by_stacking([...previews.keys()]);
            // Restore the compositor's real Z order once, before windows travel
            // back to the desktop. Never reapply app order during that flight.
            let previous = null;
            for (const window of order) {
                const preview = previews.get(window);
                preview.overlayEnabled = false;
                if (!preview.inDrag && preview.get_parent() === record.layout._container) {
                    preview.setStackAbove(previous);
                    previous = preview;
                }
            }
            this._sync(record.layout);
        }
    }
    _expand(record, id) {
        record.expandedId = id;
        record.layout._needsLayout = true;
        record.layout.layout_changed();
    }
    _assign(window, id) {
        const item = this._liveItems().find(item => item.key === window);
        const previous = item ? groupForWindow(item, this._groups, this._assignments.get(window)) : null;
        if (id === null)
            this._assignments.delete(window);
        else
            this._assignments.set(window, id);
        for (const record of this._layouts.values())
            record.expandedId = null;
        if (this._settings.get_boolean('autosave-group-sessions')) {
            const current = item ? groupForWindow(item, this._groups, this._assignments.get(window)) : null;
            if (previous !== UNGROUPED && previous !== current)
                this._saveSession(previous, true, true);
            if (current !== UNGROUPED && current)
                this._saveSession(current, true);
        }
        this._queueRefresh();
    }
    _dropTarget(actor, id) {
        actor._delegate = {
            handleDragOver: source => source.metaWindow ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.CONTINUE,
            acceptDrop: source => {
                if (!source.metaWindow)
                    return false;
                this._assign(source.metaWindow, id);
                return true;
            },
        };
    }
    _popup(source) {
        this._menu?.destroy();
        // This JS helper has no destroy() API. Destroying its menu invokes
        // removeMenu(), which releases the manager's menu, actor and stage signals.
        const manager = new PopupMenu.PopupMenuManager(source);
        this._menu = new PopupMenu.PopupMenu(source, 0.5, St.Side.TOP);
        Main.uiGroup.add_child(this._menu.actor);
        this._menu.actor.hide();
        manager.addMenu(this._menu);
        return this._menu;
    }
    _windowMenu(preview, source = preview) {
        const menu = this._popup(source);
        const item = this._liveItems().find(item => item.key === preview.metaWindow);
        const membership = item ? groupForWindow(item, this._groups, this._assignments.get(preview.metaWindow)) : UNGROUPED;
        const current = membership === UNGROUPED ? null : membership;
        if (current)
            menu.addAction('Remove from group', () => this._assign(preview.metaWindow, UNGROUPED));
        for (const group of this._groups.filter(group => group.id !== current))
            menu.addAction(`${current ? 'Move' : 'Add'} to ${group.name}`, () => this._assign(preview.metaWindow, group.id));
        menu.addAction('Use automatic grouping rules', () => this._assign(preview.metaWindow, null));
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        menu.addAction('Create custom group…', () => this._newGroup(preview.metaWindow));
        menu.open();
    }
    _stackMenu(source, record, id) {
        const group = record.specs.find(spec => spec.id === id);
        if (!group)
            return;
        const menu = this._popup(source);
        menu.addAction(group.expanded ? 'Collapse stack' : 'Expand stack',
            () => this._expand(record, group.expanded ? null : id));
        if (group.customId) {
            menu.addAction('Save session version', () => this._saveSession(group.customId));
            for (const version of this._versions(group.customId))
                menu.addAction(`Reopen: ${versionLabel(version)}`, () => this._restoreSession(group.customId, version));
        } else {
            menu.addAction('Save as reusable group', () => this._saveAppStack(group));
        }
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        for (let i = 0; i < global.workspace_manager.n_workspaces; i++) {
            const workspace = global.workspace_manager.get_workspace_by_index(i);
            menu.addAction(`Move stack to workspace ${i + 1}`, () => this._moveStack(group, workspace));
        }
        menu.addAction('Move stack to a new workspace', () => {
            const workspace = global.workspace_manager.append_new_workspace(false, global.get_current_time());
            this._moveStack(group, workspace);
        });
        menu.open();
    }
    _savedSessionMenu(source, groupId) {
        const menu = this._popup(source);
        for (const version of this._versions(groupId))
            menu.addAction(`Reopen: ${versionLabel(version)}`, () => this._restoreSession(groupId, version));
        menu.open();
    }
    _saveAppStack(stack) {
        const id = GLib.uuid_string_random();
        this._settings.set_string('groups', JSON.stringify([...this._groups,
            {id, name: stack.name, appIds: [], titlePatterns: []}]));
        this._readGroups();
        for (const item of stack.windows)
            this._assignments.set(item.key, id);
        this._saveSession(id);
        this._queueRefresh();
    }
    _restoreSession(groupId, version) {
        if (!this._groups.some(group => group.id === groupId))
            return;
        if (this._restoreTimer) {
            Main.notify('Activity Organizer', 'A saved session is already reopening. Wait for it to finish.');
            return;
        }
        const missing = planRestore(version, this._groupItems(groupId));
        if (!missing.length) {
            Main.notify('Activity Organizer', 'All saved app windows are already in this group.');
            return;
        }
        const workspace = global.workspace_manager.get_active_workspace();
        this._restoreQueue = missing.map(entry => ({...entry, groupId, workspace}));
        this._restoreErrors = [];
        this._restoreActive = null;
        this._restoreTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            if (this._restoreStep())
                return GLib.SOURCE_CONTINUE;
            this._restoreTimer = 0;
            if (this._restoreErrors.length)
                Main.notify('Activity Organizer', `Could not reopen: ${[...new Set(this._restoreErrors)].join(', ')}. The saved version is kept.`);
            else
                Main.notify('Activity Organizer', 'Saved group reopened.');
            return GLib.SOURCE_REMOVE;
        });
    }
    _launchSavedWindow(entry, workspaceIndex) {
        const app = this._appSystem.lookup_app(entry.appId);
        if (!app)
            throw new Error('Application is no longer installed');
        if (!app.can_open_new_window() && app.get_windows().length)
            throw new Error('Application does not support another window');
        app.open_new_window(workspaceIndex);
    }
    _restoreStep() {
        if (this._restoreActive) {
            const job = this._restoreActive;
            const window = this._liveItems().find(item => item.appId === job.appId && !job.baseline.has(item.key));
            if (window) {
                this._assignments.set(window.key, job.groupId);
                if (!window.key.is_on_all_workspaces() && job.workspace.index() >= 0)
                    window.key.change_workspace(job.workspace);
                this._restoreActive = null;
                this._queueRefresh();
            } else if (GLib.get_monotonic_time() >= job.deadline) {
                this._restoreErrors.push(job.appId);
                this._restoreActive = null;
            }
            return true;
        }
        const job = this._restoreQueue.shift();
        if (!job)
            return false;
        if (!this._groups.some(group => group.id === job.groupId))
            return true;
        job.baseline = new Set(this._liveItems().map(item => item.key));
        job.deadline = GLib.get_monotonic_time() + 15 * 1000000;
        this._restoreActive = job;
        try {
            this._launchSavedWindow(job, Math.max(0, job.workspace.index()));
        } catch (error) {
            this._restoreErrors.push(job.appId);
            this._restoreActive = null;
            console.error(`Activity Organizer could not reopen ${job.appId}: ${error.message}`);
        }
        return true;
    }
    _moveStack(group, workspace) {
        for (const item of group.windows) {
            if (!item.key.is_on_all_workspaces())
                item.key.change_workspace(workspace);
        }
        workspace.activate(global.get_current_time());
    }
    _newGroup(window = null) {
        if (this._dialog)
            return;
        const dialog = new ModalDialog.ModalDialog();
        this._dialog = dialog;
        dialog.contentLayout.add_child(textLabel('Create a window group', 'ao-dialog-title'));
        const entry = new St.Entry({hint_text: 'Work, Research, Project Atlas…', can_focus: true, style_class: 'ao-group-entry'});
        dialog.contentLayout.add_child(entry);
        dialog.setButtons([
            {label: 'Cancel', key: Clutter.KEY_Escape, action: () => dialog.close()},
            {label: 'Create', default: true, action: () => {
                const name = entry.get_text().trim();
                if (!name)
                    return;
                const id = GLib.uuid_string_random();
                this._settings.set_string('groups', JSON.stringify([...this._groups, {id, name, appIds: [], titlePatterns: []}]));
                if (window)
                    this._assign(window, id);
                dialog.close();
            }},
        ]);
        this._dialogClosedId = dialog.connect('closed', () => {
            dialog.disconnect(this._dialogClosedId);
            this._dialogClosedId = 0;
            this._dialog = null;
        });
        dialog.setInitialKeyFocus(entry.clutter_text);
        if (!dialog.open())
            this._destroyDialog();
    }
    _destroyDialog() {
        if (!this._dialog)
            return;
        if (this._dialogClosedId)
            this._dialog.disconnect(this._dialogClosedId);
        this._dialogClosedId = 0;
        // Disable must finish synchronously, including a dialog mid-animation.
        this._dialog.remove_all_transitions();
        this._dialog.popModal();
        this._dialog.destroy();
        this._dialog = null;
    }
    _restorePreview(preview, state) {
        if (preview._destroyed)
            return;
        preview.reactive = state.reactive;
        preview.can_focus = state.canFocus;
        preview._icon.visible = state.iconVisible;
        preview.opacity = 255;
    }
    disable() {
        if (this._restoreTimer)
            GLib.Source.remove(this._restoreTimer);
        this._restoreTimer = 0;
        this._restoreQueue = [];
        this._restoreActive = null;
        this._restoreErrors = [];
        if (this._pending)
            GLib.Source.remove(this._pending);
        this._pending = 0;
        this._rightClickPreview = null;
        this._menu?.destroy();
        this._menu = null;
        this._destroyDialog();
        this._injections?.clear();
        for (const [object, id] of this._signals ?? [])
            object.disconnect(id);
        for (const [window, ids] of this._windowSignals ?? [])
            ids.forEach(id => window.disconnect(id));
        for (const [preview, state] of this._previewState ?? [])
            this._restorePreview(preview, state);
        for (const record of this._layouts?.values() ?? []) {
            record.layout._container.disconnect(record.destroyId);
            record.toolbar.destroy();
            for (const action of record.windowActions.values())
                action.actor.destroy();
            for (const decoration of record.decorations.values())
                decoration.actor.destroy();
            record.layout._needsLayout = true;
            record.layout.syncOverlays();
            record.layout._syncOpacities();
            record.layout.layout_changed();
        }
        this._layouts?.clear();
        this._previewState?.clear();
        this._assignments?.clear();
        this._windowSignals?.clear();
        this._signals = [];
        this._previewGroups = new WeakMap();
        this._sessions = [];
        this._groups = [];
        this._settings = null;
        this._tracker = null;
        this._appSystem = null;
        this._injections = null;
    }
}
