-- -----------------------------------------------------------------------
-- MIGRATION 007 — Sicurezza
--
-- 1. Nessuna funzione e nessuna tabella raggiungibile senza accesso (anon)
-- 2. Profili: visibili solo a te e a chi è in un gruppo con te; email mai esposte
-- 3. Commenti e like: leggibili e scrivibili solo sui libri che puoi vedere
-- 4. Libri: condivisibili solo nei gruppi di cui fai parte
-- 5. Gruppi: il creatore può aggiungere solo se stesso; non può cedere il gruppo
-- 6. Limiti di lunghezza sui testi (nessun dato esistente li supera)
-- -----------------------------------------------------------------------

-- 1. Funzioni: niente accesso anonimo ------------------------------------------
REVOKE EXECUTE ON FUNCTION public.delete_own_account()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_group_members(uuid)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_group_by_invite(text)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.promote_to_admin(uuid, uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_group_member(uuid, uuid)       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_own_account()                  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_group_members(uuid)               TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_group_member(uuid)                 TO authenticated;
GRANT  EXECUTE ON FUNCTION public.join_group_by_invite(text)            TO authenticated;
GRANT  EXECUTE ON FUNCTION public.promote_to_admin(uuid, uuid)          TO authenticated;
GRANT  EXECUTE ON FUNCTION public.remove_group_member(uuid, uuid)       TO authenticated;
-- Funzione di trigger: non deve essere chiamabile da nessuno via API
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                     FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_new_user()                     TO supabase_auth_admin;

-- Nessuna funzione nuova diventerà pubblica per default
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- join_group_by_invite: richiede l'accesso in modo esplicito
CREATE OR REPLACE FUNCTION public.join_group_by_invite(p_invite text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_group_id UUID; v_group_name TEXT;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso richiesto'; END IF;
    SELECT id, name INTO v_group_id, v_group_name FROM public.groups WHERE invite_code = trim(p_invite);
    IF v_group_id IS NULL THEN RAISE EXCEPTION 'Codice invito non valido'; END IF;
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (v_group_id, auth.uid(), 'member') ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('group_id', v_group_id, 'group_name', v_group_name);
END;
$$;

-- delete_own_account: richiede l'accesso in modo esplicito
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_group_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso richiesto'; END IF;
    FOR v_group_id IN
        SELECT gm.group_id FROM public.group_members gm
        WHERE gm.user_id = auth.uid() AND gm.role = 'admin'
          AND NOT EXISTS (SELECT 1 FROM public.group_members gm2
              WHERE gm2.group_id = gm.group_id AND gm2.user_id != auth.uid() AND gm2.role = 'admin')
    LOOP
        UPDATE public.books SET group_ids = array_remove(group_ids, v_group_id)
        WHERE v_group_id = ANY(group_ids) AND owner_id != auth.uid();
        UPDATE public.books SET visibility = 'private'
        WHERE owner_id != auth.uid() AND visibility = 'group'
          AND (array_length(group_ids, 1) IS NULL OR array_length(group_ids, 1) = 0);
        DELETE FROM public.groups WHERE id = v_group_id;
    END LOOP;
    DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.join_group_by_invite(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_own_account()       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.join_group_by_invite(text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_own_account()       TO authenticated;

-- Tabelle: l'utente anonimo non ha nessun permesso (prima era bloccato solo dalla RLS)
REVOKE ALL ON public.books, public.book_comments, public.book_likes,
              public.groups, public.group_members, public.profiles FROM anon;

-- 2. Profili --------------------------------------------------------------------
-- Vero se l'utente indicato è in almeno un gruppo con chi sta facendo la richiesta
CREATE OR REPLACE FUNCTION public.shares_group_with(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.group_members mine
        JOIN public.group_members theirs ON theirs.group_id = mine.group_id
        WHERE mine.user_id = auth.uid() AND theirs.user_id = p_user
    );
$$;
REVOKE EXECUTE ON FUNCTION public.shares_group_with(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.shares_group_with(uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles: lettura pubblica per autenticati" ON public.profiles;
DROP POLICY IF EXISTS "profiles: select" ON public.profiles;
DROP POLICY IF EXISTS "profiles: lettura propri e compagni di gruppo" ON public.profiles;
CREATE POLICY "profiles: lettura propri e compagni di gruppo" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = (SELECT auth.uid()) OR public.shares_group_with(id));

-- L'email non è leggibile via API da nessuno (il sito usa quella della sessione)
REVOKE SELECT, INSERT, UPDATE ON public.profiles FROM authenticated;
GRANT  SELECT (id, nickname, created_at) ON public.profiles TO authenticated;
GRANT  INSERT (id, nickname)             ON public.profiles TO authenticated;
GRANT  UPDATE (nickname)                 ON public.profiles TO authenticated;

-- 3. Commenti e like: solo sui libri che puoi vedere ----------------------------
-- (la sottoquery su books passa dalla RLS di books, quindi rispetta privati e gruppi)
DROP POLICY IF EXISTS "book_comments: lettura" ON public.book_comments;
CREATE POLICY "book_comments: lettura" ON public.book_comments
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_comments.book_id));

DROP POLICY IF EXISTS "book_comments: inserimento" ON public.book_comments;
CREATE POLICY "book_comments: inserimento" ON public.book_comments
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid())
                AND EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_comments.book_id));

DROP POLICY IF EXISTS "book_likes: lettura" ON public.book_likes;
CREATE POLICY "book_likes: lettura" ON public.book_likes
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_likes.book_id));

DROP POLICY IF EXISTS "book_likes: inserimento" ON public.book_likes;
CREATE POLICY "book_likes: inserimento" ON public.book_likes
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid())
                AND EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_likes.book_id));

-- Commenti e like non si modificano: si creano o si cancellano
REVOKE UPDATE ON public.book_comments, public.book_likes FROM authenticated;

-- 4. Libri: condivisi solo nei propri gruppi ------------------------------------
DROP POLICY IF EXISTS "books: inserimento" ON public.books;
CREATE POLICY "books: inserimento" ON public.books
    FOR INSERT TO authenticated
    WITH CHECK (
        owner_id = (SELECT auth.uid())
        AND group_ids <@ ARRAY(SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "books: modifica" ON public.books;
CREATE POLICY "books: modifica" ON public.books
    FOR UPDATE TO authenticated
    USING (owner_id = (SELECT auth.uid()))
    WITH CHECK (
        owner_id = (SELECT auth.uid())
        AND group_ids <@ ARRAY(SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = (SELECT auth.uid()))
    );

-- 5. Gruppi ---------------------------------------------------------------------
-- Il creatore aggiunge solo se stesso (gli altri entrano con il codice invito)
DROP POLICY IF EXISTS "group_members: il creatore può aggiungere" ON public.group_members;
CREATE POLICY "group_members: il creatore può aggiungere se stesso" ON public.group_members
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = (SELECT auth.uid())
        AND EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_members.group_id AND g.created_by = (SELECT auth.uid()))
    );
-- I ruoli cambiano solo tramite promote_to_admin
REVOKE UPDATE ON public.group_members FROM authenticated;

-- Il creatore non può cedere il gruppo ad altri né riscriverne il codice invito
DROP POLICY IF EXISTS "groups: solo il creatore può modificare" ON public.groups;
CREATE POLICY "groups: solo il creatore può modificare" ON public.groups
    FOR UPDATE TO authenticated
    USING (created_by = (SELECT auth.uid()))
    WITH CHECK (created_by = (SELECT auth.uid()));
REVOKE UPDATE ON public.groups FROM authenticated;
GRANT  UPDATE (name) ON public.groups TO authenticated;
REVOKE INSERT ON public.groups FROM authenticated;
GRANT  INSERT (name, created_by) ON public.groups TO authenticated;

-- 6. Limiti di lunghezza --------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_nickname_len;
ALTER TABLE public.profiles ADD  CONSTRAINT profiles_nickname_len CHECK (char_length(nickname) BETWEEN 1 AND 40);
ALTER TABLE public.groups   DROP CONSTRAINT IF EXISTS groups_name_len;
ALTER TABLE public.groups   ADD  CONSTRAINT groups_name_len CHECK (char_length(name) BETWEEN 1 AND 80);
ALTER TABLE public.books    DROP CONSTRAINT IF EXISTS books_text_len;
ALTER TABLE public.books    ADD  CONSTRAINT books_text_len CHECK (
    char_length(title) BETWEEN 1 AND 300
    AND char_length(author) BETWEEN 1 AND 300
    AND char_length(coalesce(added_by, '')) <= 80
    AND char_length(coalesce(publication_date, '')) <= 20
    AND char_length(coalesce(quote, '')) <= 2000
    AND char_length(coalesce(summary, '')) <= 1000
    AND char_length(coalesce(notes, '')) <= 10000
    AND (pages IS NULL OR pages BETWEEN 1 AND 100000)
    AND coalesce(array_length(group_ids, 1), 0) <= 50
);

-- 7. Email del profilo sincronizzata dal sistema di accesso ---------------------
--    (prima la scriveva il sito; ora il campo non è più scrivibile dagli utenti
--    e si aggiorna solo quando la nuova email è stata confermata)
CREATE OR REPLACE FUNCTION public.handle_user_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_user_email_change: %', SQLERRM;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_user_email_change() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_user_email_change() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
    AFTER UPDATE OF email ON auth.users
    FOR EACH ROW
    WHEN (OLD.email IS DISTINCT FROM NEW.email)
    EXECUTE FUNCTION public.handle_user_email_change();
