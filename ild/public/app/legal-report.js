// Formulaire public de signalement (page /legal/signaler), sans compte.
import { api } from '/shared/lib.js';

const form = document.getElementById('report');
const status = document.getElementById('report-status');
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  data.good_faith = form.elements.good_faith.checked;
  try {
    await api('POST', '/api/public/report', data);
    form.reset();
    status.textContent = 'Merci. Ton signalement a été transmis à l’équipe de modération.';
  } catch (err) {
    status.textContent = err.message;
  }
});
