export interface FileOwner { uploaded_by?: string | null }
export interface FileReader { id:string; approval_status?:string }
export interface FileParent {
  type:'event'|'project'; visibility?:string; ownerId?:string|null; headId?:string|null;
  members?:string[]; departmentId?:string|null;
}

export function mayReadFile(user:FileReader, file:FileOwner, parents:FileParent[], departmentIds:string[]):boolean {
  if(user.approval_status!=='active')return false;
  if(!parents.length)return true;
  return parents.every(parent=>parent.type==='event'
    ? parent.visibility==='public' || (parent.visibility==='private' && parent.ownerId===user.id)
      || (parent.visibility==='department' && !!parent.departmentId && departmentIds.includes(parent.departmentId))
    : parent.ownerId===user.id || parent.headId===user.id || !!parent.members?.includes(user.id)
      || (!!parent.departmentId && departmentIds.includes(parent.departmentId)))
    && !!file;
}

export function mayDeleteFile(user:FileReader,file:FileOwner):boolean {
  return user.approval_status==='active' && file.uploaded_by===user.id;
}
