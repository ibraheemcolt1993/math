document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const screenId = $("screen-id");
  const screenWelcome = $("screen-welcome");
  const screenCards = $("screen-cards");

  const nid = $("nid");
  const btnGo = $("btnGo");
  const btnToCards = $("btnToCards");
  const btnBack = $("btnBack");
  const welcomeTitle = $("welcomeTitle");
  const cardsList = $("cardsList");

  // نموذج بيانات (مؤقت) — لاحقًا بنجيبهم من DB وملفات الدروس
  const Students = {
    "123": "أحمد محمد",
    "456": "سارة علي",
    "789": "إبراهيم أحمد"
  };

  // البطاقات اللي “مضافة فعليًا” فقط
  // rule: 14 ما تنفتح إلا إذا 13 منجزة
  const Cards = [
    { week: 13, title: "بطاقة الأسبوع الثالث عشر", key: "w13" },
    // { week: 14, title: "بطاقة الأسبوع الرابع عشر", key: "w14" }, // لما نضيفها لاحقًا نفك التعليق
  ];

  // إنجازات الطالب (مؤقت) — لاحقًا من DB
  const Progress = {
    // nid: { w13: true/false, w14: true/false }
  };

  let currentNid = "";
  let currentName = "";

  function show(el){
    [screenId, screenWelcome, screenCards].forEach(s => s.classList.add("hidden"));
    el.classList.remove("hidden");
  }

  function toast(title, msg, duration=2600){
    const host = $("toastHost");
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `
      <div class="t">${title}</div>
      <div class="m">${msg}</div>
      <div class="bar"><i></i></div>
    `;
    host.appendChild(t);
    const bar = t.querySelector(".bar i");
    bar.animate([{transform:"scaleX(1)"},{transform:"scaleX(0)"}], {duration, easing:"linear", fill:"forwards"});
    setTimeout(()=> t.remove(), duration);
  }

  function isUnlocked(week){
    if (week === 13) return true;
    // قاعدة التسلسل: لازم ينهي السابق
    const prevKey = `w${week-1}`;
    return !!(Progress[currentNid]?.[prevKey]);
  }

  function isDone(week){
    const key = `w${week}`;
    return !!(Progress[currentNid]?.[key]);
  }

  function renderCards(){
    cardsList.innerHTML = "";
    Cards.forEach(c => {
      const unlocked = isUnlocked(c.week);
      const done = isDone(c.week);

      const item = document.createElement("div");
      item.className = `cardItem ${done ? "done" : ""} ${unlocked ? "" : "locked"}`;
      item.innerHTML = `
        <div>
          <div style="font-weight:700">${c.title}</div>
          <div class="muted" style="margin-top:4px;font-size:13px">week ${c.week}</div>
        </div>
        <div class="badge">${done ? "منجزة" : (unlocked ? "مفتوحة" : "مقفلة")}</div>
      `;

      item.addEventListener("click", () => {
        if (!unlocked){
          toast("مقفلة 🔒", `لازم تنجز بطاقة الأسبوع ${c.week-1} أولًا.`);
          return;
        }
        window.location.href = `lesson.html?week=${c.week}`;
        // لاحقًا: هنا بننقلك لصفحة الدرس lesson.html أو نبدّل شاشة الدرس
      });

      cardsList.appendChild(item);
    });
  }

  btnGo.addEventListener("click", () => {
    const id = nid.value.trim();
    if (!id){
      toast("تنبيه", "اكتب رقم الهوية أولًا.");
      return;
    }
    currentNid = id;
    currentName = Students[id] || "طالبنا";

    welcomeTitle.textContent = `مرحبًا يا ${currentName}`;
    toast("أهلًا 👋", `أهلاً ${currentName}، يلا نبدأ.`);
    show(screenWelcome);
  });

  btnToCards.addEventListener("click", () => {
    if (!Progress[currentNid]) Progress[currentNid] = {}; // إنشاء سجل مؤقت
    renderCards();
    show(screenCards);
  });

  btnBack.addEventListener("click", () => show(screenWelcome));

  // Enter يعمل متابعة
  nid.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnGo.click();
  });
});
// ===== lesson.html init =====
if (window.location.pathname.endsWith("lesson.html")) {
  const params = new URLSearchParams(window.location.search);
  const week = params.get("week") || "?";

  const title = document.getElementById("lessonTitle");
  if (title) title.textContent = `بطاقة الأسبوع ${week}`;
}
