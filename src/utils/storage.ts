export const DELETE_MARKER = 'DELETE_ATOM_MARKER';

const getModKey = (fileId: string) => `mod_${fileId}`;

export const saveModification = (fileId: string, atomIndex: number, newElement: string) => {
    try {
        const key = getModKey(fileId);
        const existing = localStorage.getItem(key);
        const mods = existing ? JSON.parse(existing) : {};
        mods[atomIndex] = newElement;
        localStorage.setItem(key, JSON.stringify(mods));
    } catch (e) {
        console.error("Storage failed", e);
    }
};

export const getModifications = (fileId: string) => {
    try {
        const key = getModKey(fileId);
        const existing = localStorage.getItem(key);
        return existing ? JSON.parse(existing) : {};
    } catch (e) {
        return {};
    }
};

export const clearModifications = (fileId: string) => {
    try {
        localStorage.removeItem(getModKey(fileId));
    } catch (e) {}
};
