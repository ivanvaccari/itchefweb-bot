import { Database, type User } from "./database.js";
import { environment } from "./environment.js";
import { HttpClient } from "./HttpClient.js";
import TelegramBot from "node-telegram-bot-api";
import { DateTime } from "luxon";
import cron from "node-cron";

// Carica il db
const database = new Database();
database.load();

// Cache per clients HTTP, con scadenza di 10 minuti, per poter riusare le sessioni di login senza dover effettuare il login ad ogni richiesta
const httpClientsCache: { [key: number]: { expiresAt: Date; client: HttpClient } } = {};

/**
 * Comandi disponibili per il bot
 */
const commmands = {
    START: { command: "/start", description: "Avvia il bot e mostra le istruzioni", example: "" },
    REGISTER: { command: "/registra", description: "Registrati al bot.", example: "/registra USERNAME PASSWORD" },
    CHECK_PRENOTAZIONE: {
        command: "/prenotazione",
        description: "Controlla la prenotazione per oggi, domani o un giorno specifico.",
        example: "/prenotazione oggi, /prenotazione domani, /prenotazione 3",
    },
};

/** Bot di telegram */
const bot = new TelegramBot(environment.telegramBotToken, {
    polling: {
        interval: 10000,
        autoStart: true,
        params: {
            timeout: 20, // Timeout in seconds for long polling
        },
    },
});

/**
 * Ogni giorno controlla che ci sia la prenotazione per il giorno stesso (possibile fino entro le 09:30)
 */
cron.schedule(environment.cronToday, () => {
    let today = DateTime.local();

    if (today.weekday === 6 || today.weekday === 7) {
        return; // Se è sabato o domenica, non rompere le balle alla gente
    }

    async function _iter() {
        const users = database.find<User>(Database.TABLES.USERS);
        for (const user of users || []) {
            console.log(`Controllo prenotazione per utente ${user.username} per oggi`);
            const reservationResult = await checkReservation(user, "oggi");
            if (!reservationResult.found) {
                console.log(`Nessuna prenotazione trovata per utente ${user.username} per oggi. Invia messaggio.`);
                const message = generateReservationMessage(reservationResult);
                bot.sendMessage(user.chatId, message);
            } else {
                console.log(`Prenotazione trovata per utente ${user.username} per oggi. Nessun messaggio inviato.`);
            }

            await new Promise((resolve) => setTimeout(resolve, 10000)); // Attende 10 secondi tra le richieste per evitare di sovraccaricare il server
        }
    }
    _iter();
});

/**
 * Ogni giorno controlla che ci sia la prenotazione per il giorno successivo (possibile fino entro le 13:30)
 */
cron.schedule(environment.cronTomorrow, () => {
    
    // predi il giorno lavorativo successivo, saltando i weekend
    let plusDays = 1;
    let today = DateTime.local();

    if (today.weekday === 6 || today.weekday === 7) {
        return; // Se è sabato o domenica, non rompere le balle alla gente
    }
    if (today.weekday === 5) {
        plusDays = 3; // Se è venerdì, controlla per lunedì (3 giorni dopo)
    }

    async function _iter() {
        const users = database.find<User>(Database.TABLES.USERS);

        for (const user of users || []) {
            const reservationResult = await checkReservation(user, `${plusDays}`);
            if (!reservationResult.found) {
                console.log(`Nessuna prenotazione trovata per utente ${user.username} per ${plusDays} giorni dopo oggi. Invia messaggio.`);
                const message = generateReservationMessage(reservationResult);
                bot.sendMessage(user.chatId, message);
            } else {
                console.log(`Prenotazione trovata per utente ${user.username} per ${plusDays} giorni dopo oggi. Nessun messaggio inviato.`);
            }

            await new Promise((resolve) => setTimeout(resolve, 10000)); // Attende 10 secondi tra le richieste per evitare di sovraccaricare il server
        }
    }
    _iter();
});

/**
 * Restituisce un HttpClient per un dato chatId, riutilizzando quello in cache se ancora valido, altrimenti ne crea uno nuovo.
 *
 * @param id
 * @returns
 */
function getHttpClientForChatId(id: number): HttpClient {
    const cacheEntry = httpClientsCache[id];
    if (cacheEntry && cacheEntry.expiresAt > new Date()) {
        console.log(`Riutilizzo HttpClient in cache per chatId ${id}.`);
        return cacheEntry.client;
    }
    console.log(`Creazione di un nuovo HttpClient per chatId ${id}.`);
    const newClient = new HttpClient();
    httpClientsCache[id] = {
        client: newClient,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // Cache expires in 1 hour
    };
    return newClient;
}

/**
 * Verifica la prenotazione per un utente e una data specifica.
 *
 * @param user
 * @param param
 * @returns
 */
async function checkReservation(
    user: User,
    param: string,
): Promise<{ found: boolean; data: any; isReservationPossible?: boolean; message: string; date: string; error?: boolean }> {
    let date = null;
    if (param === "oggi") {
        date = new Date();
    } else if (param === "domani") {
        date = new Date();
        date.setDate(date.getDate() + 1);
    } else {
        const day = parseInt(param, 10);
        if (!isNaN(day)) {
            date = new Date();
            date.setDate(date.getDate() + day);
        }
    }
    if (!date) {
        return { found: false, error: true, message: `Formato del comando non valido. Usa: ${commmands.CHECK_PRENOTAZIONE.example}`, date: "", data: "" };
    }

    const italianDateString = DateTime.fromJSDate(date).setLocale("it").toLocaleString(DateTime.DATE_FULL);
    try {
        const httpClient = getHttpClientForChatId(user.chatId);
        await httpClient.login(user.username, user.password);
        const res = await httpClient.getReservation(date);
        return {
            ...res,
            date: italianDateString,
        };
    } catch (err: any) {
        return { found: false, error: true, message: err.message, date: italianDateString, data: "" };
    }
}

/**
 * Genera un messaggio leggibile per l'utente in base al risultato della verifica della prenotazione.
 *
 * @param reservationResult
 * @returns
 */
function generateReservationMessage(reservationResult: {
    found: boolean;
    data: any;
    isReservationPossible?: boolean;
    message: string;
    date: string;
    error?: boolean;
}): string {
    if (reservationResult.error) {
        return "Errore nel controllo della prenotazione per la data " + reservationResult.date + ": " + reservationResult.message;
    }

    if (reservationResult.found) {
        return `Prenotazione trovata per la data ${reservationResult.date}:\n${reservationResult.data}`;
    } else {
        if (reservationResult.isReservationPossible) {
            return `Nessuna prenotazione trovata per la data ${reservationResult.date}. È possibile effettuare una prenotazione.`;
        } else {
            return `Nessuna prenotazione trovata per la data ${reservationResult.date}. Non è possibile effettuare una prenotazione.`;
        }
    }
}

// Listen for any kind of message. There are different kinds of messages.
bot.on("message", (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";
    // Verifica se è il messaggio di registrazione
    if (text.startsWith(commmands.REGISTER.command)) {
        console.log(`Tentativo di registrazione da chatId ${chatId}`);
        const parts = text.split(" ");
        if (parts.length !== 3) {
            bot.sendMessage(chatId, `Formato del comando non valido. Usa: ${commmands.REGISTER.example}`);
            return;
        }

        // Crea un nuovo utente e salvalo nel database
        const newUser: User = {
            chatId: chatId,
            username: parts[1]!,
            password: parts[2]!,
        };
        database.create<User>(Database.TABLES.USERS, newUser);
        bot.sendMessage(chatId, "Registrazione avvenuta con successo!");
        return;
    }

    // Da qui in poi si assume che l'utente sia già registrato
    const user: User | undefined = database.find<User>(Database.TABLES.USERS, { chatId: chatId })?.[0];
    if (!user) {
        console.log(`Utente non registrato con chatId ${chatId}.`);
        bot.sendMessage(chatId, `Utente non registrato. Per registrarti, invia il comando '${commmands.REGISTER.example}'. Le credenziali da utilizzare sono quelle dell'app ItChefWeb`);
        return;
    }

    // Gestisce il comando di start
    if (text === commmands.START.command) {
        console.log(`Utente ${user.username} ha avviato il bot.`);
        const message = Object.values(commmands)
            .map((cmd) => `${cmd.command}: ${cmd.description}${cmd.example ? ` (esempio: ${cmd.example})` : ""}`)
            .join("\n\n");
        bot.sendMessage(chatId, "Benvenuto! Questo bot contolla le prenotazioni dei pasti alla mensa Camst. Ecco i comandi disponibili:\n\n" + message);
        return;
    }

    // Gestisce il comando di controllo prenotazione
    if (text.startsWith(commmands.CHECK_PRENOTAZIONE.command)) {
        const parts = text.split(" ");
        let dateParam = parts[1] ?? "oggi";

        console.log(`Controllo prenotazione per utente ${user.username} con parametro: ${dateParam}`);

        checkReservation(user, dateParam)
            .then((reservationResult: any) => {
                const message = generateReservationMessage(reservationResult);
                bot.sendMessage(chatId, message);
            })
            .catch((err) => {
                bot.sendMessage(chatId, `Errore durante il controllo della prenotazione: ${err.message}`);
            });

        return;
    }

    // Gestisce il comando di start
    if (text === commmands.START.command) {
        const message = Object.values(commmands)
            .map((cmd) => `${cmd.command}: ${cmd.description}${cmd.example ? ` (esempio: ${cmd.example})` : ""}`)
            .join("\n\n");
        bot.sendMessage(chatId, "Benvenuto! Questo bot contolla le prenotazioni dei pasti alla mensa Camst. Ecco i comandi disponibili:\n\n" + message);
        return;
    }

    bot.sendMessage(chatId, `Comando non riconosciuto. Invia ${commmands.START.command} per vedere la lista dei comandi disponibili.`);
});

/*
async function main(){
    const httpClient = new HttpClient();
    await httpClient.login(environment.camstEmail, environment.camstPassword);

    const date = new Date("2026-06-23");
    console.log(await httpClient.getReservation(date));
}



main()
.catch((err) => {
    console.error("Errore durante l'esecuzione del programma:", err);
    process.exit(1);
});*/
