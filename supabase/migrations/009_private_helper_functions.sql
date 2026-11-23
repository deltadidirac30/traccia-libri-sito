-- Le funzioni usate solo dalle regole RLS non devono essere chiamabili via API:
-- le spostiamo in uno schema non esposto. Le policy le referenziano per OID,
-- quindi continuano a funzionare senza modifiche.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

ALTER FUNCTION public.is_group_member(uuid)   SET SCHEMA private;
ALTER FUNCTION public.shares_group_with(uuid) SET SCHEMA private;

REVOKE EXECUTE ON FUNCTION private.is_group_member(uuid)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.shares_group_with(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION private.is_group_member(uuid)   TO authenticated;
GRANT  EXECUTE ON FUNCTION private.shares_group_with(uuid) TO authenticated;
