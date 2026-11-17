import type { Feature } from '../core/registry';
import { Auth } from '../core/auth';
import { canManageClub } from '../core/access';
import { initDepartmentsFeature, destroyDepartmentsFeature } from '../features/departments';
import { initAdminFeature, destroyAdminFeature } from '../features/admin';

export const organizationFeature: Feature = {
  id: 'organization', route: '/departments',
  async mount(container, services, signal) {
    if (!canManageClub(Auth.profile)) { services.navigate('/'); return; }
    for (const id of ['timelineSection','projectsSection','departmentsSection','adminSection','tasksSection','filesSection']) {
      document.getElementById(id)?.classList.add('hidden');
    }
    const toolbar = document.createElement('div');
    toolbar.className = 'organization-tabs';
    toolbar.setAttribute('role', 'tablist');
    toolbar.setAttribute('aria-label', 'Tổ chức và quản trị CLB');
    container.prepend(toolbar);
    let disposed = false;
    let revision = 0;
    const cleanup = () => {
      disposed = true;
      revision++;
      toolbar.remove();
      destroyDepartmentsFeature();
      destroyAdminFeature();
      document.getElementById('departmentsSection')?.classList.add('hidden');
      document.getElementById('adminSection')?.classList.add('hidden');
    };
    signal.addEventListener('abort', cleanup, { once: true });
    async function select(tab: 'departments' | 'admin') {
      const token = ++revision;
      toolbar.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
        button.setAttribute('aria-selected', String(button.dataset.tab === tab));
      });
      document.getElementById('departmentsSection')?.classList.add('hidden');
      document.getElementById('adminSection')?.classList.add('hidden');
      if (tab === 'departments') await initDepartmentsFeature(); else await initAdminFeature();
      if (disposed || signal.aborted || token !== revision || !canManageClub(Auth.profile)) return;
      document.getElementById(tab === 'departments' ? 'departmentsSection' : 'adminSection')?.classList.remove('hidden');
      const title = document.getElementById('pageTitle');
      if (title) title.textContent = 'Tổ chức & quản trị';
    }
    for (const [tab, label, panel] of [['departments', 'Ban & thành viên', 'departmentsSection'],
      ['admin', 'Tài khoản & bổ nhiệm', 'adminSection']] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.tab = tab;
      button.id = `organization-tab-${tab}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', panel);
      button.textContent = label;
      button.onclick = () => { void select(tab).catch(() => services.notify('Không tải được tổ chức CLB', 'error')); };
      toolbar.append(button);
    }
    try { await select('departments'); } catch { cleanup(); services.notify('Không tải được tổ chức CLB', 'error'); }
    return cleanup;
  },
};
