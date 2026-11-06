// Execute the upstream JavaScript contracts against our generated window slots.
// These checks supplement compositor testing; they do not emulate older GI libraries.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {makeStacks, layoutStacks} from '../lib/stacks.js';

const directory = process.argv[2] ?? '/tmp/activity-organizer-shell-sources';
class Box {
    constructor(x = 0, y = 0, width = 1200, height = 720) { this.set_origin(x, y); this.set_size(width, height); }
    set_origin(x, y) { this.x = x; this.y = y; }
    set_size(width, height) { this.width = width; this.height = height; }
    get_width() { return this.width; }
    get_size() { return [this.width, this.height]; }
    get_origin() { return [this.x, this.y]; }
    copy() { return new Box(this.x, this.y, this.width, this.height); }
    equal(other) { return ['x', 'y', 'width', 'height'].every(key => this[key] === other[key]); }
}
const context = vm.createContext({
    Clutter: {LayoutManager: class { _init() {} }, ActorBox: Box},
    Shell: {WindowPreview: class {}},
    St: {Adjustment: class { constructor(properties) { Object.assign(this, properties); } connect() {} }},
    Main: {overview: {animationInProgress: true}},
    OverviewControls: {ControlsState: {WINDOW_PICKER: 1}},
    Util: {lerp: (from, to, progress) => from + (to - from) * progress},
    global: {get_current_time: () => 1234},
});
function upstreamClass(version, file, name, wrapped = true) {
    const source = readFileSync(`${directory}/${version}/${file}`, 'utf8');
    const start = source.indexOf(`class ${name} `);
    assert(start >= 0, `${version}: missing ${name}`);
    const end = source.indexOf(wrapped ? '\n});' : '\n}', start);
    assert(end >= 0, `${version}: unterminated ${name}`);
    return vm.runInContext(`(${source.slice(start, end + 2)})`, context);
}

for (const version of [46, 47, 48, 49, 50]) {
    const Layout = upstreamClass(version, 'workspace.js', 'WorkspaceLayout');
    const Preview = upstreamClass(version, 'windowPreview.js', 'WindowPreview');
    const items = Array.from({length: 6}, (_, key) => {
        const metaWindow = {showing_on_its_workspace: () => true};
        const preview = {metaWindow, visible: true, boundingBox: {x: key * 40, y: key * 20, width: 900, height: 600},
            allocate(box) { this.allocated = box.copy(); }};
        return {key, preview, appId: `app${key % 2}`, appName: `App ${key % 2}`, width: 900, height: 600};
    });
    const layout = new Layout();
    layout._init({active: true}, 0, {getStateTransitionParams: () => ({currentState: 1})});
    layout._workarea = {x: 0, y: 0, width: 1200, height: 720};
    layout._sortedWindows = items.map(item => item.preview);
    layout._windows = new Map(items.map(item => [item.preview, {metaWindow: item.preview.metaWindow}]));
    layout._createBestLayout = () => ({});
    const container = {allocation: new Box(), remove_clip() {}};
    const stacks = makeStacks(items, []);
    for (const expanded of [null, stacks[0].id]) {
        const groups = layoutStacks(stacks, {x: 0, y: 0, width: 1200, height: 720}, expanded);
        layout._getWindowSlots = () => groups.flatMap(group => group.slots.map(slot =>
            [slot.x, slot.y, slot.width, slot.height, slot.item.preview]));
        layout._needsLayout = true;
        for (const progress of [0, 0.5, 1]) {
            layout._stateAdjustment.value = progress;
            layout.vfunc_allocate(container, new Box());
            for (const item of items) {
                assert(Number.isFinite(item.preview.allocated.width), `${version}: invalid native allocation`);
                assert(item.preview.allocated.width > 0, `${version}: missing preview`);
                layout._syncOverlay(item.preview);
                assert.equal(item.preview.overlayEnabled, progress === 1);
            }
            assert.equal(layout.getFocusChain().length, progress === 0 ? 0 : items.length);
        }
    }
    const events = [];
    Preview.prototype._activate.call({emit: (...args) => events.push(args)});
    assert.equal(events[0][0], 'selected');
    assert.equal(events[0][1], 1234);
    const workspace = {handleDragOver: (...args) => args.length, acceptDrop: (...args) => args.length};
    const preview = {_workspace: workspace};
    assert.equal(Preview.prototype.handleDragOver.call(preview, {}, {}, 1, 2, 3), 5);
    assert.equal(Preview.prototype.acceptDrop.call(preview, {}, {}, 1, 2, 3), 5);
    for (const name of ['_restack', '_onDragBegin', '_onDragEnd', 'setStackAbove'])
        assert.equal(typeof Preview.prototype[name], 'function', `${version}: missing preview hook ${name}`);
    const Manager = upstreamClass(version, 'popupMenu.js', 'PopupMenuManager', false);
    assert.equal(typeof Manager.prototype.removeMenu, 'function');
    console.log(`Shell ${version}: native allocation, overlay/focus, activation and drag/drop contracts passed`);
}
