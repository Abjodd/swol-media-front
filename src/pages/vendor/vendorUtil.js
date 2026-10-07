// Small helpers shared by the vendor pages
export const daysLeft = (d) => {
  if (!d) return null;
  const ms = new Date(d).setHours(23, 59, 59) - Date.now();
  return Math.ceil(ms / 86400000);
};
export const dueText = (d) => {
  const n = daysLeft(d);
  if (n === null) return 'No deadline';
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} overdue`;
  if (n === 0) return 'Due today';
  return `${n} day${n === 1 ? '' : 's'} left`;
};
// where this vendor stands on one campaign
export const progressOf = (mine) => {
  if (!mine) return { label: 'Not assigned', tone: 'off' };
  const added = mine.counts?.submitted || 0;
  if (mine.status === 'closed') return { label: 'Closed', tone: 'off' };
  if (added >= mine.quota) return { label: 'Target met', tone: 'done' };
  if (added > 0) return { label: 'In progress', tone: 'now' };
  return { label: 'To do', tone: 'todo' };
};
