import test from 'node:test';
import assert from 'node:assert/strict';
import {makeStacks, layoutStacks} from '../lib/stacks.js';
import {UNGROUPED} from '../lib/groups.js';

const groups = [{id: 'work', name: 'Work', appIds: [], titlePatterns: ['Atlas']}];
const windows = [
    {key: 1, appId: 'code', appName: 'VS Code', title: 'Notes', width: 1200, height: 800},
    {key: 2, appId: 'code', appName: 'VS Code', title: 'Another project', width: 1200, height: 800},
    {key: 3, appId: 'browser', appName: 'Browser', title: 'Atlas', width: 1400, height: 900},
    {key: 4, appId: 'files', appName: 'Files', title: 'Documents', width: 800, height: 600},
];

test('app windows automatically form one stack, custom groups can mix apps', () => {
    let stacks = makeStacks(windows, groups);
    assert.equal(stacks.length, 3);
    assert.equal(stacks.find(stack => stack.id === 'app:code').windows.length, 2);
    stacks = makeStacks(windows, groups, new Map([[1, 'work']]));
    assert.deepEqual(stacks.find(stack => stack.id === 'custom:work').windows.map(item => item.key), [1, 3]);
    stacks = makeStacks(windows, groups, new Map([[3, UNGROUPED]]));
    assert(stacks.some(stack => stack.id === 'app:browser'));
});

test('collapsed stacks overlap; expanded windows are separated and other stacks hidden', () => {
    const stacks = makeStacks(windows, groups);
    const area = {x: 10, y: 20, width: 1280, height: 680};
    const collapsed = layoutStacks(stacks, area);
    const code = collapsed.find(stack => stack.id === 'app:code');
    const [a, b] = code.slots;
    assert(a.x < b.x + b.width && b.x < a.x + a.width);
    assert(a.y < b.y + b.height && b.y < a.y + a.height);
    assert.equal(code.slots.filter(slot => slot.front).length, 1);
    const expanded = layoutStacks(stacks, area, 'app:code');
    const focused = expanded.find(stack => stack.expanded);
    assert(expanded.filter(stack => stack.id !== focused.id).every(stack => stack.hidden));
    const [left, right] = focused.slots;
    assert(left.x + left.width <= right.x || right.x + right.width <= left.x ||
        left.y + left.height <= right.y || right.y + right.height <= left.y);
});

test('geometry fits varied window counts, aspect ratios and scales without lost windows', () => {
    for (const count of [1, 2, 5, 20, 60]) {
        const items = Array.from({length: count}, (_, key) => ({key,
            appId: `app${key % 7}`, appName: `App ${key % 7}`, title: '',
            width: key % 2 ? 700 : 1600, height: key % 3 ? 900 : 400}));
        const stacks = makeStacks(items, []);
        for (const scale of [1, 2]) {
            const area = {x: 0, y: 0, width: 1280 * scale, height: 680 * scale};
            for (const expanded of [null, stacks[0].id]) {
                const result = layoutStacks(stacks, area, expanded, scale);
                assert.equal(result.flatMap(stack => stack.slots).length, count);
                for (const stack of result) {
                    for (const slot of stack.slots) {
                        assert(slot.width > 0 && slot.height > 0);
                        assert(slot.x >= stack.bounds.x && slot.y >= stack.bounds.y);
                        assert(slot.x + slot.width <= stack.bounds.x + stack.bounds.width + 0.01);
                        assert(slot.y + slot.height <= stack.bounds.y + stack.bounds.height + 0.01);
                    }
                }
            }
        }
    }
    assert.deepEqual(layoutStacks([], {x: 0, y: 0, width: 100, height: 100}), []);
});
