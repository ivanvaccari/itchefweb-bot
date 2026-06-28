import { Database, type OffTime, type User } from "./database.js";
import { environment } from "./environment.js";
import { HttpClient } from "./HttpClient.js";
import TelegramBot from "node-telegram-bot-api";
import { DateTime } from "luxon";
import cron from "node-cron";

// Carica il db
const database = new Database();
database.load();

/** Cache per clients HTTP, con scadenza di 10 minuti, per poter riusare le sessioni di login senza dover effettuare il login ad ogni richiesta */
const httpClientsCache: { [key: number]: { expiresAt: Date; client: HttpClient } } = {};

/**
 * Comandi disponibili per il bot
 */
const commmands = {
    START: { command: "/start", description: "Avvia il bot e mostra le istruzioni", example: "" },
    REGISTER: { command: "/registra", description: "Registrati al bot.", example: "/registra USERNAME PASSWORD" },
    CHECK_PRENOTAZIONE_OGGI: {
        command: "/prenotazione_oggi",
        description: "Controlla la prenotazione per oggi",
        example: "",
    },
    CHECK_PRENOTAZIONE_DOMANI: {
        command: "/prenotazione_domani",
        description: "Controlla la prenotazione per il prossimo giorno lavorativo (domani, saltando i weekend)",
        example: "",
    },
    CHECK_PRENOTAZIONE: {
        command: "/prenotazione",
        description: "Controlla la prenotazione per un giorno specifico da oggi.",
        example:
            "/prenotazione N, dove N è il numero di giorni da oggi. '/prenotazione 0' controlla per oggi, '/prenotazione 1' controlla per domani, '/prenotazione 2' controlla per dopodomani, e così via.",
    },
    FERIE: {
        command: "/ferie",
        description: "Mostra le ferie inserite per il tuo account.",
        example:''
    },
    AGGIUNGI_FERIE: {
        command: "/aggiungi_ferie",
        description: "Aggiunge giorni di ferie al tuo account, in modo da non ricevere notifiche per quei giorni.",
        example:
            "/aggiungi_ferie GG1-MM1 GG2-MM2, dove GG1-MM1 rappresenta giorno e mese di inizio delle ferie, e GG2-MM2 rappresenta giorno e mese di fine delle ferie. '/aggiungi_ferie 01-01 05-01' aggiunge ferie dal 1 gennaio al 5 gennaio. Non riceverai notifiche per quei giorni (inclusi i giorni di inizio e fine). Se devi inserire solo un giorno, puoi omettere GG2-MM2, ad esempio '/aggiungi_ferie 01-01' aggiunge ferie solo per il 1 gennaio.",
    },
    RIMUOVI_FERIE: {
        command: "/rimuovi_ferie",
        description: "Rimuove giorni di ferie dal tuo account.",
        example:
            "/rimuovi_ferie GG1-MM1 GG2-MM2, dove GG1-MM1 rappresenta giorno e mese di inizio delle ferie, e GG2-MM2 rappresenta giorno e mese di fine delle ferie. '/rimuovi_ferie 01-01 05-01' rimuove le ferie dal 1 gennaio al 5 gennaio. Se devi rimuovere solo un giorno, puoi omettere GG2-MM2, ad esempio '/rimuovi_ferie 01-01' rimuove le ferie solo per il 1 gennaio.",
    },
};

/** Bot di telegram */
const bot = new TelegramBot(environment.telegramBotToken, {
    polling: {
        interval: 1000, // After a long poll request, wait 1 second before sending the next one
        autoStart: true,
        params: {
            timeout: 30, // Timeout in seconds for long polling
        },
    },
});

bot.setMyCommands(
    Object.values(commmands).map((cmd) => ({
        command: cmd.command,
        description: cmd.description,
    })),
);

/**
 * Ogni giorno controlla che ci sia la prenotazione per il giorno stesso (possibile fino entro le 09:30)
 */
cron.schedule(
    environment.cronToday,
    () => {
        let today = DateTime.local();
        if (today.weekday === 6 || today.weekday === 7) {
            return; // Se è sabato o domenica, non rompere le balle alla gente
        }

        async function _iter() {
            const users = database.find<User>(Database.TABLES.USERS);
            for (const user of users || []) {

                const offTimeDate = today.toFormat("yyyy-MM-dd");
                const found = database.find(Database.TABLES.OFFTIMES, { userId: user.chatId, date: offTimeDate });
                if (found && found.length > 0) {
                    console.log(`Utente ${user.username} è in ferie per oggi (${offTimeDate}). Nessun messaggio inviato.`);
                    continue;
                }

                console.log(`Controllo prenotazione per utente ${user.username} per oggi`);
                const reservationResult = await checkReservation(user, 0);
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
    },
    { timezone: "Europe/Rome" },
);

/**
 * Ritorna il numero di giorni da oggi al prossimo giorno lavorativo, saltando i weekend.
 * 
 * @returns Il numero di giorni fino al prossimo giorno lavorativo.
 */
function nextWorkingDayDiff() {
    // predi il giorno lavorativo successivo, saltando i weekend
    let plusDays = 1;
    let today = DateTime.local();

    if (today.weekday === 6) {
        return 2; // Se è sabato, controlla per lunedì (2 giorni dopo)
    }
    if (today.weekday === 5) {
        plusDays = 3; // Se è venerdì, controlla per lunedì (3 giorni dopo)
    }

    return plusDays;
}

/**
 * Ogni giorno controlla che ci sia la prenotazione per il giorno successivo (possibile fino entro le 13:30)
 */
cron.schedule(
    environment.cronTomorrow,
    () => {
        console.log("Controllo prenotazione automatica per il giorno lavorativo successivo");
        // predi il giorno lavorativo successivo, saltando i weekend

        let today = DateTime.local();
        if (today.weekday === 6 || today.weekday === 7) {
            return; // Se è sabato o domenica, non rompere le balle alla gente
        }

        let plusDays = nextWorkingDayDiff();

        console.log(`Controllo prenotazione automatica per ${plusDays} giorni dopo oggi`);
        async function _iter() {
            const users = database.find<User>(Database.TABLES.USERS);
            console.log(`Trovati ${users?.length || 0} utenti registrati. Inizio controllo prenotazioni.`);
            for (const user of users || []) {

                // Controlla che l'utente non abbia inserito delle ferie per il giorno da controllare. Se le ha inserite, salta il controllo per quel giorno.
                const checkOffTimeDate = DateTime.local().plus({ days: plusDays }).toFormat("yyyy-MM-dd");
                const found = database.find(Database.TABLES.OFFTIMES, { userId: user.chatId, date: checkOffTimeDate });
                if (found && found.length > 0) {
                    console.log(`Utente ${user.username} è in ferie per la data(${checkOffTimeDate}). Salto verifica per giorno successivo.`);
                    continue;
                }
                
                // L'utente dovrebbe esserci, fai il controllo
                const reservationResult = await checkReservation(user, plusDays);
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
    },
    { timezone: "Europe/Rome" },
);

/**
 * Restituisce un HttpClient per un dato chatId, riutilizzando quello in cache se ancora valido, altrimenti ne crea uno nuovo.
 *
 * @param id the chat ID of the user for which to get the HttpClient. Clients are cached for reuse for 10 minutes.
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
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // Cache expires in 10 minutes
    };
    return newClient;
}

/**
 * Verifica la prenotazione per un utente e una data specifica.
 *
 * @param user L'utente per cui verificare la prenotazione.
 * @param param Il numero di giorni da oggi per cui verificare la prenotazione (0 = oggi, 1 = domani, ecc.)
 * @returns Un oggetto contenente il risultato della verifica della prenotazione.
 */
async function checkReservation(
    user: User,
    param: number,
): Promise<{ found: boolean; data: any; isReservationPossible?: boolean; message: string; date: string; error?: boolean }> {
    const date = new Date();
    date.setDate(date.getDate() + param);

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
    const today = DateTime.fromJSDate(new Date()).setLocale("it").toLocaleString(DateTime.DATE_FULL);
    const tomorrow = DateTime.fromJSDate(new Date()).plus({ days: 1 }).setLocale("it").toLocaleString(DateTime.DATE_FULL);
    let dd = "";
    if (reservationResult.date === today) {
        dd = "oggi";
    } else if (reservationResult.date === tomorrow) {
        dd = "domani";
    } else {
        dd = "la data " + reservationResult.date;
    }

    if (reservationResult.error) {
        return "Errore nel controllo della prenotazione per " + dd + ": " + reservationResult.message;
    }

    if (reservationResult.found) {
        return `Prenotazione trovata per ${dd}:\n${reservationResult.message}`;
    } else {
        if (reservationResult.isReservationPossible) {
            return `Nessuna prenotazione trovata per ${dd}. È ancora possibile effettuare una prenotazione.`;
        } else {
            return `Nessuna prenotazione trovata per ${dd}. Non è più possibile effettuare una prenotazione.`;
        }
    }
}

/**
 * Register a user with the bot using the /registra command.
 * 
 * @param chatId The chat ID of the user.
 * @param text The text of the message containing the command and credentials.
 * @returns {boolean} True if the registration command was processed, false otherwise.
 */
function register(chatId: number, text: string): boolean {
    if (!text.startsWith(commmands.REGISTER.command)) return false;

    console.log(`Tentativo di registrazione da chatId ${chatId}`);
    const parts = text.split(" ");
    if (parts.length !== 3) {
        bot.sendMessage(chatId, `Formato del comando non valido. Usa: ${commmands.REGISTER.example}`);
        return true;
    }

    // Crea un nuovo utente e salvalo nel database
    const newUser: User = {
        chatId: chatId,
        username: parts[1]!,
        password: parts[2]!,
    };
    database.create<User>(Database.TABLES.USERS, newUser);
    bot.sendMessage(chatId, "Registrazione avvenuta con successo!");

    return true;
}

/**
 * Manages the /start command, sending a welcome message and listing available commands.
 *
 * @param chatId the chat ID of the user.
 * @param text The test message
 * @param user the user object containing user details.
 * @returns false if the command is not /start, true otherwise.
 */
function start(chatId: number, text: string, user: User): boolean {
    if (text !== commmands.START.command) return false;

    console.log(`Utente ${user.username} ha avviato il bot.`);
    const message = Object.values(commmands)
        .map((cmd) => `${cmd.command}: ${cmd.description}${cmd.example ? `. Esempio: ${cmd.example}` : ""}`)
        .join("\n\n");
    bot.sendMessage(chatId, "Benvenuto! Questo bot contolla le prenotazioni dei pasti alla mensa Camst. Ecco i comandi disponibili:\n\n" + message);
    return true;
}

/**
 * Manages the case when a user is not registered, sending a message with instructions on how to register.
 * 
 * @param chatId the chat ID of the user.
 * @returns
 */
function registrationRequired(chatId: number) {
    console.log(`Utente non registrato con chatId ${chatId}.`);
    bot.sendMessage(
        chatId,
        `Utente non registrato. Per registrarti, invia il comando '${commmands.REGISTER.example}'. Le credenziali da utilizzare sono quelle dell'app ItChefWeb`,
    );
    return;
}

/**
 * Checks if the message is a reservation command and processes it accordingly.
 * 
 * @param chatId the chat ID of the user.
 * @param text The text of the message containing the command.
 * @param user the user object containing user details.
 * @returns {boolean} True if the message was a reservation command and was processed, false otherwise.
 */
function reservationCommand(chatId: number, text: string, user: User): boolean {
    // Gestisce il comando di controllo prenotazione
    const isPrenotazioneOggiCommand = text === commmands.CHECK_PRENOTAZIONE_OGGI.command;
    const isPrenotazioneDomaniCommand = text === commmands.CHECK_PRENOTAZIONE_DOMANI.command;
    const isPrenotazioneCommand = text.startsWith(commmands.CHECK_PRENOTAZIONE.command + " ");
    if (!(isPrenotazioneOggiCommand || isPrenotazioneDomaniCommand || isPrenotazioneCommand)) return false;

    let dateParam = 0;
    if (isPrenotazioneDomaniCommand) {
        dateParam = nextWorkingDayDiff();
    } else if (isPrenotazioneCommand) {
        const parts = text.split(" ");
        dateParam = parseInt(parts[1] ?? "", 10);
        if (isNaN(dateParam)) {
            bot.sendMessage(chatId, `Formato del comando non valido. Usa: ${commmands.CHECK_PRENOTAZIONE.example}`);
            return true;
        }
    }

    console.log(`Controllo prenotazione per utente ${user.username} con parametro: ${dateParam}`);

    checkReservation(user, dateParam)
        .then((reservationResult: any) => {
            const message = generateReservationMessage(reservationResult);
            bot.sendMessage(chatId, message);
        })
        .catch((err) => {
            bot.sendMessage(chatId, `Errore durante il controllo della prenotazione: ${err.message}`);
        });

    return true;
}

/**
 * Aggiunge uno o piu giorni di ferie.
 * 
 * @param chatId The chat ID of the user.
 * @param text The text of the message containing the command.
 * @param user The user object containing user details.
 * @returns {boolean} True se il comando è stato gestito, false altrimenti.
 */
function addOfftimeCommand(chatId: number, text: string, user: User): boolean {

    // Extrapolating the command and the dates from the text using regex
    const regex = new RegExp('^' + commmands.AGGIUNGI_FERIE.command + '\\s+(\\d{2})-(\\d{2})(\\s+(\\d{2})-(\\d{2})){0,1}$');
    const match = regex.exec(text);
    if (!match) return false; // not a match for the add off-time command

    // Parse dates. If no end date is provided, use the start date as the end date (shortcut for adding a single day)
    let startDate = DateTime.local().set({ day: parseInt(match[1]!), month: parseInt(match[2]!) });
    let endDate = startDate;
    if (match[4] && match[5]) {
        endDate = DateTime.local().set({ day: parseInt(match[4]!), month: parseInt(match[5]!) });
        if (endDate < startDate) {
            endDate = endDate.plus({ years: 1 }); // Se la data di fine è prima della data di inizio, si assume che sia nell'anno successivo (caso per dicembre-gennaio)
        }
    }

    console.log(`Aggiunta ferie per utente ${user.username} dal ${startDate.toFormat("dd-MM")} al ${endDate.toFormat("dd-MM")}`);

    // Iterate on all days and create a record for each day. If the record already exists, skip it.
    const diffDays = endDate.diff(startDate, "days").days + 1; // +1 per includere il giorno di inizio e fine
    for (let i = 0; i < diffDays; i++) {
        const offTimeDate = startDate.plus({ days: i }).toFormat("yyyy-MM-dd");
        const found = database.find(Database.TABLES.OFFTIMES, { userId: user.chatId, date: offTimeDate });
        if (!found || found.length === 0) {
            database.create(Database.TABLES.OFFTIMES, { userId: user.chatId, date: offTimeDate });
        }
    }
    bot.sendMessage(chatId, `Ferie aggiunte per il periodo ${startDate.toFormat("dd-MM")} - ${endDate.toFormat("dd-MM")}. Non riceverai notifiche per questi giorni.`);

    return true;

}

/**
 * Rimuove uno o piu giorni di ferie.
 * 
 * @param chatId The chat ID of the user.
 * @param text The text of the message containing the command.
 * @param user The user object containing user details.
 * @returns {boolean} True se il comando è stato gestito, false altrimenti.
 */
function removeOfftimeCommand(chatId: number, text: string, user: User): boolean {

    const regex = new RegExp('^' + commmands.RIMUOVI_FERIE.command + '\\s+(\\d{2})-(\\d{2})(\\s+(\\d{2})-(\\d{2})){0,1}$');
    const match = regex.exec(text);
    if (!match) return false;

    let startDate = DateTime.local().set({ day: parseInt(match[1]!), month: parseInt(match[2]!) });
    let endDate = startDate;
    if (match[4] && match[5]) {
        endDate = DateTime.local().set({ day: parseInt(match[4]!), month: parseInt(match[5]!) });
        if (endDate < startDate) {
            endDate = endDate.plus({ years: 1 }); // Se la data di fine è prima della data di inizio, si assume che sia nell'anno successivo (caso per dicembre-gennaio)
        }
    }

    console.log(`Rimozione ferie per utente ${user.username} dal ${startDate.toFormat("dd-MM")} al ${endDate.toFormat("dd-MM")}`);
    const diffDays = endDate.diff(startDate, "days").days + 1; // +1 per includere il giorno di inizio e fine
    for (let i = 0; i < diffDays; i++) {
        const offTimeDate = startDate.plus({ days: i }).toFormat("yyyy-MM-dd");
        const found = database.find(Database.TABLES.OFFTIMES, { userId: user.chatId, date: offTimeDate });
        if (found && found.length > 0) {
            database.delete(Database.TABLES.OFFTIMES, found[0]!);
        }
    }
    bot.sendMessage(chatId, `Ferie rimosse per il periodo ${startDate.toFormat("dd-MM")} - ${endDate.toFormat("dd-MM")}. Il sistema tornerà a notificarti per questi giorni se necessario.`);

    return true;

}

/**
 * Ritorna la lista di giorni di ferie inseriti per l'utente. 
 * @param chatId The chat ID of the user.
 * @param text The text of the message containing the command. 
 * @param user The user object containing user details. 
 * 
 * @returns {boolean} True se il comando è stato gestito, false altrimenti.
 */
function getOfftimeCommand(chatId: number, text: string, user: User): boolean {

    // If this is not a /ferie command, return false and skip the rest of the function
    if (text !== commmands.FERIE.command) return false;

    const offTimeDays = database.find<OffTime>(Database.TABLES.OFFTIMES, { userId: user.chatId});

    if (!offTimeDays || offTimeDays.length === 0) {
        bot.sendMessage(chatId, `Non hai giorni di ferie inseriti.`);
        return true;
    }

    const offTimeDaysFormatted = offTimeDays.map((offtime) => {
        const date = DateTime.fromISO(offtime.date);
        return date.toFormat("dd-MM-yyyy");
    });

    bot.sendMessage(chatId, `I tuoi giorni di ferie sono:\n${offTimeDaysFormatted.join("\n")}`);
    return true;
}   



// Listen for any kind of message. There are different kinds of messages.
bot.on("message", (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    // Verifica ed esegui il messaggio di registrazione. Nel caso lo sia, non proseguire con gli altri comandi.
    if (register(chatId, text)) {
        return;
    }

    // Da qui in poi si assume che l'utente sia già registrato
    const user: User | undefined = database.find<User>(Database.TABLES.USERS, { chatId: chatId })?.[0];
    if (!user) {
        return registrationRequired(chatId);
    }

    // Verifica ed esegui il messaggio di start. Nel caso lo sia, non proseguire con gli altri comandi.
    if (start(chatId, text, user)) {
        return;
    }

    // Gestisce il comando di controllo prenotazione. Nel caso lo sia, non proseguire con gli altri comandi.
    if (reservationCommand(chatId, text, user)) {
        return;
    }

    // Gestisce il comando di visualizzazione ferie. Nel caso lo sia, non proseguire con gli altri comandi.
    if (getOfftimeCommand(chatId, text, user)) {
        return;
    }

    // Gestisce il comando di aggiunta ferie. Nel caso lo sia, non proseguire con gli altri comandi.
    if (addOfftimeCommand(chatId, text, user)) {
        return;
    }

    // Gestisce il comando di rimozione ferie. Nel caso lo sia, non proseguire con gli altri comandi.
    if (removeOfftimeCommand(chatId, text, user)) {
        return;
    }

    bot.sendMessage(chatId, `Comando non riconosciuto. Invia ${commmands.START.command} per vedere la lista dei comandi disponibili.`);
});

console.log("Bot avviato e in ascolto dei messaggi.");
