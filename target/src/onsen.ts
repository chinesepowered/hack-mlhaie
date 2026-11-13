/** A soak reservation at the capybara onsen. Minutes count from opening time. */
export interface Booking {
  guest: string;
  startMinute: number;
  durationMinutes: number;
}

/** The minute the soak ends. The end minute itself is not part of the soak. */
export function soakEndsAt(booking: Booking): number {
  return booking.startMinute + booking.durationMinutes;
}

/** Whether the guest is in the water at `nowMinute`. */
export function isSoaking(booking: Booking, nowMinute: number): boolean {
  return nowMinute >= booking.startMinute && nowMinute <= soakEndsAt(booking);
}
