import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGroups, groupForWindow, buildSections, UNGROUPED} from '../lib/groups.js';

const groups = [
    {id: 'work', name: 'Work', appIds: ['firefox.desktop'], titlePatterns: ['Project Atlas']},
    {id: 'personal', name: 'Personal', appIds: ['firefox.desktop'], titlePatterns: []},
    {id: 'research', name: 'Research', appIds: [], titlePatterns: ['paper', 'journal']},
    {id: 'empty', name: 'Manual only', appIds: [], titlePatterns: []},
];

test('rules combine app and title conditions and honor priority', () => {
    assert.equal(groupForWindow({appId: 'FIREFOX.desktop', title: 'PROJECT ATLAS — Browser'}, groups), 'work');
    assert.equal(groupForWindow({appId: 'firefox.desktop', title: 'Recipes'}, groups), 'personal');
    assert.equal(groupForWindow({appId: 'editor.desktop', title: 'Project Atlas'}, groups), UNGROUPED);
    assert.equal(groupForWindow({appId: 'viewer.desktop', title: 'A journal article'}, groups), 'research');
    assert.equal(groupForWindow({}, groups), UNGROUPED);
});

test('manual assignment overrides rules, with an explicit ungrouped override', () => {
    const window = {appId: 'firefox.desktop', title: 'Project Atlas'};
    assert.equal(groupForWindow(window, groups, 'research'), 'research');
    assert.equal(groupForWindow(window, groups, UNGROUPED), UNGROUPED);
    assert.equal(groupForWindow(window, groups, 'deleted-group'), 'work');
});

test('rejects malformed settings and reserved or duplicate IDs', () => {
    assert.deepEqual(parseGroups(JSON.stringify(groups)), groups);
    assert.deepEqual(parseGroups('[]'), []);
    for (const value of ['{}', 'null', '[null]', '{', JSON.stringify([groups[0], groups[0]]),
        JSON.stringify([{...groups[0], id: UNGROUPED}]),
        JSON.stringify([{...groups[0], titlePatterns: [' ']}]),
        JSON.stringify([{...groups[0], name: ''}])])
        assert.throws(() => parseGroups(value));
});

test('nests apps under groups without merging windows across groups', () => {
    const windows = [
        {key: 1, appId: 'firefox.desktop', appName: 'Firefox', title: 'Project Atlas'},
        {key: 2, appId: 'firefox.desktop', appName: 'Firefox', title: 'Recipes'},
        {key: 3, appId: 'firefox.desktop', appName: 'Firefox', title: 'Project Atlas docs'},
        {key: 4, appId: 'editor.desktop', appName: 'Editor', title: 'Notes'},
    ];
    const sections = buildSections(windows, groups, new Map([[4, 'work']]));
    const work = sections.find(section => section.id === 'work');
    assert.equal(work.count, 3);
    assert.deepEqual(work.apps.map(app => app.name), ['Editor', 'Firefox']);
    assert.equal(work.apps[1].windows.length, 2);
    assert.equal(sections.find(section => section.id === 'personal').count, 1);
    assert.equal(sections.find(section => section.id === UNGROUPED).count, 0);
    assert.equal(buildSections(windows, groups, new Map(), 'atlas', 'work')[0].count, 2);
    assert.equal(buildSections(windows, groups, new Map(), 'no match')[0].count, 0);
    assert.equal(buildSections(windows, groups, new Map(), 'personal')[1].count, 1);
});
