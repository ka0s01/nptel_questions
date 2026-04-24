// ═══════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════
const state = {
  courses: {},          // { courseName: { weekKey: [questions] } }
  selectedCourse: null,
  mode: null,           // 'weekly' | 'random' | 'mistakes'
  selectedWeeks: new Set(),
  quiz: {
    questions: [],
    index: 0,
    score: 0,
    wrong: [],
    startTime: 0,
    timer: null,
    lastMode: null,
    lastWeeks: null,
  },
};

// localStorage key for mistakes
const MISTAKES_KEY = 'nptel_mistakes_v2';

function loadMistakes() {
  try { return JSON.parse(localStorage.getItem(MISTAKES_KEY) || '{}'); }
  catch { return {}; }
}
function saveMistakes(m) { localStorage.setItem(MISTAKES_KEY, JSON.stringify(m)); }

// ═══════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════
function goTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(pageId);
  el.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ═══════════════════════════════════════════════════════
//  UPLOAD
// ═══════════════════════════════════════════════════════
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const chips    = document.getElementById('upload-chips');
const btnCont  = document.getElementById('btn-continue-upload');

function deriveName(filename) {
  return filename.replace(/\.json$/i, '').replace(/_/g, ' ').replace(/-/g, ' ')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function handleFiles(files) {
  [...files].forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        const name = deriveName(file.name);
        state.courses[name] = data;
        renderChips();
        btnCont.disabled = false;
      } catch {
        toast(`Failed to parse ${file.name}`);
      }
    };
    reader.readAsText(file);
  });
}

function renderChips() {
  chips.innerHTML = '';
  Object.keys(state.courses).forEach(name => {
    const chip = document.createElement('span');
    chip.className = 'tag';
    chip.style.cssText = 'padding:5px 10px; font-size:.78rem; display:inline-flex; align-items:center; gap:6px; cursor:pointer;';
    chip.innerHTML = `${name} <span style="color:var(--red)">✕</span>`;
    chip.querySelector('span').onclick = () => { delete state.courses[name]; renderChips(); if (!Object.keys(state.courses).length) btnCont.disabled = true; };
    chips.appendChild(chip);
  });
}

fileInput.addEventListener('change', e => handleFiles(e.target.files));
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });

btnCont.addEventListener('click', () => { buildHome(); goTo('page-home'); });

// ═══════════════════════════════════════════════════════
//  HOME
// ═══════════════════════════════════════════════════════
const COURSE_ICONS = ['🌿','🎓','🔬','📚','🌍','🧬','🏔️','💡'];
let iconIdx = 0;

function buildHome() {
  const grid = document.getElementById('course-grid');
  grid.innerHTML = '';
  iconIdx = 0;
  Object.keys(state.courses).forEach(name => {
    const card = document.createElement('div');
    card.className = 'course-card';
    card.dataset.course = name;
    const weeks = Object.keys(state.courses[name]).length;
    const totalQ = Object.values(state.courses[name]).flat().length;
    card.innerHTML = `
      <div class="course-icon">${COURSE_ICONS[iconIdx++ % COURSE_ICONS.length]}</div>
      <h3>${name}</h3>
      <p>${weeks} weeks · ${totalQ} questions</p>`;
    card.addEventListener('click', () => selectCourse(name, card));
    grid.appendChild(card);
  });

  // Auto-select first
  const first = grid.querySelector('.course-card');
  if (first) selectCourse(first.dataset.course, first);

  updateMistakeBadge();
}

function selectCourse(name, el) {
  document.querySelectorAll('.course-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.selectedCourse = name;
  updateMistakeBadge();
}

function updateMistakeBadge() {
  const badge = document.getElementById('mistake-badge');
  const modeCard = document.getElementById('mode-mistakes');
  const mistakes = loadMistakes();
  const courseKey = state.selectedCourse;
  const count = courseKey && mistakes[courseKey] ? mistakes[courseKey].length : 0;
  badge.textContent = `${count} saved`;
  if (count === 0) {
    modeCard.classList.add('disabled');
  } else {
    modeCard.classList.remove('disabled');
  }
}

// ═══════════════════════════════════════════════════════
//  MODES
// ═══════════════════════════════════════════════════════
function startWeeklyMode() {
  if (!state.selectedCourse) { toast('Select a course first'); return; }
  buildWeekSelector();
  goTo('page-week-select');
}

function startRandomMode() {
  if (!state.selectedCourse) { toast('Select a course first'); return; }
  const course = state.courses[state.selectedCourse];
  let all = Object.values(course).flat();
  shuffle(all);
  state.quiz.lastMode = 'random';
  state.quiz.lastWeeks = null;
  launchQuiz(all, 'RANDOM MIX');
}

function startMistakeMode() {
  if (!state.selectedCourse) { toast('Select a course first'); return; }
  const mistakes = loadMistakes();
  const courseKey = state.selectedCourse;
  const list = mistakes[courseKey] || [];
  if (!list.length) { toast('No mistakes saved for this course!'); return; }
  shuffle(list);
  state.quiz.lastMode = 'mistakes';
  state.quiz.lastWeeks = null;
  goTo('page-quiz'); // navigate before launch to prevent double anim
  launchQuiz(list, 'FIX MISTAKES');
}

// ═══════════════════════════════════════════════════════
//  WEEK SELECTOR
// ═══════════════════════════════════════════════════════
function buildWeekSelector() {
  const course = state.courses[state.selectedCourse];
  const grid   = document.getElementById('week-grid');
  grid.innerHTML = '';
  state.selectedWeeks.clear();

  Object.keys(course).sort((a,b) => weekNum(a) - weekNum(b)).forEach(key => {
    const n = weekNum(key);
    const btn = document.createElement('div');
    btn.className = 'week-btn';
    btn.dataset.key = key;
    btn.innerHTML = `<span class="week-num">${n === -1 ? '0' : n}</span>${key.split(':')[1]?.trim() || key}`;
    btn.addEventListener('click', () => {
      btn.classList.toggle('selected');
      if (btn.classList.contains('selected')) state.selectedWeeks.add(key);
      else state.selectedWeeks.delete(key);
    });
    grid.appendChild(btn);
  });
}

function weekNum(key) {
  const m = key.match(/Week (\d+)/i);
  return m ? parseInt(m[1]) : -1;
}

function selectAllWeeks() {
  document.querySelectorAll('.week-btn').forEach(b => {
    b.classList.add('selected'); state.selectedWeeks.add(b.dataset.key);
  });
}
function clearWeeks() {
  document.querySelectorAll('.week-btn').forEach(b => b.classList.remove('selected'));
  state.selectedWeeks.clear();
}

function launchWeekQuiz() {
  if (!state.selectedWeeks.size) { toast('Select at least one week'); return; }
  const course = state.courses[state.selectedCourse];
  let qs = [];
  state.selectedWeeks.forEach(k => { if (course[k]) qs.push(...course[k]); });
  shuffle(qs);
  state.quiz.lastMode = 'weekly';
  state.quiz.lastWeeks = [...state.selectedWeeks];
  launchQuiz(qs, 'WEEK MODE');
}

// ═══════════════════════════════════════════════════════
//  QUIZ ENGINE
// ═══════════════════════════════════════════════════════
function launchQuiz(questions, modeLabel) {
  if (!questions.length) { toast('No questions to show!'); return; }

  clearInterval(state.quiz.timer);
  const q = state.quiz;
  q.questions = questions;
  q.index = 0;
  q.score = 0;
  q.wrong = [];
  q.startTime = Date.now();

  document.getElementById('quiz-mode-label').textContent = modeLabel;
  document.getElementById('quiz-course-label').textContent = state.selectedCourse;
  document.getElementById('q-score').textContent = '0';

  q.timer = setInterval(() => {
    const s = Math.floor((Date.now() - q.startTime) / 1000);
    document.getElementById('q-timer').textContent = formatTime(s);
  }, 1000);

  goTo('page-quiz');
  showQuestion();
}

function showQuestion() {
  const q = state.quiz;
  const qData = q.questions[q.index];

  document.getElementById('q-num').textContent = `${q.index + 1}/${q.questions.length}`;
  document.getElementById('q-progress').style.width = `${((q.index) / q.questions.length) * 100}%`;
  document.getElementById('q-week-tag').textContent = qData._week || 'Question';
  document.getElementById('q-text').textContent = qData.question;
  document.getElementById('btn-next').style.display = 'none';

  const container = document.getElementById('q-options');
  container.innerHTML = '';
  const opts = [...qData.options];
  shuffle(opts);

  const letters = ['A','B','C','D','E'];
  opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<span class="opt-letter">${letters[i]}</span><span>${opt}</span>`;
    btn.addEventListener('click', () => selectAnswer(btn, opt, qData.answer, qData));
    container.appendChild(btn);
  });
}

function selectAnswer(clickedBtn, selected, correct, qData) {
  const allBtns = document.querySelectorAll('.option-btn');
  allBtns.forEach(b => b.disabled = true);

  const isCorrect = selected === correct;

  if (isCorrect) {
    clickedBtn.classList.add('correct');
    state.quiz.score++;
    document.getElementById('q-score').textContent = state.quiz.score;
    // Remove from mistakes if correct
    removeMistake(state.selectedCourse, qData);
  } else {
    clickedBtn.classList.add('incorrect');
    // Highlight correct
    allBtns.forEach(b => {
      if (b.querySelector('span:last-child').textContent === correct) b.classList.add('correct');
    });
    // Save mistake (attach week tag)
    const mistake = { ...qData, _week: qData._week };
    state.quiz.wrong.push({ ...mistake, userAnswer: selected });
    saveMistakeEntry(state.selectedCourse, mistake);
  }

  document.getElementById('btn-next').style.display = 'inline-flex';
}

function nextQuestion() {
  state.quiz.index++;
  if (state.quiz.index < state.quiz.questions.length) {
    showQuestion();
  } else {
    finishQuiz();
  }
}

function quitQuiz() {
  clearInterval(state.quiz.timer);
  goTo('page-home');
  updateMistakeBadge();
}

function finishQuiz() {
  clearInterval(state.quiz.timer);
  const q = state.quiz;
  const total = q.questions.length;
  const pct = Math.round((q.score / total) * 100);
  const timeTaken = Math.floor((Date.now() - q.startTime) / 1000);

  document.getElementById('result-score').textContent = `${q.score}/${total}`;
  document.getElementById('stat-correct').textContent = q.score;
  document.getElementById('stat-wrong').textContent = q.wrong.length;
  document.getElementById('stat-time').textContent = formatTime(timeTaken);
  document.getElementById('result-emoji').textContent = pct === 100 ? '🏆' : pct >= 70 ? '✅' : pct >= 40 ? '📈' : '💪';
  document.getElementById('result-subtext').textContent =
    pct === 100 ? 'Perfect score — flawless!' :
    pct >= 70 ? `${pct}% — solid work!` :
    pct >= 40 ? `${pct}% — keep grinding!` : `${pct}% — mistakes saved for review.`;

  // Show/hide practice mistakes button
  const btnMistakes = document.getElementById('btn-practice-mistakes');
  btnMistakes.style.display = q.wrong.length > 0 ? 'inline-flex' : 'none';

  // Review
  const review = document.getElementById('result-review');
  review.innerHTML = '';
  if (q.wrong.length > 0) {
    const h = document.createElement('div');
    h.innerHTML = `<div class="label" style="margin-bottom:12px;">Mistakes to Review</div>`;
    review.appendChild(h);
    q.wrong.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'review-item';
      div.innerHTML = `
        <div class="review-q">${idx + 1}. ${item.question}</div>
        <div class="review-answer wrong">✗ Your answer: ${item.userAnswer}</div>
        <div class="review-answer right">✓ Correct: ${item.answer}</div>`;
      review.appendChild(div);
    });
  } else {
    review.innerHTML = `<div class="review-answer right" style="text-align:center; padding:16px;">🎉 You got everything right this session!</div>`;
  }

  updateMistakeBadge();
  goTo('page-result');
}

function retryQuiz() {
  if (state.quiz.lastMode === 'weekly' && state.quiz.lastWeeks) {
    const course = state.courses[state.selectedCourse];
    let qs = [];
    state.quiz.lastWeeks.forEach(k => { if (course[k]) qs.push(...course[k]); });
    shuffle(qs);
    launchQuiz(qs, 'WEEK MODE');
  } else if (state.quiz.lastMode === 'random') {
    startRandomMode();
  } else if (state.quiz.lastMode === 'mistakes') {
    startMistakeMode();
  }
}

// ═══════════════════════════════════════════════════════
//  MISTAKES STORAGE
// ═══════════════════════════════════════════════════════
function mistakeId(q) { return q.question.trim().slice(0, 80); }

function saveMistakeEntry(course, q) {
  const m = loadMistakes();
  if (!m[course]) m[course] = [];
  const id = mistakeId(q);
  if (!m[course].find(x => mistakeId(x) === id)) {
    m[course].push(q);
  }
  saveMistakes(m);
}

function removeMistake(course, q) {
  const m = loadMistakes();
  if (!m[course]) return;
  const id = mistakeId(q);
  m[course] = m[course].filter(x => mistakeId(x) !== id);
  saveMistakes(m);
}

// ═══════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

function formatTime(s) {
  const m = String(Math.floor(s / 60)).padStart(2,'0');
  const ss = String(s % 60).padStart(2,'0');
  return `${m}:${ss}`;
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ═══════════════════════════════════════════════════════
//  WEEK TAG INJECTION
//  Attach the week label to each question when loaded
// ═══════════════════════════════════════════════════════
function injectWeekTags(courseData) {
  const out = {};
  Object.entries(courseData).forEach(([weekKey, qs]) => {
    out[weekKey] = qs.map(q => ({ ...q, _week: weekKey }));
  });
  return out;
}

// Patch file loading to inject week tags
const _origHandleFiles = handleFiles;
function handleFiles(files) {
  [...files].forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const raw = JSON.parse(e.target.result);
        const name = deriveName(file.name);
        state.courses[name] = injectWeekTags(raw);
        renderChips();
        btnCont.disabled = false;
      } catch {
        toast(`Failed to parse ${file.name}`);
      }
    };
    reader.readAsText(file);
  });
}

// Re-bind event listeners with new handleFiles
fileInput.removeEventListener('change', _origHandleFiles);
fileInput.addEventListener('change', e => handleFiles(e.target.files));
dropZone.removeEventListener('drop', () => {});
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
