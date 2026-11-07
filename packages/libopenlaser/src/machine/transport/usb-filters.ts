import type { SerialPortFilter } from './web-serial-types';

/** USB-serial chips and boards commonly found in GRBL lasers, for the optional port filter. */
export const COMMON_USB_SERIAL_CHIPS: readonly { usbVendorId: number; name: string }[] = [
  { usbVendorId: 0x1a86, name: 'WCH CH340/CH341/CH9102' },
  { usbVendorId: 0x10c4, name: 'Silicon Labs CP210x' },
  { usbVendorId: 0x0403, name: 'FTDI' },
  { usbVendorId: 0x2341, name: 'Arduino' },
  { usbVendorId: 0x2a03, name: 'Arduino (arduino.org)' },
  { usbVendorId: 0x067b, name: 'Prolific PL2303' },
  { usbVendorId: 0x0483, name: 'STMicroelectronics (STM32 grblHAL boards)' },
  { usbVendorId: 0x303a, name: 'Espressif (ESP32-S2/S3 FluidNC boards)' },
  { usbVendorId: 0x2e8a, name: 'Raspberry Pi (RP2040 grblHAL boards)' },
];

export const COMMON_USB_SERIAL_FILTERS: readonly SerialPortFilter[] = COMMON_USB_SERIAL_CHIPS.map(
  ({ usbVendorId }) => ({ usbVendorId }),
);

const hex4 = (n: number) => n.toString(16).padStart(4, '0');

/** "USB 1a86:7523" style label, or a generic one when the port is not USB. */
export function describePort(info: { usbVendorId?: number; usbProductId?: number }): string {
  if (info.usbVendorId === undefined) return 'Serial port';
  const chip = COMMON_USB_SERIAL_CHIPS.find((c) => c.usbVendorId === info.usbVendorId);
  const ids = `USB ${hex4(info.usbVendorId)}:${hex4(info.usbProductId ?? 0)}`;
  return chip ? `${ids} (${chip.name})` : ids;
}
