#!/usr/bin/env node

import 'dotenv/config'; // Carica automaticamente il file .env
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// ── Configurazione Supabase ──────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Errore: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY non trovati nel file .env");
    process.exit(1);
}

// ── Mappa Firebase UID → Supabase UUID ───────────────────────────────
const UID_MAP = {
    'gsPwQRcg4YSHFbMY8ihqBomUqyI3': '767ef85c-fdf9-48f0-81f3-e058af5a3d73',
    // Aggiungi qui gli altri amici quando si registrano
};

// ── Percorso file export Firebase ────────────────────────────────────
const EXPORT_PATH = new URL('./firebase_export.json', import.meta.url);

// Inizializzazione Client
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
});

async function migrate() {
    try {
        console.log('📖 Lettura export Firebase...');
        const raw = readFileSync(EXPORT_PATH, 'utf-8');
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
    } catch (e) {
        console.error("❌ Errore durante la migrazione:", e.message);
    }
}

migrate();