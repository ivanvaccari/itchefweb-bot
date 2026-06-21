import "dotenv/config";

export const environment = {
    /**
     * Token di telegram, da generare tramite BotFather
     */
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
    
    /**
     * Il cron che gira alle 9:00  verifica le prenotazioni per oggi
     */
    cronToday: process.env.CRON || "00 9 * * *",

    /**
     * Il cron che gira alle 14:30 verifica le prenotazioni per domani
     */
    cronTomorrow: process.env.CRON_TOMORROW || "30 14 * * *", 

    /**
     * URl base dell'applicazione Camst, ad esempio: https://itchefwebcl.camst.it/XXXXXX/ITChefWebApp
     * Puoi trovare questo url aprendo il portale Camst nel browser e copiando l'url fino a /ITChefWebApp
     */
    camstBaseUrl: process.env.CAMST_BASEURL,
};
