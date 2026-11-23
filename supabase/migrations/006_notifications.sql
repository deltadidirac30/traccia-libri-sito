-- -----------------------------------------------------------------------
-- MIGRATION 006 — Notifiche (campanella nel sito + push sul telefono)
--
-- Tabelle nuove, nessuna modifica a quelle esistenti.
-- I trigger non possono mai bloccare un libro, un like o un commento:
-- ogni errore nelle notifiche viene solo registrato come WARNING.
-- -----------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 1. Notifiche ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE, -- destinatario
    actor_id    UUID        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE, -- chi ha fatto l'azione
    type        TEXT        NOT NULL CHECK (type IN ('book', 'like', 'comment')),
    book_id     UUID        NOT NULL REFERENCES public.books(id)         ON DELETE CASCADE,
    comment_id  UUID                 REFERENCES public.book_comments(id) ON DELETE CASCADE,
    group_id    UUID                 REFERENCES public.groups(id)        ON DELETE CASCADE,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx  ON public.notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_book_idx         ON public.notifications (book_id);
CREATE INDEX IF NOT EXISTS notifications_comment_idx      ON public.notifications (comment_id);
CREATE INDEX IF NOT EXISTS notifications_actor_idx        ON public.notifications (actor_id);
CREATE INDEX IF NOT EXISTS notifications_group_idx        ON public.notifications (group_id);
-- Un solo avviso per "Marco ha messo like al tuo libro", anche se toglie e rimette il like
CREATE UNIQUE INDEX IF NOT EXISTS notifications_like_once
    ON public.notifications (user_id, actor_id, book_id) WHERE type = 'like';
-- Un solo avviso per "nuovo libro" per destinatario
CREATE UNIQUE INDEX IF NOT EXISTS notifications_book_once
    ON public.notifications (user_id, book_id) WHERE type = 'book';

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications: lettura proprie" ON public.notifications;
CREATE POLICY "notifications: lettura proprie" ON public.notifications
    FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notifications: segna come lette" ON public.notifications;
CREATE POLICY "notifications: segna come lette" ON public.notifications
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notifications: elimina proprie" ON public.notifications;
CREATE POLICY "notifications: elimina proprie" ON public.notifications
    FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- Gli utenti possono cambiare solo read_at; le notifiche le crea solo il database
REVOKE INSERT, UPDATE ON public.notifications FROM anon, authenticated;
GRANT SELECT, DELETE ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
REVOKE ALL ON public.notifications FROM anon;

-- 2. Iscrizioni push (una per dispositivo) ------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint    TEXT        NOT NULL UNIQUE,
    p256dh      TEXT        NOT NULL,
    auth        TEXT        NOT NULL,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions: lettura proprie" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions: lettura proprie" ON public.push_subscriptions
    FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "push_subscriptions: elimina proprie" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions: elimina proprie" ON public.push_subscriptions
    FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

REVOKE INSERT, UPDATE ON public.push_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.push_subscriptions FROM anon;

-- Salva (o riassegna) l'iscrizione del dispositivo all'utente collegato
CREATE OR REPLACE FUNCTION public.save_push_subscription(p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT, p_user_agent TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso richiesto'; END IF;
    IF p_endpoint IS NULL OR p_endpoint !~ '^https://' THEN RAISE EXCEPTION 'Iscrizione non valida'; END IF;

    INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
    ON CONFLICT (endpoint) DO UPDATE
        SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
            auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent, created_at = NOW();
END;
$$;
REVOKE ALL ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 3. Configurazione privata (chiavi VAPID, segreto del webhook) ---------------
--    RLS attiva senza policy: leggibile solo dal database e dalla Edge Function.
CREATE TABLE IF NOT EXISTS public.push_config (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_config FROM anon, authenticated;

INSERT INTO public.push_config (key, value)
VALUES ('webhook_secret', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- 4. Trigger che creano le notifiche ------------------------------------------

-- Nuovo libro condiviso (o libro esistente condiviso con un gruppo nuovo)
CREATE OR REPLACE FUNCTION public.notify_book_shared()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_groups UUID[];
BEGIN
    IF NEW.visibility <> 'group' THEN RETURN NEW; END IF;

    IF TG_OP = 'INSERT' THEN
        v_new_groups := NEW.group_ids;
    ELSE
        SELECT COALESCE(array_agg(g), '{}') INTO v_new_groups
        FROM unnest(NEW.group_ids) AS g
        WHERE OLD.visibility <> 'group' OR NOT (g = ANY (OLD.group_ids));
    END IF;

    IF COALESCE(array_length(v_new_groups, 1), 0) = 0 THEN RETURN NEW; END IF;

    INSERT INTO public.notifications (user_id, actor_id, type, book_id, group_id)
    SELECT DISTINCT ON (gm.user_id) gm.user_id, NEW.owner_id, 'book', NEW.id, gm.group_id
    FROM public.group_members gm
    WHERE gm.group_id = ANY (v_new_groups)
      AND gm.user_id <> NEW.owner_id
    ORDER BY gm.user_id, gm.joined_at
    ON CONFLICT DO NOTHING;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_book_shared: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_book_shared ON public.books;
CREATE TRIGGER trg_notify_book_shared
    AFTER INSERT OR UPDATE OF visibility, group_ids ON public.books
    FOR EACH ROW EXECUTE FUNCTION public.notify_book_shared();

-- Like a un tuo libro
CREATE OR REPLACE FUNCTION public.notify_book_liked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.notifications (user_id, actor_id, type, book_id)
    SELECT b.owner_id, NEW.user_id, 'like', NEW.book_id
    FROM public.books b
    WHERE b.id = NEW.book_id AND b.owner_id <> NEW.user_id
    ON CONFLICT DO NOTHING;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_book_liked: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_book_liked ON public.book_likes;
CREATE TRIGGER trg_notify_book_liked
    AFTER INSERT ON public.book_likes
    FOR EACH ROW EXECUTE FUNCTION public.notify_book_liked();

-- Like tolto prima che fosse letto: l'avviso sparisce
CREATE OR REPLACE FUNCTION public.notify_book_unliked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.notifications
    WHERE type = 'like' AND actor_id = OLD.user_id AND book_id = OLD.book_id AND read_at IS NULL;
    RETURN OLD;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_book_unliked: %', SQLERRM;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_book_unliked ON public.book_likes;
CREATE TRIGGER trg_notify_book_unliked
    AFTER DELETE ON public.book_likes
    FOR EACH ROW EXECUTE FUNCTION public.notify_book_unliked();

-- Commento: avvisa il proprietario del libro e chi ha già commentato quel libro
CREATE OR REPLACE FUNCTION public.notify_book_commented()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.notifications (user_id, actor_id, type, book_id, comment_id)
    SELECT r.user_id, NEW.user_id, 'comment', NEW.book_id, NEW.id
    FROM (
        SELECT b.owner_id AS user_id FROM public.books b WHERE b.id = NEW.book_id
        UNION
        SELECT c.user_id FROM public.book_comments c WHERE c.book_id = NEW.book_id AND c.id <> NEW.id
    ) r
    WHERE r.user_id IS NOT NULL AND r.user_id <> NEW.user_id;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_book_commented: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_book_commented ON public.book_comments;
CREATE TRIGGER trg_notify_book_commented
    AFTER INSERT ON public.book_comments
    FOR EACH ROW EXECUTE FUNCTION public.notify_book_commented();

-- 5. Ogni nuova notifica chiede alla Edge Function di inviare il push ----------
--    pg_net è asincrono: la richiesta parte dopo il commit e non rallenta l'utente.
CREATE OR REPLACE FUNCTION public.dispatch_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_secret TEXT;
BEGIN
    -- Niente richiesta se il destinatario non ha dispositivi iscritti
    IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = NEW.user_id) THEN
        RETURN NEW;
    END IF;

    SELECT value INTO v_secret FROM public.push_config WHERE key = 'webhook_secret';

    PERFORM net.http_post(
        url     := 'https://hhltbnrbjvxoisaizirj.supabase.co/functions/v1/send-push',
        body    := jsonb_build_object('notification_id', NEW.id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        timeout_milliseconds := 5000
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'dispatch_push_notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_push ON public.notifications;
CREATE TRIGGER trg_dispatch_push
    AFTER INSERT ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_notification();

-- Le funzioni dei trigger non devono essere chiamabili dall'API
REVOKE ALL ON FUNCTION public.notify_book_shared()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_book_liked()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_book_unliked()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_book_commented()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_push_notification() FROM PUBLIC, anon, authenticated;

-- 6. Aggiornamento in tempo reale della campanella -----------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END $$;
