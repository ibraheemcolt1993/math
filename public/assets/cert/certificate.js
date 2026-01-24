const LS_STUDENT_SESSION = 'math:studentSession';
const LS_LAST_CERTIFICATE = 'math:lastCertificate';
const LS_STUDENT_COMPLETIONS = 'math:studentCompletions';
const LS_CARDS_CACHE = 'math:cardsCache';

const elements = {
  shell: document.getElementById('certShell'),
  paper: document.getElementById('certPaper'),
  empty: document.getElementById('certEmpty'),
  actions: document.getElementById('certActions'),
  notice: document.getElementById('certNotice'),
  name: document.getElementById('certName'),
  card: document.getElementById('certCard'),
  classLine: document.getElementById('certClassLine'),
  dateLine: document.getElementById('certDateLine'),
  idLine: document.getElementById('certIdLine'),
  metaWeek: document.getElementById('certMetaWeek'),
  metaScore: document.getElementById('certMetaScore'),
  metaDate: document.getElementById('certMetaDate'),
  btnPng: document.getElementById('btnDownloadPng'),
  btnJpg: document.getElementById('btnDownloadJpg'),
  btnShare: document.getElementById('btnShareWhatsapp')
};

const gradeNames = {
  1: 'الأول',
  2: 'الثاني',
  3: 'الثالث',
  4: 'الرابع',
  5: 'الخامس',
  6: 'السادس',
  7: 'السابع',
  8: 'الثامن',
  9: 'التاسع'
};

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getWeekParam() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('week');
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveGradeName(value) {
  const key = Number.parseInt(value, 10);
  return gradeNames[key] || value || '—';
}

function formatArabicDate(dateInput) {
  const date = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

function buildCertNumber({ studentId, week, dateInput }) {
  const date = dateInput ? new Date(dateInput) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const yyyy = safeDate.getFullYear();
  const mm = String(safeDate.getMonth() + 1).padStart(2, '0');
  const dd = String(safeDate.getDate()).padStart(2, '0');
  return `CERT-${studentId}-${week}-${yyyy}${mm}${dd}`;
}

function findCardFromCache(week) {
  const cards = readJson(LS_CARDS_CACHE, []);
  if (!Array.isArray(cards)) return null;
  return cards.find((card) => Number(card?.week ?? card?.Week) === Number(week)) || null;
}

function findCompletionInCache(studentId, week) {
  const root = readJson(LS_STUDENT_COMPLETIONS, {});
  const list = Array.isArray(root?.[studentId]) ? root[studentId] : [];
  return list.find((item) => Number(item?.Week ?? item?.week) === Number(week)) || null;
}

async function fetchCompletion(studentId, week) {
  try {
    const response = await fetch(`/api/progress/completed?studentId=${encodeURIComponent(studentId)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('تعذر تحميل الإنجازات');
    const data = await response.json();
    if (!Array.isArray(data)) return null;
    return data.find((item) => Number(item?.Week ?? item?.week) === Number(week)) || null;
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function showNotice(message) {
  if (!elements.notice) return;
  elements.notice.textContent = message;
  elements.notice.classList.remove('hidden');
}

function hideNotice() {
  if (!elements.notice) return;
  elements.notice.classList.add('hidden');
  elements.notice.textContent = '';
}

async function resolveCertificateData() {
  const session = readJson(LS_STUDENT_SESSION);
  const lastCertificate = readJson(LS_LAST_CERTIFICATE);
  const weekParam = getWeekParam();

  if (lastCertificate?.week) {
    return { source: 'last', session, payload: lastCertificate };
  }

  if (!weekParam || !session?.id) {
    return { source: 'empty', session: session || null, payload: null };
  }

  const completionFromCache = findCompletionInCache(session.id, weekParam);
  const completion = completionFromCache || (await fetchCompletion(session.id, weekParam));

  return {
    source: 'query',
    session,
    payload: {
      week: weekParam,
      studentId: session.id,
      completedAt: completion?.CompletedAt ?? completion?.completedAt ?? null,
      finalScore: completion?.FinalScore ?? completion?.finalScore ?? null,
      cardTitle: '',
      fullName: session?.fullName ?? '',
      firstName: session?.firstName ?? ''
    }
  };
}

function renderCertificate({ session, payload }) {
  const week = payload?.week ?? '';
  const studentId = payload?.studentId || session?.id || '';
  const cachedCard = week ? findCardFromCache(week) : null;

  const fullName = payload?.fullName || session?.fullName || session?.firstName || `طالب ${studentId}`;
  const className = session?.class ? String(session.class) : '—';
  const gradeName = resolveGradeName(session?.grade ? String(session.grade) : '');

  const cardTitle =
    payload?.cardTitle ||
    cachedCard?.Title ||
    cachedCard?.title ||
    (week ? `بطاقة رقم ${week}` : '—');

  const seqValue = cachedCard?.Seq ?? cachedCard?.seq ?? week;
  const completedAt = payload?.completedAt || payload?.issuedAt || payload?.CompletedAt || null;
  const finalScore = payload?.finalScore ?? payload?.FinalScore ?? null;

  const dateLabel = formatArabicDate(completedAt);
  const certNumber = buildCertNumber({ studentId, week, dateInput: completedAt });

  elements.name.textContent = fullName;
  elements.card.textContent = `أتمّ بطاقة رقم ${seqValue} بعنوان: ${cardTitle}`;
  elements.classLine.textContent = `الصف: ${gradeName}  |  الشعبة: ${className}`;
  elements.dateLine.textContent = `التاريخ: ${dateLabel}`;
  elements.idLine.textContent = `رقم الشهادة: ${certNumber}`;

  elements.metaWeek.textContent = String(seqValue ?? week ?? '—');
  elements.metaScore.textContent = finalScore !== null && finalScore !== undefined ? String(finalScore) : '—';
  elements.metaDate.textContent = dateLabel;

  document.title = `شهادة إتمام بطاقة ${seqValue}`;

  elements.btnPng?.addEventListener('click', () => downloadCertificate('png', week));
  elements.btnJpg?.addEventListener('click', () => downloadCertificate('jpg', week));
  elements.btnShare?.addEventListener('click', () => shareCertificate({ week, cardTitle, name: fullName }));
}

function showEmptyState() {
  elements.empty?.classList.remove('hidden');
  elements.shell?.classList.add('hidden');
  elements.actions?.classList.add('hidden');
}

function showCertificateState() {
  elements.empty?.classList.add('hidden');
  elements.shell?.classList.remove('hidden');
  elements.actions?.classList.remove('hidden');
}

async function renderCanvas(scale = 2) {
  if (!window.html2canvas) {
    throw new Error('html2canvas not available');
  }
  return window.html2canvas(elements.paper, {
    scale,
    backgroundColor: '#ffffff',
    useCORS: true
  });
}

async function downloadCertificate(type, week) {
  hideNotice();
  try {
    const canvas = await renderCanvas(2);
    const isPng = type === 'png';
    const mime = isPng ? 'image/png' : 'image/jpeg';
    const quality = isPng ? 1 : 0.92;

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
    if (!blob) throw new Error('تعذر إنشاء الصورة');

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `certificate-week-${week || 'unknown'}.${isPng ? 'png' : 'jpg'}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    showNotice('تعذر تجهيز الصورة حاليًا. جرّب الطباعة أو أخذ لقطة شاشة.');
  }
}

async function shareCertificate({ week, cardTitle, name }) {
  hideNotice();
  const shareText = `شهادة إتمام بطاقة ${cardTitle} - ${name}`;
  const shareUrl = window.location.href;

  if (navigator.share) {
    try {
      if (navigator.canShare && window.html2canvas) {
        const canvas = await renderCanvas(2);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1));
        if (blob) {
          const file = new File([blob], `certificate-week-${week || 'unknown'}.png`, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'شهادة إتمام بطاقة', text: shareText });
            return;
          }
        }
      }

      await navigator.share({ title: 'شهادة إتمام بطاقة', text: shareText, url: shareUrl });
      return;
    } catch (error) {
      console.warn(error);
    }
  }

  const waUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;
  window.open(waUrl, '_blank', 'noopener');
}

async function init() {
  const resolved = await resolveCertificateData();
  if (!resolved.payload || !resolved.session) {
    showEmptyState();
    return;
  }

  showCertificateState();
  renderCertificate({ session: resolved.session, payload: resolved.payload });
}

init();
