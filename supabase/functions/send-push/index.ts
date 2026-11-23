// =====================================================================
// send-push — invia le notifiche push di Traccia Libri
//
// GET  ?vapid           → restituisce la chiave pubblica VAPID (la crea al primo avvio)
// POST {notification_id} con header x-push-secret → invia il push a tutti i
//                         dispositivi del destinatario. Chiamata solo dal database.
//
// Nessun segreto da configurare a mano: chiavi VAPID e segreto del webhook
// stanno nella tabella privata public.push_config (RLS senza policy).
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SITE_URL = 'https://deltadidirac30.github.io/traccia-libri-sito';
const CONTACT = SITE_URL; // soggetto VAPID: un URL https valido (Apple li rifiuta se non validi)

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function getConfig(key: string): Promise<string | null> {
    const { data } = await supabase.from('push_config').select('value').eq('key', key).maybeSingle();
    return data?.value ?? null;
}

async function getVapidKeys() {
    let publicKey = await getConfig('vapid_public_key');
    let privateKey = await getConfig('vapid_private_key');
    if (!publicKey || !privateKey) {
        const keys = webpush.generateVAPIDKeys();
        // ignoreDuplicates: se due richieste arrivano insieme vince la prima
        await supabase.from('push_config').upsert([
            { key: 'vapid_public_key', value: keys.publicKey },
            { key: 'vapid_private_key', value: keys.privateKey },
        ], { onConflict: 'key', ignoreDuplicates: true });
        publicKey = await getConfig('vapid_public_key');
        privateKey = await getConfig('vapid_private_key');
    }
    return { publicKey: publicKey!, privateKey: privateKey! };
}

function timingSafeEqual(a: string, b: string) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function quoted(title: string) {
    const t = title.length > 60 ? title.slice(0, 57) + '…' : title;
    return `«${t}»`;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

    const url = new URL(req.url);

    // --- Chiave pubblica per iscrivere un dispositivo ---
    if (req.method === 'GET' && url.searchParams.has('vapid')) {
        const { publicKey } = await getVapidKeys();
        return json({ publicKey });
    }

    if (req.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405);

    // --- Solo il database può chiedere un invio ---
    const secret = await getConfig('webhook_secret');
    const given = req.headers.get('x-push-secret') ?? '';
    if (!secret || !timingSafeEqual(given, secret)) return json({ error: 'Non autorizzato' }, 401);

    const { notification_id } = await req.json().catch(() => ({ notification_id: null }));
    if (!notification_id) return json({ error: 'notification_id mancante' }, 400);

    const { data: n } = await supabase
        .from('notifications')
        .select('id, user_id, type, book_id, read_at, actor:profiles!notifications_actor_id_fkey(nickname), book:books(title, owner_id), group:groups(name)')
        .eq('id', notification_id)
        .maybeSingle();
    if (!n) return json({ skipped: 'notifica non trovata' });

    const actor = (n as any).actor?.nickname ?? 'Qualcuno';
    const book = (n as any).book;
    const group = (n as any).group?.name;
    if (!book) return json({ skipped: 'libro non trovato' });

    let title = 'Traccia Libri';
    let body = '';
    if (n.type === 'book') {
        title = group ? `Nuovo libro in ${group}` : 'Nuovo libro nel gruppo';
        body = `${actor} ha aggiunto ${quoted(book.title)}`;
    } else if (n.type === 'like') {
        title = 'Nuovo like';
        body = `A ${actor} piace ${quoted(book.title)}`;
    } else if (n.type === 'comment') {
        title = 'Nuovo commento';
        body = book.owner_id === n.user_id
            ? `${actor} ha commentato ${quoted(book.title)}`
            : `${actor} ha commentato anche ${quoted(book.title)}`;
    }

    const payload = JSON.stringify({
        title,
        body,
        tag: `${n.type}-${n.book_id}`,
        url: `${SITE_URL}/scheda.html?id=${n.book_id}${n.type === 'comment' ? '#commenti' : ''}`,
    });

    const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', n.user_id);
    if (!subs?.length) return json({ sent: 0 });

    const { publicKey, privateKey } = await getVapidKeys();
    webpush.setVapidDetails(CONTACT, publicKey, privateKey);

    let sent = 0;
    const gone: string[] = [];
    await Promise.all(subs.map(async (s) => {
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                payload,
                { TTL: 60 * 60 * 24, urgency: 'normal' },
            );
            sent++;
        } catch (err: any) {
            // 404/410: il dispositivo ha revocato il permesso o disinstallato l'app
            if (err?.statusCode === 404 || err?.statusCode === 410) gone.push(s.id);
            else console.log(JSON.stringify({ event: 'push-error', status: err?.statusCode, body: String(err?.body ?? err).slice(0, 200) }));
        }
    }));

    if (gone.length) await supabase.from('push_subscriptions').delete().in('id', gone);

    return json({ sent, removed: gone.length });
});
