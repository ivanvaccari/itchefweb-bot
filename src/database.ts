import fs from 'fs';
import path from 'path';




export type User = {
    chatId: number;
    username: string;
    password: string;
}

export class Database {

    static TABLES = {
        USERS: 'users',
    } as const;

    private data: {
        users: User[];
    } = { users: [] };
    
    /**
     * Caica il db dalla cartella ./database/database.json. Se non esiste, crea la cartella e il file
     */
    public load() {
        const dbDir = path.join(process.cwd(), 'database');
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir);
        }

        if (!fs.existsSync(path.join(dbDir, 'database.json'))) {
            this.save();
        }
        this.data = JSON.parse(fs.readFileSync(path.join(dbDir, 'database.json'), 'utf-8'));
    }

    /**
     * Crea un nuovo record nella tabella specificata e salva il db
     * @param table 
     * @param record 
     */
    public create<T>(table: keyof Database['data'], record: T) {
        (this.data[table] as T[]).push(record);
        this.save();
    }

    /**
     * Cerca i record nella tabella specificata che corrispondono al match fornito. Se non viene fornito alcun match, restituisce tutti i record della tabella.
     * @param table 
     * @param match 
     * @returns 
     */
    public find<T>(table: keyof Database['data'], match?: Partial<T>): T[] | undefined {
        const items = this.data[table] as T[];
        if (!match) return items;
        return items.filter(item => {
            return Object.entries(match).every(([key, value]) => item[key as keyof T] === value);
        });
    }

    /**
     * Save the db to the ./database/database.json file
     */
    public save() {
        const dbDir = path.join(process.cwd(), 'database');
        fs.writeFileSync(path.join(dbDir, 'database.json'), JSON.stringify(this.data, null, 2), 'utf-8');
    }
}