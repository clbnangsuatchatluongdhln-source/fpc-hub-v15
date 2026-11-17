import type { Feature } from '../../core/registry';
import { initProjectsFeature } from './index';

const SECTION_ID = 'projectsSection';

function hideAllSections(): void {
  ['timelineSection', 'projectsSection', 'departmentsSection', 'adminSection', 'tasksSection'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

function setPageTitle(title: string): void {
  const el = document.getElementById('pageTitle');
  if (el) el.textContent = title;
}

export const projectsFeature: Feature = {
  id: 'projects',
  route: '/projects',
  async mount() {
    hideAllSections();
    document.getElementById(SECTION_ID)?.classList.remove('hidden');
    setPageTitle('Dự án');

    initProjectsFeature();
  },
};
