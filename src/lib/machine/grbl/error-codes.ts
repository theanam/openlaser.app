/**
 * GRBL 1.1 error and alarm codes. Short names and descriptions follow gnea/grbl
 * doc/csv/error_codes_en_US.csv and alarm_codes_en_US.csv; hints are ours.
 */
export interface GrblCodeInfo {
  code: number;
  name: string;
  description: string;
  /** Short "what to do" advice for the common cases. */
  hint?: string;
}

const ERRORS: GrblCodeInfo[] = [
  {
    code: 1,
    name: 'Expected command letter',
    description: 'G-code words consist of a letter and a value. Letter was not found.',
  },
  {
    code: 2,
    name: 'Bad number format',
    description: 'Missing the expected G-code word value or numeric value format is not valid.',
  },
  {
    code: 3,
    name: 'Invalid statement',
    description: "Grbl '$' system command was not recognized or supported.",
    hint: 'Check the spelling of the $ command. Send $ to list the supported commands.',
  },
  { code: 4, name: 'Value < 0', description: 'Negative value received for an expected positive value.' },
  {
    code: 5,
    name: 'Setting disabled',
    description: 'Homing cycle failure. Homing is not enabled via settings.',
    hint: 'Homing is off ($22=0). Enable it only if the machine has limit switches.',
  },
  { code: 6, name: 'Value < 3 usec', description: 'Minimum step pulse time must be greater than 3usec.' },
  {
    code: 7,
    name: 'EEPROM read fail. Using defaults',
    description: 'An EEPROM read failed. Auto-restoring affected EEPROM to default values.',
    hint: 'Settings were reset to defaults. Check $$ and restore your machine settings.',
  },
  {
    code: 8,
    name: 'Not idle',
    description:
      "Grbl '$' command cannot be used unless Grbl is IDLE. Ensures smooth operation during a job.",
    hint: 'Wait until the machine is idle, then try again.',
  },
  {
    code: 9,
    name: 'G-code lock',
    description: 'G-code commands are locked out during alarm or jog state.',
    hint: 'The machine is in alarm. Home ($H) or unlock ($X) first.',
  },
  {
    code: 10,
    name: 'Homing not enabled',
    description: 'Soft limits cannot be enabled without homing also enabled.',
    hint: 'Enable homing ($22=1) before enabling soft limits ($20=1).',
  },
  {
    code: 11,
    name: 'Line overflow',
    description: 'Max characters per line exceeded. Received command line was not executed.',
    hint: 'Lines must be shorter than 80 characters.',
  },
  {
    code: 12,
    name: 'Step rate > 30kHz',
    description: "Grbl '$' setting value cause the step rate to exceed the maximum supported.",
  },
  {
    code: 13,
    name: 'Check Door',
    description: 'Safety door detected as opened and door state initiated.',
    hint: 'Close the safety door, then resume.',
  },
  {
    code: 14,
    name: 'Line length exceeded',
    description: 'Build info or startup line exceeded EEPROM line length limit. Line not stored.',
  },
  {
    code: 15,
    name: 'Travel exceeded',
    description: 'Jog target exceeds machine travel. Jog command has been ignored.',
    hint: 'The jog would leave the work area. Use a smaller step.',
  },
  {
    code: 16,
    name: 'Invalid jog command',
    description: "Jog command has no '=' or contains prohibited g-code.",
  },
  { code: 17, name: 'Setting disabled', description: 'Laser mode requires PWM output.' },
  {
    code: 20,
    name: 'Unsupported command',
    description: 'Unsupported or invalid g-code command found in block.',
    hint: 'The firmware does not understand this command. Check the G-code or the output settings.',
  },
  {
    code: 21,
    name: 'Modal group violation',
    description: 'More than one g-code command from same modal group found in block.',
  },
  {
    code: 22,
    name: 'Undefined feed rate',
    description: 'Feed rate has not yet been set or is undefined.',
    hint: 'Add an F word (for example F1000) to the first G1/G2/G3 move.',
  },
  {
    code: 23,
    name: 'Invalid gcode ID:23',
    description: 'G-code command in block requires an integer value.',
  },
  {
    code: 24,
    name: 'Invalid gcode ID:24',
    description: 'More than one g-code command that requires axis words found in block.',
  },
  { code: 25, name: 'Invalid gcode ID:25', description: 'Repeated g-code word found in block.' },
  {
    code: 26,
    name: 'Invalid gcode ID:26',
    description:
      'No axis words found in block for g-code command or current modal state which requires them.',
  },
  { code: 27, name: 'Invalid gcode ID:27', description: 'Line number value is invalid.' },
  { code: 28, name: 'Invalid gcode ID:28', description: 'G-code command is missing a required value word.' },
  { code: 29, name: 'Invalid gcode ID:29', description: 'G59.x work coordinate systems are not supported.' },
  { code: 30, name: 'Invalid gcode ID:30', description: 'G53 only allowed with G0 and G1 motion modes.' },
  {
    code: 31,
    name: 'Invalid gcode ID:31',
    description: 'Axis words found in block when no command or current modal state uses them.',
  },
  {
    code: 32,
    name: 'Invalid gcode ID:32',
    description: 'G2 and G3 arcs require at least one in-plane axis word.',
  },
  { code: 33, name: 'Invalid gcode ID:33', description: 'Motion command target is invalid.' },
  { code: 34, name: 'Invalid gcode ID:34', description: 'Arc radius value is invalid.' },
  {
    code: 35,
    name: 'Invalid gcode ID:35',
    description: 'G2 and G3 arcs require at least one in-plane offset word.',
  },
  { code: 36, name: 'Invalid gcode ID:36', description: 'Unused value words found in block.' },
  {
    code: 37,
    name: 'Invalid gcode ID:37',
    description: 'G43.1 dynamic tool length offset is not assigned to configured tool length axis.',
  },
  { code: 38, name: 'Invalid gcode ID:38', description: 'Tool number greater than max supported value.' },
];

const ALARMS: GrblCodeInfo[] = [
  {
    code: 1,
    name: 'Hard limit',
    description:
      'Hard limit has been triggered. Machine position is likely lost due to sudden halt. Re-homing is highly recommended.',
    hint: 'A limit switch was hit. Reset, unlock, then home the machine before running again.',
  },
  {
    code: 2,
    name: 'Soft limit',
    description:
      'Soft limit alarm. G-code motion target exceeds machine travel. Machine position retained. Alarm may be safely unlocked.',
    hint: 'The job goes outside the work area. Unlock, then move the design inside the bed.',
  },
  {
    code: 3,
    name: 'Abort during cycle',
    description:
      'Reset while in motion. Machine position is likely lost due to sudden halt. Re-homing is highly recommended.',
    hint: 'Position may be lost. Home ($H) or unlock ($X) to continue.',
  },
  {
    code: 4,
    name: 'Probe fail',
    description:
      'Probe fail. Probe is not in the expected initial state before starting probe cycle when G38.2 and G38.3 is not triggered and G38.4 and G38.5 is triggered.',
  },
  {
    code: 5,
    name: 'Probe fail',
    description:
      'Probe fail. Probe did not contact the workpiece within the programmed travel for G38.2 and G38.4.',
  },
  {
    code: 6,
    name: 'Homing fail',
    description: 'Homing fail. The active homing cycle was reset.',
    hint: 'Homing was interrupted. Run homing again.',
  },
  {
    code: 7,
    name: 'Homing fail',
    description: 'Homing fail. Safety door was opened during homing cycle.',
    hint: 'Close the safety door and run homing again.',
  },
  {
    code: 8,
    name: 'Homing fail',
    description:
      'Homing fail. Pull off travel failed to clear limit switch. Try increasing pull-off setting or check wiring.',
    hint: 'Increase the pull-off distance ($27) or check the limit switch wiring.',
  },
  {
    code: 9,
    name: 'Homing fail',
    description:
      'Homing fail. Could not find limit switch within search distances. Try increasing max travel, decreasing pull-off distance, or check wiring.',
    hint: 'A limit switch was not found. Check the switch wiring and $130/$131, then home again.',
  },
];

export const GRBL_ERRORS: ReadonlyMap<number, GrblCodeInfo> = new Map(ERRORS.map((e) => [e.code, e]));
export const GRBL_ALARMS: ReadonlyMap<number, GrblCodeInfo> = new Map(ALARMS.map((a) => [a.code, a]));

/** Alarms after which GRBL prints "[MSG:Reset to continue]" and ignores input until a reset. */
export const CRITICAL_ALARMS: ReadonlySet<number> = new Set([1, 2]);

export function describeError(code: number): GrblCodeInfo {
  return GRBL_ERRORS.get(code) ?? { code, name: `Error ${code}`, description: `Unknown error code ${code}.` };
}

export function describeAlarm(code: number): GrblCodeInfo {
  return GRBL_ALARMS.get(code) ?? { code, name: `Alarm ${code}`, description: `Unknown alarm code ${code}.` };
}

/** One-line message for state and events: "Undefined feed rate: Feed rate has not yet been set…". */
export function errorMessage(code: number): string {
  const info = describeError(code);
  return `${info.name}: ${info.description}`;
}

export function alarmMessage(code: number): string {
  const info = describeAlarm(code);
  return `${info.name}: ${info.description}`;
}
