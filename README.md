# ITCHEFWEB-BOT

App NodeJS per monitorare le prenotazioni dei pasti tramite il portale ITChefWeb di CAMST e notificare l'utente via telegram se non è stata effettuata la prenotazione.

Può:
- Ottenere i pasti prenotati per l'utente
- Notificare l'utente se non ha prenotato il pasto per il giorno corrente prima che scada il tempo limite per la prenotazione
- Notificare l'utente se non ha prenotato il pasto per il giorno lavorativo successivo prima che scada il tempo limite per la prenotazione
- Gestire le ferie per gli utenti, in modo da non inviare notifiche se l'utente è in ferie

La serie completa di comandi è ottenibile tramite il comando `/start` sul bot telegram correlato.

## Configurazione

L'app è configurabile tramite le seguenti variabili d'ambiente:

- TELEGRAM_BOT_TOKEN: **obbligatorio** token per bot telegram. Devi generarne uno tramite il bot **@BotFather** su telegram
- CRON: **opzionale** cron per il controllo giornaliero delle prenotazioni (default: 00 9 * * *)
- CRON_TOMORROW: **opzionale** cron per il controllo delle prenotazioni per il giorno lavorativo successivo (default: 30 14 * * *)
- CAMST_BASEURL: **obbligatorio** url base dell'applicazione Camst, ad esempio: https://itchefwebcl.camst.it/XXXXXX/ITChefWebApp. Puoi trovare questo url aprendo il portale Camst nel browser e copiando l'url fino a /ITChefWebApp

## Avviare l'app in ambiente di sviluppo

Crea il file `.env` nella root del progetto con le variabili d'ambiente necessarie, ad esempio:

```env
TELEGRAM_BOT_TOKEN=XXXXXXX:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
CAMST_BASEURL=https://itchefwebcl.camst.it/XXXXXX/ITChefWebApp
```

Dopodichè esegui: 

```bash
npm install  # installa le dipendenze del progetto (da eseguire solo la prima volta)
npm start # avvia l'app in modalità sviluppo
```

## Generazione immagine docker

Esegui uno dei seguenti comandi per generare l'immagine docker:

1. via npm script: `npm run build-docker`
2. via bash script: `bash build-docker.sh`

## Avviare l'app con docker

La lista di immagini disponibili è visibile su [https://hub.docker.com/repository/docker/ivaccari/itchefweb-bot/general](https://hub.docker.com/repository/docker/ivaccari/itchefweb-bot/general).
Esempio di configuazione per docker-compose:

```bash
services:
  itchefwebbot:
    image: ivaccari/itchefweb-bot:1.0.5
    container_name: itchefweb-bot
    volumes:
      - ./database/:/app/database/  # mount per il database interno, obbligatorio
    environment:
      - TELEGRAM_BOT_TOKEN=your_telegram_bot_token
      - CAMST_BASEURL=https://itchefwebcl.camst.it/XXXXXXXXXX/ITChefWebApp
```


