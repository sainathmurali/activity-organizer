export const MAX_SAVED_VERSIONS = 10;

export function parseSessions(json) {
    const sessions = JSON.parse(json);
    if (!Array.isArray(sessions))
        throw new Error('Saved sessions must be an array.');
    const groupIds = new Set();
    for (const session of sessions) {
        if (!session || typeof session.groupId !== 'string' || !session.groupId || groupIds.has(session.groupId) ||
            !Array.isArray(session.versions))
            throw new Error('Each saved group needs a unique ID and a version list.');
        groupIds.add(session.groupId);
        const versionIds = new Set();
        for (const version of session.versions) {
            if (!version || typeof version.id !== 'string' || !version.id || versionIds.has(version.id) ||
                typeof version.createdAt !== 'string' || !Number.isFinite(Date.parse(version.createdAt)) ||
                typeof version.automatic !== 'boolean' || !Array.isArray(version.windows) || !version.windows.length)
                throw new Error('A saved version has invalid metadata.');
            versionIds.add(version.id);
            for (const window of version.windows) {
                if (!window || typeof window.appId !== 'string' || !window.appId || typeof window.title !== 'string')
                    throw new Error('A saved window needs an application ID and title.');
            }
        }
    }
    return sessions;
}

export function snapshotWindows(items) {
    return items.map(item => ({appId: item.appId, title: item.title ?? ''}));
}

export function saveVersion(sessions, groupId, version) {
    // Never save an empty group on window close or logout: its last useful
    // snapshot is precisely what the user needs when reopening it later.
    if (!version.windows.length)
        return sessions;
    const current = sessions.find(session => session.groupId === groupId);
    let versions = [...(current?.versions ?? [])];
    if (version.automatic) {
        const previous = versions.find(item => item.automatic);
        const signature = windows => JSON.stringify(windows.map(item => `${item.appId}\0${item.title}`).sort());
        if (previous && signature(previous.windows) === signature(version.windows))
            return sessions;
        versions = versions.filter(item => !item.automatic);
    }
    versions = [version, ...versions].slice(0, MAX_SAVED_VERSIONS);
    const result = sessions.filter(session => session.groupId !== groupId);
    result.push({groupId, versions});
    return result;
}

export function planRestore(version, liveWindows) {
    const available = new Map();
    for (const window of liveWindows)
        available.set(window.appId, (available.get(window.appId) ?? 0) + 1);
    return version.windows.filter(window => {
        const count = available.get(window.appId) ?? 0;
        if (!count)
            return true;
        available.set(window.appId, count - 1);
        return false;
    });
}

export function clearAutomaticVersion(sessions, groupId) {
    return sessions.map(session => session.groupId === groupId
        ? {...session, versions: session.versions.filter(version => !version.automatic)} : session)
        .filter(session => session.versions.length);
}

export function versionLabel(version) {
    const date = new Date(version.createdAt).toLocaleString();
    return `${version.automatic ? 'Automatic save' : 'Saved version'} · ${date} · ${version.windows.length} windows`;
}
