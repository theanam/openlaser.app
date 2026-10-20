/** "Laser not showing up?" walkthrough: power, cable, driver (per platform), then the last checks. */
import type { DesktopPlatform } from '../lib/platform';

/** A line of guidance: plain text, optionally with a command to copy or links to follow. */
export interface HelpLine {
  text: string;
  code?: string;
  links?: Array<{ label: string; href: string }>;
}

export const CH340_WINDOWS = 'https://www.wch-ic.com/downloads/CH341SER_EXE.html';
export const CH340_MAC = 'https://www.wch-ic.com/downloads/CH34XSER_MAC_ZIP.html';
export const CP210X = 'https://www.silabs.com/developer-tools/usb-to-uart-bridge-vcp-drivers';

export const POWER: HelpLine[] = [
  { text: 'Switch the laser on and check that the controller board’s light is lit.' },
  { text: 'Many lasers stay hidden from the computer until the board has power, even with USB plugged in.' },
  { text: 'Lasers with a separate power brick: check both ends of the power cable.' },
];

export const USB: HelpLine[] = [
  { text: 'Use the cable that came with the laser. Charge-only cables carry no data.' },
  {
    text: 'Plug straight into the computer while troubleshooting. Hubs and docks often drop serial devices.',
  },
  { text: 'Try another USB port, and give the laser a few seconds after plugging in.' },
];

export const BLUETOOTH: HelpLine[] = [
  { text: 'Pair the laser in your system’s Bluetooth settings first.' },
  { text: 'Paired Bluetooth serial devices then appear in the port list (Chrome or Edge 117 and later).' },
  { text: 'USB is steadier for long jobs. Wi-Fi connections are unsupported; use USB or Bluetooth.' },
];

export const PLATFORM_LABELS: Record<DesktopPlatform, string> = {
  windows: 'Windows',
  mac: 'macOS',
  linux: 'Linux',
  chromeos: 'ChromeOS',
};

export const DRIVERS: Record<DesktopPlatform, HelpLine[]> = {
  windows: [
    { text: 'Right-click Start and open Device Manager, then plug in the laser.' },
    {
      text: 'Under Ports (COM & LPT), an entry like “USB-SERIAL CH340” or “Silicon Labs CP210x” means the driver is ready.',
    },
    {
      text: 'Listed under Other devices with a warning sign? Install the driver for its chip:',
      links: [
        { label: 'CH340 / CH341 driver (WCH)', href: CH340_WINDOWS },
        { label: 'CP210x driver (Silicon Labs)', href: CP210X },
      ],
    },
    { text: 'Run the installer, unplug the laser, plug it back in and reload this page.' },
  ],
  mac: [
    { text: 'CH340 and CH9102 chips work out of the box on macOS 11 and later.' },
    {
      text: 'Check the chip: Apple menu → About This Mac → More Info → System Report → USB.',
    },
    {
      text: 'CP210x boards and older macOS need a driver:',
      links: [
        { label: 'CP210x driver (Silicon Labs)', href: CP210X },
        { label: 'CH34x driver (WCH)', href: CH340_MAC },
      ],
    },
    {
      text: 'After installing, open System Settings → Privacy & Security, click Allow next to the driver and restart.',
    },
    {
      text: 'Check in Terminal: a usbserial, wchusbserial or SLAB_USBtoUART entry is your laser.',
      code: 'ls /dev/cu.*',
    },
  ],
  linux: [
    {
      text: 'Drivers ship with the kernel. With the laser plugged in, its port shows here:',
      code: 'ls /dev/ttyUSB* /dev/ttyACM*',
    },
    {
      text: 'Give yourself access to serial ports, then log out and back in (Arch and Fedora: the uucp group).',
      code: 'sudo usermod -aG dialout $USER',
    },
    {
      text: 'Ubuntu and Debian: the braille service brltty grabs CH340 ports. Remove it unless you use a braille display.',
      code: 'sudo apt remove brltty',
    },
    {
      text: 'Watch the kernel log while plugging in; look for ch341 or cp210x lines.',
      code: 'sudo dmesg -w',
    },
  ],
  chromeos: [
    { text: 'Drivers are built in. Plug in the laser and allow the USB device if ChromeOS asks.' },
    {
      text: 'Run openlaser in the main Chrome browser. Apps in the Linux container get no access to these ports.',
    },
  ],
};

export const LAST_CHECKS: HelpLine[] = [
  {
    text: 'Close LightBurn, LaserGRBL, Arduino IDE and other apps that talk to the laser. A port opens in one app at a time.',
  },
  { text: 'Restart the browser after installing a driver.' },
  { text: 'Use Chrome, Edge, Opera or Brave on a desktop computer. Machine control needs Web Serial.' },
  { text: 'Unplug the laser, wait five seconds and plug it back in.' },
];
