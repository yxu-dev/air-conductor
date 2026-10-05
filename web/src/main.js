import './style.css';
import { state } from './state.js';
import { renderStatus } from './visuals.js';

// TODO: Wire user actions to serial, audio and camera modules.
renderStatus(document.querySelector('#app'), state);
