/* 
CHANGELOG:
- [STEP 1] Added students data loader from API
- [STEP 1] Added student identity validation (ID + birthYear)
- [STEP 1] Non-breaking addition: no dependency on UI or storage
- [STEP 1] Prepared foundation for future login integration
*/

import { fetchJson } from './api.js';

let studentsCache = null;

/**
 * Load students database (cached after first load)
 */
export async function loadStudents() {
  if (studentsCache) {
    return studentsCache;
  }

  const data = await fetchJson('/api/admin/students', { noStore: true });

  if (!Array.isArray(data)) {
    throw new Error('Students database format is invalid');
  }

  studentsCache = data.map((student) => ({
    id: student.StudentId ?? student.studentId ?? student.id ?? '',
    birthYear: student.BirthYear ?? student.birthYear ?? '',
    firstName: student.FirstName ?? student.firstName ?? '',
    fullName: student.FullName ?? student.fullName ?? '',
    class: student.Class ?? student.class ?? '',
  }));
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
