// ============================================================
// FPC HUB v15 · Calendar Module — Event/Project create modal
// Port từ 06c-event-create.js
// ============================================================

import { Modal } from '../../ui/modal';
import { Toast } from '../../ui/toast';
import { escHtml } from '../../utils';
import { el } from './calendar-ui';
import {
  createProjectWithPhases,
  createTaskFromEvent,
  saveEvent,
  type SaveEventInput,
} from './calendar-service';
import type { Department, EventTone, EventVisibility, Project } from './types';
import { ymd } from './calendar-utils';

export interface OpenCreateModalOptions {
  initialTab?: 'event' | 'project';
  presetDate?: Date | null;
  projects: Project[];
  departments: Department[];
  currentUserId: string | null;
  onCreated?: () => void | Promise<void>;
}

export function openCreateEventQuick(date: Date, opts: OpenCreateModalOptions): void {
  openCreateModal({ ...opts, initialTab: 'event', presetDate: date });
}

export function openCreateModal(options: OpenCreateModalOptions): void {
  const {
    initialTab = 'event',
    presetDate = null,
    projects,
    departments,
    currentUserId,
    onCreated,
  } = options;

  const MODAL_ID = 'createItemModal';

  Modal.open(MODAL_ID, null, (content) => {
    let currentTab: 'event' | 'project' = initialTab;
    const defaultDate = presetDate ? new Date(presetDate) : new Date();
    const dStr = ymd(defaultDate);

    /* HEADER */
    const head = el('div', { class: 'shrink-0 border-b border-white/[.06]' });
    const headTop = el('div', { class: 'flex items-center justify-between px-6 pt-5 pb-4' });

    const closeBtn = el('button', {
      class:
        'w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition',
      html: '<i class="fa-solid fa-xmark text-sm"></i>',
    });
    closeBtn.addEventListener('click', () => Modal.close(MODAL_ID));

    headTop.append(
      el('h2', { id: `${MODAL_ID}-title`, class: 'font-black text-white text-base flex items-center gap-2' }, [
        el('i', { class: 'fa-solid fa-plus-circle text-pink-400' }),
        el('span', { text: 'Tạo mới' }),
      ]),
      closeBtn,
    );
    head.append(headTop);

    const tabRow = el('div', { class: 'px-6 pb-4' });
    const tabWrap = el('div', { class: 'inline-flex p-1 rounded-xl bg-white/[.03] border border-white/[.06]' });
    const tabs: Array<{ v: 'event' | 'project'; icon: string; label: string }> = [
      { v: 'event', icon: 'fa-calendar-plus', label: 'Sự kiện' },
      { v: 'project', icon: 'fa-layer-group', label: 'Dự án' },
    ];
    for (const t of tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.tab = t.v;
      const setClass = (sel: boolean): void => {
        btn.className =
          `px-4 py-2 rounded-lg text-xs font-black transition flex items-center gap-1.5 ` +
          (sel
            ? 'bg-gradient-to-r from-pink-600 to-violet-600 text-white shadow-neon-pink'
            : 'text-slate-400 hover:text-white hover:bg-white/[.04]');
      };
      setClass(t.v === currentTab);
      btn.innerHTML = `<i class="fa-solid ${t.icon} text-[10px]"></i><span>${escHtml(t.label)}</span>`;
      btn.addEventListener('click', () => {
        if (currentTab === t.v) return;
        currentTab = t.v;
        tabWrap.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
          const sel = b.dataset.tab === t.v;
          b.className =
            `px-4 py-2 rounded-lg text-xs font-black transition flex items-center gap-1.5 ` +
            (sel
              ? 'bg-gradient-to-r from-pink-600 to-violet-600 text-white shadow-neon-pink'
              : 'text-slate-400 hover:text-white hover:bg-white/[.04]');
        });
        renderForm();
      });
      tabWrap.appendChild(btn);
    }
    tabRow.append(tabWrap);
    head.append(tabRow);
    content.append(head);

    const body = el('div', { class: 'flex-1 overflow-y-auto scrollbar px-6 py-5 min-h-0' });
    content.append(body);

    const footer = el('div', {
      class: 'shrink-0 px-6 py-4 border-t border-white/[.06] bg-black/20 flex justify-end gap-2',
    });
    const cancelBtn = el('button', {
      class: 'px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-bold text-slate-300 transition',
      text: 'Hủy',
    });
    cancelBtn.addEventListener('click', () => Modal.close(MODAL_ID));

    const submitBtn = el('button', {
      id: 'createSubmitBtn',
      class:
        'px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 hover:opacity-95 text-sm font-black text-white transition shadow-neon-pink active:scale-[0.98]',
      text: 'Tạo',
    });

    footer.append(cancelBtn, submitBtn);
    content.append(footer);

    function renderForm(): void {
      body.replaceChildren();
      if (currentTab === 'event') renderEventForm();
      else renderProjectForm();
      submitBtn.textContent = currentTab === 'event' ? 'Tạo sự kiện' : 'Tạo dự án';
    }

    function renderEventForm(): void {
      body.append(
        el('div', { class: 'mb-4' }, [
          el('label', {
            class: 'block text-[10px] font-black text-slate-400 mb-1.5 tracking-widest uppercase',
            text: 'Tên sự kiện *',
          }),
          el('input', {
            id: 'evLabel',
            type: 'text',
            maxlength: '120',
            class:
              'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50 transition',
            placeholder: 'VD: Họp kick-off FPC 2025',
          }),
        ]),
      );

      body.append(
        el('div', { class: 'mb-4' }, [
          el('label', {
            class: 'block text-[10px] font-black text-slate-400 mb-1.5 tracking-widest uppercase',
            text: 'Mô tả',
          }),
          el('textarea', {
            id: 'evDesc',
            rows: '2',
            class:
              'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50 transition resize-none',
            placeholder: 'Mô tả ngắn...',
          }),
        ]),
      );

      const projBox = el('div', { class: 'mb-4' });
      projBox.append(
        el('label', { class: 'block text-[10px] font-black text-slate-400 mb-1.5 tracking-widest uppercase' }, [
          el('span', { text: 'Thuộc Dự án ' }),
          el('span', { class: 'text-slate-600 font-bold normal-case tracking-normal', text: '(không bắt buộc)' }),
        ]),
      );
      const projSelect = el('select', {
        id: 'evProjectSelect',
        class:
          'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50 transition cursor-pointer',
      });
      projSelect.append(el('option', { value: '', text: '— Không thuộc dự án / Hoạt động chung CLB —' }));
      for (const p of projects) {
        projSelect.append(el('option', { value: p.id, text: p.name }));
      }
      projBox.append(projSelect);
      body.append(projBox);

      body.append(buildTimeBlock('ev'));
      body.append(buildVisibilityBlock('ev'));
    }

    function renderProjectForm(): void {
      body.append(
        el('div', { class: 'mb-4' }, [
          el('label', {
            class: 'block text-[10px] font-black text-slate-400 mb-1.5 tracking-widest uppercase',
            text: 'Tên dự án *',
          }),
          el('input', {
            id: 'prName',
            type: 'text',
            maxlength: '120',
            class:
              'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50 transition',
            placeholder: 'VD: Chiến dịch tuyển thành viên 2025',
          }),
        ]),
      );

      body.append(
        el('div', { class: 'mb-4' }, [
          el('label', {
            class: 'block text-[10px] font-black text-slate-400 mb-1.5 tracking-widest uppercase',
            text: 'Mô tả',
          }),
          el('textarea', {
            id: 'prDesc',
            rows: '2',
            class:
              'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50 transition resize-none',
            placeholder: 'Mục tiêu, phạm vi dự án...',
          }),
        ]),
      );

      const deptBox = el('div', { class: 'mb-4' });
      deptBox.append(
        el('label', { class: 'block text-[10px] font-black text-slate-400 mb-1.5 tracking-widest uppercase' }, [
          el('span', { text: 'Ban phụ trách ' }),
          el('span', { class: 'text-slate-600 font-bold normal-case tracking-normal', text: '(để trống = dự án CLB)' }),
        ]),
      );
      const deptSelect = el('select', {
        id: 'prDeptSelect',
        class:
          'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50 transition cursor-pointer',
      });
      deptSelect.append(el('option', { value: '', text: '— Dự án CLB (không thuộc ban) —' }));
      for (const d of departments) {
        deptSelect.append(el('option', { value: d.id, text: d.name }));
      }
      deptBox.append(deptSelect);
      body.append(deptBox);

      body.append(buildTimeBlock('pr', { showQuick: false }));
      body.append(buildPhasesBlock());
    }

    function buildTimeBlock(prefix: 'ev' | 'pr', { showQuick = true } = {}): HTMLElement {
      const box = el('div', { class: 'p-3 rounded-xl bg-cyan-500/[.03] border border-cyan-500/15 space-y-3 mb-4' });

      box.append(
        el('div', { class: 'text-[10px] font-black text-cyan-300 tracking-widest uppercase flex items-center gap-1.5' }, [
          el('i', { class: 'fa-solid fa-play text-[8px]' }),
          el('span', { text: 'Bắt đầu' }),
        ]),
      );
      const startGrid = el('div', { class: 'grid grid-cols-2 gap-2' });
      const startDate = el('input', {
        type: 'date',
        id: `${prefix}StartDate`,
        class:
          'w-full bg-black/40 border border-white/[.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer',
      });
      startDate.value = dStr;
      const startTime = el('input', {
        type: 'time',
        id: `${prefix}StartTime`,
        class:
          'w-full bg-black/40 border border-white/[.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer',
      });
      startTime.value = '08:00';
      startGrid.append(startDate, startTime);
      box.append(startGrid);

      box.append(
        el('div', { class: 'text-[10px] font-black text-rose-300 tracking-widest uppercase flex items-center gap-1.5 mt-2' }, [
          el('i', { class: 'fa-solid fa-flag-checkered text-[8px]' }),
          el('span', { text: 'Kết thúc' }),
        ]),
      );
      const endGrid = el('div', { class: 'grid grid-cols-2 gap-2' });
      const endDate = el('input', {
        type: 'date',
        id: `${prefix}EndDate`,
        class:
          'w-full bg-black/40 border border-white/[.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500/50 cursor-pointer',
      });
      endDate.value = dStr;
      const endTime = el('input', {
        type: 'time',
        id: `${prefix}EndTime`,
        class:
          'w-full bg-black/40 border border-white/[.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500/50 cursor-pointer',
      });
      endTime.value = '10:00';
      endGrid.append(endDate, endTime);
      box.append(endGrid);

      if (showQuick) {
        const quickRow = el('div', { class: 'flex gap-1.5 flex-wrap pt-2 border-t border-white/[.06]' });
        const quicks: Array<{ l: string; m: number }> = [
          { l: '30p', m: 30 },
          { l: '1h', m: 60 },
          { l: '2h', m: 120 },
          { l: '4h', m: 240 },
          { l: '1 ngày', m: 1440 },
        ];
        for (const q of quicks) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className =
            'text-[10px] px-2 py-1 rounded-md bg-white/[.03] hover:bg-cyan-500/10 text-slate-400 hover:text-cyan-300 border border-white/[.05] transition font-bold';
          b.textContent = q.l;
          b.addEventListener('click', () => {
            const s = new Date(`${startDate.value}T${startTime.value}:00`);
            const e = new Date(s.getTime() + q.m * 60_000);
            endDate.value = ymd(e);
            endTime.value = `${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
          });
          quickRow.appendChild(b);
        }
        box.appendChild(quickRow);
      }

      startDate.addEventListener('change', () => {
        if (endDate.value < startDate.value) endDate.value = startDate.value;
      });

      return el('div', {}, [
        el('label', {
          class: 'block text-[10px] font-black text-slate-400 mb-1.5 tracking-widest uppercase',
          text: 'Thời gian *',
        }),
        box,
      ]);
    }

    function buildVisibilityBlock(prefix: 'ev' | 'pr'): HTMLElement {
      const block = el('div', { class: 'mb-4' });
      block.append(
        el('div', { class: 'block text-[10px] font-black text-slate-400 mb-2 tracking-widest uppercase', text: 'Phạm vi' }),
      );

      const visRow = el('div', { class: 'grid grid-cols-3 gap-2' });
      visRow.dataset.visRow = '1';
      visRow.dataset.selectedVis = 'public';

      const visOptions: Array<{ v: EventVisibility; icon: string; label: string; desc: string }> = [
        { v: 'public', icon: 'fa-globe', label: 'Toàn CLB', desc: 'Mọi người thấy' },
        { v: 'department', icon: 'fa-building-user', label: 'Theo Ban', desc: 'Giao cho ban' },
        { v: 'private', icon: 'fa-lock', label: 'Cá nhân', desc: 'Chỉ mình bạn' },
      ];

      for (const opt of visOptions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.vis = opt.v;
        const applyClass = (sel: boolean): void => {
          btn.className =
            `p-3 rounded-xl border text-left transition ` +
            (sel
              ? 'bg-pink-500/15 border-pink-500/40 text-pink-300'
              : 'bg-white/[.02] border-white/[.06] text-slate-400 hover:bg-white/[.04]');
        };
        applyClass(opt.v === 'public');
        btn.innerHTML =
          `<div class="flex items-center gap-2 mb-1"><i class="fa-solid ${opt.icon} text-xs"></i><span class="text-xs font-black">${escHtml(opt.label)}</span></div>` +
          `<div class="text-[10px] opacity-70">${escHtml(opt.desc)}</div>`;
        btn.addEventListener('click', () => {
          visRow.dataset.selectedVis = opt.v;
          visRow.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
            const sel = b.dataset.vis === opt.v;
            b.className =
              `p-3 rounded-xl border text-left transition ` +
              (sel
                ? 'bg-pink-500/15 border-pink-500/40 text-pink-300'
                : 'bg-white/[.02] border-white/[.06] text-slate-400 hover:bg-white/[.04]');
          });
          const deptBoxEl = content.querySelector<HTMLElement>('#evDeptBlock');
          if (deptBoxEl) deptBoxEl.classList.toggle('hidden', opt.v !== 'department');
        });
        visRow.appendChild(btn);
      }
      block.appendChild(visRow);

      const deptBlock = el('div', {
        id: 'evDeptBlock',
        class: 'hidden mt-3 p-3 rounded-xl bg-violet-500/[.05] border border-violet-500/20 space-y-3',
      });
      deptBlock.append(
        el('label', {
          class: 'block text-[10px] font-black text-violet-300 mb-1.5 tracking-widest uppercase',
          text: 'Ban phụ trách *',
        }),
      );
      const deptSelect = el('select', {
        id: `${prefix}DeptSelect`,
        class:
          'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50 transition cursor-pointer',
      });
      deptSelect.append(el('option', { value: '', text: '— Chọn ban —' }));
      for (const d of departments) {
        const o = el('option', { value: d.id, text: d.name });
        o.dataset.color = d.color;
        deptSelect.appendChild(o);
      }
      deptBlock.appendChild(deptSelect);

      deptBlock.append(
        el('label', {
          class: 'block text-[10px] font-black text-violet-300 mb-1.5 tracking-widest uppercase',
          text: 'Độ ưu tiên',
        }),
      );
      const priSelect = el('select', {
        id: `${prefix}Priority`,
        class:
          'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50 transition cursor-pointer',
      });
      const priorities: Array<{ v: string; t: string }> = [
        { v: 'low', t: 'Thấp' },
        { v: 'normal', t: 'Bình thường' },
        { v: 'high', t: 'Cao' },
        { v: 'urgent', t: 'Khẩn cấp' },
      ];
      for (const p of priorities) {
        const opt = el('option', { value: p.v, text: p.t });
        if (p.v === 'normal') (opt as HTMLOptionElement).selected = true;
        priSelect.appendChild(opt);
      }
      deptBlock.appendChild(priSelect);

      deptBlock.append(
        el('p', {
          class: 'text-[10px] text-slate-400 italic pt-1 border-t border-white/[.06]',
          text: '💡 Sự kiện giao ban sẽ tạo công việc tương ứng trong tab Công việc.',
        }),
      );
      block.appendChild(deptBlock);
      return block;
    }

    function buildPhasesBlock(): HTMLElement {
      const block = el('div', { class: 'mb-4' });
      block.append(
        el('div', { class: 'block text-[10px] font-black text-slate-400 mb-2 tracking-widest uppercase' }, [
          el('span', { text: 'Giai đoạn ' }),
          el('span', { class: 'text-slate-600 font-bold normal-case tracking-normal', text: '(ít nhất 1)' }),
        ]),
      );

      const list = el('div', { class: 'space-y-2 mb-2' });
      let phaseCount = 0;

      const addPhase = (name = '', start = dStr, end = dStr): void => {
        phaseCount++;
        const idx = phaseCount;
        const row = el('div', { class: 'p-3 rounded-xl bg-white/[.02] border border-white/[.06] space-y-2' });

        const rowHead = el('div', { class: 'flex items-center justify-between gap-2' });
        rowHead.append(
          el('span', {
            class: 'text-[10px] font-black text-violet-300 tracking-widest uppercase',
            text: `Giai đoạn #${idx}`,
          }),
        );
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className =
          'w-6 h-6 rounded text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition flex items-center justify-center';
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark text-xs"></i>';
        removeBtn.addEventListener('click', () => {
          row.remove();
          reindexPhases();
          if (list.children.length === 0) addPhase();
        });
        rowHead.appendChild(removeBtn);
        row.appendChild(rowHead);

        const nameIn = el('input', {
          type: 'text',
          maxlength: '60',
          class:
            'w-full bg-black/40 border border-white/[.08] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition phase-name',
          placeholder: 'Tên giai đoạn (VD: Lên ý tưởng)',
          value: name,
        });
        row.appendChild(nameIn);

        const dateGrid = el('div', { class: 'grid grid-cols-2 gap-2' });
        const sd = el('input', {
          type: 'date',
          class:
            'phase-start w-full bg-black/40 border border-white/[.08] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer',
        });
        sd.value = start;
        const ed = el('input', {
          type: 'date',
          class:
            'phase-end w-full bg-black/40 border border-white/[.08] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500/50 cursor-pointer',
        });
        ed.value = end;
        dateGrid.append(sd, ed);
        row.appendChild(dateGrid);
        list.appendChild(row);
      };

      const reindexPhases = (): void => {
        Array.from(list.children).forEach((row, i) => {
          const label = (row as HTMLElement).querySelector<HTMLSpanElement>('span.text-\\[10px\\]');
          if (label) label.textContent = `Giai đoạn #${i + 1}`;
        });
        phaseCount = list.children.length;
      };

      addPhase();
      block.appendChild(list);

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className =
        'w-full px-3 py-2 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-200 border border-violet-500/30 text-xs font-black transition flex items-center justify-center gap-1.5';
      addBtn.innerHTML = '<i class="fa-solid fa-plus text-[10px]"></i><span>Thêm giai đoạn</span>';
      addBtn.addEventListener('click', () => {
        const lastRow = list.lastElementChild as HTMLElement | null;
        let newStart = dStr;
        if (lastRow) {
          const lastEnd = lastRow.querySelector<HTMLInputElement>('.phase-end')?.value;
          if (lastEnd) newStart = lastEnd;
        }
        addPhase('', newStart, newStart);
      });
      block.appendChild(addBtn);
      return block;
    }

    submitBtn.addEventListener('click', async () => {
      const orig = submitBtn.textContent ?? 'Tạo';
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Đang tạo...';

      try {
        if (currentTab === 'event') {
          await submitEventForm(content, currentUserId, departments);
        } else {
          await submitProjectForm(content, currentUserId);
        }
        Modal.close(MODAL_ID);
        if (onCreated) await onCreated();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Đã xảy ra lỗi';
        console.error('Submit failed:', err);
        Toast.show('Lỗi: ' + message, { type: 'error' });
        submitBtn.disabled = false;
        submitBtn.textContent = orig;
      }
    });

    renderForm();
  });
}

async function submitEventForm(
  content: HTMLElement,
  currentUserId: string | null,
  departments: Department[],
): Promise<void> {
  const title = (content.querySelector<HTMLInputElement>('#evLabel')?.value ?? '').trim();
  const description = (content.querySelector<HTMLTextAreaElement>('#evDesc')?.value ?? '').trim();
  const projectId = content.querySelector<HTMLSelectElement>('#evProjectSelect')?.value || null;
  const sD = content.querySelector<HTMLInputElement>('#evStartDate')?.value;
  const sT = content.querySelector<HTMLInputElement>('#evStartTime')?.value ?? '08:00';
  const eD = content.querySelector<HTMLInputElement>('#evEndDate')?.value;
  const eT = content.querySelector<HTMLInputElement>('#evEndTime')?.value ?? '10:00';
  const deptId = content.querySelector<HTMLSelectElement>('#evDeptSelect')?.value || null;
  const priority = content.querySelector<HTMLSelectElement>('#evPriority')?.value ?? 'normal';

  /* Đọc phạm vi từ data-attribute của visRow (tránh TS narrow từ initializer) */
  const visRowEl = content.querySelector<HTMLElement>('[data-vis-row]');
  const rawVis = visRowEl?.dataset.selectedVis;
  const selectedVisibility: EventVisibility =
    rawVis === 'department' || rawVis === 'private' ? rawVis : 'public';

  if (!title || title.length > 120) {
    Toast.show('Tên sự kiện không hợp lệ (1-120 ký tự)', { type: 'error' });
    content.querySelector<HTMLInputElement>('#evLabel')?.focus();
    throw new Error('Tên không hợp lệ');
  }
  if (!sD || !eD) throw new Error('Chọn đầy đủ ngày bắt đầu và kết thúc');

  const startObj = new Date(`${sD}T${sT}:00`);
  const endObj = new Date(`${eD}T${eT}:00`);
  if (endObj < startObj) throw new Error('Ngày kết thúc phải sau ngày bắt đầu');
  if (selectedVisibility === 'department' && !deptId) throw new Error('Chọn ban phụ trách');

  let tone: EventTone = 'violet';
  if (selectedVisibility === 'department' && deptId) {
    const dept = departments.find((d) => d.id === deptId);
    if (dept?.color) tone = dept.color;
  }

  const input: SaveEventInput = {
    title,
    description,
    start_time: startObj.toISOString(),
    end_time: endObj.toISOString(),
    tone,
    icon: 'fa-calendar',
    visibility: selectedVisibility,
    department_id: selectedVisibility === 'department' ? deptId : null,
    project_id: projectId,
    created_by: currentUserId,
  };

  const saved = await saveEvent(input);

  if (selectedVisibility === 'department' && deptId) {
    try {
      await createTaskFromEvent({
        title,
        description,
        department_id: deptId,
        priority: priority as 'low' | 'normal' | 'high' | 'urgent',
        start_date: sD,
        deadline: eD,
        created_by: currentUserId,
        project_id: projectId,
      });
    } catch (err) {
      console.warn('Create task from event failed:', err);
    }
  }

  Toast.show(`Đã tạo "${saved.title}"`, { type: 'success' });
}

async function submitProjectForm(content: HTMLElement, currentUserId: string | null): Promise<void> {
  const name = (content.querySelector<HTMLInputElement>('#prName')?.value ?? '').trim();
  const description = (content.querySelector<HTMLTextAreaElement>('#prDesc')?.value ?? '').trim();
  const deptId = content.querySelector<HTMLSelectElement>('#prDeptSelect')?.value || null;
  const sD = content.querySelector<HTMLInputElement>('#prStartDate')?.value;
  const eD = content.querySelector<HTMLInputElement>('#prEndDate')?.value;

  const phases: Array<{ name: string; start_date: string | null; end_date: string | null }> = [];
  const phaseNames = content.querySelectorAll<HTMLInputElement>('.phase-name');
  const phaseStarts = content.querySelectorAll<HTMLInputElement>('.phase-start');
  const phaseEnds = content.querySelectorAll<HTMLInputElement>('.phase-end');
  for (let i = 0; i < phaseNames.length; i++) {
    const pName = phaseNames[i].value.trim();
    if (!pName) continue;
    phases.push({
      name: pName,
      start_date: phaseStarts[i]?.value ?? null,
      end_date: phaseEnds[i]?.value ?? null,
    });
  }

  if (!name || name.length < 3) throw new Error('Tên dự án phải có ít nhất 3 ký tự');
  if (!sD || !eD) throw new Error('Chọn thời gian dự án');
  if (phases.length === 0) throw new Error('Cần ít nhất 1 giai đoạn');

  const project = await createProjectWithPhases({
    name,
    description,
    department_id: deptId,
    start_date: sD,
    end_date: eD,
    owner_id: currentUserId,
    phases,
  });

  Toast.show(`Đã tạo dự án "${project.name}" với ${phases.length} giai đoạn`, { type: 'success' });
}

export function openCreateEvent(
  _trigger: HTMLElement | null,
  presetDate: Date,
  opts: OpenCreateModalOptions,
): void {
  openCreateModal({ ...opts, initialTab: 'event', presetDate });
}
