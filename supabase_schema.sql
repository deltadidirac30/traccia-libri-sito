-- =====================================================================
-- TRACCIA LIBRI LETTURA — Supabase Schema
-- Incolla tutto questo nel SQL Editor di Supabase ed esegui.
-- =====================================================================


-- -----------------------------------------------------------------------
-- 0. Estensioni
-- -----------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_bytes() per invite_code


-- -----------------------------------------------------------------------
-- 1. PROFILES
--    Estende auth.users con nickname. Popolata automaticamente dal trigger.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    nickname    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Tutti gli utenti autenticati possono leggere i profili
-- (necessario per mostrare "Aggiunto da [nickname]" sui libri)
CREATE POLICY "profiles: lettura pubblica per autenticati"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

-- Ogni utente può inserire/aggiornare solo il proprio profilo
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
-- 2. GROUPS
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.groups (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    invite_code  TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
    created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Solo i membri del gruppo (o il creatore) possono vedere il gruppo
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

-- Qualsiasi utente autenticato può creare un gruppo
CREATE POLICY "groups: chiunque può creare"
    ON public.groups FOR INSERT
    TO authenticated
    WITH CHECK (created_by = auth.uid());

-- Solo il creatore può modificare o eliminare
CREATE POLICY "groups: solo il creatore può modificare"
    ON public.groups FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid());

CREATE POLICY "groups: solo il creatore può eliminare"
    ON public.groups FOR DELETE
    TO authenticated
    USING (created_by = auth.uid());


-- -----------------------------------------------------------------------
-- 3. GROUP_MEMBERS  (tabella ponte)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_members (
    group_id   UUID NOT NULL REFERENCES public.groups(id)   ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Un utente può vedere i membri dei gruppi di cui fa parte
CREATE POLICY "group_members: visibili tra membri dello stesso gruppo"
    ON public.group_members FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.group_members me
            WHERE me.group_id = group_id
              AND me.user_id  = auth.uid()
        )
    );

-- Il creatore del gruppo può aggiungere membri
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

-- Un utente può rimuovere se stesso; il creatore può rimuovere chiunque
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
-- 4. BOOKS
--    visibility = 'private'  → visibile solo al proprietario
--    visibility = 'group'    → visibile ai membri del gruppo in group_id
--
--    NOTA TECNICA: Si usa una colonna visibility TEXT + una FK group_id
--    separata, invece di mettere l'UUID direttamente in visibility.
--    Questo permette al database di garantire l'integrità referenziale
--    e rende le RLS policies molto più semplici e performanti.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.books (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    added_by          TEXT        NOT NULL,          -- nickname snapshot al momento dell'inserimento
    title             TEXT        NOT NULL,
    author            TEXT        NOT NULL,
    publication_date  TEXT,                          -- anno, es. "1984"
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

    -- Vincolo: group_id deve essere valorizzato se e solo se visibility = 'group'
    CONSTRAINT group_visibility_consistency
        CHECK (
            (visibility = 'group' AND group_id IS NOT NULL)
            OR (visibility = 'private' AND group_id IS NULL)
        )
);

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- SELECT: il proprietario vede sempre i propri libri.
--         I membri del gruppo vedono i libri condivisi con quel gruppo.
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

-- INSERT: ogni utente può aggiungere solo libri di cui è proprietario
CREATE POLICY "books: inserimento"
    ON public.books FOR INSERT
    TO authenticated
    WITH CHECK (owner_id = auth.uid());

-- UPDATE / DELETE: solo il proprietario
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
-- 5. TRIGGER — crea il profilo automaticamente a ogni nuova registrazione
--    Il nickname viene passato come user_metadata durante la signup.
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
            split_part(NEW.email, '@', 1)   -- fallback: parte locale dell'email
        )
    );
    RETURN NEW;
END;
$$;

-- Rimuovi il trigger se esiste già (idempotente)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();


-- -----------------------------------------------------------------------
-- 6. INDICI  (performance sulle query più frequenti)
-- -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS books_owner_id_idx      ON public.books(owner_id);
CREATE INDEX IF NOT EXISTS books_group_id_idx      ON public.books(group_id);
CREATE INDEX IF NOT EXISTS group_members_user_idx  ON public.group_members(user_id);


-- -----------------------------------------------------------------------
-- 7. RPC — join_group_by_invite
--    SECURITY DEFINER: bypassa RLS per trovare il gruppo tramite invite_code
--    (un utente non ancora membro non potrebbe altrimenti fare SELECT su groups).
--    Restituisce { group_id, group_name } oppure lancia un'eccezione.
-- -----------------------------------------------------------------------
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
    -- Trova il gruppo (bypass RLS grazie a SECURITY DEFINER)
    SELECT id, name INTO v_group_id, v_group_name
    FROM public.groups
    WHERE invite_code = p_invite;

    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Codice invito non valido';
    END IF;

    -- Aggiunge l'utente corrente come membro (idempotente)
    INSERT INTO public.group_members (group_id, user_id)
    VALUES (v_group_id, auth.uid())
    ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
        'group_id',   v_group_id,
        'group_name', v_group_name
    );
END;
$$;
