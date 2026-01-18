import { fetchJson } from './api.js';
import { DATA_PATHS } from './constants.js';

const LS_ADMIN_STUDENTS = 'math:admin:students';

let studentsCache = null;

/**
 * Load students list (cached after first load)
 */
export async function loadStudents() {
  if (studentsCache) {
    return studentsCache;
  }

  const stored = readLocalJson(LS_ADMIN_STUDENTS);
  if (stored && Array.isArray(stored)) {
    studentsCache = stored.map(normalizeStudent);
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

  const normalizedId = String(id).trim();
  const normalizedYear = String(birthYear).trim();

  const student = students.find(s =>
    String(s.id) === normalizedId &&
    String(s.birthYear) === normalizedYear
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

function readLocalJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
