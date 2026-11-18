/**
 * One driver at a time.
 *
 * Keyboard, mouse, touch, and gamepad each bring their own intent.
 * The ship listens to whoever spoke last. A mouse that is merely sitting
 * still is not speaking, so it cannot drag the ship off a key press.
 * The reverse is the same: keys that are up do not cancel a cursor.
 *
 * Analogy: the car has one steering wheel. The passenger putting a hand
 * near it does not turn the car. Grabbing it does.
 */

export type DeviceName = 'keyboard' | 'mouse' | 'touch' | 'gamepad';

export type Scheme = 'auto' | 'keyboard' | 'mouse' | 'touch';

export type MoveIntent = {
  device: DeviceName;
  ax: number;
  ay: number;
  aimX: number;
  aimY: number;
  /** Cursor follow. Stick devices leave this false. */
  useAim: boolean;
  /**
   * True only when this device did something new: a key went down,
   * the pointer actually moved, or a stick left its deadzone.
   * A held pose is not "new". A stationary cursor is not "new".
   */
  engaged: boolean;
};

export type Arbiter = { device: DeviceName };

export type Drive = {
  device: DeviceName;
  ax: number;
  ay: number;
  aimX: number;
  aimY: number;
  /** 'mouse' gets a deadzone. 'keys' accelerates. 'chase' is the bot's full-speed aim. */
  feel: 'keys' | 'mouse' | 'chase';
};

const ORDER: DeviceName[] = ['keyboard', 'touch', 'gamepad', 'mouse'];

function find(parts: MoveIntent[], device: DeviceName): MoveIntent | undefined {
  return parts.find((part) => part.device === device);
}

function asDrive(part: MoveIntent | undefined, device: DeviceName): Drive {
  if (!part) {
    return { device, ax: 0, ay: 0, aimX: 0, aimY: 0, feel: 'keys' };
  }
  return {
    device,
    ax: part.ax,
    ay: part.ay,
    aimX: part.aimX,
    aimY: part.aimY,
    feel: part.useAim ? 'mouse' : 'keys',
  };
}

/**
 * Pick the device that drives this frame.
 * A locked scheme ignores everyone else, including a mouse left on the glass.
 */
export function arbitrate(
  prev: Arbiter,
  parts: MoveIntent[],
  scheme: Scheme
): { arbiter: Arbiter; drive: Drive } {
  if (scheme !== 'auto') {
    const locked = scheme === 'keyboard' ? 'keyboard' : scheme === 'mouse' ? 'mouse' : 'touch';
    return { arbiter: { device: locked }, drive: asDrive(find(parts, locked), locked) };
  }

  let device = prev.device;
  for (const name of ORDER) {
    const part = find(parts, name);
    if (part?.engaged) device = name;
  }
  return { arbiter: { device }, drive: asDrive(find(parts, device), device) };
}
