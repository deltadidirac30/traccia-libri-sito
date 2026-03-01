-- =====================================================================
-- TRACCIA LIBRI LETTURA — Supabase Schema
-- Incolla tutto questo nel SQL Editor di Supabase ed esegui.
-- =====================================================================


-- -----------------------------------------------------------------------
-- 0. Estensioni
-- -----------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_bytes() per invite_code


-- -----------------------------------------------------------------------
-- 1. TABELLE
--    Tutte create prima di qualsiasi policy, per evitare forward reference.
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    nickname    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.groups (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    invite_code  TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
    created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.group_members (
    group_id   UUID NOT NULL REFERENCES public.groups(id)   ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.books (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    added_by          TEXT        NOT NULL,
    title             TEXT        NOT NULL,
    author            TEXT        NOT NULL,
    publication_date  TEXT,
    pages             INTEGER,
    start_date        DATE,
    end_date          DATE,
    quote             TEXT,
    summary           TEXT,
    notes             TEXT,
    visibility        TEXT        NOT NULL DEFAULT 'private'
                                  CHECK (visibility IN ('private', 'group')),
    group_id          UUID        REFERENCES public.groups(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT group_visibility_consistency
        CHECK (
            (visibility = 'group' AND group_id IS NOT NULL)
            OR (visibility = 'private' AND group_id IS NULL)
        )
);


-- -----------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY — abilita su tutte le tabelle
-- -----------------------------------------------------------------------
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books        ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------
-- 3. POLICIES — profiles
-- -----------------------------------------------------------------------
CREATE POLICY "profiles: lettura pubblica per autenticati"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "profiles: inserimento proprio profilo"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

CREATE POLICY "profiles: aggiornamento proprio profilo"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());


-- -----------------------------------------------------------------------
-- 4. POLICIES — groups
-- -----------------------------------------------------------------------
CREATE POLICY "groups: visibile ai propri membri"
    ON public.groups FOR SELECT
    TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = id
              AND gm.user_id  = auth.uid()
        )
    );

CREATE POLICY "groups: chiunque può creare"
    ON public.groups FOR INSERT
    TO authenticated
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "groups: solo il creatore può modificare"
    ON public.groups FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid());

CREATE POLICY "groups: solo il creatore può eliminare"
    ON public.groups FOR DELETE
    TO authenticated
    USING (created_by = auth.uid());


-- -----------------------------------------------------------------------
-- 5. POLICIES — group_members
-- -----------------------------------------------------------------------
-- Nota: policy volutamente semplice (no self-join) per evitare ricorsione RLS.
-- Ogni utente vede solo le proprie iscrizioni — sufficiente per tutte le funzionalità.
CREATE POLICY "group_members: visibili i propri"
    ON public.group_members FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "group_members: il creatore può aggiungere"
    ON public.group_members FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.groups g
            WHERE g.id         = group_id
              AND g.created_by = auth.uid()
        )
    );

CREATE POLICY "group_members: rimozione"
    ON public.group_members FOR DELETE
    TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.groups g
            WHERE g.id         = group_id
              AND g.created_by = auth.uid()
        )
    );


-- -----------------------------------------------------------------------
-- 6. POLICIES — books
-- -----------------------------------------------------------------------
CREATE POLICY "books: lettura"
    ON public.books FOR SELECT
    TO authenticated
    USING (
        owner_id = auth.uid()
        OR (
            visibility = 'group'
            AND group_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.group_members gm
                WHERE gm.group_id = books.group_id
                  AND gm.user_id  = auth.uid()
            )
        )
    );

CREATE POLICY "books: inserimento"
    ON public.books FOR INSERT
    TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "books: modifica"
    ON public.books FOR UPDATE
    TO authenticated
    USING  (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "books: eliminazione"
    ON public.books FOR DELETE
    TO authenticated
    USING (owner_id = auth.uid());


-- -----------------------------------------------------------------------
-- 7. INDICI
-- -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS books_owner_id_idx      ON public.books(owner_id);
CREATE INDEX IF NOT EXISTS books_group_id_idx      ON public.books(group_id);
CREATE INDEX IF NOT EXISTS group_members_user_idx  ON public.group_members(user_id);


-- -----------------------------------------------------------------------
-- 8. TRIGGER — crea il profilo automaticamente a ogni nuova registrazione
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, nickname)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'nickname',
            split_part(NEW.email, '@', 1)
        )
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();


-- -----------------------------------------------------------------------
-- 9. RPC — join_group_by_invite
--    SECURITY DEFINER: bypassa RLS per trovare il gruppo tramite invite_code.
--    Restituisce { group_id, group_name } oppure lancia un'eccezione.
-- -----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.join_group_by_invite(text);

CREATE OR REPLACE FUNCTION public.join_group_by_invite(p_invite text)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group_id   UUID;
    v_group_name TEXT;
BEGIN
    SELECT id, name INTO v_group_id, v_group_name
    FROM public.groups
    WHERE invite_code = p_invite;

    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Codice invito non valido';
    END IF;

    INSERT INTO public.group_members (group_id, user_id)
    VALUES (v_group_id, auth.uid())
    ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
        'group_id',   v_group_id,
        'group_name', v_group_name
    );
END;
$$;


-- -----------------------------------------------------------------------
-- 10. MIGRATION 001 — Ruoli gruppo, Likes, Commenti
--     Esegui questo blocco nel SQL Editor di Supabase dopo lo schema base.
-- -----------------------------------------------------------------------

-- Colonna role su group_members
ALTER TABLE public.group_members
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'member'));

-- Backfill: il creatore del gruppo diventa admin
UPDATE public.group_members gm
SET role = 'admin'
FROM public.groups g
WHERE gm.group_id = g.id AND gm.user_id = g.created_by;

-- Aggiorna join_group_by_invite: inserisce esplicitamente role='member'
DROP FUNCTION IF EXISTS public.join_group_by_invite(text);
CREATE OR REPLACE FUNCTION public.join_group_by_invite(p_invite text)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group_id UUID; v_group_name TEXT;
BEGIN
    SELECT id, name INTO v_group_id, v_group_name FROM public.groups WHERE invite_code = p_invite;
    IF v_group_id IS NULL THEN RAISE EXCEPTION 'Codice invito non valido'; END IF;
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (v_group_id, auth.uid(), 'member') ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('group_id', v_group_id, 'group_name', v_group_name);
END; $$;

-- Tabella book_likes
CREATE TABLE IF NOT EXISTS public.book_likes (
    book_id    UUID NOT NULL REFERENCES public.books(id)    ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (book_id, user_id)
);
ALTER TABLE public.book_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "book_likes: lettura"
    ON public.book_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "book_likes: inserimento"
    ON public.book_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "book_likes: eliminazione"
    ON public.book_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Tabella book_comments
CREATE TABLE IF NOT EXISTS public.book_comments (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id    UUID        NOT NULL REFERENCES public.books(id)    ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content    TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.book_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "book_comments: lettura"
    ON public.book_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "book_comments: inserimento"
    ON public.book_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "book_comments: eliminazione"
    ON public.book_comments FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Espandi policy DELETE books: anche admin del gruppo può eliminare
DROP POLICY IF EXISTS "books: eliminazione" ON public.books;
CREATE POLICY "books: eliminazione"
    ON public.books FOR DELETE TO authenticated
    USING (
        owner_id = auth.uid()
        OR (
            visibility = 'group' AND group_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.group_members gm
                WHERE gm.group_id = books.group_id
                  AND gm.user_id  = auth.uid()
                  AND gm.role     = 'admin'
            )
        )
    );

-- RPC: get_group_members (SECURITY DEFINER — evita problemi RLS self-join)
DROP FUNCTION IF EXISTS public.get_group_members(UUID);
CREATE OR REPLACE FUNCTION public.get_group_members(p_group_id UUID)
RETURNS TABLE(user_id UUID, nickname TEXT, role TEXT, joined_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = p_group_id AND user_id = auth.uid()
    ) THEN RAISE EXCEPTION 'Accesso non autorizzato al gruppo'; END IF;

    RETURN QUERY
        SELECT gm.user_id, p.nickname, gm.role, gm.joined_at
        FROM public.group_members gm
        JOIN public.profiles p ON p.id = gm.user_id
        WHERE gm.group_id = p_group_id
        ORDER BY gm.role DESC, gm.joined_at ASC;
END; $$;

-- RPC: remove_group_member (solo admin può rimuovere altri)
DROP FUNCTION IF EXISTS public.remove_group_member(UUID, UUID);
CREATE OR REPLACE FUNCTION public.remove_group_member(p_group_id UUID, p_target UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller_role TEXT;
BEGIN
    SELECT role INTO caller_role FROM public.group_members
    WHERE group_id = p_group_id AND user_id = auth.uid();
    IF caller_role IS NULL THEN RAISE EXCEPTION 'Non sei membro di questo gruppo'; END IF;
    IF caller_role != 'admin' AND p_target != auth.uid()
        THEN RAISE EXCEPTION 'Solo un admin può rimuovere altri membri'; END IF;
    DELETE FROM public.group_members WHERE group_id = p_group_id AND user_id = p_target;
END; $$;

-- Indici per le nuove tabelle
CREATE INDEX IF NOT EXISTS book_likes_book_idx    ON public.book_likes(book_id);
CREATE INDEX IF NOT EXISTS book_likes_user_idx    ON public.book_likes(user_id);
CREATE INDEX IF NOT EXISTS book_comments_book_idx ON public.book_comments(book_id);
CREATE INDEX IF NOT EXISTS book_comments_user_idx ON public.book_comments(user_id);
CREATE INDEX IF NOT EXISTS gm_role_idx            ON public.group_members(group_id, role);


-- -----------------------------------------------------------------------
-- 11. MIGRATION 002 — Eliminazione account utente
--     Esegui nel SQL Editor di Supabase.
-- -----------------------------------------------------------------------

-- RPC: delete_own_account (v1 — sostituita da Migration 003)
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;


-- -----------------------------------------------------------------------
-- 12. MIGRATION 003 — Promozione admin, gestione gruppi su eliminazione account
--     Esegui nel SQL Editor di Supabase.
-- -----------------------------------------------------------------------

-- Trigger: quando group_id diventa NULL su un libro (es. gruppo eliminato),
-- imposta automaticamente visibility='private' per rispettare il constraint.
CREATE OR REPLACE FUNCTION public.fix_book_visibility_on_group_null()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.group_id IS NULL AND NEW.visibility = 'group' THEN
        NEW.visibility := 'private';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fix_book_visibility ON public.books;
CREATE TRIGGER trg_fix_book_visibility
    BEFORE UPDATE ON public.books
    FOR EACH ROW
    EXECUTE FUNCTION public.fix_book_visibility_on_group_null();

-- RPC: delete_own_account (v2 — gestisce i gruppi di cui si è unico admin)
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group_id UUID;
BEGIN
    -- Per ogni gruppo in cui l'utente è l'UNICO admin:
    -- rendi privati i libri degli altri membri, poi elimina il gruppo.
    FOR v_group_id IN
        SELECT gm.group_id
        FROM public.group_members gm
        WHERE gm.user_id = auth.uid()
          AND gm.role = 'admin'
          AND NOT EXISTS (
              SELECT 1 FROM public.group_members gm2
              WHERE gm2.group_id = gm.group_id
                AND gm2.user_id != auth.uid()
                AND gm2.role = 'admin'
          )
    LOOP
        -- I libri degli ALTRI utenti nel gruppo diventano privati
        UPDATE public.books
        SET visibility = 'private', group_id = NULL
        WHERE group_id = v_group_id
          AND owner_id != auth.uid();

        -- Elimina il gruppo (cascade rimuove i group_members)
        DELETE FROM public.groups WHERE id = v_group_id;
    END LOOP;

    -- Per i gruppi con altri admin: la cascade da auth.users rimuoverà
    -- automaticamente la riga in group_members senza toccare il gruppo.

    -- Elimina l'utente (cascade: profiles → books, group_members, likes, commenti)
    DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- RPC: promote_to_admin — solo un admin può promuovere un membro
CREATE OR REPLACE FUNCTION public.promote_to_admin(p_group_id UUID, p_target UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_role TEXT;
BEGIN
    SELECT role INTO caller_role FROM public.group_members
    WHERE group_id = p_group_id AND user_id = auth.uid();

    IF caller_role IS NULL THEN RAISE EXCEPTION 'Non sei membro di questo gruppo'; END IF;
    IF caller_role != 'admin' THEN RAISE EXCEPTION 'Solo un admin può promuovere altri membri'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = p_group_id AND user_id = p_target
    ) THEN RAISE EXCEPTION 'Utente non trovato nel gruppo'; END IF;

    UPDATE public.group_members SET role = 'admin'
    WHERE group_id = p_group_id AND user_id = p_target;
END;
$$;

-- -----------------------------------------------------------------------
-- 13. MIGRATION 004 — Multi-group support: group_id → group_ids UUID[]
--     Esegui nel SQL Editor di Supabase.
-- -----------------------------------------------------------------------

-- 1. Nuova colonna array
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS group_ids UUID[] NOT NULL DEFAULT '{}';

-- 2. Migra i dati esistenti
UPDATE public.books SET group_ids = ARRAY[group_id]
WHERE group_id IS NOT NULL AND visibility = 'group';

-- 3. Rimuovi trigger Migration 003 (referenziava group_id)
DROP TRIGGER IF EXISTS trg_fix_book_visibility ON public.books;
DROP FUNCTION IF EXISTS public.fix_book_visibility_on_group_null();

-- 4. Rimuovi vecchia colonna (elimina automaticamente FK e vincoli su di essa)
ALTER TABLE public.books DROP COLUMN IF EXISTS group_id CASCADE;

-- 5. Nuovo vincolo visibilità (array_length('{}',1) = NULL, soddisfa IS NULL)
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_group_visibility_check;
ALTER TABLE public.books ADD CONSTRAINT books_group_visibility_check
    CHECK (
        (visibility = 'private' AND (array_length(group_ids, 1) IS NULL))
        OR
        (visibility = 'group'   AND array_length(group_ids, 1) > 0)
    );

-- 6. RLS lettura: owner oppure membro di almeno uno dei gruppi del libro
DROP POLICY IF EXISTS "books: lettura" ON public.books;
CREATE POLICY "books: lettura" ON public.books FOR SELECT TO authenticated
    USING (
        owner_id = auth.uid()
        OR (visibility = 'group' AND EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = ANY(books.group_ids) AND gm.user_id = auth.uid()
        ))
    );

-- 7. RLS eliminazione: owner oppure admin di uno qualsiasi dei gruppi del libro
DROP POLICY IF EXISTS "books: eliminazione" ON public.books;
CREATE POLICY "books: eliminazione" ON public.books FOR DELETE TO authenticated
    USING (
        owner_id = auth.uid()
        OR (visibility = 'group' AND EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = ANY(books.group_ids) AND gm.user_id = auth.uid() AND gm.role = 'admin'
        ))
    );

-- 8. Indice GIN per query efficienti su array
CREATE INDEX IF NOT EXISTS books_group_ids_gin ON public.books USING gin(group_ids);

-- 9. delete_own_account (v3) — aggiornato per group_ids array
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group_id UUID;
BEGIN
    FOR v_group_id IN
        SELECT gm.group_id
        FROM public.group_members gm
        WHERE gm.user_id = auth.uid()
          AND gm.role = 'admin'
          AND NOT EXISTS (
              SELECT 1 FROM public.group_members gm2
              WHERE gm2.group_id = gm.group_id
                AND gm2.user_id != auth.uid()
                AND gm2.role = 'admin'
          )
    LOOP
        UPDATE public.books
        SET group_ids = array_remove(group_ids, v_group_id)
        WHERE v_group_id = ANY(group_ids) AND owner_id != auth.uid();

        UPDATE public.books
        SET visibility = 'private'
        WHERE owner_id != auth.uid()
          AND visibility = 'group'
          AND (array_length(group_ids, 1) IS NULL OR array_length(group_ids, 1) = 0);

        DELETE FROM public.groups WHERE id = v_group_id;
    END LOOP;

    DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
