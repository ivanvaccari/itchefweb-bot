import fs from "fs";
import path from "path";

export type User = {
    chatId: number;
    username: string;
    password: string;
};

export type OffTime = {
    userId: number;
    date: string;
};

export class Database {
    static TABLES = {
        USERS: "users",
        OFFTIMES: "offtimes",
    } as const;

    private data: {
        users: User[];
        offtimes: OffTime[];
    } = { users: [], offtimes: [] };

    private saveTimeout: NodeJS.Timeout | null = null;

    /**
     * Caica il db dalla cartella ./database/database.json. Se non esiste, crea la cartella e il file
     */
    public load() {
        const dbDir = path.join(process.cwd(), "database");
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir);
        }

        if (!fs.existsSync(path.join(dbDir, "database.json"))) {
            this.save(true);
        }
        this.data = {
            ...this.data,
            ...JSON.parse(fs.readFileSync(path.join(dbDir, "database.json"), "utf-8")),
        };
    }

    /**
     * Crea un nuovo record nella tabella specificata e salva il db
     * @param table
     * @param record
     */
    public create<T>(table: keyof Database["data"], record: T) {
        (this.data[table] as T[]).push(record);
        this.save();
    }

    /**
     * Cerca i record nella tabella specificata che corrispondono al match fornito. Se non viene fornito alcun match, restituisce tutti i record della tabella.
     * @param table
     * @param match
     * @returns
     */
    public find<T>(table: keyof Database["data"], match?: Partial<T>): T[] | undefined {
        const items = this.data[table] as T[];
        if (!match) return items;
        return items.filter((item) => this.objectMatches(item, match));
    }

    /**
     * Save the db to the ./database/database.json file
     * This stores the data in memory to the file system.
     * If immediate is true, it saves immediately, otherwise it waits for 500ms before saving to avoid multiple writes in a short time.
     */
    private save(immediate = false) {
        const _write = () => {
            const dbDir = path.join(process.cwd(), "database");
            fs.writeFileSync(path.join(dbDir, "database.json"), JSON.stringify(this.data, null, 2), "utf-8");
        };

        if (immediate) {
            _write();
        } else {
            if (this.saveTimeout) {
                clearTimeout(this.saveTimeout);
            }
            this.saveTimeout = setTimeout(() => {
                _write();
                this.saveTimeout = null;
            }, 500);
        }
    }

    /**
     * Update an item by id in the specified table with the provided update object. If the item is found, it merges the existing item with the update and saves the database.
     *
     * @param table The table in which to update the item.
     * @param id The id of the item to update.
     * @param update The update object containing the fields to update.
     * @returns {boolean} true if the item was found and updated, false otherwise.
     */
    public updateById<T>(table: keyof Database["data"], id: string, update: Partial<T>): boolean {
        const items = this.data[table] as T[];
        const index = items.findIndex((item) => (item as any).id === id);
        if (index !== -1) {
            items[index] = { ...items[index], ...update } as T;
            this.save();
            return true;
        }
        return false;
    }

    /**
     * Delete an item by match in the specified table. If the item is found, it removes the item and saves the database.
     *
     * @param table The table from which to delete the item.
     * @param match The match object containing the fields to match for deletion.
     * @returns {boolean} true if the item was found and deleted, false otherwise.
     */
    public delete<T>(table: keyof Database["data"], match: Partial<T>): boolean {
        const beforeCount = (this.data[table] as T[]).length;
        this.data[table] = (this.data[table] as T[]).filter((item) => !this.objectMatches(item, match)) as any;
        const afterCount = (this.data[table] as T[]).length;

        if (afterCount < beforeCount) {
            this.save();
            return true;
        }
        return false;
    }

    /**
     * Check if an object matches the provided match object. It compares each key-value pair in the match object with the corresponding key-value pair in the item.
     *
     * @param item The item to check for matches.
     * @param match The match object containing the fields to match against the item.
     * @returns {boolean} true if the item matches the provided match object, false otherwise.
     */
    private objectMatches<T>(item: T, match: Partial<T>): boolean {
        return Object.entries(match).every(([key, value]) => item[key as keyof T] === value);
    }
}
