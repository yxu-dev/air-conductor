import { readiness } from './experience.js';

const steps = ['mode', 'right', 'left', 'ready'];
export class StudioWindows {
  constructor({ root, view, state, supported, onChange }) {
    Object.assign(this, { root, view, state, supported, onChange, step: 'mode', current: null });
    this.dialogs = [...root.querySelectorAll('dialog')];
    this.click = event => {
      const open = event.target.closest('[data-open-window]');
      const close = event.target.closest('[data-close-window]');
      const step = event.target.closest('button[data-setup-step]');
      if (open) this.open(open.dataset.openWindow, undefined, open);
      if (close) this.close();
      if (step && !step.disabled) { this.step = step.dataset.setupStep; this.onChange(); }
    };
    root.addEventListener('click', this.click);
    this.closed = () => {
      if (this.current && !this.view[this.current].open) {
        this.current = null; state.sceneSuspended = false; this.onChange();
      }
    };
    this.cancel = event => { event.preventDefault(); this.close(); };
    this.dialogs.forEach(dialog => dialog.addEventListener('close', this.closed));
    this.dialogs.forEach(dialog => dialog.addEventListener('cancel', this.cancel));
    this.next = () => {
      if (this.step === 'ready' && readiness(state, supported).ready) return this.close();
      if (this.step === 'mode') this.step = state.experienceMode === 'manual' ? 'ready' : 'right';
      else if (this.step === 'right' && state.serialPhase === 'connected' && state.calibrationState === 'ready') this.step = 'left';
      else if (this.step === 'left' && state.cameraReady && state.leftHandBound) this.step = 'ready';
      this.onChange();
    };
    this.back = () => { this.step = this.step === 'ready' && state.experienceMode === 'manual' ? 'mode' : steps[Math.max(0, steps.indexOf(this.step) - 1)]; this.onChange(); };
    view['setup-next'].addEventListener('click', this.next);
    view['setup-back'].addEventListener('click', this.back);
    this.open('settings', 'mode');
  }
  open(name, step, opener) {
    if (!this.view[name]?.matches('dialog')) return;
    if (!this.current) this.returnFocus = opener ?? this.view['open-devices'];
    if (this.current && this.current !== name) this.view[this.current].close();
    this.current = name;
    if (name === 'settings') {
      const ready = readiness(this.state, this.supported);
      this.step = step ?? (ready.ready ? 'ready' : ready.step === 'camera' || ready.step === 'left' ? 'left' : 'mode');
    }
    this.state.sceneSuspended = true;
    if (!this.view[name].open) this.view[name].showModal();
    this.onChange();
  }
  close() {
    if (this.current) this.view[this.current].close();
    this.current = null; this.state.sceneSuspended = false; this.onChange();
    if (this.returnFocus?.getClientRects().length) this.returnFocus.focus({ preventScroll: true });
  }
  refresh() {
    const { state, view } = this;
    const ready = readiness(state, this.supported);
    if (state.experienceMode === 'manual' && ['right', 'left'].includes(this.step)) this.step = 'mode';
    this.root.dataset.setupStep = this.step;
    steps.forEach(step => {
      view[`setup-${step}`].hidden = step !== this.step;
      const button = this.root.querySelector(`[data-setup-step=${step}]`);
      button.setAttribute('aria-current', step === this.step ? 'step' : 'false');
      button.disabled = (state.experienceMode === 'manual' && ['right', 'left'].includes(step)) || (step === 'left' && (state.serialPhase !== 'connected' || state.calibrationState !== 'ready')) || (step === 'ready' && !ready.ready);
    });
    view['setup-back'].hidden = this.step === 'mode';
    view['setup-next'].textContent = this.step === 'ready' ? 'Enter studio' : 'Continue';
    view['setup-next'].disabled = state.performanceBusy || (this.step === 'ready' && !ready.ready) || (this.step === 'right' && (state.serialPhase !== 'connected' || state.calibrationState !== 'ready')) || (this.step === 'left' && (!state.cameraReady || !state.leftHandBound));
    view['ready-summary'].textContent = state.experienceMode === 'manual' ? 'Listen mode is ready. Adjust the tempo and volume as you play.' : ready.ready ? 'Right wrist calibrated. Left hand confirmed. Your studio is ready.' : ready.hint;
    view['mode-current'].textContent = state.experienceMode === 'manual' ? 'Listen' : 'Conduct';
    view['device-dot'].dataset.ready = String(ready.ready);
  }
  dispose() {
    this.dialogs.forEach(dialog => dialog.removeEventListener('close', this.closed));
    this.dialogs.forEach(dialog => dialog.removeEventListener('cancel', this.cancel));
    this.root.removeEventListener('click', this.click);
    this.view['setup-next'].removeEventListener('click', this.next);
    this.view['setup-back'].removeEventListener('click', this.back);
    this.dialogs.forEach(dialog => { if (dialog.open) dialog.close(); });
    this.state.sceneSuspended = false;
  }
}
