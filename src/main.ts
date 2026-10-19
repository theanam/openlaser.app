import '@fontsource/geist-sans/latin-400.css';
import '@fontsource/geist-sans/latin-500.css';
import '@fontsource/geist-sans/latin-600.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';
import './styles/tokens.css';
import './styles/app.css';
import { mount } from 'svelte';
import App from './app/App.svelte';
import { reportError } from '$lib/ui/errors';

window.addEventListener('error', (event) => reportError(event.error ?? event.message, 'window'));
window.addEventListener('unhandledrejection', (event) => reportError(event.reason, 'promise'));

const app = mount(App, { target: document.getElementById('app')! });

export default app;
