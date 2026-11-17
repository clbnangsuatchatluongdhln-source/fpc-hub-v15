import type { Feature } from '../../core/registry';
import { initFilesFeature, destroyFilesFeature } from './files-page';

const SECTION_ID = 'filesSection';

function hideAllSections(): void {
  ['timelineSection', 'projectsSection', 'departmentsSection', 'adminSection', 'tasksSection', 'filesSection'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

function setPageTitle(title: string): void {
  const el = document.getElementById('pageTitle');
  if (el) el.textContent = title;
}

export const filesFeature: Feature = {
  id: 'files',
  route: '/files',
  async mount() {
    await initFilesFeature();
    hideAllSections();
    document.getElementById(SECTION_ID)?.classList.remove('hidden');
    setPageTitle('Kho tài nguyên');

    return () => {
      destroyFilesFeature();
    };
  },
};
