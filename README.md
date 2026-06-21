# AUTOCAMST

Mini app Node.js per monitorare le prenotazione della camst di fontevivo e inviare un messaggio su telegram se non è stata effettuata la prenotazione.

## Avvio


E' richiesto docker e docker-compose.

#### ENV

- TELEGRAM_BOT_TOKEN: **obbligatorio** token per bot telegram.
- CRON: **opzionale** cron per il controllo giornaliero delle prenotazioni (default: 00 9 * * *)
- CRON_TOMORROW: **opzionale** cron per il controllo delle prenotazioni per il giorno lavorativo successivo (default: 30 14 * * *)
- CAMST_BASEURL: **obbligatorio** url base dell'applicazione Camst, ad esempio: https://itchefwebcl.camst.it/XXXXXX/ITChefWebApp. Puoi trovare questo url aprendo il portale Camst nel browser e copiando l'url fino a /ITChefWebApp

#### Mounts
- /app/database/: **obbligatorio** cartella dove viene salvato il db interno (default: ./database)

```bash
services:
  autocamst:
    image: autocamst
    container_name: autocamst
    volumes:
      - ./database/:/app/database/
    ports:
      - "3000:3000"
    environment:
      - TELEGRAM_BOT_TOKEN=your_telegram_bot_token
      - CAMST_BASEURL=https://itchefwebcl.camst.it/XXXXXXXXXX/ITChefWebApp
```

