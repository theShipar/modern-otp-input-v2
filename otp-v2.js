(() => {
  'use strict';

  const card = document.getElementById('card');
  const field = document.getElementById('field');
  const input = document.getElementById('otp');
  const cells = Array.from(document.querySelectorAll('.cell'));
  const digits = cells.map(cell => cell.querySelector('.digit'));
  const plate = document.getElementById('plate');
  const foot = document.getElementById('foot');
  const chip = document.getElementById('suggest');
  const resend = document.getElementById('resend');
  const secs = document.getElementById('secs');
  const switchBtn = document.getElementById('switch');
  const attN = document.querySelector('.att-n');
  const attVal = document.querySelector('.att-val');
  const attW = document.querySelector('.att-w');
  const attTail = document.querySelector('.att-tail');
  const live = document.getElementById('live');

  const CODE = '204816';
  const LEN = CODE.length;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  let code = '';
  let attempts = 3;
  let seconds = 30;
  let mode = 'idle';      // idle | verify | error | clear | autofill | success | reset
  let focused = false;
  let locked = false;
  let chipTimer = 0;
  let verifyTimer = 0;
  const flow = new Set();

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const later = (ms, fn) => {
    const id = setTimeout(() => { flow.delete(id); fn(); }, ms);
    flow.add(id);
    return id;
  };
  const clearFlow = () => {
    flow.forEach(clearTimeout);
    flow.clear();
    clearTimeout(verifyTimer);
    clearTimeout(chipTimer);
  };
  const announce = message => {
    live.textContent = '';
    setTimeout(() => { live.textContent = message; }, 40);
  };
  const sanitize = value => value.replace(/\D+/g, '').slice(0, LEN);
  const copyState = () => card.dataset.copy;

  /* ── Copy + footer variant ───────────────────────────── */

  function setCopy(next) {
    card.dataset.copy = next;
  }

  function updateChip() {
    clearTimeout(chipTimer);
    const allowed = focused && !locked && code.length === 0 && attempts > 0 && copyState() !== 'success';
    if (!allowed) {
      foot.classList.remove('chip');
      return;
    }
    chipTimer = setTimeout(() => {
      if (focused && !locked && code.length === 0 && attempts > 0 && copyState() !== 'success') {
        foot.classList.add('chip');
      }
    }, 120);
  }

  /* ── Sliding plate spring ────────────────────────────── */

  let sx = 0, sv = 0, tx = 0, lastT = 0, rafId = 0;

  const paintPlate = () => {
    plate.style.transform = `translateX(${sx.toFixed(2)}px)`;
  };

  function springTo(x) {
    tx = x;
    if (reduce.matches) {
      sx = x;
      sv = 0;
      paintPlate();
      return;
    }
    if (!rafId) {
      lastT = performance.now();
      rafId = requestAnimationFrame(stepSpring);
    }
  }

  function stepSpring(now) {
    const dt = Math.min((now - lastT) / 1000, 0.033);
    lastT = now;
    const k = 240;
    const c = 31;
    sv += (-k * (sx - tx) - c * sv) * dt;
    sx += sv * dt;
    if (Math.abs(sx - tx) < 0.3 && Math.abs(sv) < 0.8) {
      sx = tx;
      sv = 0;
      paintPlate();
      rafId = 0;
      return;
    }
    paintPlate();
    rafId = requestAnimationFrame(stepSpring);
  }

  function refreshPlate() {
    const off = mode === 'verify' || mode === 'error' || mode === 'autofill' || mode === 'success' || mode === 'reset';
    const show = focused && !off && code.length < LEN && attempts > 0;
    plate.classList.toggle('show', show);
    const idx = Math.min(code.length, LEN - 1);
    cells.forEach((cell, i) => cell.classList.toggle('at', show && i === idx));
    if (!show) return;

    const cell = cells[idx];
    plate.style.width = `${cell.offsetWidth}px`;
    plate.classList.toggle('has-caret', mode === 'idle' || mode === 'clear');
    springTo(cell.offsetLeft);
  }

  /* ── Digit animations ────────────────────────────────── */

  function digitIn(digit, delay = 0) {
    digit.getAnimations().forEach(animation => animation.cancel());
    if (reduce.matches) return;
    digit.animate(
      [
        { opacity: 0, filter: 'blur(6px)' },
        { opacity: 1, filter: 'blur(0px)' }
      ],
      { duration: 190, delay, easing: 'cubic-bezier(.22,.7,.24,1)', fill: 'both' }
    );
  }

  function digitOut(digit, delay = 0) {
    digit.getAnimations().forEach(animation => animation.cancel());
    if (reduce.matches) {
      digit.style.opacity = '0';
      digit.style.filter = 'blur(4px)';
      return Promise.resolve();
    }
    return digit.animate(
      [
        { opacity: 1, filter: 'blur(0px)' },
        { opacity: 0, filter: 'blur(7px)' }
      ],
      { duration: 170, delay, easing: 'ease-in', fill: 'forwards' }
    ).finished.catch(() => {});
  }

  function clearDigit(digit) {
    digit.textContent = '';
    digit.style.opacity = '';
    digit.style.filter = '';
    digit.getAnimations().forEach(animation => animation.cancel());
  }

  /* ── Typing ──────────────────────────────────────────── */

  function applyValue(raw) {
    const next = sanitize(raw);
    if (next === code) {
      input.value = code;
      return;
    }
    if (attempts === 0) {
      input.value = code;
      return;
    }

    const oldLength = code.length;
    if (copyState() === 'error') setCopy('idle');

    code = next;
    input.value = next;
    try { input.setSelectionRange(next.length, next.length); } catch (e) { /* no-op */ }

    if (next.length > oldLength) {
      for (let i = oldLength; i < next.length; i++) {
        digits[i].textContent = next[i];
        cells[i].classList.add('filled');
        digitIn(digits[i], (i - oldLength) * 55);
      }
    }

    if (next.length < oldLength) {
      for (let i = next.length; i < oldLength; i++) {
        cells[i].classList.remove('filled');
        const digit = digits[i];
        digitOut(digit).then(() => {
          if (!code[i]) clearDigit(digit);
        });
      }
    }

    for (let i = 0; i < Math.min(next.length, oldLength); i++) {
      if (digits[i].textContent !== next[i]) {
        digits[i].textContent = next[i];
        cells[i].classList.add('filled');
        digitIn(digits[i]);
      }
    }

    refreshPlate();
    updateChip();

    if (next.length === LEN && !locked) {
      scheduleVerify(180 + Math.max(0, next.length - oldLength - 1) * 45);
    }
  }

  input.addEventListener('focus', () => {
    focused = true;
    try { input.setSelectionRange(code.length, code.length); } catch (e) { /* no-op */ }
    refreshPlate();
    updateChip();
  });

  input.addEventListener('blur', () => {
    focused = false;
    refreshPlate();
    updateChip();
  });

  input.addEventListener('input', event => {
    if (locked || attempts === 0) {
      event.target.value = code;
      return;
    }
    const value = sanitize(event.target.value);
    event.target.value = value;
    applyValue(value);
  });

  /* ── Verification ────────────────────────────────────── */

  function scheduleVerify(delay) {
    clearTimeout(verifyTimer);
    verifyTimer = setTimeout(() => {
      if (!locked && code.length === LEN && mode === 'idle') verify();
    }, delay);
  }

  async function verify() {
    locked = true;
    mode = 'verify';
    input.readOnly = true;
    clearTimeout(chipTimer);
    foot.classList.remove('chip');
    refreshPlate();
    announce('Verifying code.');

    if (!reduce.matches) {
      digits.forEach((digit, i) => {
        digit.animate(
          [
            { opacity: 1, filter: 'blur(0px)', offset: 0 },
            { opacity: .06, filter: 'blur(5px)', offset: .48 },
            { opacity: 1, filter: 'blur(0px)', offset: 1 }
          ],
          { duration: 340, delay: i * 90, easing: 'ease-in-out' }
        );
      });
    }

    await wait(reduce.matches ? 450 : (LEN - 1) * 90 + 340 + 70);
    if (mode !== 'verify') return;

    if (code === CODE) succeed();
    else fail();
  }

  async function succeed() {
    mode = 'success';
    setCopy('success');
    cells.forEach(cell => cell.classList.add('ok'));
    foot.classList.remove('chip');
    refreshPlate();
    announce('Verified. Welcome back, Abtahi.');

    await wait(200);
    if (mode !== 'success') return;

    digits.forEach((digit, i) => {
      if (reduce.matches) {
        digit.style.opacity = '0';
        return;
      }
      digit.animate(
        [
          { opacity: 1, filter: 'blur(0px)' },
          { opacity: 0, filter: 'blur(6px)' }
        ],
        { duration: 230, delay: i * 22, easing: 'ease-in', fill: 'forwards' }
      );
    });

    await wait(300);
    if (mode !== 'success') return;
    field.dataset.phase = 'merging';

    await wait(260);
    if (mode !== 'success') return;
    field.dataset.phase = 'pill';

    code = '';
    input.value = '';
  }

  function renderAttempts(n, animate) {
    card.dataset.att = String(n);
    if (animate && n > 0 && !reduce.matches) {
      const ghost = document.createElement('span');
      ghost.className = 'att-ghost';
      ghost.textContent = attVal.textContent;
      attN.appendChild(ghost);
      attVal.textContent = String(n);
      ghost.animate(
        [
          { opacity: 1, filter: 'blur(0px)' },
          { opacity: 0, filter: 'blur(5px)' }
        ],
        { duration: 240, easing: 'ease-in', fill: 'forwards' }
      ).onfinish = () => ghost.remove();
      attVal.animate(
        [
          { opacity: 0, filter: 'blur(5px)' },
          { opacity: 1, filter: 'blur(0px)' }
        ],
        { duration: 280, easing: 'ease-out' }
      );
    } else {
      attVal.textContent = n > 0 ? String(n) : '0';
    }
    attW.textContent = 'attempts';
    attTail.textContent = 'left';
  }

  function fail() {
    mode = 'error';
    cells.forEach(cell => {
      if (cell.classList.contains('filled')) cell.classList.add('err');
    });
    renderAttempts(attempts, false);
    setCopy('error');
    announce(`Incorrect code. ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'} left.`);

    later(450, () => {
      attempts = Math.max(0, attempts - 1);
      renderAttempts(attempts, true);
      if (attempts === 0) {
        announce('Too many attempts.');
        seconds = 0;
        secs.textContent = '0';
        resend.disabled = false;
        resend.classList.add('ready');
        resend.setAttribute('aria-label', 'Resend code');
      } else {
        announce(`${attempts} ${attempts === 1 ? 'attempt' : 'attempts'} left.`);
      }
    });

    later(720, () => {
      if (mode !== 'error') return;
      mode = 'clear';
      clearCode();
    });
  }

  async function clearCode() {
    const step = 78;

    code = code.slice(0, LEN - 1);
    input.value = code;
    cells[LEN - 1].classList.remove('err', 'filled');
    digitOut(digits[LEN - 1]);
    refreshPlate();

    for (let i = LEN - 2; i >= 0; i--) {
      await wait(step);
      if (mode !== 'clear') return;
      code = code.slice(0, i);
      input.value = code;
      cells[i].classList.remove('err', 'filled');
      digitOut(digits[i]);
      refreshPlate();
    }

    await wait(180);
    if (mode !== 'clear') return;

    digits.forEach(clearDigit);
    cells.forEach(cell => cell.classList.remove('err', 'filled'));
    code = '';
    input.value = '';

    mode = 'idle';
    locked = false;
    input.readOnly = attempts === 0;
    if (attempts === 0) input.blur();
    refreshPlate();
    updateChip();
    announce('Code cleared. You can try again.');
  }

  /* ── Mail suggestion ─────────────────────────────────── */

  async function useSuggestion() {
    if (locked || code.length !== 0 || attempts === 0) return;
    clearTimeout(chipTimer);
    foot.classList.remove('chip');
    if (copyState() === 'error') setCopy('idle');

    mode = 'autofill';
    locked = true;
    input.readOnly = true;
    refreshPlate();

    for (let i = 0; i < LEN; i++) {
      await wait(70);
      if (mode !== 'autofill') return;
      code += CODE[i];
      input.value = code;
      digits[i].textContent = CODE[i];
      cells[i].classList.add('filled');
      digitIn(digits[i]);
      refreshPlate();
    }

    await wait(200);
    if (mode !== 'autofill') return;
    mode = 'idle';
    locked = false;
    input.readOnly = false;
    scheduleVerify(200);
  }

  chip.addEventListener('pointerdown', event => {
    event.preventDefault();
    useSuggestion();
  });

  /* ── Attempts / timer / reset ────────────────────────── */

  function timerTick() {
    if (seconds <= 0) return;
    seconds -= 1;
    if (seconds === 0) {
      resend.disabled = false;
      resend.classList.add('ready');
      resend.setAttribute('aria-label', 'Resend code');
    }
    secs.textContent = String(seconds);
  }

  function resetTimer() {
    seconds = 30;
    secs.textContent = '30';
    resend.classList.remove('ready');
    resend.disabled = true;
    resend.setAttribute('aria-label', 'Resend in 30 seconds');
  }

  resend.addEventListener('click', () => {
    if (resend.disabled) return;
    clearFlow();

    mode = 'idle';
    locked = false;
    input.readOnly = false;
    attempts = 3;
    renderAttempts(3, false);
    setCopy('idle');

    field.dataset.phase = '';
    code = '';
    input.value = '';
    digits.forEach(clearDigit);
    cells.forEach(cell => cell.classList.remove('err', 'ok', 'filled', 'at'));

    resetTimer();
    refreshPlate();
    input.focus({ preventScroll: true });
    updateChip();
    announce('New code sent to abtahi.shipar@gmail.com.');
  });

  function switchAccount() {
    if (mode !== 'success') return;
    clearFlow();
    mode = 'reset';
    locked = true;
    input.readOnly = true;
    setCopy('idle');
    field.dataset.phase = 'reset';
    foot.classList.remove('chip');
    announce('Switched account. Enter the code sent to abtahi.shipar@gmail.com.');

    later(210, () => {
      if (mode !== 'reset') return;
      field.dataset.phase = 'split';
    });

    later(560, () => {
      field.dataset.phase = '';
      digits.forEach(clearDigit);
      cells.forEach(cell => cell.classList.remove('ok', 'err', 'filled', 'at'));
      code = '';
      input.value = '';
      attempts = 3;
      renderAttempts(3, false);
      mode = 'idle';
      locked = false;
      input.readOnly = false;
      input.blur();
      refreshPlate();
      updateChip();
    });
  }

  switchBtn.addEventListener('click', switchAccount);

  /* ── Boot ────────────────────────────────────────────── */

  window.addEventListener('resize', () => {
    if (plate.classList.contains('show')) refreshPlate();
  });

  refreshPlate();
  setInterval(timerTick, 1000);

  if (matchMedia('(pointer: fine)').matches) {
    setTimeout(() => {
      if (!locked && document.visibilityState === 'visible') {
        input.focus({ preventScroll: true });
      }
    }, 420);
  }
})();

(() => {
  const root = document.documentElement;
  const toggle = document.getElementById('theme-toggle');
  let saved; try { saved = localStorage.getItem('otp-theme'); } catch {}
  const system = matchMedia('(prefers-color-scheme: dark)');
  function apply(theme) {
    root.dataset.theme = theme;
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
    toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    toggle.querySelector('span').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  }
  apply(saved || (system.matches ? 'dark' : 'light'));
  toggle.addEventListener('click', () => {
    saved = root.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(saved); try { localStorage.setItem('otp-theme', saved); } catch {}
  });
  system.addEventListener('change', e => { if (!saved) apply(e.matches ? 'dark' : 'light'); });
})();
