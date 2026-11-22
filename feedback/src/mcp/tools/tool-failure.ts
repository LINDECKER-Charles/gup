/**
 * A call the tool refuses for a reason the caller can act on (unknown ID,
 * nothing to change): its message is sent back as the tool's error result.
 * Any other error is logged and answered with an opaque message.
 */
export class ToolFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolFailure";
  }
}
