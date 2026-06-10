import { useEffect, useState } from "react";
import styles from "./BackToTop.module.css";

const SHOW_AFTER_PX = 600;

// Fixed "back to top" button that appears once the page has been scrolled
// past SHOW_AFTER_PX — useful given how tall this page gets once the
// simulation results, Timeline, Fixtures, and Knockout bracket are all shown.
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      className={styles.button}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      title="Back to top"
    >
      ↑
    </button>
  );
}
