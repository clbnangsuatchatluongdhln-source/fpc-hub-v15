import type { Feature } from '../../core/registry';
import { initDepartmentsFeature, destroyDepartmentsFeature } from './index';

const SECTION_ID = 'departmentsSection';

function hideAllSections(): void {
  ['timelineSection', 'projectsSection', 'departmentsSection', 'adminSection', 'tasksSection'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

function setPageTitle(title: string): void {
  const el = document.getElementById('pageTitle');
  if (el) el.textContent = title;
}

export const departmentsFeature: Feature = {
  id: 'departments',
  route: '/departments',
  async mount() {
    await initDepartmentsFeature();
    hideAllSections();
    document.getElementById(SECTION_ID)?.classList.remove('hidden');
    setPageTitle('Tổ chức');

    return () => {
      destroyDepartmentsFeature();
    };
  },
};
