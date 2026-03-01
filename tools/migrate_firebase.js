#!/usr/bin/env node
// =====================================================================
// tools/migrate_firebase.js
//
// Importa i libri da un export JSON di Firebase Realtime Database
// nella tabella books di Supabase.
//
// PRE-REQUISITI:
//   1. Node.js installato (qualsiasi versione ≥ 16)
//   2. Eseguire: npm init -y && npm install @supabase/supabase-js
//   3. Scarica l'export JSON da Firebase Console →
//      Realtime Database → (tre puntini) → Export JSON
//   4. Copia il file JSON in questa cartella con il nome firebase_export.json
//   5. Compila la mappa UID qui sotto (vedi GUIDA)
//
// ESECUZIONE:
//   node tools/migrate_firebase.js
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync }  from 'fs';

// ── Configurazione ────────────────────────────────────────────────────
const SUPABASE_URL       = 'https://TUO_PROJECT_ID.supabase.co';
const SUPABASE_SERVICE_KEY = 'TUA_SERVICE_ROLE_KEY';  // NON la anon key!
                                                       // Supabase → Settings → API → service_role

// ── Mappa Firebase UID → Supabase UUID ───────────────────────────────
// Come ottenerla:
//   Firebase Console → Authentication → Users → copia UID di ogni utente
//   Supabase Dashboard → Authentication → Users → copia UUID di ogni utente
//   (gli utenti devono già aver creato l'account su Supabase)
const UID_MAP = {
    // 'FIREBASE_UID_1': 'SUPABASE_UUID_1',
    // 'FIREBASE_UID_2': 'SUPABASE_UUID_2',
};

// ── Percorso file export Firebase ────────────────────────────────────
const EXPORT_PATH = new URL('./firebase_export.json', import.meta.url);

// ─────────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
});

async function migrate() {
    console.log('📖 Lettura export Firebase...');
    const raw  = readFileSync(EXPORT_PATH, 'utf-8');
    const data = JSON.parse(raw);

    const firebaseBooks = data.books ?? {};
    const firebaseUsers = data.users ?? {};

    const entries = Object.entries(firebaseBooks);
    console.log(`   Trovati ${entries.length} libri.`);

    let ok = 0, skip = 0, err = 0;

    for (const [firebaseId, book] of entries) {
        const supabaseOwnerId = UID_MAP[book.ownerUid];

        if (!supabaseOwnerId) {
            console.warn(`⚠️  Libro "${book.title}" — ownerUid ${book.ownerUid} non presente in UID_MAP. Saltato.`);
            skip++;
            continue;
        }

        // Ricava nickname dal nodo users di Firebase (snapshot)
        const addedBy = book.addedBy
            ?? firebaseUsers[book.ownerUid]?.nickname
            ?? 'Utente sconosciuto';

        const row = {
            owner_id:         supabaseOwnerId,
            added_by:         addedBy,
            title:            book.title            ?? '',
            author:           book.author           ?? '',
            publication_date: book.publicationDate  ? String(book.publicationDate) : null,
            pages:            book.pages            ? Number(book.pages) : null,
            start_date:       book.startDate        ?? null,
            end_date:         book.endDate          ?? null,
            quote:            book.quote            ?? null,
            summary:          book.summary          ?? null,
            notes:            book.notes            ?? null,
            visibility:       'private',
            group_id:         null,
        };

        const { error } = await supabase.from('books').insert(row);

        if (error) {
            console.error(`❌ Errore su "${book.title}":`, error.message);
            err++;
        } else {
            console.log(`✅ Importato: "${book.title}" (${addedBy})`);
            ok++;
        }
    }

    console.log('\n══════════════════════════════════');
    console.log(`Completato: ${ok} importati, ${skip} saltati, ${err} errori.`);
}

migrate().catch(console.error);
