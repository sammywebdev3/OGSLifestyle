-- READ-ONLY check that a live project matches migration 20261018000000_phase1_players.sql.
--
-- Paste into Supabase Dashboard → SQL Editor and Run. It only reads the system catalogs
-- (and counts rows); it changes nothing. Every row should say ok = true; the first row
-- ("00 ALL CHECKS") is true only when all of them are.
--
-- The fingerprints (md5) were taken from the reviewed migration applied to local
-- supabase/postgres 15.8 and 17.6 images; both give identical values. If a fingerprint
-- check fails, the detail column says what to compare. `npm run test:db` re-checks
-- that this file passes on the migration and fails on known-bad variants.
with
tbl(name) as (values ('players'), ('inventories'), ('inventory_items')),
cls as (
  select c.* from pg_class c join tbl on tbl.name = c.relname
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
),
priv(p) as (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')),
fn as (select * from pg_proc where oid = to_regprocedure('public.create_character(text,jsonb)')),
pol as (select * from pg_policies where schemaname = 'public' and tablename in (select name from tbl)),
checks(check_name, ok, detail) as (
  select '01 tables exist', count(*) = 3, coalesce(string_agg(relname, ', ' order by relname), 'none')
    from cls
  union all
  select '02 row level security on', count(*) = 3 and bool_and(relrowsecurity),
         coalesce(string_agg(relname || '=' || relrowsecurity, ', ' order by relname), 'none')
    from cls
  union all
  select '03 policies: 3, select-only, authenticated',
         count(*) = 3 and coalesce(bool_and(cmd = 'SELECT' and roles = '{authenticated}' and permissive = 'PERMISSIVE'), false),
         coalesce(string_agg(tablename || ': ' || policyname || ' (' || cmd || ' to ' || array_to_string(roles, ',') || ')', '; ' order by tablename), 'none')
    from pol
  union all
  select '04 policies: own rows only (fingerprint)',
         coalesce(md5(string_agg(tablename || ':' || policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':'
                  || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' order by tablename, policyname)), '')
           = '4648b23a26c0323f87ecb0616f343d37',
         'compare pg_policies.qual with the migration if false'
    from pol
  union all
  select '05 anon: no table privileges', count(*) = 0,
         coalesce(string_agg(tbl.name || ':' || p, ', '), 'none')
    from tbl cross join priv
   where to_regclass('public.' || tbl.name) is not null and has_table_privilege('anon', 'public.' || tbl.name, p)
  union all
  select '06 authenticated: SELECT only', count(*) filter (where p <> 'SELECT') = 0 and count(*) filter (where p = 'SELECT') = 3,
         coalesce(string_agg(tbl.name || ':' || p, ', ' order by tbl.name, p), 'none')
    from tbl cross join priv
   where to_regclass('public.' || tbl.name) is not null and has_table_privilege('authenticated', 'public.' || tbl.name, p)
  union all
  select '07 table columns and defaults (fingerprint)',
         coalesce(md5(string_agg(c.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull
                  || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), ''), '|' order by c.relname, a.attnum)), '')
           = 'bdb6254ee741f3467e3c7d6f181b5b66',
         'compare columns, types, NOT NULL and defaults with the migration if false'
    from cls c
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  union all
  select '08 keys, foreign keys, checks (fingerprint)',
         coalesce(md5(string_agg(c.relname || ':' || k.conname || ':' || pg_get_constraintdef(k.oid), '|' order by c.relname, k.conname)), '')
           = '0e658fc2d5235ab5523036a9aae395f9',
         coalesce(string_agg(k.conname, ', ' order by k.conname), 'none')
    from cls c join pg_constraint k on k.conrelid = c.oid
  union all
  select '09 no triggers on these tables', count(*) = 0, coalesce(string_agg(tgname, ', '), 'none')
    from pg_trigger where not tgisinternal and tgrelid in (select oid from cls)
  union all
  select '10 one create_character, returns players, plpgsql',
         (select count(*) from pg_proc where proname = 'create_character' and pronamespace = 'public'::regnamespace) = 1
           and coalesce(bool_and(prorettype = to_regtype('public.players') and prolang = (select oid from pg_language where lanname = 'plpgsql')), false),
         coalesce(max(oid::regprocedure::text), 'missing')
    from fn
  union all
  select '11 function owner is postgres', coalesce(bool_and(pg_get_userbyid(proowner) = 'postgres'), false),
         coalesce(max(pg_get_userbyid(proowner)), 'missing')
    from fn
  union all
  select '12 SECURITY DEFINER with empty search_path',
         coalesce(bool_and(prosecdef and proconfig = array['search_path=""']), false),
         coalesce(max('security_definer=' || prosecdef || ' config=' || coalesce(proconfig::text, 'none')), 'missing')
    from fn
  union all
  select '13 execute: authenticated only (not anon, not PUBLIC)',
         coalesce(bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')
                       and not has_function_privilege('anon', oid, 'EXECUTE')
                       and not exists (select 1 from aclexplode(proacl) x where x.grantee = 0)), false),
         coalesce(max(coalesce(proacl::text, 'default (PUBLIC can execute)')), 'missing')
    from fn
  union all
  -- Exact bytes, or the same code with only indentation / trailing spaces / CRs changed (the SQL
  -- Editor re-indents pasted text). That is safe to accept: line breaks and every other character
  -- must still match, and no string literal in the reviewed body spans lines, so the tokens are
  -- identical. Anything else fails; supabase/verify/phase1_function_diff.sql shows which lines.
  select '14 function body = reviewed version (fingerprint)',
         coalesce(bool_and(md5(replace(prosrc, chr(13), '')) = '10850996eebe13b27f16630d82366103'
                        or md5(regexp_replace(replace(prosrc, chr(13), ''), '^[ ' || chr(9) || ']+|[ ' || chr(9) || ']+$', '', 'gn')) = 'a1ffc329cee0b869b0f2eed3cd9567d4'), false),
         coalesce(max(case when md5(replace(prosrc, chr(13), '')) = '10850996eebe13b27f16630d82366103' then 'match=exact'
                           when md5(regexp_replace(replace(prosrc, chr(13), ''), '^[ ' || chr(9) || ']+|[ ' || chr(9) || ']+$', '', 'gn')) = 'a1ffc329cee0b869b0f2eed3cd9567d4'
                             then 'match=same code (only indentation/trailing spaces differ)'
                           else 'match=DIFFERENT (run supabase/verify/phase1_function_diff.sql)' end
                      || ' nfc_normalize=' || (strpos(prosrc, 'normalize(') > 0)
                      || ' unicode_allow_list=' || (strpos(prosrc, chr(92) || 'u1E00-' || chr(92) || 'u1EFF') > 0)
                      || ' starting_cash_50000=' || (strpos(prosrc, '50000') > 0)), 'missing')
    from fn
  union all
  select '15 info: row counts (not a check)', true,
         'players=' || (select count(*) from public.players)
         || ' inventories=' || (select count(*) from public.inventories)
         || ' inventory_items=' || (select count(*) from public.inventory_items)
)
select '00 ALL CHECKS' as check_name, bool_and(ok) as ok, count(*) filter (where not ok) || ' failing' as detail from checks
union all
select * from checks
order by 1;
