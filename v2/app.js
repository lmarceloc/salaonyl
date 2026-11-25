const state = { step: 1, service: '', duration: '', date: '', time: '', name: '', note: '' };
const panels = [...document.querySelectorAll('[data-step-panel]')];
const progressBar = document.querySelector('[data-progress-bar]');
const progressLabel = document.querySelector('[data-progress-label]');
const nextButtons = [...document.querySelectorAll('[data-next]')];
const summary = document.querySelector('[data-aside-summary]');
const emptySummary = document.querySelector('[data-aside-empty]');

function updateSummary() {
  const hasSelection = state.service || state.date || state.time;
  emptySummary.hidden = Boolean(hasSelection);
  summary.hidden = !hasSelection;
  document.querySelector('[data-summary-service]').textContent = state.service || 'Escolha um serviço';
  document.querySelector('[data-summary-date]').textContent = state.date || 'Escolha um dia';
  document.querySelector('[data-summary-time]').textContent = state.time || 'Escolha um horário';
  document.querySelector('[data-summary-duration]').textContent = state.duration ? `Duração estimada · ${state.duration}` : 'Duração estimada · —';
}

function renderStep() {
  panels.forEach(panel => {
    const active = panel.dataset.stepPanel === String(state.step);
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  });
  const percent = state.step === 1 ? 33.33 : state.step === 2 ? 66.66 : state.step === 3 ? 100 : 100;
  if (progressBar) progressBar.style.width = `${percent}%`;
  if (progressLabel) progressLabel.textContent = state.step === 'success' ? 'Pedido pronto' : `Passo ${state.step} de 3`;
  updateSummary();
}

function setSelected(selector, element) {
  document.querySelectorAll(selector).forEach(item => item.classList.remove('is-selected'));
  element?.classList.add('is-selected');
}

document.querySelectorAll('[data-service]').forEach(card => card.addEventListener('click', () => {
  state.service = card.dataset.service;
  state.duration = card.dataset.duration;
  setSelected('[data-service]', card);
  nextButtons[0].disabled = false;
  updateSummary();
}));

document.querySelectorAll('[data-date]').forEach(card => card.addEventListener('click', () => {
  state.date = card.dataset.date;
  setSelected('[data-date]', card);
  document.querySelector('[data-date-hint]').textContent = `Horários para ${state.date.split(',')[0]}`;
  document.querySelectorAll('[data-time]').forEach(time => { time.disabled = false; });
}));

document.querySelectorAll('[data-time]').forEach(card => card.addEventListener('click', () => {
  state.time = card.dataset.time;
  setSelected('[data-time]', card);
  nextButtons[1].disabled = false;
}));

document.querySelectorAll('[data-start]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('#booking').scrollIntoView({ behavior: 'smooth' });
  document.querySelector('[data-service]').focus({ preventScroll: true });
}));

document.querySelectorAll('[data-next]').forEach((button, index) => button.addEventListener('click', () => {
  if (index === 0 && state.service) state.step = 2;
  if (index === 1 && state.date && state.time) {
    document.querySelector('[data-recap-service]').textContent = state.service;
    document.querySelector('[data-recap-date]').textContent = state.date;
    document.querySelector('[data-recap-time]').textContent = state.time;
    state.step = 3;
  }
  renderStep();
}));

document.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', () => {
  state.step = Math.max(1, state.step - 1);
  renderStep();
}));

document.querySelector('[data-submit]').addEventListener('click', () => {
  state.name = document.querySelector('#customer-name').value.trim() || 'cliente';
  state.note = document.querySelector('#customer-message').value.trim();
  const message = `Olá, equipe Nyl! Meu nome é ${state.name}. Gostaria de agendar ${state.service} para ${state.date}, às ${state.time}.${state.note ? ` Observação: ${state.note}` : ''}`;
  document.querySelector('[data-message-preview]').textContent = message;
  document.querySelector('[data-whatsapp]').href = `https://wa.me/5542988820334?text=${encodeURIComponent(message)}`;
  panels.forEach(panel => { panel.hidden = panel.dataset.stepPanel !== 'success'; });
  state.step = 'success';
  progressBar.style.width = '100%';
  progressLabel.textContent = 'Pedido pronto';
});

document.querySelector('[data-restart]').addEventListener('click', () => {
  Object.assign(state, { step: 1, service: '', duration: '', date: '', time: '', name: '', note: '' });
  document.querySelectorAll('.is-selected').forEach(item => item.classList.remove('is-selected'));
  document.querySelectorAll('[data-time]').forEach(time => { time.disabled = true; });
  nextButtons.forEach(button => { button.disabled = true; });
  document.querySelector('#customer-name').value = '';
  document.querySelector('#customer-message').value = '';
  renderStep();
  document.querySelector('[data-service]').focus({ preventScroll: true });
});

renderStep();
