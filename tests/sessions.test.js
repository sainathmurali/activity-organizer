import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSessions, saveVersion, clearAutomaticVersion, snapshotWindows, planRestore, MAX_SAVED_VERSIONS} from '../lib/sessions.js';

const windows = [{appId: 'code.desktop', title: 'Project'}, {appId: 'browser.desktop', title: 'Page'},
    {appId: 'browser.desktop', title: 'Another page'}];
const version = (id, automatic = false, entries = windows) => ({id, automatic,
    createdAt: '2026-11-04T07:00:00.000Z', windows: snapshotWindows(entries)});

test('saved app/window groups roundtrip across process and session boundaries', () => {
    const saved = saveVersion([], 'work', version('first'));
    assert.deepEqual(parseSessions(JSON.stringify(saved)), saved);
    assert.deepEqual(planRestore(saved[0].versions[0], []), windows);
    assert.deepEqual(planRestore(saved[0].versions[0], [{appId: 'browser.desktop'}]),
        [windows[0], windows[2]]);
    assert.deepEqual(planRestore(saved[0].versions[0], windows), []);
    assert.deepEqual(planRestore(saved[0].versions[0], [...windows, windows[0]]), []);
});

test('automatic saves replace the auto version while explicit versions remain', () => {
    let saved = saveVersion([], 'work', version('manual'));
    saved = saveVersion(saved, 'work', version('auto1', true));
    const unchanged = saveVersion(saved, 'work', version('same-apps', true));
    assert.equal(unchanged, saved);
    saved = saveVersion(saved, 'work', version('auto2', true, windows.slice(0, 1)));
    assert.deepEqual(saved[0].versions.map(item => item.id), ['auto2', 'manual']);
    assert.equal(saveVersion(saved, 'work', version('closed', true, [])), saved);
    for (let i = 0; i < 15; i++)
        saved = saveVersion(saved, 'work', version(`manual${i}`));
    assert.equal(saved[0].versions.length, MAX_SAVED_VERSIONS);
});

test('snapshots contain only desktop app IDs and display titles', () => {
    const result = snapshotWindows([{appId: 'files.desktop', title: 'Documents', key: {native: true}, app: {}}]);
    assert.deepEqual(result, [{appId: 'files.desktop', title: 'Documents'}]);
});

test('explicitly emptying a group removes its automatic save but retains named history', () => {
    let saved = saveVersion([], 'work', version('manual'));
    saved = saveVersion(saved, 'work', version('auto', true));
    assert.deepEqual(clearAutomaticVersion(saved, 'work')[0].versions.map(item => item.id), ['manual']);
    assert.deepEqual(clearAutomaticVersion(saveVersion([], 'work', version('auto', true)), 'work'), []);
});

test('malformed saved versions are rejected without replacing valid data', () => {
    for (const json of ['{}', 'null', '[null]', JSON.stringify([{groupId: 'work', versions: [{}]}]),
        JSON.stringify([{groupId: 'work', versions: [{...version('bad'), createdAt: 'invalid'}]}]),
        JSON.stringify([{groupId: 'work', versions: [version('duplicate'), version('duplicate')]}])])
        assert.throws(() => parseSessions(json));
});
