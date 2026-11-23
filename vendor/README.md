# Librerie incluse nel sito

Copiate dal registro npm e servite dal sito stesso, così nessuno script arriva da server esterni
(la Content-Security-Policy delle pagine permette solo script del sito).

| File | Pacchetto | Versione | Licenza |
|------|-----------|----------|---------|
| supabase.js | @supabase/supabase-js (dist/umd/supabase.js) | 2.119.2 | MIT |
| motion.js | motion (dist/motion.js) | 12.43.0 | MIT |

Per aggiornarle: `npm pack <pacchetto>@<versione>`, copiare il file indicato e cambiare `VERSION` in `sw.js`.
