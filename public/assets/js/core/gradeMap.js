export const GRADE_WEEK_MAP = {
  '7/1': [999, 1000],
  '7/2': [999],
  '8/1': [1000],
};

export function getWeeksForClass(studentClass) {
  if (!studentClass) return null;
  const key = String(studentClass).trim();
  return GRADE_WEEK_MAP[key] || null;
}
