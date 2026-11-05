'use strict';

let encryptedSolutions;

async function loadSolutions() {
  if (!encryptedSolutions) {
    encryptedSolutions = fetch('solutions.json').then(async (response) => {
      if (!response.ok) throw new Error('load');
      const result = await response.json();
      if (result.version !== 1 || !result.solutions || result.iterations !== 600000) {
        throw new Error('format');
      }
      return result;
    }).catch((error) => {
      encryptedSolutions = undefined;
      throw error;
    });
  }
  return encryptedSolutions;
}

function decodeBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function decryptSolution(id, password, bundle) {
  const entry = bundle.solutions[id];
  if (!entry) throw new Error('missing');
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: decodeBase64(entry.salt), iterations: bundle.iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64(entry.iv), additionalData: encoder.encode(id) },
    key,
    decodeBase64(entry.data)
  );
  const solution = JSON.parse(new TextDecoder().decode(decrypted));
  if (typeof solution.code !== 'string' || typeof solution.explanation !== 'string') throw new Error('format');
  return solution;
}

document.querySelectorAll('.solution').forEach((panel) => {
  const id = panel.dataset.id;
  const form = panel.querySelector('form');
  const input = form.querySelector('input');
  const submit = form.querySelector('button');
  const status = panel.querySelector('.unlock-status');
  const content = panel.querySelector('.solution-content');

  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const password = input.value.trim();
    if (!password) {
      message('Bitte das Passwort für diese Aufgabe eingeben.', true);
      input.focus();
      return;
    }
    if (!globalThis.crypto?.subtle) {
      message('Bitte die Seite über HTTPS in einem aktuellen Browser öffnen.', true);
      return;
    }
    submit.disabled = true;
    input.setAttribute('aria-invalid', 'false');
    message('Lösung wird freigeschaltet …');
    let bundle;
    try {
      bundle = await loadSolutions();
    } catch {
      message('Die Lösung konnte nicht geladen werden. Verbindung prüfen und nochmals versuchen.', true);
      submit.disabled = false;
      return;
    }
    try {
      const solution = await decryptSolution(id, password, bundle);
      const heading = document.createElement('h4');
      heading.textContent = 'Eine mögliche Lösung';
      heading.tabIndex = -1;
      const explanation = document.createElement('p');
      explanation.textContent = solution.explanation;
      const pre = document.createElement('pre');
      pre.tabIndex = 0;
      pre.setAttribute('aria-label', 'C#-Lösung zu Aufgabe ' + id);
      const code = document.createElement('code');
      code.textContent = solution.code;
      pre.append(code);
      const actions = document.createElement('div');
      actions.className = 'solution-actions';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Code kopieren';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(code.textContent);
          message('Code kopiert.');
        } catch {
          message('Kopieren nicht möglich. Markiere den Code und kopiere ihn manuell.', true);
        }
      });
      const lock = document.createElement('button');
      lock.type = 'button';
      lock.textContent = 'Wieder sperren';
      lock.addEventListener('click', () => {
        content.replaceChildren();
        content.hidden = true;
        form.hidden = false;
        message('Lösung gesperrt.');
        input.focus();
      });
      actions.append(copy, lock);
      content.replaceChildren(heading, pre, explanation, actions);
      content.hidden = false;
      form.hidden = true;
      input.value = '';
      message('Aufgabe ' + id + ' freigeschaltet.');
      heading.focus({ preventScroll: true });
    } catch (error) {
      if (error.name === 'OperationError') {
        message('Dieses Passwort passt nicht zu Aufgabe ' + id + '.', true);
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        input.select();
      } else {
        message('Die Lösung konnte nicht geöffnet werden. Bitte die Seite neu laden.', true);
      }
    } finally {
      submit.disabled = false;
    }
  });
});

function openLinkedExercise() {
  if (!/^#aufgabe-\d{2}$/.test(location.hash)) return;
  const exercise = document.getElementById(location.hash.slice(1));
  if (exercise?.classList.contains('exercise')) {
    exercise.open = true;
    exercise.scrollIntoView({ block: 'start' });
  }
}
window.addEventListener('hashchange', openLinkedExercise);
openLinkedExercise();
