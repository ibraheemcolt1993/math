import { showToast } from '../ui/toast.js';

const elements = {
  links: document.getElementById('adminLinks'),
  quickLinks: document.getElementById('adminQuickLinks')
};

const adminLinks = [
  {
    key: 'students',
    title: 'إدارة الطلاب',
    description: 'عرض بيانات الطلاب وإدارتها بسهولة.',
    href: '/mng/students.html',
    badge: 'طلاب'
  },
  {
    key: 'cards',
    title: 'إدارة البطاقات',
    description: 'تحكم بالبطاقات التعليمية وجدولتها.',
    href: '/mng/cards.html',
    badge: 'بطاقات'
  },
  {
    key: 'card-editor',
    title: 'محرر البطاقة',
    description: 'إضافة أو تعديل محتوى البطاقات.',
    href: '/mng/card-editor.html',
    badge: 'محرر'
  },
  {
    key: 'teachers',
    title: 'إدارة المعلمين',
    description: 'إدارة حسابات المعلمين وصلاحياتهم.',
    href: '/mng/teachers.html',
    badge: 'مشرف',
    role: 1
  }
];

const quickLinks = [
  { key: 'students', label: 'الطلاب', href: '/mng/students.html' },
  { key: 'cards', label: 'البطاقات', href: '/mng/cards.html' },
  { key: 'card-editor', label: 'محرر البطاقة', href: '/mng/card-editor.html' },
  { key: 'teachers', label: 'المعلمين', href: '/mng/teachers.html', role: 1 }
];

function fetchWithCredentials(url, options) {
  return fetch(url, { credentials: 'include', ...(options || {}) });
}

function renderLinks(role) {
  if (elements.links) {
    const visible = adminLinks.filter((item) => item.role == null || item.role === role);
    elements.links.innerHTML = visible
      .map((item) => `
        <a class="card" href="${item.href}">
          <div class="card-header">
            <div>
              <h2 class="card-title">${item.title}</h2>
              <p class="card-subtitle">${item.description}</p>
            </div>
            <span class="badge primary">${item.badge}</span>
          </div>
          <div class="card-body">
            <span class="btn btn-outline btn-sm">فتح الصفحة</span>
          </div>
        </a>
      `)
      .join('');
  }

  if (elements.quickLinks) {
    const visibleQuick = quickLinks.filter((item) => item.role == null || item.role === role);
    elements.quickLinks.innerHTML = visibleQuick
      .map((item) => `<a class="btn btn-outline btn-sm" href="${item.href}">${item.label}</a>`)
      .join('');
  }
}

async function loadSession() {
  try {
    const res = await fetchWithCredentials('/api/ain/me', { cache: 'no-store' });
    if (res.status === 401) {
      renderLinks(null);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || data?.message || 'تعذر التحقق من الجلسة.');
    }
    const role = Number(data?.user?.role);
    renderLinks(Number.isFinite(role) ? role : null);
  } catch (error) {
    renderLinks(null);
    showToast('خطأ', error.message || 'تعذر تحميل روابط الإدارة.', 'error');
  }
}

loadSession();
