document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  /* =========================
     الصفحة الرئيسية
  ========================= */

  const screenId = $("screen-id");
  const screenWelcome = $("screen-welcome");
  const screenCards = $("screen-cards");

  const nid = $("nid");
  const btnGo = $("btnGo");
  const btnToCards = $("btnToCards");
  const btnBack = $("btnBack");
  const welcomeTitle = $("welcomeTitle");
  const cardsList = $("cardsList");

  const Students = {
    "123": "أحمد محمد",
    "456": "سارة علي",
    "789": "إبراهيم أحمد"
  };

  const Cards = [
    { week: 13, title: "بطاقة الأسبوع الثالث عشر", key: "w13" }
  ];

  const Progress = {};
  let currentNid = "";
  let currentName = "";

  function show(el){
    [screenId, screenWelcome, screenCards].forEach(s => s?.classList.add("hidden"));
    el?.classList.remove("hidden");
  }

  function toast(title, msg, duration=2600){
    const host = $("toastHost");
    if(!host) return;

    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `
      <div class="t">${title}</div>
      <div class="m">${msg}</div>
      <div class="bar"><i></i></div>
    `;
    host.appendChild(t);

    const bar = t.querySelector(".bar i");
    bar.animate(
      [{transform:"scaleX(1)"},{transform:"scaleX(0)"}],
      {duration, easing:"linear", fill:"forwards"}
    );

    setTimeout(()=> t.remove(), duration);
  }

  function renderCards(){
    if(!cardsList) return;
    cardsList.innerHTML = "";

    Cards.forEach(c => {
      const item = document.createElement("div");
      item.className = "cardItem";
      item.innerHTML = `
        <div>
          <div style="font-weight:700">${c.title}</div>
          <div class="muted" style="margin-top:4px;font-size:13px">week ${c.week}</div>
        </div>
        <div class="badge">مفتوحة</div>
      `;
      item.onclick = () => {
        window.location.href = `lesson.html?week=${c.week}`;
      };
      cardsList.appendChild(item);
    });
  }

  btnGo?.addEventListener("click", () => {
    const id = nid.value.trim();
    if(!id){
      toast("تنبيه", "اكتب رقم الهوية أولًا");
      return;
    }
    currentNid = id;
    currentName = Students[id] || "طالبنا";
    welcomeTitle.textContent = `مرحبًا يا ${currentName}`;
    show(screenWelcome);
  });

  btnToCards?.addEventListener("click", () => {
    renderCards();
    show(screenCards);
  });

  btnBack?.addEventListener("click", () => show(screenWelcome));
  nid?.addEventListener("keydown", e => e.key==="Enter" && btnGo.click());
});


/* =========================
   lesson.html (محرك الدرس)
========================= */

if (window.location.pathname.endsWith("lesson.html")) {
(async () => {

  const params = new URLSearchParams(window.location.search);
  const week = params.get("week") || "13";

  const titleEl  = document.getElementById("lessonTitle");
  const nameEl   = document.getElementById("studentName");
  const content  = document.getElementById("content");
  const question = document.getElementById("question");

  if(titleEl) titleEl.textContent = `بطاقة الأسبوع ${week}`;
  if(nameEl)  nameEl.textContent  = `الطالب`;

  try {
    const res = await fetch(`data/week${week}.json`, { cache:"no-store" });
    if(!res.ok) throw new Error("تعذر تحميل البطاقة");
    const data = await res.json();

    titleEl.textContent = data.title;

    const concept = data.concepts[0];
    let step = 0; // 0 هدف - 1 شرح - 2 مثال - 3 ملاحظة - 4 سؤال

    function renderStep(){
      if(!content) return;

      if(step === 0){
        content.innerHTML = `
          <h2>${concept.title}</h2>
          <p class="muted">${concept.goal}</p>
          <button class="btn primary" id="next">التالي</button>
        `;
      }

      if(step === 1){
        content.innerHTML = `
          <h2>الشرح</h2>
          <p>${concept.explain}</p>
          <button class="btn primary" id="next">التالي</button>
        `;
      }

      if(step === 2){
        content.innerHTML = `
          <h2>مثال</h2>
          <p>${concept.example}</p>
          <button class="btn primary" id="next">التالي</button>
        `;
      }

      if(step === 3){
        content.innerHTML = `
          <h2>ملاحظة</h2>
          <p>${concept.note}</p>
          <button class="btn primary" id="next">انتقل للسؤال</button>
        `;
      }

      if(step === 4){
        content.innerHTML = `
          <h2>سؤال</h2>
          <p>${concept.question.text}</p>
          <input id="answer" placeholder="اكتب الإجابة">
          <button class="btn primary" id="check">تحقق</button>
        `;
      }

      document.getElementById("next")?.addEventListener("click", () => {
        step++;
        renderStep();
      });

      document.getElementById("check")?.addEventListener("click", () => {
        const val = document.getElementById("answer").value.trim();
        if(val === concept.question.answer){
          alert("أحسنت ✅ إجابة صحيحة");
        }else{
          showToast("تنبيه", "حاول مرة أخرى");
        }
      });
    }

    renderStep();

  } catch(e){
    if(content){
      content.innerHTML = `<h2>خطأ ⚠️</h2><p>${e.message}</p>`;
    }
  }

})();
}
