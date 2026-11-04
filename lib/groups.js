// No Shell dependencies: the matching behavior can also be tested with Node.
export const UNGROUPED = '__ungrouped__';

export function parseGroups(json) {
    const groups = JSON.parse(json);
    if (!Array.isArray(groups))
        throw new Error('Groups must be an array.');
    const ids = new Set();
    for (const group of groups) {
        if (!group || typeof group.id !== 'string' || !group.id.trim() ||
            group.id === UNGROUPED || ids.has(group.id))
            throw new Error('Each group needs a unique ID.');
        ids.add(group.id);
        if (typeof group.name !== 'string' || !group.name.trim())
            throw new Error('Each group needs a name.');
        for (const key of ['appIds', 'titlePatterns']) {
            if (!Array.isArray(group[key]) || group[key].some(value =>
                typeof value !== 'string' || !value.trim()))
                throw new Error(`${key} must contain nonempty strings.`);
        }
    }
    return groups;
}

export function groupForWindow(window, groups, manualGroup) {
    if (manualGroup === UNGROUPED || groups.some(group => group.id === manualGroup))
        return manualGroup;
    const appId = (window.appId ?? '').toLowerCase();
    const title = (window.title ?? '').toLowerCase();
    for (const group of groups) {
        // Empty rules never capture everything. Both fields, when set, must match.
        if (!group.appIds.length && !group.titlePatterns.length)
            continue;
        const appMatches = !group.appIds.length ||
            group.appIds.some(id => id.toLowerCase() === appId);
        const titleMatches = !group.titlePatterns.length ||
            group.titlePatterns.some(pattern => title.includes(pattern.toLowerCase()));
        if (appMatches && titleMatches)
            return group.id;
    }
    return UNGROUPED;
}

export function buildSections(windows, groups, assignments = new Map(), query = '', selected = null) {
    const sections = [...groups, {id: UNGROUPED, name: 'Ungrouped'}]
        .filter(group => !selected || group.id === selected)
        .map(group => ({...group, apps: [], count: 0}));
    const byId = new Map(sections.map(section => [section.id, section]));
    const term = query.trim().toLowerCase();
    for (const window of windows) {
        const groupId = groupForWindow(window, groups, assignments.get(window.key));
        const section = byId.get(groupId);
        if (!section || (term && !`${window.title} ${window.appName} ${window.appId} ${section.name}`
            .toLowerCase().includes(term)))
            continue;
        let app = section.apps.find(item => item.id === window.appId);
        if (!app) {
            app = {id: window.appId, name: window.appName, windows: []};
            section.apps.push(app);
        }
        app.windows.push(window);
        section.count++;
    }
    for (const section of sections)
        section.apps.sort((a, b) => a.name.localeCompare(b.name));
    return sections;
}
