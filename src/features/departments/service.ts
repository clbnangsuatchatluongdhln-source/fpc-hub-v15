import { supabase } from '../../core/supabase';
import type { Department, DeptRole, Profile } from '../../core/types';

export interface DeptWithHead extends Department {
  head: Profile | null;
}

export interface DeptMemberInfo extends Profile {
  deptRole: DeptRole;
  joinedAt: string;
}

export interface DeptData {
  departments: DeptWithHead[];
  members: Record<string, DeptMemberInfo[]>;
  users: Profile[];
}

export async function loadDeptData(): Promise<DeptData> {
  console.log('[dept] Bắt đầu load dữ liệu...');
  const [deptRes, memberRes, usersRes] = await Promise.all([
    supabase.from('departments').select('*').is('deleted_at', null).order('created_at', { ascending: true }),
    supabase.from('department_members').select('*'),
    supabase.from('profiles').select('*').eq('approval_status', 'active'),
  ]);

  if (deptRes.error) {
    console.error('[dept] Lỗi load departments:', deptRes.error);
    throw new Error(deptRes.error.message);
  }
  if (memberRes.error) {
    console.error('[dept] Lỗi load members:', memberRes.error);
    throw new Error(memberRes.error.message);
  }
  if (usersRes.error) {
    console.error('[dept] Lỗi load users:', usersRes.error);
    throw new Error(usersRes.error.message);
  }
  console.log('[dept] Kết quả thô:', {
    departments: deptRes.data?.length ?? 0,
    members: memberRes.data?.length ?? 0,
    users: usersRes.data?.length ?? 0,
  });

  const users = (usersRes.data ?? []) as Profile[];
  const userMap = new Map<string, Profile>();
  for (const u of users) userMap.set(u.id, u);

  const departments: DeptWithHead[] = ((deptRes.data ?? []) as Department[]).map((d) => ({
    ...d,
    head: d.head_id ? userMap.get(d.head_id) ?? null : null,
  }));

  const members: Record<string, DeptMemberInfo[]> = {};
  type MemberRow = { department_id: string; user_id: string; role: DeptRole; joined_at: string };
  for (const row of (memberRes.data ?? []) as MemberRow[]) {
    const user = userMap.get(row.user_id);
    if (!user) continue;
    if (!members[row.department_id]) members[row.department_id] = [];
    members[row.department_id]!.push({ ...user, deptRole: row.role, joinedAt: row.joined_at });
  }

  return { departments, members, users };
}

export async function createDepartment(input: {
  name: string;
  description: string | null;
  color: string;
  icon: string;
  head_id: string | null;
}): Promise<void> {
  const { error } = await supabase.from('departments').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateDepartment(
  id: string,
  input: { name: string; description: string | null; color: string; icon: string; head_id: string | null },
): Promise<void> {
  const { error } = await supabase.from('departments').update(input).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteDepartment(id: string): Promise<void> {
  const { error } = await supabase.from('departments').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function addDeptMember(deptId: string, userId: string, role: DeptRole): Promise<void> {
  const { error } = await supabase
    .from('department_members')
    .insert({ department_id: deptId, user_id: userId, role });
  if (error) throw new Error(error.message);
}

export async function removeDeptMember(deptId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('department_members')
    .delete()
    .eq('department_id', deptId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function setDeptHead(deptId: string, userId: string | null): Promise<void> {
  const { error } = await supabase.from('departments').update({ head_id: userId }).eq('id', deptId);
  if (error) throw new Error(error.message);
}
