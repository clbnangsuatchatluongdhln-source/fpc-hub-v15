import type { Feature } from '../../core/registry';
import { initAdminFeature, destroyAdminFeature } from './index';

const SECTION_ID = 'adminSection';

function hideAllSections(): void {
  ['timelineSection', 'projectsSection', 'departmentsSection', 'adminSection', 'tasksSection'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

function setPageTitle(title: string): void {
  const el = document.getElementById('pageTitle');
  if (el) el.textContent = title;
}

export const adminFeature: Feature = {
  id: 'admin',
  route: '/admin',
  async mount() {
    await initAdminFeature();
    hideAllSections();
    document.getElementById(SECTION_ID)?.classList.remove('hidden');
    setPageTitle('Quản trị');

    return () => {
      destroyAdminFeature();
    };
  },
};
