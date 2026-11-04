import {groupForWindow, UNGROUPED} from './groups.js';

// Custom groups take priority; other windows form stacks by application.
export function makeStacks(windows, groups, assignments = new Map()) {
    const stacks = new Map();
    for (const item of windows) {
        const custom = groupForWindow(item, groups, assignments.get(item.key));
        const id = custom === UNGROUPED ? `app:${item.appId}` : `custom:${custom}`;
        if (!stacks.has(id)) {
            stacks.set(id, {
                id, customId: custom === UNGROUPED ? null : custom,
                name: groups.find(group => group.id === custom)?.name ?? item.appName,
                app: custom === UNGROUPED ? item.app : null,
                windows: [],
            });
        }
        stacks.get(id).windows.push(item);
    }
    return [...stacks.values()].sort((a, b) => {
        if (Boolean(a.customId) !== Boolean(b.customId))
            return a.customId ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

function fit(item, x, y, width, height) {
    const sourceWidth = Math.max(1, item.width);
    const sourceHeight = Math.max(1, item.height);
    const scale = Math.max(0, Math.min(width / sourceWidth, height / sourceHeight, 0.9));
    return {item, x: x + (width - sourceWidth * scale) / 2,
        y: y + (height - sourceHeight * scale) / 2,
        width: sourceWidth * scale, height: sourceHeight * scale};
}

function grid(count, width, height, aspect = 1.6) {
    let best = {columns: 1, rows: count, score: -Infinity};
    for (let columns = 1; columns <= count; columns++) {
        const rows = Math.ceil(count / columns);
        const cellWidth = width / columns;
        const cellHeight = height / rows;
        const score = Math.min(cellWidth, cellHeight * aspect) *
            Math.min(cellHeight, cellWidth / aspect) - (columns * rows - count) * 10;
        if (score > best.score)
            best = {columns, rows, score};
    }
    return best;
}

export function layoutStacks(stacks, area, expandedId = null, scale = 1) {
    if (!stacks.length)
        return [];
    const expanded = stacks.find(stack => stack.id === expandedId);
    const gap = 26 * scale;
    const caption = 44 * scale;
    const padding = 12 * scale;
    const arrangement = grid(stacks.length, area.width, area.height, 1.45);
    const cellWidth = area.width / arrangement.columns;
    const cellHeight = area.height / arrangement.rows;
    return stacks.map((stack, index) => {
        const hidden = Boolean(expanded && stack !== expanded);
        const isExpanded = stack === expanded;
        const rowStart = Math.floor(index / arrangement.columns) * arrangement.columns;
        const rowCount = Math.min(arrangement.columns, stacks.length - rowStart);
        const bounds = isExpanded ? {...area} : {
            x: area.x + (area.width - rowCount * cellWidth) / 2 + index % arrangement.columns * cellWidth,
            y: area.y + Math.floor(index / arrangement.columns) * cellHeight,
            width: cellWidth, height: cellHeight,
        };
        const width = Math.max(1, bounds.width - padding * 2);
        const height = Math.max(1, bounds.height - caption - padding * 2);
        let slots;
        if (isExpanded) {
            const {columns, rows} = grid(stack.windows.length, width, height);
            const slotWidth = width / columns;
            const slotHeight = height / rows;
            slots = stack.windows.map((item, i) => ({
                ...fit(item, bounds.x + padding + i % columns * slotWidth + gap / 2,
                    bounds.y + padding + caption + Math.floor(i / columns) * slotHeight,
                    Math.max(1, slotWidth - gap), Math.max(1, slotHeight - 72 * scale)),
                front: true,
            }));
        } else {
            const offset = Math.min(13 * scale, width / 12, height / 12);
            slots = stack.windows.map((item, i) => {
                const depth = Math.min(stack.windows.length - i - 1, 3);
                return {
                    ...fit(item, bounds.x + padding + offset * depth,
                        bounds.y + padding + offset * (3 - depth),
                        Math.max(1, width - offset * 3), Math.max(1, height - offset * 3)),
                    front: i === stack.windows.length - 1,
                };
            });
        }
        return {...stack, bounds, slots, hidden, expanded: isExpanded};
    });
}
