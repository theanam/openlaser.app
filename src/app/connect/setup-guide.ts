/** Picture-led steps for each Blocker: what to click, in order, with anything to copy. */
import { APP_URL } from '$lib/config/app';
import { BROWSER_NAMES, type Blocker, type DeviceOs } from './browser-check';

export type SetupArt =
  | 'copy'
  | 'paste'
  | 'flag'
  | 'relaunch'
  | 'toggle'
  | 'permission'
  | 'terminal'
  | 'retry'
  | 'browser'
  | 'computer';

export interface SetupStep {
  art: SetupArt;
  title: string;
  detail?: string;
  /** Text to copy: an address or a command. */
  code?: string;
  links?: Array<{ label: string; href: string }>;
}

export interface SetupGuide {
  title: string;
  lead: string;
  steps: SetupStep[];
  /** The fix applies without a restart, so Connect can be tried straight from the guide. */
  retry: boolean;
}

export const CHROME_DOWNLOAD = 'https://www.google.com/chrome/';
export const EDGE_DOWNLOAD = 'https://www.microsoft.com/edge/download';
const DOWNLOADS = [
  { label: 'Get Chrome', href: CHROME_DOWNLOAD },
  { label: 'Get Edge', href: EDGE_DOWNLOAD },
];

const MEDIUM = { usb: 'USB', bluetooth: 'Bluetooth' } as const;

const RETRY: SetupStep = {
  art: 'retry',
  title: 'Press Connect again',
  detail: 'Keep the laser switched on and within a few metres.',
};

function adapterSteps(os: DeviceOs, name: string): SetupStep[] {
  switch (os) {
    case 'mac':
      return [
        { art: 'toggle', title: 'Turn on Bluetooth', detail: 'Control Centre in the menu bar → Bluetooth.' },
        {
          art: 'permission',
          title: `Let ${name} use Bluetooth`,
          detail: `System Settings → Privacy & Security → Bluetooth, then switch on ${name}.`,
        },
        { ...RETRY, title: `Restart ${name} and press Connect again` },
      ];
    case 'windows':
      return [
        {
          art: 'toggle',
          title: 'Turn on Bluetooth',
          detail: 'Start → Settings → Bluetooth & devices, then switch Bluetooth on.',
          links: [{ label: 'Open Bluetooth settings', href: 'ms-settings:bluetooth' }],
        },
        RETRY,
      ];
    case 'linux':
      return [
        {
          art: 'toggle',
          title: 'Turn on Bluetooth',
          detail: 'In system settings, or unblock it in a terminal:',
          code: 'rfkill unblock bluetooth',
        },
        {
          art: 'terminal',
          title: 'Start the Bluetooth service',
          code: 'sudo systemctl enable --now bluetooth',
        },
        RETRY,
      ];
    case 'chromeos':
      return [
        {
          art: 'toggle',
          title: 'Turn on Bluetooth',
          detail: 'Click the clock at the bottom right → Bluetooth.',
        },
        RETRY,
      ];
    case 'android':
    case 'ios':
      return [
        {
          art: 'toggle',
          title: 'Turn on Bluetooth',
          detail: 'Swipe down from the top of the screen → Bluetooth.',
        },
        {
          art: 'permission',
          title: `Let ${name} find nearby devices`,
          detail: `Tap Allow when asked, or Settings → Apps → ${name} → Permissions → Nearby devices.`,
        },
        RETRY,
      ];
  }
}

export function setupGuide(blocker: Blocker): SetupGuide {
  const name = BROWSER_NAMES[blocker.browser];
  const Name = name.charAt(0).toUpperCase() + name.slice(1);
  if (blocker.kind === 'flag') {
    const steps: SetupStep[] = [
      { art: 'copy', title: 'Copy this address', code: blocker.address },
      {
        art: 'paste',
        title: 'Paste it into the address bar and press Enter',
        detail: 'Browser settings pages open only from the address bar.',
      },
      {
        art: 'flag',
        title: `Set “${blocker.flag}” to Enabled`,
        detail: 'It is highlighted at the top of the page.',
      },
      {
        art: 'relaunch',
        title: 'Click Relaunch',
        detail: `${Name} restarts with your tabs. Then press Connect again.`,
      },
    ];
    if (blocker.os === 'linux') {
      steps.push({
        art: 'terminal',
        title: 'Still nothing? Start the Bluetooth service',
        code: 'sudo systemctl enable --now bluetooth',
      });
    }
    return {
      title: `Turn on Bluetooth in ${name}`,
      lead: `${Name} can reach Bluetooth lasers once one setting is on.`,
      steps,
      retry: false,
    };
  }
  if (blocker.kind === 'adapter') {
    return {
      title: 'Turn on Bluetooth',
      lead: 'The computer’s Bluetooth is off or blocked.',
      steps: adapterSteps(blocker.os, name),
      retry: true,
    };
  }
  const medium = MEDIUM[blocker.method];
  if (blocker.reason === 'device') {
    const phone = blocker.os === 'ios' ? 'iPhone and iPad browsers' : 'Phone browsers';
    return {
      title: 'Use a computer',
      lead: `${phone} can’t reach lasers over ${medium}.`,
      steps: [
        {
          art: 'computer',
          title: 'Open openlaser on a computer',
          detail:
            blocker.os === 'android'
              ? 'Chrome or Edge on Windows, macOS, Linux or ChromeOS. LaserPeckers also connect over Bluetooth here.'
              : 'Chrome or Edge on Windows, macOS, Linux or ChromeOS.',
          code: APP_URL,
        },
      ],
      retry: false,
    };
  }
  if (blocker.reason === 'update') {
    return {
      title: `Update ${name}`,
      lead: `This version of ${name} has no ${medium} access.`,
      steps: [
        { art: 'browser', title: `Update ${name}`, detail: `Menu → Help → About, then relaunch.` },
        { art: 'browser', title: 'Or use Chrome or Edge', links: DOWNLOADS },
      ],
      retry: false,
    };
  }
  return {
    title: 'Use Chrome or Edge',
    lead: `${Name} can’t reach lasers over ${medium}.`,
    steps: [
      { art: 'browser', title: 'Install Chrome or Edge', detail: 'Both are free.', links: DOWNLOADS },
      { art: 'copy', title: 'Open openlaser there', code: APP_URL },
      RETRY,
    ],
    retry: false,
  };
}
