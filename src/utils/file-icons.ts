/* ============================================================
   FPC LAB · src/utils/file-icons.ts
   Port FILE_ICONS + fileIcon từ v14 `03-ui.js`.
   ============================================================ */

export interface FileIconDef {
  icon: string;
  cls: string;
  bg: string;
}

const DEFAULT_ICON: FileIconDef = {
  icon: 'fa-file',
  cls: 'text-slate-400',
  bg: 'bg-slate-500/15',
};

const FILE_ICONS: Record<string, FileIconDef> = {
  pdf:  { icon: 'fa-file-pdf',    cls: 'text-rose-400',    bg: 'bg-rose-500/15' },
  zip:  { icon: 'fa-file-zipper', cls: 'text-amber-400',   bg: 'bg-amber-500/15' },
  rar:  { icon: 'fa-file-zipper', cls: 'text-amber-400',   bg: 'bg-amber-500/15' },
  gz:   { icon: 'fa-file-zipper', cls: 'text-amber-400',   bg: 'bg-amber-500/15' },
  doc:  { icon: 'fa-file-word',   cls: 'text-blue-400',    bg: 'bg-blue-500/15' },
  docx: { icon: 'fa-file-word',   cls: 'text-blue-400',    bg: 'bg-blue-500/15' },
  xls:  { icon: 'fa-file-excel',  cls: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  xlsx: { icon: 'fa-file-excel',  cls: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  csv:  { icon: 'fa-file-csv',    cls: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  png:  { icon: 'fa-file-image',  cls: 'text-cyan-400',    bg: 'bg-cyan-500/15' },
  jpg:  { icon: 'fa-file-image',  cls: 'text-cyan-400',    bg: 'bg-cyan-500/15' },
  jpeg: { icon: 'fa-file-image',  cls: 'text-cyan-400',    bg: 'bg-cyan-500/15' },
  webp: { icon: 'fa-file-image',  cls: 'text-cyan-400',    bg: 'bg-cyan-500/15' },
  gif:  { icon: 'fa-file-image',  cls: 'text-cyan-400',    bg: 'bg-cyan-500/15' },
  mp4:  { icon: 'fa-file-video',  cls: 'text-violet-400',  bg: 'bg-violet-500/15' },
  mov:  { icon: 'fa-file-video',  cls: 'text-violet-400',  bg: 'bg-violet-500/15' },
  webm: { icon: 'fa-file-video',  cls: 'text-violet-400',  bg: 'bg-violet-500/15' },
  mp3:  { icon: 'fa-file-audio',  cls: 'text-pink-400',    bg: 'bg-pink-500/15' },
  wav:  { icon: 'fa-file-audio',  cls: 'text-pink-400',    bg: 'bg-pink-500/15' },
  ogg:  { icon: 'fa-file-audio',  cls: 'text-pink-400',    bg: 'bg-pink-500/15' },
  m4a:  { icon: 'fa-file-audio',  cls: 'text-pink-400',    bg: 'bg-pink-500/15' },
  fig:  { icon: 'fa-palette',     cls: 'text-violet-400',  bg: 'bg-violet-500/15' },
  key:  { icon: 'fa-display',     cls: 'text-pink-400',    bg: 'bg-pink-500/15' },
  md:   { icon: 'fa-file-lines',  cls: 'text-slate-400',   bg: 'bg-slate-500/15' },
  txt:  { icon: 'fa-file-lines',  cls: 'text-slate-400',   bg: 'bg-slate-500/15' },
  sql:  { icon: 'fa-database',    cls: 'text-cyan-400',    bg: 'bg-cyan-500/15' },
  yaml: { icon: 'fa-file-code',   cls: 'text-violet-400',  bg: 'bg-violet-500/15' },
  json: { icon: 'fa-file-code',   cls: 'text-amber-400',   bg: 'bg-amber-500/15' },
  default: DEFAULT_ICON,
};

export function fileIcon(name: string): FileIconDef {
  const ext = (String(name).split('.').pop() ?? '').toLowerCase();
  return FILE_ICONS[ext] ?? DEFAULT_ICON;
}

export { FILE_ICONS };
