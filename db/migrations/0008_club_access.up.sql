BEGIN;
CREATE SCHEMA IF NOT EXISTS fpc_private;
REVOKE ALL ON SCHEMA fpc_private FROM PUBLIC;
GRANT USAGE ON SCHEMA fpc_private TO authenticated;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS club_position text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_club_position_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_club_position_check
  CHECK (club_position IS NULL OR club_position IN ('president', 'vice_president'));

CREATE OR REPLACE FUNCTION fpc_private.is_active_member()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approval_status = 'active'); $$;

CREATE OR REPLACE FUNCTION public.is_club_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approval_status = 'active'
  AND (role IN ('super_admin', 'admin') OR club_position IN ('president', 'vice_president'))); $$;

CREATE OR REPLACE FUNCTION fpc_private.guard_club_appointments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.club_position IS DISTINCT FROM OLD.club_position
    OR NEW.approval_status IS DISTINCT FROM OLD.approval_status
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    IF NOT public.is_club_admin() THEN RAISE EXCEPTION 'Chỉ lãnh đạo CLB được bổ nhiệm hoặc duyệt tài khoản'; END IF;
    IF NEW.id = auth.uid() THEN RAISE EXCEPTION 'Không được tự thay đổi quyền hoặc chức vụ'; END IF;
    IF (NEW.role = 'super_admin' OR OLD.role = 'super_admin') AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Chỉ quản trị hệ thống được thay đổi tài khoản quản trị hệ thống';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_club_appointments ON public.profiles;
CREATE TRIGGER trg_club_appointments BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION fpc_private.guard_club_appointments();

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'group';
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE RESTRICT;
UPDATE public.conversations SET scope = 'direct' WHERE type = 'dm';
UPDATE public.conversations SET scope = 'club' WHERE id = (
  SELECT id FROM public.conversations WHERE type = 'channel' ORDER BY created_at, id LIMIT 1
);
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_scope_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_scope_check CHECK (
  (scope = 'department' AND department_id IS NOT NULL AND type = 'group')
  OR (scope = 'club' AND department_id IS NULL AND type = 'channel')
  OR (scope = 'direct' AND department_id IS NULL AND type = 'dm')
  OR (scope = 'group' AND department_id IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_club ON public.conversations(scope) WHERE scope = 'club';
CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_department ON public.conversations(department_id) WHERE scope = 'department';

INSERT INTO public.conversations(type, name, scope, members)
SELECT 'channel', 'Thông báo chung CLB', 'club', '{}'::uuid[]
WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE scope = 'club');

CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT fpc_private.is_active_member() AND EXISTS (
    SELECT 1 FROM public.conversations c WHERE c.id = conv_id AND (
      c.scope = 'club'
      OR (c.scope IN ('direct','group') AND auth.uid() = ANY(c.members))
      OR (c.scope = 'department' AND EXISTS (
        SELECT 1 FROM public.departments d JOIN public.department_members dm ON dm.department_id = d.id
        WHERE d.id = c.department_id AND d.deleted_at IS NULL AND dm.user_id = auth.uid()
      ))
    )
  );
$$;

CREATE OR REPLACE FUNCTION fpc_private.can_send_conversation(conv_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT public.is_conversation_member(conv_id) AND EXISTS (
  SELECT 1 FROM public.conversations WHERE id = conv_id AND (scope <> 'club' OR public.is_club_admin())
); $$;

CREATE OR REPLACE FUNCTION fpc_private.are_active_members(user_ids uuid[])
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT NOT EXISTS (SELECT 1 FROM unnest(user_ids) member_id WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE id = member_id AND approval_status = 'active'
)); $$;

DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_member(id));

DROP POLICY IF EXISTS club_conversations_read_guard ON public.conversations;
CREATE POLICY club_conversations_read_guard ON public.conversations AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.is_conversation_member(id));
DROP POLICY IF EXISTS club_conversations_create_guard ON public.conversations;
CREATE POLICY club_conversations_create_guard ON public.conversations AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (
    fpc_private.is_active_member() AND created_by = auth.uid() AND auth.uid() = ANY(members)
    AND scope IN ('direct','group') AND type IN ('dm','group') AND department_id IS NULL
    AND (scope <> 'direct' OR cardinality(members) = 2)
    AND fpc_private.are_active_members(members)
  );
DROP POLICY IF EXISTS club_conversations_change_guard ON public.conversations;
CREATE POLICY club_conversations_change_guard ON public.conversations AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.is_conversation_member(id) AND created_by = auth.uid() AND scope IN ('direct','group'))
  WITH CHECK (public.is_conversation_member(id) AND created_by = auth.uid() AND scope IN ('direct','group'));
DROP POLICY IF EXISTS club_conversations_delete_guard ON public.conversations;
CREATE POLICY club_conversations_delete_guard ON public.conversations AS RESTRICTIVE
  FOR DELETE TO authenticated USING (scope IN ('direct','group') AND public.is_conversation_member(id));

CREATE OR REPLACE FUNCTION fpc_private.guard_conversation_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin') OR auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.scope IS DISTINCT FROM OLD.scope
    OR NEW.department_id IS DISTINCT FROM OLD.department_id OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Không được đổi phạm vi hội thoại';
  END IF;
  IF NEW.members IS DISTINCT FROM OLD.members THEN
    RAISE EXCEPTION 'Thay đổi thành viên hội thoại cần quy trình quản trị riêng';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_conversation_identity ON public.conversations;
CREATE TRIGGER trg_conversation_identity BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION fpc_private.guard_conversation_identity();

DROP POLICY IF EXISTS club_messages_read_guard ON public.messages;
CREATE POLICY club_messages_read_guard ON public.messages AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS club_messages_send_guard ON public.messages;
CREATE POLICY club_messages_send_guard ON public.messages AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid() AND fpc_private.can_send_conversation(conversation_id));
DROP POLICY IF EXISTS club_messages_update_guard ON public.messages;
CREATE POLICY club_messages_update_guard ON public.messages AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.is_conversation_member(conversation_id))
  WITH CHECK (public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS club_messages_delete_guard ON public.messages;
CREATE POLICY club_messages_delete_guard ON public.messages AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.is_conversation_member(conversation_id) AND fpc_private.can_send_conversation(conversation_id));

CREATE OR REPLACE FUNCTION fpc_private.guard_message_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Không được đổi định danh tin nhắn'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','seen_at','delivered_at','search_tsv']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['status','seen_at','delivered_at','search_tsv']) THEN
    IF OLD.sender_id IS DISTINCT FROM auth.uid() OR NOT fpc_private.can_send_conversation(OLD.conversation_id) THEN
      RAISE EXCEPTION 'Không được sửa nội dung tin nhắn của người khác';
    END IF;
  END IF;
  IF array_position(ARRAY['failed','sending','sent','delivered','seen'],NEW.status)
    < array_position(ARRAY['failed','sending','sent','delivered','seen'],OLD.status) THEN NEW.status = OLD.status; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_message_update_guard ON public.messages;
CREATE TRIGGER trg_message_update_guard BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION fpc_private.guard_message_update();

CREATE OR REPLACE FUNCTION fpc_private.sync_department_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NULL THEN
    INSERT INTO public.conversations(type, name, scope, department_id, members)
    VALUES ('group', 'Ban ' || NEW.name, 'department', NEW.id, '{}'::uuid[])
    ON CONFLICT (department_id) WHERE scope = 'department' DO UPDATE SET name = EXCLUDED.name;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_department_conversation ON public.departments;
CREATE TRIGGER trg_department_conversation AFTER INSERT OR UPDATE OF name, deleted_at ON public.departments
  FOR EACH ROW EXECUTE FUNCTION fpc_private.sync_department_conversation();
INSERT INTO public.conversations(type, name, scope, department_id, members)
SELECT 'group', 'Ban ' || name, 'department', id, '{}'::uuid[] FROM public.departments WHERE deleted_at IS NULL
ON CONFLICT (department_id) WHERE scope = 'department' DO UPDATE SET name = EXCLUDED.name;

CREATE OR REPLACE FUNCTION fpc_private.sync_department_head()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.department_members SET role = 'member' WHERE department_id = NEW.id AND role = 'head' AND user_id IS DISTINCT FROM NEW.head_id;
  IF NEW.head_id IS NOT NULL THEN
    INSERT INTO public.department_members(department_id,user_id,role) VALUES (NEW.id,NEW.head_id,'head')
    ON CONFLICT (department_id,user_id) DO UPDATE SET role = 'head';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_department_head ON public.departments;
CREATE TRIGGER trg_department_head AFTER INSERT OR UPDATE OF head_id ON public.departments
  FOR EACH ROW EXECUTE FUNCTION fpc_private.sync_department_head();
UPDATE public.department_members dm SET role = 'member' FROM public.departments d
WHERE dm.department_id = d.id AND dm.role = 'head' AND dm.user_id IS DISTINCT FROM d.head_id;
INSERT INTO public.department_members(department_id,user_id,role)
SELECT id,head_id,'head' FROM public.departments WHERE head_id IS NOT NULL
ON CONFLICT (department_id,user_id) DO UPDATE SET role = 'head';

CREATE OR REPLACE FUNCTION fpc_private.clear_removed_department_head()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.departments SET head_id = NULL WHERE id = OLD.department_id AND head_id = OLD.user_id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_removed_department_head ON public.department_members;
CREATE TRIGGER trg_removed_department_head AFTER DELETE ON public.department_members
  FOR EACH ROW EXECUTE FUNCTION fpc_private.clear_removed_department_head();

CREATE OR REPLACE FUNCTION fpc_private.touch_conversation_from_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = greatest(last_message_at,NEW.created_at) WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_message_conversation_time ON public.messages;
CREATE TRIGGER trg_message_conversation_time AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION fpc_private.touch_conversation_from_message();

DROP POLICY IF EXISTS club_states_member_guard ON public.conversation_states;
CREATE POLICY club_states_member_guard ON public.conversation_states AS RESTRICTIVE
  FOR ALL TO authenticated USING (user_id = auth.uid() AND public.is_conversation_member(conversation_id))
  WITH CHECK (user_id = auth.uid() AND public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS club_notifications_member_guard ON public.notifications;
CREATE POLICY club_notifications_member_guard ON public.notifications AS RESTRICTIVE
  FOR SELECT TO authenticated USING (user_id = auth.uid() AND fpc_private.is_active_member()
    AND (conversation_id IS NULL OR public.is_conversation_member(conversation_id)));

CREATE OR REPLACE FUNCTION fpc_private.can_read_event(event_visibility text, dept_id uuid, owner_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT fpc_private.is_active_member() AND (
  (event_visibility = 'private' AND owner_id = auth.uid()) OR event_visibility = 'public'
  OR (event_visibility = 'department' AND public.is_department_member(dept_id))
); $$;
CREATE OR REPLACE FUNCTION fpc_private.can_write_event(event_visibility text, dept_id uuid, owner_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT fpc_private.is_active_member() AND owner_id = auth.uid() AND (
  event_visibility = 'private' OR (event_visibility = 'public' AND public.is_club_admin())
  OR (event_visibility = 'department' AND (public.is_club_admin() OR EXISTS (
    SELECT 1 FROM public.departments WHERE id = dept_id AND deleted_at IS NULL AND head_id = auth.uid()
  )))
); $$;
DROP POLICY IF EXISTS club_events_read_guard ON public.events;
CREATE POLICY club_events_read_guard ON public.events AS RESTRICTIVE FOR SELECT TO authenticated
  USING (fpc_private.can_read_event(visibility::text,department_id,created_by));
DROP POLICY IF EXISTS club_events_insert_guard ON public.events;
CREATE POLICY club_events_insert_guard ON public.events AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (fpc_private.can_write_event(visibility::text,department_id,created_by));
DROP POLICY IF EXISTS club_events_update_guard ON public.events;
CREATE POLICY club_events_update_guard ON public.events AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (fpc_private.can_write_event(visibility::text,department_id,created_by))
  WITH CHECK (fpc_private.can_write_event(visibility::text,department_id,created_by));
DROP POLICY IF EXISTS club_events_delete_guard ON public.events;
CREATE POLICY club_events_delete_guard ON public.events AS RESTRICTIVE FOR DELETE TO authenticated
  USING (fpc_private.can_write_event(visibility::text,department_id,created_by));

REVOKE ALL ON FUNCTION fpc_private.is_active_member(), fpc_private.can_send_conversation(uuid),
  fpc_private.are_active_members(uuid[]), fpc_private.can_read_event(text,uuid,uuid), fpc_private.can_write_event(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fpc_private.is_active_member(), fpc_private.can_send_conversation(uuid),
  fpc_private.are_active_members(uuid[]), fpc_private.can_read_event(text,uuid,uuid), fpc_private.can_write_event(text,uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION fpc_private.guard_club_appointments(), fpc_private.guard_conversation_identity(),
  fpc_private.guard_message_update(), fpc_private.sync_department_conversation(), fpc_private.sync_department_head(),
  fpc_private.clear_removed_department_head(), fpc_private.touch_conversation_from_message() FROM PUBLIC;

INSERT INTO public.schema_migrations(version,name,applied_by) VALUES ('0008','club_access_and_scoped_chat','manual')
ON CONFLICT(version) DO NOTHING;
COMMIT;

