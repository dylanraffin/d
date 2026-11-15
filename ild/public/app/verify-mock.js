// Simulation du prestataire de vérification d'âge (développement uniquement).
import { api } from '/shared/lib.js';

const session = location.hash.slice(1);
const status = document.getElementById('status');
for (const btn of document.querySelectorAll('[data-result]')) {
  btn.addEventListener('click', async () => {
    try {
      await api('POST', `/api/dev/verification/${encodeURIComponent(session)}`, { result: btn.dataset.result });
      status.textContent = 'Résultat envoyé à ILD. Retour à l’app…';
      setTimeout(() => { location.href = '/#/'; }, 600);
    } catch (e) {
      status.textContent = e.message;
    }
  });
}
