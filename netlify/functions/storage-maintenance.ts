import {runStorageMaintenance} from '../../api/_lib/storage-maintenance';
export default async()=>{
 const result=await runStorageMaintenance({signal:AbortSignal.timeout(20000)});
 console.log(JSON.stringify({storageMaintenance:result}));
};
export const config={schedule:'5 2 * * *'};
