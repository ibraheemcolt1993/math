/* 
CHANGELOG:
- [STEP 1] Added students data loader from static JSON file
- [STEP 1] Added student identity validation (ID + birthYear)
- [STEP 1] Non-breaking addition: no dependency on UI or storage
- [STEP 1] Prepared foundation for future login integration
*/

import { fetchJSON } from './api.js';

let studentsCache = null;

/**
 * Load students database (cached after first load)
 */
export async function loadStudents() {
  if (studentsCache) {
    return studentsCache;
  }

  const data = await fetchJSON('/data/students.json');

  if (!Array.isArray(data)) {
    throw new Error('Students database format is invalid');
  }

  studentsCache = data;
  return studentsCache;
}

/**
 * Find student by ID number and birth year
 * @param {string} id
 * @param {string} birthYear
 * @returns {object|null}
 */
export async function findStudentByIdentity(id, birthYear) {
  const students = await loadStudents();

  const normalizedId = String(id).trim();
  const normalizedYear = String(birthYear).trim();

  const student = students.find(s =>
    String(s.id) === normalizedId &&
    String(s.birthYear) === normalizedYear
  );

  return student || null;
}
