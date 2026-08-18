ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Порталът само ПИШЕ в одит лога (logAudit() -> sbPost), никога не чете/трие/променя от клиента.
-- Затова anon получава само INSERT — SELECT/UPDATE/DELETE остават затворени по подразбиране.
CREATE POLICY anon_insert_audit_log ON public.audit_log
  FOR INSERT TO anon
  WITH CHECK (true);
