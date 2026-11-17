import {storageRequest} from '../../core/storage/http';
import {escHtml} from '../../utils';
import './storage-dashboard.css';

interface Connection {id:string;label:string;provider:string;env_prefix:string;bucket:string;configured:boolean;write_enabled:boolean;capacity_bytes:number;reported_used_bytes:number;used:number;reserved:number;warn_percent:number;stop_percent:number;image_priority:number|null;document_priority:number|null;video_priority:number|null}
interface Limit {id:string;name:string;enabled:boolean;max_file_bytes:number;daily_bytes:number;daily_count:number;total_bytes:number;used:number;reserved:number;day_bytes:number;day_count:number}
interface Job {id:string;title:string;state:string;visibility:string;delete_after:string|null;hold_reason:string|null;last_error:string|null}
interface Overview {admin:boolean;connections:Connection[];users:Limit[];jobs:Job[]}
const mib=1048576;
const bytes=(v:number)=>(v/mib).toLocaleString('vi-VN',{maximumFractionDigits:1})+' MiB';
const states:Record<string,string>={review:'Chờ duyệt',scheduled:'Đã hẹn xóa',retained:'Đang giữ lại',deleting:'Đang dọn tệp',failed:'Cần thử dọn lại',cancelled:'Cần duyệt lại',deleted:'Đã xóa'};
function input(name:string,label:string,value:number,min=0,max=1048576){return '<label>'+label+'<input type="number" name="'+name+'" value="'+value+'" min="'+min+'" max="'+max+'" step="any" required></label>';}
export function mountStorageDashboard(host:HTMLElement):()=>void {
 const root=document.createElement('section');root.className='storage-dashboard';host.prepend(root);
 let alive=true,busy=false,editing=false;
 const message=document.createElement('p');message.setAttribute('role','status');
 const content=document.createElement('div');root.append(message,content);
 async function action(body:Record<string,unknown>) {
  if(busy)return;busy=true;message.textContent='Đang lưu…';
  try{await storageRequest('/api/storage-control',body);editing=false;busy=false;await refresh();if(alive)message.textContent='Đã cập nhật';}
  catch(error){if(alive)message.textContent=error instanceof Error?error.message:'Không lưu được';}
  finally{busy=false;}
 }
 function limitForm(user:Limit) {
  const form=document.createElement('form');form.className='storage-form';
  form.innerHTML='<h4>'+escHtml(user.name||'Thành viên')+'</h4><p>24 giờ: '+bytes(user.day_bytes)+' · '+user.day_count+' tệp. Đang lưu: '+bytes(user.used)+' · Đang chờ: '+bytes(user.reserved)+'</p>'+input('max_file_bytes','Mỗi tệp (MiB)',user.max_file_bytes/mib,0.000001,100)+input('daily_bytes','Mỗi 24 giờ (MiB)',user.daily_bytes/mib)+input('daily_count','Số tệp / 24 giờ',user.daily_count,0,10000)+input('total_bytes','Tổng đang lưu (MiB)',user.total_bytes/mib)+'<label><input name="enabled" type="checkbox" '+(user.enabled?'checked':'')+'> Cho phép tải lên</label><button>Lưu hạn mức</button>';
  form.onsubmit=event=>{event.preventDefault();const data=new FormData(form);void action({action:'save-limit',user_id:user.id,enabled:data.has('enabled'),max_file_bytes:Math.round(Number(data.get('max_file_bytes'))*mib),daily_bytes:Math.round(Number(data.get('daily_bytes'))*mib),daily_count:Number(data.get('daily_count')),total_bytes:Math.round(Number(data.get('total_bytes'))*mib)});};return form;
 }
 async function refresh() {
  if(!alive || busy || editing)return;
  try {
   const data=await storageRequest<Overview>('/api/storage-control',{action:'overview'});if(!alive)return;
   content.replaceChildren();message.textContent='Dung lượng ước tính theo app; chưa bao gồm mọi bản lưu mềm và dữ liệu bên ngoài.';
   const heading=document.createElement('h3');heading.textContent='Dung lượng & vòng đời dữ liệu';content.append(heading);
   for(const user of data.users) {
    if(data.admin){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Hạn mức · '+user.name+' · '+bytes(user.day_bytes)+' / '+bytes(user.daily_bytes)+' mỗi 24 giờ';details.append(summary,limitForm(user));content.append(details);}
    else {const p=document.createElement('p');p.textContent='Bạn: '+bytes(user.day_bytes)+' / '+bytes(user.daily_bytes)+' mỗi 24 giờ · '+user.day_count+' / '+user.daily_count+' tệp · Đang lưu '+bytes(user.used)+' / '+bytes(user.total_bytes);content.append(p);}
   }
   for(const c of data.connections) {
    const used=Math.max(Number(c.used)+Number(c.reserved),Number(c.reported_used_bytes));const percent=Math.min(100,Math.round(used/c.capacity_bytes*100));
    const details=document.createElement('details');
    details.innerHTML='<summary>'+escHtml(c.label)+' · '+escHtml(c.provider)+' · '+percent+'% · '+(!c.configured?'Thiếu cấu hình':!c.write_enabled?'Ngừng nhận mới':percent>=c.stop_percent?'Chuyển kho':'Đang nhận')+'</summary><progress max="100" value="'+percent+'"></progress><p>'+bytes(used)+' / '+bytes(c.capacity_bytes)+' · '+escHtml(c.bucket)+' · '+escHtml(c.env_prefix)+'</p>';
    const form=document.createElement('form');form.className='storage-form';
    form.innerHTML='<label>Tên kho<input name="label" maxlength="100" value="'+escHtml(c.label)+'" required></label>'+input('capacity_bytes','Ngân sách dung lượng (MiB)',c.capacity_bytes/mib,1)+input('reported_used_bytes','Đã dùng theo dashboard provider (MiB)',c.reported_used_bytes/mib)+input('warn_percent','Cảnh báo (%)',c.warn_percent,1,98)+input('stop_percent','Ngừng nhận mới (%)',c.stop_percent,2,99)+['image','document','video'].map((kind,index)=>'<label>Ưu tiên '+['ảnh','tài liệu','video'][index]+' (trống = không nhận)<input name="'+kind+'_priority" type="number" min="1" max="1000" value="'+(c[(kind+'_priority') as keyof Connection]??'')+'"></label>').join('')+'<label><input name="write_enabled" type="checkbox" '+(c.write_enabled?'checked':'')+'> Cho nhận tệp mới</label><button>Lưu kho</button>';
    form.onsubmit=event=>{event.preventDefault();const fd=new FormData(form);const body:Record<string,unknown>={action:'save-connection',id:c.id,label:fd.get('label'),write_enabled:fd.has('write_enabled')};for(const key of ['capacity_bytes','reported_used_bytes'])body[key]=Math.round(Number(fd.get(key))*mib);for(const key of ['warn_percent','stop_percent'])body[key]=Number(fd.get(key));for(const key of ['image_priority','document_priority','video_priority'])body[key]=fd.get(key)===''?null:Number(fd.get(key));void action(body);};details.append(form);content.append(details);
   }
   if(data.admin) {
    const help=document.createElement('p');help.textContent='Thêm tài khoản kho: dùng scripts/connect-storage.mjs với tệp cấu hình local. Hệ thống kiểm tra thật trước khi đăng ký; key không nhập vào giao diện hoặc database.';content.append(help);
    const scan=document.createElement('button');scan.textContent='Kiểm tra hạn mức & sự kiện quá 90 ngày';scan.onclick=()=>void action({action:'scan'});content.append(scan);
    const run=document.createElement('button');run.textContent='Dọn lịch đã duyệt và đến hạn';run.onclick=()=>{if(window.confirm('Chỉ dọn những sự kiện đã được duyệt và hết 7 ngày chờ. Tiếp tục?'))void action({action:'run-due'});};content.append(run);
   }
   const h=document.createElement('h4');h.textContent='Sự kiện cũ cần xem lại';content.append(h);
   if(!data.jobs.length){const empty=document.createElement('p');empty.textContent='Chưa có sự kiện cần xử lý';content.append(empty);}
   for(const j of data.jobs) {
    const item=document.createElement('article');const title=document.createElement('strong');title.textContent=j.title;
    const info=document.createElement('p');info.textContent=(states[j.state]??j.state)+(j.delete_after?' · Dự kiến xóa '+new Date(j.delete_after).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'}):'')+(j.hold_reason?' · '+j.hold_reason:'')+(j.last_error?' · '+j.last_error:'');item.append(title,info);
    if(['review','scheduled','retained','cancelled'].includes(j.state)) {
     const hold=document.createElement('button');hold.textContent='Yêu cầu giữ lại';hold.onclick=()=>{const reason=window.prompt('Lý do giữ lại sự kiện và tệp đính kèm:');if(reason!==null)void action({action:'hold',id:j.id,reason});};item.append(hold);
    }
    if(data.admin && ['review','retained','cancelled'].includes(j.state)) {
     const audience=document.createElement('select');audience.setAttribute('aria-label','Người nhận thông báo');audience.innerHTML='<option value="related">Người liên quan</option>'+(j.visibility==='public'?'<option value="club">Toàn CLB</option>':'');
     const approve=document.createElement('button');approve.textContent='Duyệt xóa sau 7 ngày';approve.onclick=()=>{if(window.confirm('Sự kiện và tệp đính kèm sẽ bị xóa sau 7 ngày. Gửi thông báo trước khi xóa?'))void action({action:'approve',id:j.id,audience:audience.value});};item.append(audience,approve);
    }
    content.append(item);
   }
  }catch(error){if(alive)message.textContent=error instanceof Error?error.message:'Không tải được quản trị kho';}
 }
 content.addEventListener('input',()=>{editing=true;});
 void refresh();const timer=window.setInterval(()=>void refresh(),60000);
 return ()=>{alive=false;window.clearInterval(timer);root.remove();};
}
