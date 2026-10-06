/** Polite aria-live region: screen readers announce score changes without moving focus. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div className="visually-hidden" aria-live="polite" aria-atomic="true" data-testid="live-region">
      {message}
    </div>
  );
}
