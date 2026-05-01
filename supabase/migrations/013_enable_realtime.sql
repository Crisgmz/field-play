-- ============================================================
-- MIGRATION 013: Activar Realtime en tablas operativas
-- ============================================================
-- PURPOSE:
--   Por default, Supabase Realtime NO publica cambios de tablas
--   públicas — hay que agregarlas explícitamente al publication
--   `supabase_realtime`. Sin esto, las suscripciones del frontend
--   no reciben eventos.
--
--   Activamos solo las tablas donde un cambio importa para la UI:
--   reservas, bloqueos, canchas, configuración. Tablas estáticas
--   (logs, etc.) se quedan fuera.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → pega y Run.
--   Idempotente — si la tabla ya está en el publication, falla
--   silenciosamente con DO ... EXCEPTION. No corre dos veces seguidas
--   en el mismo statement, pero re-aplicar el archivo completo es OK
--   porque cada bloque maneja su propio error.
-- ============================================================

do $$
declare
  tbl text;
  tables text[] := array[
    'bookings',
    'blocks',
    'block_units',
    'fields',
    'field_units',
    'clubs',
    'pricing_rules',
    'venue_configs',
    'club_images',
    'profiles'
  ];
begin
  foreach tbl in array tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', tbl);
      raise notice 'Added public.% to supabase_realtime', tbl;
    exception
      when duplicate_object then
        raise notice 'public.% already in supabase_realtime, skipping', tbl;
    end;
  end loop;
end $$;


-- Verificación: lista las tablas que están publicando cambios.
--
--   select schemaname, tablename
--   from pg_publication_tables
--   where pubname = 'supabase_realtime'
--     and schemaname = 'public'
--   order by tablename;
--
-- Debe incluir las 10 tablas listadas arriba.
