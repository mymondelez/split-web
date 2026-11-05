# $plit 2 — prototipo indipendente

La versione originale è nel ramo `main` e non viene modificata.

## Nuove funzioni
- Interfaccia responsive più moderna con dashboard e grafico ad anello.
- **Totale speso dal gruppo**: somma di ogni spesa una sola volta, indipendentemente da chi paga e dalle quote.
- Contatore delle spese, numero partecipanti e media statistica per persona.
- Riepilogo degli importi effettivamente pagati da ogni partecipante.
- Calcolo saldi e suggerimenti di rimborso in centesimi interi.
- Categorie delle spese e filtro per descrizione o pagante.

## Isolamento dei dati
**Questa V2 è intenzionalmente una demo standalone basata su localStorage** con chiave separata `split-web-v2-local-rooms-v1`.
Non comunica con Firebase originale (`split-da653`), non scrive alcun dato sugli $plit esistenti e non modifica il sito pubblicato.
I gruppi V2 funzionano solo su un singolo browser, non sono sincronizzati, non sono accessibili da altri dispositivi tramite codice e possono essere persi cancellando i dati del browser.

Per una V2 realmente condivisibile e pronta alla pubblicazione serve configurare **un nuovo progetto Firebase** con regole di sicurezza, autenticazione e backup propri. Non inserire chiavi o riutilizzare il database della V1 senza pianificazione e controllo.

## Avvio
Aprire `v2/index.html` con un server HTTP locale (ad esempio `python -m http.server 8000` dalla radice del repository, poi `http://localhost:8000/v2/`). Non aprire con `file://`, perché il browser potrebbe bloccare i moduli ES.

## Test
Con Node.js 20+:
```bash
cd v2
npm test
```
