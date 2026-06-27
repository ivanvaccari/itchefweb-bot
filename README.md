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

- TELEGRAM_BOT_TOKEN: **obbligatorio** token per bot telegram. Devi generarne uno tramite il bot @BotFather su telegram
- CRON: **opzionale** cron per il controllo giornaliero delle prenotazioni (default: 00 9 * * *)
- CRON_TOMORROW: **opzionale** cron per il controllo delle prenotazioni per il giorno lavorativo successivo (default: 30 14 * * *)
- CAMST_BASEURL: **obbligatorio** url base dell'applicazione Camst, ad esempio: https://itchefwebcl.camst.it/XXXXXX/ITChefWebApp. Puoi trovare questo url aprendo il portale Camst nel browser e copiando l'url fino a /ITChefWebApp

## Avviare l'app con docker

Esempio di configuazione per docker-compose:

```bash
services:
  itchefwebbot:
    image: ivaccari/itchefweb-bot:latest
    container_name: itchefweb-bot
    volumes:
      - ./database/:/app/database/  # mount per il database interno, obbigatorio
    environment:
      - TELEGRAM_BOT_TOKEN=your_telegram_bot_token
      - CAMST_BASEURL=https://itchefwebcl.camst.it/XXXXXXXXXX/ITChefWebApp
```


