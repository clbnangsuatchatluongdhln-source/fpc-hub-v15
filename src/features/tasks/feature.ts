import type { Feature } from '../../core/registry';
import { initTasksFeature, showTasksView, destroyTasksFeature } from './index';

function hideAllSections(): void {
  ['timelineSection', 'projectsSection', 'departmentsSection', 'adminSection', 'tasksSection'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

function setPageTitle(title: string): void {
  const el = document.getElementById('pageTitle');
  if (el) el.textContent = title;
}

export const tasksFeature: Feature = {
  id: 'tasks',
  route: '/tasks',
  async mount() {
    hideAllSections();
    setPageTitle('Công việc');
    await initTasksFeature();
    showTasksView();

    return () => {
      destroyTasksFeature();
    };
  },
};
