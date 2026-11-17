import {describe,expect,it} from 'vitest';
import {mayDeleteFile,mayReadFile} from '../../../api/_lib/storage-policy';
const user={id:'u',approval_status:'active'},file={uploaded_by:'u'};
describe('file access',()=>{
 it('does not let upload ownership bypass a private event owned by someone else',()=>{
  expect(mayReadFile(user,file,[{type:'event',visibility:'private',ownerId:'other'}],[])).toBe(false);
 });
 it('requires department membership for department events',()=>{
  const parent={type:'event' as const,visibility:'department',departmentId:'d'};
  expect(mayReadFile(user,file,[parent],[])).toBe(false);
  expect(mayReadFile(user,file,[parent],['d'])).toBe(true);
 });
 it('requires access to every linked parent',()=>{
  expect(mayReadFile(user,file,[{type:'event',visibility:'public'},{type:'project',ownerId:'other'}],[])).toBe(false);
 });
 it('allows project owner or project member',()=>{
  expect(mayReadFile(user,file,[{type:'project',ownerId:'u'}],[])).toBe(true);
  expect(mayReadFile(user,file,[{type:'project',members:['u']}],[])).toBe(true);
 });
 it('denies pending accounts and deleting another user file',()=>{
  expect(mayReadFile({...user,approval_status:'pending'},file,[],[])).toBe(false);
  expect(mayDeleteFile(user,{uploaded_by:'other'})).toBe(false);
  expect(mayDeleteFile(user,file)).toBe(true);
 });
});
