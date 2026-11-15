# Dark Shadow — prototipo

Picchiaduro a scorrimento laterale in stile console 16-bit anni '90.
Protagonista: **Dark Shadow**, eroe mascherato che combatte il crimine con la magia nera.

**Gioca online:** https://agtw-source.github.io/dark-shadow/

## Comandi

| Tasto | Azione |
|---|---|
| Frecce / WASD | Muoversi (anche in profondità) |
| Z / J | Colpo di bastone (premi 3 volte per la combo) |
| X / K / Spazio | Salto (Z in aria = attacco in salto) |
| C / L | Arco oscuro (costa magia) |
| V / U | Sfera d'ombra, colpo a distanza (costa magia) |
| B / I | Super mossa (con la barra magia piena) |
| Shift / H | Parata |
| P / Esc · M | Pausa · Audio on/off |

Su telefono e tablet compaiono joystick e pulsanti a schermo (giocare in orizzontale). Funziona anche con un gamepad.

## Contenuto del prototipo
- 1 livello (città gotica) con 6 ondate di nemici e un boss finale.
- Barra vita, barra magia che si ricarica colpendo, oggetti per vita e magia.
- Nemici, scenario e musica chiptune sono originali, generati dal codice.
- Gli sprite del protagonista sono ricavati dalla scheda personaggio di Dark Shadow.

## Tecnica
HTML5 canvas + Web Audio, nessuna libreria. Nessuna compilazione: si apre `index.html` con un server statico
(es. `python3 -m http.server`) oppure si pubblica com'è su GitHub Pages.
