/* ============================================================
   FPC HUB v15 · Module 5 · Workflow (Modals)
   Port từ 12a-task-modals.js, 13a-subtask-create.js, 13b-submit-file.js,
   13c-scoring.js, 13d-president.js.
   ============================================================ */
import { Modal } from '../../ui/modal';
import { Toast } from '../../ui/toast';
import { escHtml } from '../../utils';
import { el, fmtBytes, getUserDisplay } from './task-ui';
import {
  createTask, updateTask, createSubtask, submitFilesToSubtask,
  scoreSubmission, rejectSubmission, submitTaskToPresident,
  approveTaskSubmission, rejectTaskSubmission, logHistory,
  fetchTaskSubmissionById,
} from './task-service';
import type {
  Task, Subtask, Submission, TaskSubmission, Profile, Department,
  ProjectOption, FinalFile, ScoreboardEntry, TaskPriority,
} from './types';

/* ─────────────────────────────────────────────
   PUBLIC CONTEXT
   ───────────────────────────────────────────── */
export interface WorkflowContext {
  currentProfile: Profile;
  departments: Department[];
  users: Profile[];
  projects: ProjectOption[];
  tasks: Task[];
  subtasks: Subtask[];
  submissions: Record<string, Submission[]>;
  taskSubmission: TaskSubmission | null;
  refreshList: () => Promise<void>;
  refreshDetail: (taskId: string) => Promise<void>;
}

export const MODAL_IDS = {
  createTask: 'taskFormModal',
  detail: 'taskDetailModal',
  createSubtask: 'createSubtaskModal',
  submitFile: 'submitFileModal',
  score: 'scoreSubmissionModal',
  submitToPresident: 'submitToPresidentModal',
  presidentReview: 'presidentReviewModal',
} as const;

/* ─────────────────────────────────────────────
   INTERNAL HELPERS
   ───────────────────────────────────────────── */
function safeClose(id: string): void {
  try { Modal.close(id); } catch { /* ignore */ }
}

function readValue(root: HTMLElement, selector: string): string {
  const node = root.querySelector<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(selector);
  return node?.value.trim() ?? '';
}

function readNumber(root: HTMLElement, selector: string): number {
  return parseFloat(readValue(root, selector));
}

function disableBtn(btn: HTMLButtonElement, label: string): void {
  btn.disabled = true;
  btn.dataset.origHtml = btn.innerHTML;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i>${escHtml(label)}`;
}

function restoreBtn(btn: HTMLButtonElement): void {
  btn.disabled = false;
  if (btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Đã có lỗi xảy ra';
}

function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el('div');
  wrap.appendChild(el('label', {
    class: 'block text-[10px] font-black text-slate-400 mb-1.5 tracking-widest uppercase',
    text: label,
  }));
  wrap.appendChild(control);
  return wrap;
}

/* ============================================================
   MODAL 1 — Tạo / Sửa Task
   ============================================================ */
export function openCreateTaskModal(ctx: WorkflowContext, taskId?: string): void {
  if (ctx.currentProfile.role !== 'super_admin') {
    Toast.show('Chỉ Super Admin mới tạo/sửa task', { type: 'error' });
    return;
  }

  const isEdit = !!taskId;
  const task = isEdit ? ctx.tasks.find((t) => t.id === taskId) : null;
  if (isEdit && !task) return;

  safeClose(MODAL_IDS.createTask);
  Modal.open(MODAL_IDS.createTask, null, (content) => {
    /* Header */
    const header = el('div', {
      class: 'shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[.06]',
    });
    const title = el('h2', {
      class: 'font-black text-white text-base flex items-center gap-2',
    }, [
      el('i', { class: 'fa-solid fa-list-check text-violet-400' }),
      el('span', { text: isEdit ? 'Sửa task' : 'Tạo task mới' }),
    ]);
    const closeBtn = el('button', {
      class: 'w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition',
      html: '<i class="fa-solid fa-xmark text-sm"></i>',
      type: 'button',
    }) as HTMLButtonElement;
    closeBtn.addEventListener('click', () => safeClose(MODAL_IDS.createTask));
    header.append(title, closeBtn);
    content.appendChild(header);

    /* Body */
    const body = el('div', {
      class: 'flex-1 overflow-y-auto scrollbar px-6 py-5 space-y-4 min-h-0',
    });

    body.appendChild(field('Tên task *',
      el('input', {
        id: 'taskTitleInput', type: 'text', maxlength: '120',
        class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition',
        placeholder: 'VD: Thiết kế bộ nhận diện FPC 2025',
        value: task?.title ?? '',
      })));

    const descInput = el('textarea', {
      id: 'taskDescInput', rows: '2', maxlength: '500',
      class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition resize-none',
      placeholder: 'Mô tả công việc...',
    }) as HTMLTextAreaElement;
    descInput.value = task?.description ?? '';
    body.appendChild(field('Mô tả', descInput));

    const reqInput = el('textarea', {
      id: 'taskReqInput', rows: '2', maxlength: '500',
      class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition resize-none',
      placeholder: 'Yêu cầu đầu ra cụ thể...',
    }) as HTMLTextAreaElement;
    reqInput.value = task?.requirement ?? '';
    body.appendChild(field('Yêu cầu đầu ra', reqInput));

    /* Grid: Ban + Priority */
    const grid = el('div', { class: 'grid grid-cols-2 gap-3' });

    const deptSelect = el('select', {
      id: 'taskDeptSelect',
      class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50 transition cursor-pointer',
    }) as HTMLSelectElement;
    deptSelect.appendChild(el('option', { value: '', text: '— Chọn ban —' }));
    ctx.departments.forEach((d) => {
      deptSelect.appendChild(el('option', {
        value: d.id, text: d.name, selected: d.id === task?.department_id,
      }));
    });
    grid.appendChild(field('Ban phụ trách *', deptSelect));

    const priSelect = el('select', {
      id: 'taskPrioritySelect',
      class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50 transition cursor-pointer',
    }) as HTMLSelectElement;
    const priorities: { v: TaskPriority; t: string }[] = [
      { v: 'low', t: 'Thấp' },
      { v: 'normal', t: 'Bình thường' },
      { v: 'high', t: 'Cao' },
      { v: 'urgent', t: 'Khẩn cấp' },
    ];
    priorities.forEach((p) => {
      priSelect.appendChild(el('option', {
        value: p.v, text: p.t, selected: p.v === (task?.priority ?? 'normal'),
      }));
    });
    grid.appendChild(field('Độ ưu tiên', priSelect));
    body.appendChild(grid);

    /* Project */
    const projectSelect = el('select', {
      id: 'taskProjectSelect',
      class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50 transition cursor-pointer',
    }) as HTMLSelectElement;
    projectSelect.appendChild(el('option', { value: '', text: '— Không thuộc dự án nào —' }));
    ctx.projects.forEach((p) => {
      projectSelect.appendChild(el('option', {
        value: p.id, text: p.name, selected: p.id === task?.project_id,
      }));
    });
    const projLabel = el('label', {
      class: 'block text-[10px] font-black text-slate-400 mb-1.5 tracking-widest uppercase',
    });
    projLabel.innerHTML =
      'Thuộc dự án <span class="text-slate-600 font-bold normal-case tracking-normal">(không bắt buộc)</span>';
    const projBlock = el('div');
    projBlock.append(projLabel, projectSelect);
    body.appendChild(projBlock);

    /* Dates */
    const grid2 = el('div', { class: 'grid grid-cols-2 gap-3' });

    const startInput = el('input', {
      id: 'taskStartInput', type: 'date',
      class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50 transition cursor-pointer',
    }) as HTMLInputElement;
    startInput.value = task?.start_date ?? new Date().toISOString().slice(0, 10);
    grid2.appendChild(field('Ngày bắt đầu', startInput));

    const dlInput = el('input', {
      id: 'taskDeadlineInput', type: 'date',
      class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50 transition cursor-pointer',
    }) as HTMLInputElement;
    dlInput.value = (task?.deadline_current || task?.deadline_original || '').slice(0, 10);
    grid2.appendChild(field('Deadline *', dlInput));
    body.appendChild(grid2);

    content.appendChild(body);

    /* Footer */
    const footer = el('div', {
      class: 'shrink-0 px-6 py-4 border-t border-white/[.06] bg-black/20 flex justify-end gap-2',
    });
    const cancelBtn = el('button', {
      class: 'px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-bold text-slate-300 transition',
      type: 'button', text: 'Hủy',
    }) as HTMLButtonElement;
    cancelBtn.addEventListener('click', () => safeClose(MODAL_IDS.createTask));

    const submitBtn = el('button', {
      id: 'taskSubmitBtn',
      class: 'px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 hover:opacity-95 text-sm font-black text-white transition shadow-neon-pink active:scale-[0.98]',
      type: 'button',
      text: isEdit ? 'Lưu thay đổi' : 'Tạo task',
    }) as HTMLButtonElement;

    submitBtn.addEventListener('click', async () => {
      const title = readValue(content, '#taskTitleInput');
      const description = readValue(content, '#taskDescInput');
      const requirement = readValue(content, '#taskReqInput');
      const departmentId = readValue(content, '#taskDeptSelect');
      const priority = (readValue(content, '#taskPrioritySelect') || 'normal') as TaskPriority;
      const startDate = readValue(content, '#taskStartInput') || null;
      const deadline = readValue(content, '#taskDeadlineInput');
      const projectId = readValue(content, '#taskProjectSelect') || null;

      if (title.length < 3) {
        Toast.show('Tên task phải có ít nhất 3 ký tự', { type: 'error' });
        return;
      }
      if (!departmentId) {
        Toast.show('Chọn ban phụ trách', { type: 'error' });
        return;
      }
      if (!deadline) {
        Toast.show('Chọn deadline', { type: 'error' });
        return;
      }

      disableBtn(submitBtn, 'Đang lưu...');
      try {
        if (isEdit && task) {
          await updateTask(task.id, {
            title, description, requirement, department_id: departmentId,
            priority, start_date: startDate, deadline, project_id: projectId,
          });
          Toast.show(`Đã cập nhật "${title}"`, { type: 'success' });
        } else {
          await createTask({
            title, description, requirement, department_id: departmentId,
            priority, start_date: startDate, deadline, project_id: projectId,
            created_by: ctx.currentProfile.id,
          });
          Toast.show(`Đã tạo task "${title}"`, { type: 'success' });
        }
        safeClose(MODAL_IDS.createTask);
        await ctx.refreshList();
        if (isEdit && task) await ctx.refreshDetail(task.id);
      } catch (err) {
        Toast.show('Lỗi lưu task: ' + errorMessage(err), { type: 'error' });
        restoreBtn(submitBtn);
      }
    });

    footer.append(cancelBtn, submitBtn);
    content.appendChild(footer);
  });
}

/* ============================================================
   MODAL 2 — Tạo Subtask (Trưởng ban)
   ============================================================ */
export function openCreateSubtaskModal(ctx: WorkflowContext, taskId: string): void {
  const task = ctx.tasks.find((t) => t.id === taskId);
  if (!task) return;

  const dept = ctx.departments.find((d) => d.id === task.department_id);
  const isHead = dept?.head_id === ctx.currentProfile.id;
  const isPresident =
    ctx.currentProfile.role === 'super_admin' || ctx.currentProfile.role === 'admin';
  if (!isHead && !isPresident) {
    Toast.show('Chỉ Trưởng ban mới có quyền chia subtask', { type: 'error' });
    return;
  }

  /* Fallback: chưa có bảng department_members trong state → dùng toàn bộ users.
     Ưu tiên trưởng ban lên đầu danh sách ứng viên. */
  const candidates: Profile[] = [];
  if (dept?.head_id) {
    const headProfile = ctx.users.find((u) => u.id === dept.head_id);
    if (headProfile) candidates.push(headProfile);
  }
  ctx.users.forEach((u) => {
    if (!candidates.some((c) => c.id === u.id)) candidates.push(u);
  });

  safeClose(MODAL_IDS.createSubtask);
  Modal.open(MODAL_IDS.createSubtask, null, (content) => {
    /* Header */
    const header = el('div', {
      class: 'shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[.06]',
    });
    const title = el('h2', {
      class: 'font-black text-white text-base flex items-center gap-2',
    }, [
      el('i', { class: 'fa-solid fa-list-check text-violet-400' }),
      el('span', { text: 'Chia việc cho thành viên (Tạo subtask)' }),
    ]);
    const closeBtn = el('button', {
      class: 'w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition',
      html: '<i class="fa-solid fa-xmark text-sm"></i>',
      type: 'button',
    }) as HTMLButtonElement;
    closeBtn.addEventListener('click', () => safeClose(MODAL_IDS.createSubtask));
    header.append(title, closeBtn);
    content.appendChild(header);

    /* Body */
    const body = el('div', {
      class: 'flex-1 overflow-y-auto scrollbar px-6 py-5 space-y-4 min-h-0',
    });

    body.appendChild(field('Tên phần việc *',
      el('input', {
        id: 'subtaskTitle', type: 'text', maxlength: '100',
        class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition',
        placeholder: 'VD: Thiết kế mockup trang chủ Figma',
      })));

    body.appendChild(field('Yêu cầu chi tiết',
      el('textarea', {
        id: 'subtaskDesc', rows: '3',
        class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition resize-none',
        placeholder: 'Mô tả nội dung cần thực hiện, tiêu chí bàn giao...',
      })));

    const grid = el('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-3' });

    const assSelect = el('select', {
      id: 'subtaskAssignee',
      class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50 transition cursor-pointer',
    }) as HTMLSelectElement;
    assSelect.appendChild(el('option', { value: '', text: '— Chọn thành viên —' }));
    candidates.forEach((u) => {
      const suffix = u.id === dept?.head_id ? ' (Trưởng ban)' : '';
      assSelect.appendChild(el('option', { value: u.id, text: u.display_name + suffix }));
    });
    grid.appendChild(field('Giao cho thành viên *', assSelect));

    const dlInput = el('input', {
      id: 'subtaskDeadline', type: 'date',
      class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50 transition cursor-pointer',
    }) as HTMLInputElement;
    const taskDl = task.deadline_current || task.deadline_original;
    if (taskDl) dlInput.value = taskDl.slice(0, 10);
    grid.appendChild(field('Deadline hoàn thành *', dlInput));
    body.appendChild(grid);

    content.appendChild(body);

    /* Footer */
    const footer = el('div', {
      class: 'shrink-0 px-6 py-4 border-t border-white/[.06] bg-black/20 flex justify-end gap-2',
    });
    const cancelBtn = el('button', {
      class: 'px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-bold text-slate-300 transition',
      type: 'button', text: 'Hủy',
    }) as HTMLButtonElement;
    cancelBtn.addEventListener('click', () => safeClose(MODAL_IDS.createSubtask));

    const submitBtn = el('button', {
      id: 'btnSubmitCreateSubtask',
      class: 'px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 hover:opacity-95 text-sm font-black text-white transition shadow-neon-pink active:scale-[0.98]',
      type: 'button', text: 'Giao việc',
    }) as HTMLButtonElement;

    submitBtn.addEventListener('click', async () => {
      const title = readValue(content, '#subtaskTitle');
      const desc = readValue(content, '#subtaskDesc');
      const assigneeId = readValue(content, '#subtaskAssignee');
      const deadline = readValue(content, '#subtaskDeadline');

      if (title.length < 3 || title.length > 100) {
        Toast.show('Tên subtask phải từ 3 đến 100 ký tự', { type: 'error' });
        return;
      }
      if (!assigneeId) {
        Toast.show('Vui lòng chọn thành viên nhận việc', { type: 'error' });
        return;
      }
      if (!deadline) {
        Toast.show('Vui lòng đặt deadline cho subtask', { type: 'error' });
        return;
      }

      disableBtn(submitBtn, 'Đang lưu...');
      try {
        const orderIdx = ctx.subtasks.length + 1;
        const newSub = await createSubtask({
          task_id: taskId,
          title,
          description: desc || null,
          assignee_id: assigneeId,
          deadline,
          order_index: orderIdx,
          created_by: ctx.currentProfile.id,
        });

        if (task.status === 'assigned') {
          await logHistory({
            task_id: taskId,
            action: 'start_working',
            old_status: 'assigned',
            new_status: 'working',
            note: 'Chuyển sang đang làm khi bắt đầu chia subtask',
          });
        }

        const assignee = getUserDisplay(assigneeId, ctx.users);
        await logHistory({
          task_id: taskId,
          action: 'create_subtask',
          note: `Tạo subtask: "${title}" giao cho ${assignee.name}`,
          metadata: { subtask_id: newSub.id },
        });

        Toast.show(`Đã giao "${title}" cho ${assignee.name}`, { type: 'success' });
        safeClose(MODAL_IDS.createSubtask);
        await ctx.refreshList();
        await ctx.refreshDetail(taskId);
      } catch (err) {
        Toast.show('Lỗi tạo subtask: ' + errorMessage(err), { type: 'error' });
        restoreBtn(submitBtn);
      }
    });

    footer.append(cancelBtn, submitBtn);
    content.appendChild(footer);
  });
}

/* ============================================================
   MODAL 3 — Nộp file (Member)
   ============================================================ */
export function openSubmitFileModal(ctx: WorkflowContext, subtaskId: string): void {
  const subtask = ctx.subtasks.find((s) => s.id === subtaskId);
  if (!subtask) return;

  safeClose(MODAL_IDS.submitFile);
  Modal.open(MODAL_IDS.submitFile, null, (content) => {
    let chosenFiles: File[] = [];

    /* Header */
    const header = el('div', {
      class: 'shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[.06]',
    });
    const title = el('h2', {
      class: 'font-black text-white text-base flex items-center gap-2',
    }, [
      el('i', { class: 'fa-solid fa-cloud-arrow-up text-pink-400' }),
      el('span', { text: `Nộp kết quả: ${subtask.title}` }),
    ]);
    const closeBtn = el('button', {
      class: 'w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition',
      html: '<i class="fa-solid fa-xmark text-sm"></i>',
      type: 'button',
    }) as HTMLButtonElement;
    closeBtn.addEventListener('click', () => safeClose(MODAL_IDS.submitFile));
    header.append(title, closeBtn);
    content.appendChild(header);

    /* Body */
    const body = el('div', {
      class: 'flex-1 overflow-y-auto scrollbar px-6 py-5 space-y-4 min-h-0',
    });

    const notice = el('div', {
      class: 'p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs text-slate-300 flex items-start gap-2.5',
    });
    notice.innerHTML = `
      <i class="fa-solid fa-circle-info text-violet-400 text-sm mt-0.5 shrink-0"></i>
      <div>
        <p class="font-bold text-white">Quy trình nộp bài FPC LAB:</p>
        <p class="text-slate-400 mt-0.5">Thành viên tải lên file minh chứng / sản phẩm. Điểm số (0-10) và tỷ lệ đóng góp (%) sẽ do Trưởng ban đánh giá khách quan sau khi kiểm tra file.</p>
      </div>`;
    body.appendChild(notice);

    /* Dropzone */
    const dropzone = el('div', {
      class: 'border-2 border-dashed border-white/15 hover:border-pink-500/50 rounded-2xl p-6 text-center cursor-pointer transition bg-white/[.02] hover:bg-white/[.04]',
    });
    const fileInput = el('input', { type: 'file', multiple: true, class: 'hidden' }) as HTMLInputElement;
    dropzone.innerHTML = `
      <i class="fa-solid fa-cloud-arrow-up text-3xl text-pink-400 mb-2 block"></i>
      <p class="text-sm font-bold text-white">Nhấn hoặc kéo thả file vào đây</p>
      <p class="text-xs text-slate-500 mt-1">Hỗ trợ PDF, Figma, Zip, Code, Ảnh, Video, Tài liệu...</p>`;
    dropzone.appendChild(fileInput);
    dropzone.addEventListener('click', () => fileInput.click());

    const fileListEl = el('div', { class: 'space-y-1.5 hidden' });

    const renderChosen = (): void => {
      if (!chosenFiles.length) {
        fileListEl.classList.add('hidden');
        fileListEl.replaceChildren();
        return;
      }
      fileListEl.classList.remove('hidden');
      fileListEl.replaceChildren();
      chosenFiles.forEach((f, idx) => {
        const item = el('div', {
          class: 'flex items-center justify-between p-2.5 rounded-xl bg-white/[.03] border border-white/[.06] text-xs',
        });
        item.innerHTML = `
          <div class="flex items-center gap-2 truncate flex-1">
            <i class="fa-solid fa-file text-slate-400"></i>
            <span class="font-bold text-slate-200 truncate">${escHtml(f.name)}</span>
            <span class="text-slate-500 shrink-0">${escHtml(fmtBytes(f.size))}</span>
          </div>`;
        const rmBtn = el('button', {
          type: 'button',
          class: 'text-slate-500 hover:text-rose-400 ml-2',
          html: '<i class="fa-solid fa-xmark"></i>',
        }) as HTMLButtonElement;
        rmBtn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          chosenFiles.splice(idx, 1);
          renderChosen();
        });
        item.appendChild(rmBtn);
        fileListEl.appendChild(item);
      });
    };

    fileInput.addEventListener('change', () => {
      chosenFiles = Array.from(fileInput.files ?? []);
      renderChosen();
    });

    body.append(dropzone, fileListEl);

    body.appendChild(field('Ghi chú / Mô tả sản phẩm',
      el('textarea', {
        id: 'submitNote', rows: '3',
        class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50 transition resize-none',
        placeholder: 'Mô tả ngắn gọn kết quả công việc, link bổ sung hoặc lưu ý cho Trưởng ban...',
      })));

    content.appendChild(body);

    /* Footer */
    const footer = el('div', {
      class: 'shrink-0 px-6 py-4 border-t border-white/[.06] bg-black/20 flex justify-end gap-2',
    });
    const cancelBtn = el('button', {
      class: 'px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-bold text-slate-300 transition',
      type: 'button', text: 'Hủy',
    }) as HTMLButtonElement;
    cancelBtn.addEventListener('click', () => safeClose(MODAL_IDS.submitFile));

    const submitBtn = el('button', {
      id: 'btnConfirmSubmitFile',
      class: 'px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 hover:opacity-95 text-sm font-black text-white transition shadow-neon-pink active:scale-[0.98]',
      type: 'button', text: 'Nộp bài',
    }) as HTMLButtonElement;

    submitBtn.addEventListener('click', async () => {
      if (!chosenFiles.length) {
        Toast.show('Vui lòng chọn ít nhất 1 file đính kèm', { type: 'error' });
        return;
      }
      const note = readValue(content, '#submitNote');
      const now = new Date();
      const dl = subtask.deadline ? new Date(subtask.deadline) : null;
      if (dl) dl.setHours(23, 59, 59, 999);
      const isLate = dl ? now > dl : false;
      const lateDays = isLate && dl
        ? Math.max(1, Math.ceil((now.getTime() - dl.getTime()) / 86_400_000))
        : 0;

      disableBtn(submitBtn, 'Đang tải file lên...');
      try {
        await submitFilesToSubtask({
          subtaskId,
          taskId: subtask.task_id,
          files: chosenFiles,
          note,
          memberId: ctx.currentProfile.id,
          isLate,
          lateDays,
        });
        await logHistory({
          task_id: subtask.task_id,
          action: 'submit_subtask_file',
          note: `Thành viên nộp ${chosenFiles.length} file cho subtask "${subtask.title}"${isLate ? ` (Trễ ${lateDays} ngày)` : ''}`,
          metadata: { subtask_id: subtaskId, file_count: chosenFiles.length },
        });
        Toast.show('Đã nộp bài thành công! Chờ Trưởng ban chấm điểm.', { type: 'success' });
        safeClose(MODAL_IDS.submitFile);
        await ctx.refreshList();
        await ctx.refreshDetail(subtask.task_id);
      } catch (err) {
        Toast.show('Lỗi nộp bài: ' + errorMessage(err), { type: 'error' });
        restoreBtn(submitBtn);
      }
    });

    footer.append(cancelBtn, submitBtn);
    content.appendChild(footer);
  });
}

/* ============================================================
   MODAL 4 — Chấm điểm (Trưởng ban)
   ============================================================ */
export function openScoreModal(ctx: WorkflowContext, submissionId: string): void {
  let targetSub: Submission | null = null;
  let targetSubtask: Subtask | null = null;
  for (const sub of ctx.subtasks) {
    const found = (ctx.submissions[sub.id] ?? []).find((x) => x.id === submissionId);
    if (found) {
      targetSub = found;
      targetSubtask = sub;
      break;
    }
  }
  if (!targetSub || !targetSubtask) return;

  const task = ctx.tasks.find((t) => t.id === targetSubtask!.task_id);
  if (!task) return;
  const dept = ctx.departments.find((d) => d.id === task.department_id);
  const isHead = dept?.head_id === ctx.currentProfile.id;
  const isPresident =
    ctx.currentProfile.role === 'super_admin' || ctx.currentProfile.role === 'admin';
  if (!isHead && !isPresident) {
    Toast.show('Chỉ Trưởng ban mới có quyền chấm điểm', { type: 'error' });
    return;
  }

  const sub = targetSub;
  const subtask = targetSubtask;
  const member = getUserDisplay(sub.member_id, ctx.users);

  safeClose(MODAL_IDS.score);
  Modal.open(MODAL_IDS.score, null, (content) => {
    /* Header */
    const header = el('div', {
      class: 'shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[.06]',
    });
    const title = el('h2', {
      class: 'font-black text-white text-base flex items-center gap-2',
    }, [
      el('i', { class: 'fa-solid fa-star text-amber-400' }),
      el('span', { text: `Đánh giá & Chấm điểm: ${subtask.title}` }),
    ]);
    const closeBtn = el('button', {
      class: 'w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition',
      html: '<i class="fa-solid fa-xmark text-sm"></i>',
      type: 'button',
    }) as HTMLButtonElement;
    closeBtn.addEventListener('click', () => safeClose(MODAL_IDS.score));
    header.append(title, closeBtn);
    content.appendChild(header);

    /* Body */
    const body = el('div', {
      class: 'flex-1 overflow-y-auto scrollbar px-6 py-5 space-y-4 min-h-0',
    });

    const fileBox = el('div', {
      class: 'p-3.5 rounded-2xl bg-white/[.03] border border-white/[.06] space-y-3',
    });
    fileBox.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white text-xs font-black">${escHtml(member.initial)}</div>
          <span class="font-bold text-white text-sm">${escHtml(member.name)}</span>
        </div>
        <span class="text-[11px] text-slate-500">${escHtml(new Date(sub.submitted_at).toLocaleString('vi-VN'))}</span>
      </div>
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/[.08]">
        <div class="flex items-center gap-2 truncate flex-1">
          <i class="fa-solid fa-file text-cyan-400 text-sm"></i>
          <span class="text-xs font-bold text-slate-200 truncate">${escHtml(sub.file_name)}</span>
          <span class="text-[10px] text-slate-500 shrink-0">${escHtml(fmtBytes(sub.file_size))}</span>
        </div>
        <a href="${escHtml(sub.file_url)}" target="_blank" rel="noopener noreferrer"
           class="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-black transition flex items-center gap-1.5 shrink-0">
          <i class="fa-solid fa-eye text-[10px]"></i><span>Xem file</span>
        </a>
      </div>
      ${sub.note ? `<p class="text-xs text-slate-400 italic">Lời nhắn: "${escHtml(sub.note)}"</p>` : ''}`;
    body.appendChild(fileBox);

    /* Score + Contribution */
    const scoreGrid = el('div', { class: 'grid grid-cols-2 gap-3' });
    scoreGrid.appendChild(field('Điểm số (0 - 10) *',
      el('input', {
        id: 'inputScore', type: 'number', min: '0', max: '10', step: '0.5',
        value: sub.score != null ? String(sub.score) : '8.5',
        class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-base font-black text-emerald-300 focus:outline-none focus:border-emerald-500/50 transition',
      })));
    scoreGrid.appendChild(field('Đóng góp (%) *',
      el('input', {
        id: 'inputContrib', type: 'number', min: '0', max: '100', step: '1',
        value: sub.contribution_pct != null ? String(sub.contribution_pct) : '25',
        class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-base font-black text-cyan-300 focus:outline-none focus:border-cyan-500/50 transition',
      })));
    body.appendChild(scoreGrid);

    const noteInput = el('textarea', {
      id: 'inputHeadNote', rows: '3',
      class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition resize-none',
      placeholder: 'Ghi nhận xét ưu điểm hoặc yêu cầu chỉnh sửa nếu từ chối...',
    }) as HTMLTextAreaElement;
    noteInput.value = sub.head_note ?? '';
    body.appendChild(field('Nhận xét / Lời phê của Trưởng ban', noteInput));

    content.appendChild(body);

    /* Footer */
    const footer = el('div', {
      class: 'shrink-0 px-6 py-4 border-t border-white/[.06] bg-black/20 flex justify-between items-center gap-2 flex-wrap',
    });

    const rejectBtn = el('button', {
      class: 'px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-black transition flex items-center gap-1.5',
      type: 'button',
    }, [
      el('i', { class: 'fa-solid fa-xmark text-xs' }),
      el('span', { text: 'Từ chối (Bắt làm lại)' }),
    ]) as HTMLButtonElement;

    const rightGrp = el('div', { class: 'flex items-center gap-2' });
    const cancelBtn = el('button', {
      class: 'px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-bold text-slate-300 transition',
      type: 'button', text: 'Hủy',
    }) as HTMLButtonElement;
    cancelBtn.addEventListener('click', () => safeClose(MODAL_IDS.score));

    const acceptBtn = el('button', {
      class: 'px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 text-sm font-black text-white transition shadow-lg active:scale-[0.98]',
      type: 'button', text: 'Chấp nhận & Chấm điểm',
    }) as HTMLButtonElement;

    rejectBtn.addEventListener('click', async () => {
      const headNote = readValue(content, '#inputHeadNote');
      if (!headNote) {
        Toast.show('Vui lòng nhập lý do từ chối vào ô nhận xét để thành viên biết lỗi cần sửa', { type: 'error' });
        return;
      }
      if (!window.confirm(`Từ chối bài nộp của ${member.name} và yêu cầu làm lại?`)) return;
      rejectBtn.disabled = true;
      try {
        await rejectSubmission({
          submissionId: sub.id,
          subtaskId: subtask.id,
          head_note: headNote,
          scored_by: ctx.currentProfile.id,
        });
        await logHistory({
          task_id: subtask.task_id,
          action: 'reject_submission',
          note: `Trưởng ban từ chối bài nộp của ${member.name}: "${headNote}"`,
          metadata: { subtask_id: subtask.id, submission_id: sub.id },
        });
        Toast.show(`Đã yêu cầu ${member.name} làm lại bài`, { type: 'warn' });
        safeClose(MODAL_IDS.score);
        await ctx.refreshDetail(subtask.task_id);
      } catch (err) {
        Toast.show('Lỗi: ' + errorMessage(err), { type: 'error' });
      } finally {
        rejectBtn.disabled = false;
      }
    });

    acceptBtn.addEventListener('click', async () => {
      const score = readNumber(content, '#inputScore');
      const contrib = readNumber(content, '#inputContrib');
      const headNote = readValue(content, '#inputHeadNote');
      if (isNaN(score) || score < 0 || score > 10) {
        Toast.show('Điểm số phải từ 0 đến 10', { type: 'error' });
        return;
      }
      if (isNaN(contrib) || contrib < 0 || contrib > 100) {
        Toast.show('Tỷ lệ đóng góp phải từ 0% đến 100%', { type: 'error' });
        return;
      }
      disableBtn(acceptBtn, 'Đang lưu...');
      try {
        await scoreSubmission({
          submissionId: sub.id,
          subtaskId: subtask.id,
          score, contribution_pct: contrib,
          head_note: headNote,
          scored_by: ctx.currentProfile.id,
        });
        await logHistory({
          task_id: subtask.task_id,
          action: 'score_submission',
          note: `Chấm ${score}/10 điểm (${contrib}%) cho ${member.name} ở phần việc "${subtask.title}"`,
          metadata: { subtask_id: subtask.id, score, contribution_pct: contrib },
        });
        Toast.show(`Đã ghi nhận ${score}/10 điểm cho ${member.name}`, { type: 'success' });
        safeClose(MODAL_IDS.score);
        await ctx.refreshDetail(subtask.task_id);
      } catch (err) {
        Toast.show('Lỗi chấm điểm: ' + errorMessage(err), { type: 'error' });
        restoreBtn(acceptBtn);
      }
    });

    rightGrp.append(cancelBtn, acceptBtn);
    footer.append(rejectBtn, rightGrp);
    content.appendChild(footer);
  });
}

/* ============================================================
   MODAL 5 — Trưởng ban tổng hợp gửi Chủ nhiệm
   ============================================================ */
export function openSubmitToPresidentModal(ctx: WorkflowContext, taskId: string): void {
  const task = ctx.tasks.find((t) => t.id === taskId);
  if (!task) return;

  const dept = ctx.departments.find((d) => d.id === task.department_id);
  const isHead = dept?.head_id === ctx.currentProfile.id;
  const isPresident =
    ctx.currentProfile.role === 'super_admin' || ctx.currentProfile.role === 'admin';
  if (!isHead && !isPresident) {
    Toast.show('Chỉ Trưởng ban mới có quyền nộp sản phẩm lên Chủ nhiệm', { type: 'error' });
    return;
  }

  /* Tổng hợp submission chưa bị reject */
  interface AllSub extends Submission { subtaskTitle: string; }
  const allSubmissions: AllSub[] = [];
  ctx.subtasks.forEach((st) => {
    (ctx.submissions[st.id] ?? []).filter((s) => !s.is_rejected).forEach((s) => {
      allSubmissions.push({ ...s, subtaskTitle: st.title });
    });
  });

  const userMap: Record<string, {
    user_id: string; name: string; scores: number[];
    contribution_pct: number; role: string;
  }> = {};
  allSubmissions.forEach((s) => {
    if (!userMap[s.member_id]) {
      const u = getUserDisplay(s.member_id, ctx.users);
      userMap[s.member_id] = {
        user_id: s.member_id, name: u.name,
        scores: [], contribution_pct: 0, role: 'member',
      };
    }
    if (s.score != null) userMap[s.member_id].scores.push(s.score);
    if (s.contribution_pct != null) userMap[s.member_id].contribution_pct += Number(s.contribution_pct);
  });

  const scoreboardData: ScoreboardEntry[] = Object.values(userMap).map((item) => ({
    user_id: item.user_id,
    name: item.name,
    score: item.scores.length
      ? Math.round((item.scores.reduce((a, b) => a + b, 0) / item.scores.length) * 10) / 10
      : 8.5,
    contribution_pct: Math.min(100, item.contribution_pct),
    role: item.role,
  }));

  safeClose(MODAL_IDS.submitToPresident);
  Modal.open(MODAL_IDS.submitToPresident, null, (content) => {
    /* Header */
    const header = el('div', {
      class: 'shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[.06]',
    });
    const title = el('h2', {
      class: 'font-black text-white text-base flex items-center gap-2',
    }, [
      el('i', { class: 'fa-solid fa-paper-plane text-violet-400' }),
      el('span', { text: `Tổng hợp sản phẩm gửi Chủ nhiệm: ${task.title}` }),
    ]);
    const closeBtn = el('button', {
      class: 'w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition',
      html: '<i class="fa-solid fa-xmark text-sm"></i>',
      type: 'button',
    }) as HTMLButtonElement;
    closeBtn.addEventListener('click', () => safeClose(MODAL_IDS.submitToPresident));
    header.append(title, closeBtn);
    content.appendChild(header);

    /* Body */
    const body = el('div', {
      class: 'flex-1 overflow-y-auto scrollbar px-6 py-5 space-y-4 min-h-0',
    });

    /* File checklist */
    const fileSec = el('div', { class: 'space-y-2' });
    fileSec.appendChild(el('label', {
      class: 'block text-[10px] font-black text-slate-400 tracking-widest uppercase',
      text: 'Chọn file nghiệm thu chung *',
    }));

    if (!allSubmissions.length) {
      fileSec.appendChild(el('p', {
        class: 'text-xs text-amber-300 italic',
        text: 'Chưa có file nào từ thành viên. Bạn vẫn có thể nộp báo cáo tổng quan.',
      }));
    } else {
      const fList = el('div', { class: 'space-y-1.5 max-h-48 overflow-y-auto scrollbar' });
      allSubmissions.forEach((s) => {
        const row = el('label', {
          class: 'flex items-center gap-3 p-2.5 rounded-xl bg-white/[.02] border border-white/[.05] hover:bg-white/[.05] cursor-pointer transition',
        });
        const cb = el('input', {
          type: 'checkbox', value: s.id, checked: true,
          class: 'final-file-cb w-4 h-4 accent-violet-500 cursor-pointer',
        }) as HTMLInputElement;
        row.appendChild(cb);
        row.appendChild(el('div', { class: 'min-w-0 flex-1' }, [
          el('div', { class: 'text-xs font-bold text-white truncate', text: s.file_name }),
          el('div', {
            class: 'text-[10px] text-slate-500 truncate',
            text: `${s.subtaskTitle} · ${fmtBytes(s.file_size)}`,
          }),
        ]));
        fList.appendChild(row);
      });
      fileSec.appendChild(fList);
    }
    body.appendChild(fileSec);

    /* Scoreboard */
    const scoreSec = el('div', { class: 'space-y-2' });
    scoreSec.appendChild(el('label', {
      class: 'block text-[10px] font-black text-slate-400 tracking-widest uppercase',
      text: 'Bảng điểm đóng góp của các thành viên',
    }));

    const tbl = el('table', { class: 'w-full text-left text-xs' });
    tbl.innerHTML = `
      <thead class="bg-white/[.04] text-[10px] text-slate-400 uppercase font-black">
        <tr>
          <th class="px-3 py-2">Thành viên</th>
          <th class="px-3 py-2 text-center">Điểm TB</th>
          <th class="px-3 py-2 text-center">Đóng góp %</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-white/[.04]"></tbody>`;
    const tbody = tbl.querySelector('tbody');
    if (tbody) {
      if (!scoreboardData.length) {
        tbody.innerHTML =
          '<tr><td colspan="3" class="px-3 py-4 text-center text-slate-500 italic">Chưa có thành viên nào được chấm điểm</td></tr>';
      } else {
        scoreboardData.forEach((item) => {
          tbody.appendChild(el('tr', { class: 'hover:bg-white/[.02]' }, [
            el('td', { class: 'px-3 py-2 font-bold text-white', text: item.name }),
            el('td', { class: 'px-3 py-2 text-center font-black text-emerald-300', text: `${item.score}/10` }),
            el('td', { class: 'px-3 py-2 text-center font-bold text-cyan-300', text: `${item.contribution_pct}%` }),
          ]));
        });
      }
    }
    const tableWrap = el('div', { class: 'rounded-xl border border-white/[.06] overflow-hidden' });
    tableWrap.appendChild(tbl);
    scoreSec.appendChild(tableWrap);
    body.appendChild(scoreSec);

    body.appendChild(field('Tóm tắt nghiệm thu gửi Chủ nhiệm *',
      el('textarea', {
        id: 'presidentSummary', rows: '3',
        class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition resize-none',
        placeholder: 'Tóm tắt kết quả hoàn thành của ban, các tài liệu đính kèm và lưu ý...',
      })));

    content.appendChild(body);

    /* Footer */
    const footer = el('div', {
      class: 'shrink-0 px-6 py-4 border-t border-white/[.06] bg-black/20 flex justify-end gap-2',
    });
    const cancelBtn = el('button', {
      class: 'px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-bold text-slate-300 transition',
      type: 'button', text: 'Hủy',
    }) as HTMLButtonElement;
    cancelBtn.addEventListener('click', () => safeClose(MODAL_IDS.submitToPresident));

    const submitBtn = el('button', {
      class: 'px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 hover:opacity-95 text-sm font-black text-white transition shadow-neon-pink active:scale-[0.98]',
      type: 'button', text: 'Gửi Chủ nhiệm duyệt',
    }) as HTMLButtonElement;

    submitBtn.addEventListener('click', async () => {
      const summary = readValue(content, '#presidentSummary');
      if (summary.length < 5) {
        Toast.show('Vui lòng nhập tóm tắt nghiệm thu (tối thiểu 5 ký tự)', { type: 'error' });
        return;
      }

      /* FIX: build FinalFile[] bằng for-of thay vì map().filter() type-predicate
         (tránh lỗi TS2677 khi FinalFile.size optional). */
      const checked = Array.from(
        content.querySelectorAll<HTMLInputElement>('.final-file-cb:checked'),
      );
      const finalFiles: FinalFile[] = [];
      for (const cb of checked) {
        const found = allSubmissions.find((s) => s.id === cb.value);
        if (found) {
          finalFiles.push({
            url: found.file_url,
            name: found.file_name,
            size: found.file_size,
          });
        }
      }

      disableBtn(submitBtn, 'Đang gửi...');
      try {
        await submitTaskToPresident({
          taskId,
          headId: ctx.currentProfile.id,
          finalFiles,
          summary,
          scoreboard: scoreboardData,
        });
        await logHistory({
          task_id: taskId,
          action: 'submit_to_president',
          old_status: 'working',
          new_status: 'pending_review',
          note: `Trưởng ban nộp sản phẩm nghiệm thu lên Chủ nhiệm: "${summary}"`,
        });
        Toast.show('Đã gửi sản phẩm và bảng điểm lên Chủ nhiệm duyệt!', { type: 'success' });
        safeClose(MODAL_IDS.submitToPresident);
        await ctx.refreshList();
        await ctx.refreshDetail(taskId);
      } catch (err) {
        Toast.show('Lỗi: ' + errorMessage(err), { type: 'error' });
        restoreBtn(submitBtn);
      }
    });

    footer.append(cancelBtn, submitBtn);
    content.appendChild(footer);
  });
}

/* ============================================================
   MODAL 6 — Chủ nhiệm duyệt cuối
   ============================================================ */
export async function openPresidentReviewModal(
  ctx: WorkflowContext,
  taskSubmissionId: string,
): Promise<void> {
  if (ctx.currentProfile.role !== 'super_admin' && ctx.currentProfile.role !== 'admin') {
    Toast.show('Chỉ Chủ nhiệm mới có quyền phê duyệt task', { type: 'error' });
    return;
  }

  const taskSub = await fetchTaskSubmissionById(taskSubmissionId);
  if (!taskSub) {
    Toast.show('Không tìm thấy thông tin nộp bài', { type: 'error' });
    return;
  }
  const task = ctx.tasks.find((t) => t.id === taskSub.task_id);
  const head = getUserDisplay(taskSub.head_id, ctx.users);

  safeClose(MODAL_IDS.presidentReview);
  Modal.open(MODAL_IDS.presidentReview, null, (content) => {
    /* Header */
    const header = el('div', {
      class: 'shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[.06]',
    });
    const title = el('h2', {
      class: 'font-black text-white text-base flex items-center gap-2',
    }, [
      el('i', { class: 'fa-solid fa-gavel text-pink-400' }),
      el('span', { text: `Chủ nhiệm phê duyệt: ${task?.title ?? 'Công việc'}` }),
    ]);
    const closeBtn = el('button', {
      class: 'w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition',
      html: '<i class="fa-solid fa-xmark text-sm"></i>',
      type: 'button',
    }) as HTMLButtonElement;
    closeBtn.addEventListener('click', () => safeClose(MODAL_IDS.presidentReview));
    header.append(title, closeBtn);
    content.appendChild(header);

    /* Body */
    const body = el('div', {
      class: 'flex-1 overflow-y-auto scrollbar px-6 py-5 space-y-4 min-h-0',
    });

    const report = el('div', {
      class: 'p-4 rounded-2xl bg-violet-500/[.06] border border-violet-500/20 space-y-2',
    });
    report.innerHTML = `
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-2 font-bold text-white">
          <i class="fa-solid fa-user-tie text-violet-400"></i>
          <span>Báo cáo từ Trưởng ban ${escHtml(head.name)}</span>
        </div>
        <span class="text-slate-500 text-[11px]">${escHtml(new Date(taskSub.submitted_at).toLocaleString('vi-VN'))}</span>
      </div>
      <p class="text-xs text-slate-300 leading-relaxed italic">"${escHtml(taskSub.summary || 'Không có mô tả chi tiết')}"</p>`;
    body.appendChild(report);

    /* Final files */
    const filesSec = el('div', { class: 'space-y-2' });
    filesSec.appendChild(el('div', {
      class: 'text-[10px] font-black text-slate-400 tracking-widest uppercase',
      text: `Sản phẩm hoàn thiện (${taskSub.final_files?.length ?? 0} file)`,
    }));
    if (!taskSub.final_files || !taskSub.final_files.length) {
      filesSec.appendChild(el('p', {
        class: 'text-xs text-slate-500 italic',
        text: 'Không có file đính kèm.',
      }));
    } else {
      const fGrid = el('div', { class: 'space-y-1.5' });
      taskSub.final_files.forEach((f) => {
        const row = el('div', {
          class: 'flex items-center justify-between p-2.5 rounded-xl bg-white/[.02] border border-white/[.06]',
        });
        row.innerHTML = `
          <div class="flex items-center gap-2 truncate flex-1">
            <i class="fa-solid fa-file-circle-check text-emerald-400"></i>
            <span class="text-xs font-bold text-slate-200 truncate">${escHtml(f.name)}</span>
            ${f.size ? `<span class="text-[10px] text-slate-500">${escHtml(fmtBytes(f.size))}</span>` : ''}
          </div>
          <a href="${escHtml(f.url)}" target="_blank" rel="noopener noreferrer"
             class="px-3 py-1 rounded bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 text-xs font-bold transition flex items-center gap-1.5">
            <i class="fa-solid fa-download text-[10px]"></i><span>Tải về</span>
          </a>`;
        fGrid.appendChild(row);
      });
      filesSec.appendChild(fGrid);
    }
    body.appendChild(filesSec);

    /* Scoreboard */
    const scoreSec = el('div', { class: 'space-y-2' });
    scoreSec.appendChild(el('div', {
      class: 'text-[10px] font-black text-slate-400 tracking-widest uppercase',
      text: 'Bảng điểm đề xuất cho các thành viên',
    }));
    const tbl = el('table', { class: 'w-full text-left text-xs' });
    tbl.innerHTML = `
      <thead class="bg-white/[.04] text-[10px] text-slate-400 uppercase font-black">
        <tr>
          <th class="px-3 py-2">Họ tên</th>
          <th class="px-3 py-2 text-center">Điểm TB</th>
          <th class="px-3 py-2 text-center">Đóng góp (%)</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-white/[.04]"></tbody>`;
    const tbody = tbl.querySelector('tbody');
    if (tbody) {
      if (!taskSub.scoreboard?.length) {
        tbody.innerHTML =
          '<tr><td colspan="3" class="px-3 py-4 text-center text-slate-500 italic">Chưa có bảng điểm</td></tr>';
      } else {
        taskSub.scoreboard.forEach((item) => {
          tbody.appendChild(el('tr', {}, [
            el('td', { class: 'px-3 py-2 font-bold text-white', text: item.name }),
            el('td', { class: 'px-3 py-2 text-center font-black text-emerald-300', text: `${item.score}/10` }),
            el('td', { class: 'px-3 py-2 text-center font-bold text-cyan-300', text: `${item.contribution_pct}%` }),
          ]));
        });
      }
    }
    const tableWrap = el('div', { class: 'rounded-xl border border-white/[.06] overflow-hidden' });
    tableWrap.appendChild(tbl);
    scoreSec.appendChild(tableWrap);
    body.appendChild(scoreSec);

    body.appendChild(field('Ý kiến của Chủ nhiệm / Lý do từ chối',
      el('textarea', {
        id: 'presidentNote', rows: '3',
        class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50 transition resize-none',
        placeholder: 'Ghi nhận xét khen ngợi hoặc chỉ rõ lý do nếu từ chối yêu cầu làm lại...',
      })));

    content.appendChild(body);

    /* Footer */
    const footer = el('div', {
      class: 'shrink-0 px-6 py-4 border-t border-white/[.06] bg-black/20 flex justify-between items-center gap-2 flex-wrap',
    });

    const rejectBtn = el('button', {
      class: 'px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-black transition flex items-center gap-1.5',
      type: 'button',
    }, [
      el('i', { class: 'fa-solid fa-xmark text-xs' }),
      el('span', { text: '❌ Từ chối (Làm lại)' }),
    ]) as HTMLButtonElement;

    const rightBox = el('div', { class: 'flex items-center gap-2' });
    const closeFinal = el('button', {
      class: 'px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-bold text-slate-300 transition',
      type: 'button', text: 'Đóng',
    }) as HTMLButtonElement;
    closeFinal.addEventListener('click', () => safeClose(MODAL_IDS.presidentReview));

    const approveBtn = el('button', {
      class: 'px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 text-sm font-black text-white transition shadow-lg active:scale-[0.98]',
      type: 'button', text: '✅ Phê duyệt & Ghi nhận điểm',
    }) as HTMLButtonElement;

    rejectBtn.addEventListener('click', async () => {
      const note = readValue(content, '#presidentNote');
      if (!note) {
        Toast.show('Vui lòng nhập lý do từ chối để ban phụ trách biết hướng chỉnh sửa', { type: 'error' });
        return;
      }
      if (!window.confirm('Xác nhận từ chối và yêu cầu ban làm lại sản phẩm?')) return;

      rejectBtn.disabled = true;
      try {
        const newCount = await rejectTaskSubmission({
          taskSubmissionId,
          taskId: taskSub.task_id,
          reviewedBy: ctx.currentProfile.id,
          reason: note,
          currentRejectCount: task?.reject_count ?? 0,
        });
        await logHistory({
          task_id: taskSub.task_id,
          action: 'president_reject',
          old_status: 'pending_review',
          new_status: 'rejected',
          note: `Chủ nhiệm từ chối: "${note}" (Lần từ chối: ${newCount})`,
        });
        Toast.show('Đã gửi thông báo từ chối tới ban phụ trách', { type: 'warn' });
        safeClose(MODAL_IDS.presidentReview);
        await ctx.refreshList();
        await ctx.refreshDetail(taskSub.task_id);
      } catch (err) {
        Toast.show('Lỗi: ' + errorMessage(err), { type: 'error' });
      } finally {
        rejectBtn.disabled = false;
      }
    });

    approveBtn.addEventListener('click', async () => {
      const note = readValue(content, '#presidentNote');
      if (!window.confirm('Xác nhận phê duyệt sản phẩm? Trigger SQL sẽ tự động ghi điểm đóng góp cho từng thành viên.')) return;

      disableBtn(approveBtn, 'Đang duyệt...');
      try {
        await approveTaskSubmission({
          taskSubmissionId,
          taskId: taskSub.task_id,
          reviewedBy: ctx.currentProfile.id,
          note,
        });
        await logHistory({
          task_id: taskSub.task_id,
          action: 'president_approve',
          old_status: 'pending_review',
          new_status: 'approved',
          note: `Chủ nhiệm nghiệm thu & duyệt sản phẩm${note ? `: "${note}"` : ''}`,
        });
        Toast.show('🎉 Đã phê duyệt thành công! Điểm số đã được ghi nhận.', { type: 'success', timeout: 5000 });
        safeClose(MODAL_IDS.presidentReview);
        await ctx.refreshList();
        await ctx.refreshDetail(taskSub.task_id);
      } catch (err) {
        Toast.show('Lỗi duyệt: ' + errorMessage(err), { type: 'error' });
        restoreBtn(approveBtn);
      }
    });

    rightBox.append(closeFinal, approveBtn);
    footer.append(rejectBtn, rightBox);
    content.appendChild(footer);
  });
}
