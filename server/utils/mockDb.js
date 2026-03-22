const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../db.json');
const FALLBACK_DB_PATH = path.join(__dirname, '../db.fallback.json');

function resolveDbPath() {
    try {
        if (fs.existsSync(DB_PATH) && fs.statSync(DB_PATH).isDirectory()) {
            console.warn(`[mockDb] ${DB_PATH} is a directory; falling back to ${FALLBACK_DB_PATH}.`);
            return FALLBACK_DB_PATH;
        }
    } catch (error) {
        console.warn(`[mockDb] Failed to stat ${DB_PATH}; falling back to ${FALLBACK_DB_PATH}.`, error);
        return FALLBACK_DB_PATH;
    }
    return DB_PATH;
}

const ACTIVE_DB_PATH = resolveDbPath();

// Global In-Memory Cache
let dbCache = null;

// Initialize DB if not exists
if (!fs.existsSync(ACTIVE_DB_PATH)) {
    const initialData = { users: {}, invitationCodes: [], verificationCodes: [], usageLogs: [] };
    fs.writeFileSync(ACTIVE_DB_PATH, JSON.stringify(initialData, null, 2));
    dbCache = initialData;
} else {
    try {
        dbCache = JSON.parse(fs.readFileSync(ACTIVE_DB_PATH, 'utf8'));
    } catch (e) {
        console.error("Failed to load DB on startup:", e);
        dbCache = { users: {}, invitationCodes: [], verificationCodes: [], usageLogs: [] };
    }
}

class MockModel {
    constructor(collectionName, schema) {
        this.collectionName = collectionName;
        this.schema = schema;
    }

    _readDB() {
        return dbCache;
    }

    _writeDB(data) {
        dbCache = data;
        try {
            const tempPath = ACTIVE_DB_PATH + '.tmp';
            fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
            fs.renameSync(tempPath, ACTIVE_DB_PATH);
        } catch (e) {
            console.error("DB Write Error:", e);
        }
    }

    _getCollection() {
        const db = this._readDB();
        let collection = db[this.collectionName];
        
        if (!collection) return [];

        // If it's the "users" object map, convert to array for query
        if (this.collectionName === 'users' && !Array.isArray(collection)) {
            return Object.values(collection);
        }
        
        return Array.isArray(collection) ? collection : [];
    }

    _saveCollection(newCollection) {
        const db = this._readDB();
        
        if (this.collectionName === 'users' && !Array.isArray(db.users)) {
            // Convert back to object map if that was the format
            const map = {};
            newCollection.forEach(item => {
                map[item.id || item.email || Math.random().toString()] = item;
            });
            db.users = map;
        } else {
            db[this.collectionName] = newCollection;
        }
        
        this._writeDB(db);
    }

    async find(query = {}) {
        const collection = this._getCollection();
        let results = collection.filter(item => this._matches(item, query));
        return this._wrapResult(results);
    }

    async findOne(query = {}) {
        const collection = this._getCollection();
        const item = collection.find(doc => this._matches(doc, query));
        return item ? this._wrapDocument(item) : null;
    }

    async findById(id) {
        return (await this.findOne({ _id: id })) || (await this.findOne({ id: id }));
    }

    async create(doc) {
        const collection = this._getCollection();
        const newDoc = { 
            _id: Math.random().toString(36).substr(2, 9),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...doc 
        };
        collection.push(newDoc);
        this._saveCollection(collection);
        return this._wrapDocument(newDoc);
    }

    async countDocuments(query = {}) {
        const docs = await this.find(query);
        return docs.length;
    }

    async findOneAndUpdate(query, update, options) {
        const collection = this._getCollection();
        const index = collection.findIndex(doc => this._matches(doc, query));
        
        if (index === -1) {
            if (options && options.upsert) {
                return this.create(update.$set || update);
            }
            return null;
        }

        let doc = collection[index];
        
        // Handle basic operators
        if (update.$set) {
            doc = { ...doc, ...update.$set };
        }
        if (update.$inc) {
            for (const key in update.$inc) {
                doc[key] = (doc[key] || 0) + update.$inc[key];
            }
        }
        // If no operators, assume direct update (not standard mongoose but ok for simple usage)
        if (!update.$set && !update.$inc) {
            // CRITICAL FIX: Deep merge or at least preserve top-level keys
            // Don't just spread update over doc, as it might replace nested objects if we aren't careful.
            // But for this simple DB, spread is usually fine unless 'update' is partial and we expect merge.
            // Mongoose default is 'replace' for updateOne if not using operators? No, typically $set is required.
            // To be safe, we treat direct properties as $set.
            doc = { ...doc, ...update };
        }

        doc.updatedAt = new Date();
        collection[index] = doc;
        this._saveCollection(collection);
        
        return this._wrapDocument(doc);
    }
    
    async updateOne(query, update) {
        return this.findOneAndUpdate(query, update);
    }

    // Helper to check if doc matches query
    _matches(doc, query) {
        for (const key in query) {
            const val = query[key];
            
            // Handle Regex
            if (val && val.$regex) {
                const re = new RegExp(val.$regex, val.$options);
                if (!re.test(doc[key])) return false;
                continue;
            }
            
            // Handle Operators
            if (typeof val === 'object' && val !== null) {
                if (val.$gte !== undefined && !(new Date(doc[key]) >= new Date(val.$gte))) return false;
                if (val.$gt !== undefined && !(doc[key] > val.$gt)) return false;
                if (val.$lt !== undefined && !(doc[key] < val.$lt)) return false;
                // ... add others if needed
            } else {
                // Exact match
                if (doc[key] != val) return false;
            }
        }
        return true;
    }

    // Wrap result to support .select(), .sort(), .limit() chaining (mock)
    _wrapResult(results) {
        const wrapper = results;
        // Mock chainable methods
        wrapper.select = () => wrapper;
        wrapper.sort = (criteria) => {
            // Simple sort implementation if needed, for now return as is or reverse
            if (criteria && criteria.createdAt === -1) return wrapper.reverse();
            return wrapper;
        };
        wrapper.limit = (n) => wrapper.slice(0, n);
        return wrapper;
    }

    _wrapDocument(doc) {
        // Add .toObject() method
        return {
            ...doc,
            toObject: () => doc,
            save: async () => {
                // Find and update self
                await this.findOneAndUpdate({ _id: doc._id }, { $set: doc });
                return doc;
            }
        };
    }
}

module.exports = MockModel;
