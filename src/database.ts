import fs from "fs";
import path from "path";

/**
 * User record type.
 */
export type User = {
    /** Telegram chat ID of the user */
    chatId: number;
    /** Username of the user (for the ITChefweb app) */
    username: string;
    /** Password of the user (for the ITChefweb app) */
    password: string;
};

/**
 * Off-time record type.
 * Represent a user's off-time with a userId and a date (single day off).
 */
export type OffTime = {
    /** Id of the user */
    userId: number;
    /** Date of the off-time */
    date: string;
};


/**
 * This class represents a simple in-memory database that can be persisted to a JSON file. It provides very basic methods to manage data.
 * 
 * Cons: very simple, no complex queries, no relations, no indexing, no transactions, no concurrency control, no data validation, no data integrity checks, no data encryption.
 * Pros: no external dependencies, easy to use, easy to understand, easy to extend, easy to test, easy to debug, easy to maintain.
 */
export class Database {
    static TABLES = {
        USERS: "users",
        OFFTIMES: "offtimes",
    } as const;

    private data: {
        users: User[];
        offtimes: OffTime[];
    } = { users: [], offtimes: [] };

    /** Timer for debouncing the save operation */
    private saveTimeout: NodeJS.Timeout | null = null;

    /**
     * Loads the database from the ./database/database.json file. If the file does not exist, it creates the directory and the file with default data.
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
     * Create a new record in the specified table and save the database.
     * @param table The table in which to create the record.
     * @param record The record to create.
     */
    public create<T>(table: keyof Database["data"], record: T) {
        (this.data[table] as T[]).push(record);
        this.save();
    }

    /**
     * Find records in the specified table that match the provided match object. If no match is provided, it returns all records in the table.
     * 
     * @param table The table in which to search for records.
     * @param match The match object containing the fields to match for filtering.
     * @returns An array of matching records or undefined if no records are found.
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
            // In case of "Not immediate", debounce the file write to avoid multiple writes in a short time.
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
     * Update one or more items in the specified table with the provided update object.
     * It merges the existing matching items with the updated data and saves the database.
     *
     * @param table The table in which to update the item.
     * @param match The match object containing the fields to match for updating.
     * @param update The update object containing the fields to update.
     * @returns {boolean} true if the item was found and updated, false otherwise.
     */
    public update<T>(table: keyof Database["data"], match: Partial<T>, update: Partial<T>): boolean {
        let hasChanges = false
        const items = this.data[table] as T[];
        items.forEach((item, index) => {
            if (this.objectMatches(item, match)) {
                items[index] = { ...item, ...update } as T;
                hasChanges = true;
            }
        });
        if (hasChanges) {
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
