-- READ-ONLY. Shows which lines of the live public.create_character body differ from the reviewed
-- migration (supabase/migrations/20261018000000_phase1_players.sql), ignoring indentation and
-- trailing spaces. Paste into Supabase Dashboard -> SQL Editor and Run; it changes nothing.
--
-- First row: summary. Every other row is one line that differs: its line number in the
-- migration file, the live text, and any characters outside printable ASCII (e.g. U+A0, a
-- non-breaking space). "differing=0" means the live code is the reviewed code.
-- The expected lines are stored as md5 fingerprints so that pasting this file cannot alter them.
with
expected as (
  select m, i from unnest(array['d41d8cd98f00b204e9800998ecf8427e','27aec0f4281e186cd83e5d949edd22d5','ce53263d04b80a942107ef40d420db67','95fa2cb30d7dabdfe302520b73358da0','4f4f1743a8d91932f1e4ee05d504d16d','a0e31a9b70f66446eed3a3a74d505662','8d589afa4dfaeeed85fff5aa78e5ff6a','0215ad92db98c10ba6a5914de837428a','e3d31c3a0a9c931e5e6b524a32646baf','317332dd3f19e1e0060dc005ac82eee3','d41d8cd98f00b204e9800998ecf8427e','a8ac0629e2ab605f6fb134a97886b279','9a54312827eb42ae5722c83e36ebfd5d','9c100383e594d7224aed405efb26fd6c','6ebbef6050a0e635b073dce729999ffc','874be932859196d2bfb642fb46fdb7ee','d8a070a1473e7beb003610f6d9dc3513','0b5ccda50fdb83fcc9263c89682c49cb','ee8856d059c2fd947e0c9830caa2ac09','317332dd3f19e1e0060dc005ac82eee3','d41d8cd98f00b204e9800998ecf8427e','3d7b7e55c178d7cd0ae6ef011b7b1b5a','442d0184dd79889a45d70c3497afc249','33750273ec8632bc84a46e70181141c8','b0e92f6a4338ac5d383bc5318f6f34ec','bbc8b1f70e57676ddcdc9e93e02f197a','1c46dafd8f8f452e4f8d2003bf467aca','317332dd3f19e1e0060dc005ac82eee3','d41d8cd98f00b204e9800998ecf8427e','72eff321a7cd5ef1b7404ec8716b008d','b744c7fea308669ac1c0dd73e23f66f1','317332dd3f19e1e0060dc005ac82eee3','d41d8cd98f00b204e9800998ecf8427e','46f2c7754d9148b76f2f4c5c6fa8fb74','fa717f3d63d3c7b59ba13fb144cec64a','543c542dcca65741d46454c38db15bb5','2d720441e9e4d423326b973513fb0878','117ed6bea534e516a5128cf3faacdef2','622c88f22fe09d7d363e8b1dde645c34','6a53ee4fd3a3e375e455b32d1cc3a6b1','37967e2e82ae946fd9c12295c29bfcf0','8278bc52d11cef014b442cf6d6199b81','d53a13603c25e3a55ca77e02f78e0a41','9371d7a2e3ae86a00aab4771e39d255d','05db57e33c4469742c4daed07f4bff63','d41d8cd98f00b204e9800998ecf8427e','7147892b5d13d76ca9edd092c0c8527c','06d7d764180b07ff8a44e226ea0a7a75','d7d466beb9e9efbcce5e186cb9ea4aa1','68f1b6c59ce07f60994575eab242071e','2aad29e1ca2c2577fdd43da2f1c53edd','d41d8cd98f00b204e9800998ecf8427e','fc7704fdd6ec83612c2ba198190882dd','284daf7805f5618250880d45bd94c510','d41d8cd98f00b204e9800998ecf8427e']::text[]) with ordinality u(m, i)
),
live as (
  select regexp_replace(replace(prosrc, chr(13), ''), '^[ ' || chr(9) || ']+|[ ' || chr(9) || ']+$', '', 'gn') as n
    from pg_proc where oid = to_regprocedure('public.create_character(text,jsonb)')
),
live_lines as (
  select l, i from live, regexp_split_to_table(n, chr(10)) with ordinality t(l, i)
),
cmp as (
  select coalesce(l.i, e.i) as body_line, l.l as live_text,
         (l.l is not null and e.m is not null and md5(l.l) = e.m) as same
    from live_lines l full join expected e on e.i = l.i
)
select 0 as migration_line,
       'SUMMARY: ' || case when not exists (select 1 from live) then 'function missing'
                           else 'live lines=' || (select count(*) from live_lines)
                                || ' expected=' || (select count(*) from expected)
                                || ' differing=' || (select count(*) from cmp where not same) end as live_text,
       null as unusual_characters
union all
select body_line + 67, coalesce(live_text, '(line missing in live function)'),
       (select string_agg(distinct 'U+' || upper(to_hex(ascii(c))), ' ')
          from regexp_split_to_table(coalesce(live_text, ''), '') c
         where ascii(c) > 126 or ascii(c) < 32)
  from cmp where not same
order by 1;
