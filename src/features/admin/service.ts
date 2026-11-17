import { supabase } from '../../core/supabase';
import type { Profile, Role } from '../../core/types';
import type { ClubPosition } from '../../core/access';

export async function loadAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

export async function approveUser(userId: string, approverId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      approval_status: 'active',
      approved_by: approverId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function rejectUser(userId: string, approverId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      approval_status: 'rejected',
      approved_by: approverId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function changeRole(userId: string, role: Role): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function changeClubPosition(userId: string, clubPosition: ClubPosition): Promise<void> {
  const { error } = await supabase.from('profiles').update({ club_position: clubPosition }).eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function deleteUserProfile(userId: string): Promise<void> {
  const { error } = await supabase.from('profiles').delete().eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function countPendingUsers(): Promise<number> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('approval_status', 'pending');
  if (error) return 0;
  return count ?? 0;
}
