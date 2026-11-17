/* ============================================================
   FPC HUB v15 · Module 5 · Task History Modal
   Modal xem lịch sử thao tác của 1 task.
   ============================================================ */
import { Modal } from '../../ui/modal';
import { el, getUserDisplay } from './task-ui';
import { fetchTaskHistory } from './task-service';
import type { Profile, TaskHistory } from './types';

export const HISTORY_MODAL_ID = 'taskHistoryModal';

const ACTION_META: Record<string, { icon: string; color: string; label: string }> = {
  update_task: { icon: 'fa-pen', color: 'cyan', label: 'Cập nhật task' },
  task_status_changed: { icon: 'fa-arrows-rotate', color: 'violet', label: 'Đổi trạng thái task' },
  update_subtask: { icon: 'fa-pen', color: 'violet', label: 'Cập nhật subtask' },
  submission_updated: { icon: 'fa-file', color: 'emerald', label: 'Cập nhật bài nộp' },
  task_submission_created: { icon: 'fa-paper-plane', color: 'amber', label: 'Tạo bản nộp nghiệm thu' },
  task_submission_updated: { icon: 'fa-file', color: 'amber', label: 'Cập nhật bản nghiệm thu' },
  create_task:         { icon: 'fa-plus-circle',    color: 'cyan',    label: 'Tạo task' },
  start_working:       { icon: 'fa-play-circle',    color: 'violet',  label: 'Bắt đầu làm' },
  create_subtask:      { icon: 'fa-list-check',     color: 'violet',  label: 'Tạo subtask' },
  submit_subtask_file: { icon: 'fa-cloud-arrow-up', color: 'pink',    label: 'Nộp bài' },
  score_submission:    { icon: 'fa-star',           color: 'emerald', label: 'Chấm điểm' },
  reject_submission:   { icon: 'fa-circle-xmark',   color: 'rose',    label: 'TB từ chối' },
  submit_to_president: { icon: 'fa-paper-plane',    color: 'amber',   label: 'Gửi Chủ nhiệm' },
  president_approve:   { icon: 'fa-circle-check',   color: 'emerald', label: 'Chủ nhiệm duyệt' },
  president_reject:    { icon: 'fa-xmark-circle',   color: 'rose',    label: 'CN từ chối' },
};

function getActionMeta(action: string): { icon: string; color: string; label: string } {
  return ACTION_META[action] ?? { icon: 'fa-circle-info', color: 'slate', label: action };
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export async function openTaskHistoryModal(
  taskId: string,
  taskTitle: string,
  users: Profile[],
): Promise<void> {
  try { Modal.close(HISTORY_MODAL_ID); } catch { /* ignore */ }

  let history: TaskHistory[] = [];
  let loadingError: string | null = null;
  try {
    history = await fetchTaskHistory(taskId);
  } catch (err) {
    loadingError = err instanceof Error ? err.message : 'Không tải được lịch sử';
  }

  Modal.open(HISTORY_MODAL_ID, null, (content) => {
    /* Header */
    const header = el('div', {
      class: 'shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[.06]',
    });
    const title = el('h2', {
      class: 'font-black text-white text-base flex items-center gap-2 min-w-0',
    }, [
      el('i', { class: 'fa-solid fa-clock-rotate-left text-cyan-400' }),
      el('span', { class: 'truncate', text: `Lịch sử: ${taskTitle}` }),
    ]);
    const closeBtn = el('button', {
      class: 'w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition shrink-0',
      html: '<i class="fa-solid fa-xmark text-sm"></i>',
      type: 'button',
    }) as HTMLButtonElement;
    closeBtn.addEventListener('click', () => { try { Modal.close(HISTORY_MODAL_ID); } catch { /* ignore */ } });
    header.append(title, closeBtn);
    content.appendChild(header);

    /* Body */
    const body = el('div', {
      class: 'flex-1 overflow-y-auto scrollbar px-6 py-5 space-y-3 min-h-0',
    });

    if (loadingError) {
      body.appendChild(el('div', {
        class: 'p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm',
        text: `Lỗi: ${loadingError}`,
      }));
    } else if (!history.length) {
      body.appendChild(el('div', { class: 'text-center py-12 px-4' }, [
        el('i', { class: 'fa-solid fa-clock-rotate-left text-4xl text-slate-700 mb-3 block' }),
        el('p', { class: 'text-sm font-bold text-slate-400', text: 'Chưa có thao tác nào' }),
        el('p', {
          class: 'text-xs text-slate-500 mt-1',
          text: 'Lịch sử sẽ xuất hiện khi có người tạo subtask, nộp bài, chấm điểm...',
        }),
      ]));
    } else {
      const tl = el('div', { class: 'relative pl-8' });
      tl.appendChild(el('div', {
        class: 'absolute left-3 top-2 bottom-2 w-px bg-white/10',
      }));

      history.forEach((entry) => {
        const meta = getActionMeta(entry.action);
        const actor = entry.actor_id
          ? getUserDisplay(entry.actor_id, users)
          : { name: 'Hệ thống', initial: 'S' };

        const row = el('div', { class: 'relative mb-4 last:mb-0' });

        row.appendChild(el('div', {
          class: `absolute -left-8 top-0.5 w-6 h-6 rounded-full bg-${meta.color}-500/20 border-2 border-${meta.color}-500/50 flex items-center justify-center text-${meta.color}-300`,
        }, [
          el('i', { class: `fa-solid ${meta.icon} text-[9px]` }),
        ]));

        const card = el('div', {
          class: 'p-3 rounded-xl bg-white/[.02] border border-white/[.06] space-y-1.5',
        });

        const headRow = el('div', {
          class: 'flex items-center justify-between gap-2 flex-wrap',
        });
        headRow.appendChild(el('div', { class: 'flex items-center gap-2 min-w-0' }, [
          el('div', {
            class: 'w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white text-[9px] font-black shrink-0',
          }, [el('span', { text: actor.initial })]),
          el('span', { class: 'text-xs font-bold text-white truncate', text: actor.name }),
          el('span', {
            class: `text-[10px] px-1.5 py-0.5 rounded bg-${meta.color}-500/15 text-${meta.color}-300 border border-${meta.color}-500/30 font-black shrink-0`,
            text: meta.label,
          }),
        ]));
        headRow.appendChild(el('span', {
          class: 'text-[10px] text-slate-500 shrink-0',
          text: fmtTime(entry.created_at),
        }));
        card.appendChild(headRow);

        if (entry.old_status || entry.new_status) {
          card.appendChild(el('div', { class: 'text-[11px] text-slate-500' }, [
            el('span', { text: 'Trạng thái: ' }),
            el('span', { class: 'text-slate-400 font-mono', text: entry.old_status ?? '—' }),
            el('span', { class: 'mx-1', text: '→' }),
            el('span', { class: 'text-slate-200 font-mono', text: entry.new_status ?? '—' }),
          ]));
        }

        if (entry.note) {
          card.appendChild(el('p', {
            class: 'text-xs text-slate-300 leading-relaxed whitespace-pre-wrap',
            text: entry.note,
          }));
        }

        row.appendChild(card);
        tl.appendChild(row);
      });

      body.appendChild(tl);
    }

    content.appendChild(body);

    /* Footer */
    const footer = el('div', {
      class: 'shrink-0 px-6 py-3 border-t border-white/[.06] bg-black/20 flex justify-between items-center gap-3',
    });
    footer.appendChild(el('span', {
      class: 'text-[11px] text-slate-500',
      text: history.length ? `${history.length} thao tác` : '',
    }));
    const closeFooter = el('button', {
      class: 'px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 text-xs font-black text-white shadow-neon-pink transition',
      type: 'button',
      text: 'Đóng',
    }) as HTMLButtonElement;
    closeFooter.addEventListener('click', () => { try { Modal.close(HISTORY_MODAL_ID); } catch { /* ignore */ } });
    footer.appendChild(closeFooter);
    content.appendChild(footer);
  });
}
