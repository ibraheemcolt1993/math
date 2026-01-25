const LS_STUDENT_SESSION = 'math:studentSession';
const LS_LAST_CERTIFICATE = 'math:lastCertificate';
const LS_STUDENT_COMPLETIONS = 'math:studentCompletions';
const LS_CARDS_CACHE = 'math:cardsCache';
const EXPORT_SIZE = 1080;

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

const certState = {
  week: '',
  seq: '',
  cardTitle: '',
  certNumber: '',
  fullName: ''
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

function normalizeDigits(value) {
  const map = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
  };

  return String(value ?? '')
    .split('')
    .map((char) => map[char] ?? char)
    .join('');
}

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
  const normalized = normalizeDigits(raw).trim();
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

function showNoticeTemporary(message, timeout = 2600) {
  showNotice(message);
  window.setTimeout(() => {
    hideNotice();
  }, timeout);
}

async function resolveCertificateData() {
  const session = readJson(LS_STUDENT_SESSION);
  const lastCertificate = readJson(LS_LAST_CERTIFICATE);
  const weekParam = getWeekParam();

  if (weekParam) {
    if (!session?.id) {
      return { source: 'empty', session: session || null, payload: null, message: 'لا توجد شهادة لهذا الأسبوع' };
    }
    const completionFromCache = findCompletionInCache(session.id, weekParam);
    const completion = completionFromCache || (await fetchCompletion(session.id, weekParam));
    if (!completion && !completionFromCache) {
      return { source: 'empty', session, payload: null, message: 'لا توجد شهادة لهذا الأسبوع' };
    }

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

  if (lastCertificate?.week) {
    return { source: 'last', session, payload: lastCertificate };
  }

  return { source: 'empty', session: session || null, payload: null };
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

  certState.week = String(week ?? '');
  certState.seq = String(seqValue ?? week ?? '');
  certState.cardTitle = cardTitle;
  certState.certNumber = certNumber;
  certState.fullName = fullName;

  elements.btnPng?.addEventListener('click', () => downloadCertificate('png', week));
  elements.btnJpg?.addEventListener('click', () => downloadCertificate('jpg', week));
  elements.btnShare?.addEventListener('click', () => shareCertificate());
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

async function renderCanvas(target, { scale = 2, width, height, backgroundColor = null } = {}) {
  if (!window.html2canvas) {
    throw new Error('html2canvas not available');
  }
  return window.html2canvas(target, {
    scale,
    backgroundColor,
    useCORS: true,
    allowTaint: false,
    logging: false,
    imageTimeout: 15000,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    scrollX: 0,
    scrollY: 0
  });
}

async function waitForAssetsReady() {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {}
  }

  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  const images = Array.from(elements.paper?.querySelectorAll('img') || []);
  if (!images.length) return;

  await Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    })
  );
}

function buildExportStage() {
  const stage = document.createElement('div');
  stage.className = 'cert-export-stage';
  stage.style.width = `${EXPORT_SIZE}px`;
  stage.style.height = `${EXPORT_SIZE}px`;

  const clone = elements.paper.cloneNode(true);
  clone.classList.add('is-export');
  stage.appendChild(clone);
  document.body.appendChild(stage);

  return { stage, clone };
}

async function createCertificateImage(type) {
  if (!elements.paper) throw new Error('Certificate not ready');
  let stage;
  let canvas;
  try {
    await waitForAssetsReady();
    const exportStage = buildExportStage();
    stage = exportStage.stage;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    canvas = await renderCanvas(stage, {
      scale: 2,
      width: EXPORT_SIZE,
      height: EXPORT_SIZE,
      backgroundColor: null
    });
  } finally {
    stage?.remove();
  }

  const isPng = type === 'png';
  const mime = isPng ? 'image/png' : 'image/jpeg';
  const quality = isPng ? 1 : 0.92;

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob) throw new Error('تعذر إنشاء الصورة');

  const fileName = `certificate-${certState.certNumber || certState.seq || 'week'}.${isPng ? 'png' : 'jpg'}`;
  const file = new File([blob], fileName, { type: mime });
  return { blob, file };
}

async function downloadCertificate(type) {
  hideNotice();
  try {
    const { blob, file } = await createCertificateImage(type);
    showNoticeTemporary('تم تجهيز الصورة ✅');

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    document.body.classList.remove('cert-exporting');
    showNotice('تعذر تجهيز الصورة حاليًا. جرّب الطباعة أو أخذ لقطة شاشة.');
  }
}

async function shareCertificate() {
  hideNotice();
  const shareText = `شهادة إتمام للطالب/ة ${certState.fullName} - البطاقة ${certState.seq} - ${certState.certNumber}`;
  const shareUrl = window.location.href;

  if (navigator.share && navigator.canShare) {
    try {
      const { file } = await createCertificateImage('png');
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'شهادة إتمام', text: shareText });
        return;
      }
    } catch (error) {
      console.warn(error);
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: 'شهادة إتمام', text: shareText, url: shareUrl });
      return;
    } catch (error) {
      console.warn(error);
    }
  }

  showNotice('حمّل الصورة أولًا ثم أرسلها في واتساب.');
  const waUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;
  window.open(waUrl, '_blank', 'noopener');
}

async function init() {
  const resolved = await resolveCertificateData();
  if (!resolved.payload || !resolved.session) {
    if (resolved.message) {
      showNotice(resolved.message);
    }
    showEmptyState();
    return;
  }

  showCertificateState();
  renderCertificate({ session: resolved.session, payload: resolved.payload });
}

function initZoomWatcher() {
  const viewport = window.visualViewport;
  if (!viewport) return;

  const updateZoomClass = () => {
    const isZoomed = viewport.scale > 1.01;
    document.documentElement.classList.toggle('is-zoomed', isZoomed);
  };

  updateZoomClass();
  viewport.addEventListener('resize', updateZoomClass);
  viewport.addEventListener('scroll', updateZoomClass);
}

initZoomWatcher();
init();
