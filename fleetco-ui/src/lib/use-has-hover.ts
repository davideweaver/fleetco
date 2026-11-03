import { useEffect, useState } from "react";

/**
 * True only on a device with a real hovering pointer — a desktop mouse or trackpad.
 * An iPad reports `hover: none` and `pointer: coarse`, so it gets no tooltips, which
 * is why the collapsed rail is not the default there (see `useRailOpen`).
 */
export function useHasHover() {
  const [hasHover, setHasHover] = useState(
    () => window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const onChange = () => setHasHover(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return hasHover;
}
