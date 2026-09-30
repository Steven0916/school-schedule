'use strict';

const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');
const submit = document.getElementById('login-submit');
const endpoint = form.dataset.role === 'admin' ? '/api/admin/login' : '/api/schools/login';

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  submit.disabled = true;
  submit.textContent = '登入中…';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: form.username.value.trim(), password: form.password.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '登入失敗，請稍後重試。');
    window.location.replace('/');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
    form.password.value = '';
    submit.disabled = false;
    submit.textContent = '登入';
  }
});
