# $plit 2 — prototipo indipendente

La versione originale è nel ramo `main` e non viene modificata.

## Nuove funzioni
- Interfaccia responsive scura con accenti ciano/lime/violetto/ambra ad alto contrasto, dashboard, card e grafico ad anello.
- **Totale speso dal gruppo**: somma di ogni spesa una sola volta, indipendentemente da chi paga e dalle quote.
- Contatore delle spese, numero partecipanti e media statistica per persona.
- Riepilogo degli importi effettivamente pagati da ogni partecipante.
- Calcolo saldi e suggerimenti di rimborso in centesimi interi.
- Nove categorie: Carburante, Autostrada, Pedaggi, Supermercato, Cibo e bevande, Casa e alloggio, Musei/attrazioni, Acquisto, Svago.
- Categoria completamente **facoltativa**, con voce "Senza categoria" e possibilità di aggiungere un nome personalizzato.
- Categoria modificabile in seguito tramite la matita nell’elenco delle spese senza variare saldo, spesa o quote.
- **Tabella interattiva delle spese per categoria** con numero di spese, totale in euro, peso percentuale e mini barre. Toccando una riga si filtrano le spese, compresa la voce "Senza categoria". Il totale della tabella coincide con il totale del gruppo.
- Toccando il chip categoria sotto una spesa si attiva/disattiva lo stesso filtro; il pulsante "Mostra tutte" lo rimuove. Il subtotale filtrato è mostrato in fondo all’elenco mentre il totale generale rimane nella dashboard.
- Rimborsi con nomi più grandi, indicazione esplicita "deve a" e importi ad alto contrasto.
- Compatibilità con le vecchie categorie della prima bozza V2. Le vecchie spese già salvate rimangono visibili.
- Filtro spese per descrizione o pagante.

## Isolamento dei dati
**Questa V2 è intenzionalmente una demo standalone basata su localStorage** con chiave separata `split-web-v2-local-rooms-v1`.
Non comunica con Firebase originale (`split-da653`), non scrive alcun dato sugli $plit esistenti e non modifica il sito pubblicato.
I gruppi V2 funzionano solo su un singolo browser, non sono sincronizzati, non sono accessibili da altri dispositivi tramite codice e possono essere persi cancellando i dati del browser. La chiave del localStorage è rimasta invariata dalla V2 precedente: eventuali gruppi già salvati sullo stesso browser vengono mantenuti. La nota tecnica è nel footer della V2 per lasciare la testata pulita.

Per una V2 realmente condivisibile e pronta alla pubblicazione serve configurare **un nuovo progetto Firebase** con regole di sicurezza, autenticazione e backup propri. Non inserire chiavi o riutilizzare il database della V1 senza pianificazione e controllo.

## Avvio
Aprire `v2/index.html` con un server HTTP locale (ad esempio `python -m http.server 8000` dalla radice del repository, poi `http://localhost:8000/v2/`). Non aprire con `file://`, perché il browser potrebbe bloccare i moduli ES.

## Test
Sono previsti test per aritmetica in centesimi, rimborsi e categorie non obbligatorie. Con Node.js 20+:
```bash
cd v2
npm test
```
