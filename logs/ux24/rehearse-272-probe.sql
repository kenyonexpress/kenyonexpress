DO $p$
DECLARE cols int; trg text; backfilled int; own int; anon_rows int; uid uuid;
BEGIN
  SELECT count(*) INTO cols FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name IN ('terms_accepted_at','terms_version');
  SELECT string_agg(tgname, ',' ORDER BY tgname) INTO trg FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname='users' AND NOT t.tgisinternal;
  SELECT count(*) INTO backfilled FROM public.profiles WHERE terms_accepted_at IS NOT NULL;
  SELECT id INTO uid FROM public.profiles ORDER BY created_at LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO own FROM public.profiles WHERE id = uid AND terms_accepted_at IS NULL;
  PERFORM set_config('role', 'anon', true);
  SELECT count(*) INTO anon_rows FROM public.profiles;
  RESET role;
  RAISE EXCEPTION 'PROBE cols=% triggers=% backfilled=% own_row_visible_as_authenticated=% anon_rows=%', cols, trg, backfilled, own, anon_rows;
END $p$;
