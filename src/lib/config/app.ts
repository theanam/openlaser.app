/** Single source for the product name and identity. Never hard-code these elsewhere. */
export const APP_NAME = 'openlaser';
export const APP_DOMAIN = 'openlaser.app';
export const APP_URL = 'https://openlaser.app';
export const APP_TAGLINE = 'Laser control in your browser. Free, open source, and it works offline.';
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

export const REPO_URL = 'https://github.com/theanam/openlaser.app';
export const ISSUES_URL = `${REPO_URL}/issues`;
export const CONTACT_EMAIL = 'anam.ahmed.a@gmail.com';

/** Project files: a zip with `project.json` and `assets/`. */
export const PROJECT_EXTENSION = '.olaser';
export const PROJECT_MIME = 'application/x-openlaser-project';
/** Machine profiles are plain JSON files. */
export const MACHINE_EXTENSION = '.json';

export const GCODE_EXTENSIONS = ['.gcode', '.nc', '.gc', '.ngc', '.txt'] as const;
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.bmp', '.gif'] as const;
