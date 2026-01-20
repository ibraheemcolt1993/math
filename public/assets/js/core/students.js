import { fetchJson } from './api.js';
import { DATA_PATHS } from './constants.js';
import { normalizeDigits } from './normalizeDigits.js';

let studentsCache = null;

/**
 * Load students list (cached after first load)
 */
export async function loadStudents() {
  if (studentsCache) {
    return studentsCache;
  }

  const data = await fetchJson(DATA_PATHS.STUDENTS, { noStore: true });
  const list = Array.isArray(data) ? data : data?.students;

  if (!Array.isArray(list)) {
    throw new Error('Students list format is invalid');
  }

  studentsCache = list.map(normalizeStudent);
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

  const normalizedId = normalizeDigits(String(id).trim());
  const normalizedYear = normalizeDigits(String(birthYear).trim());

  const student = students.find(s =>
    normalizeDigits(String(s.id)) === normalizedId &&
    normalizeDigits(String(s.birthYear)) === normalizedYear
  );

  return student || null;
}

function normalizeStudent(student) {
  return {
    id: student.StudentId ?? student.studentId ?? student.id ?? '',
    birthYear: student.BirthYear ?? student.birthYear ?? '',
    firstName: student.FirstName ?? student.firstName ?? '',
    fullName: student.FullName ?? student.fullName ?? '',
    class: student.Class ?? student.class ?? '',
  };
}
