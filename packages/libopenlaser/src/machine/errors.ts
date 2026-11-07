/** Rejection reason for queued commands discarded by a soft reset (SPEC §7.2). */
export class ResetError extends Error {
  constructor(message = 'Command discarded by a machine reset') {
    super(message);
    this.name = 'ResetError';
  }
}

export class DisconnectedError extends Error {
  constructor(message = 'Machine is not connected') {
    super(message);
    this.name = 'DisconnectedError';
  }
}

/** A manual command was attempted while a job owns the stream. */
export class MachineBusyError extends Error {
  constructor(message = 'A job is running; manual commands are disabled until it ends') {
    super(message);
    this.name = 'MachineBusyError';
  }
}

/** The machine answered `error:N` to a command that the caller needed to succeed. */
export class CommandError extends Error {
  constructor(
    readonly code: number,
    readonly grblMessage: string,
    readonly line: string,
  ) {
    super(`${line}: error ${code}: ${grblMessage}`);
    this.name = 'CommandError';
  }
}

export class HandshakeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandshakeError';
  }
}

export class JobStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobStartError';
  }
}
