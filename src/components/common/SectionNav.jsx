import { useEffect, useState } from "react";
import styles from "./SectionNav.module.css";

const SECTIONS = [
  { id: "outlook", label: "Outlook" },
  { id: "progression", label: "Progression" },
  { id: "timeline", label: "Timeline" },
  { id: "fixtures", label: "Fixtures" },
  { id: "bracket", label: "Bracket" },
  { id: "performance", label: "Performance" },
  { id: "report-card", label: "Report card" },
];

export function SectionNav() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);

  useEffect(() => {
    const elements = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const current = visible.reduce((a, b) =>
          a.boundingClientRect.top >= b.boundingClientRect.top ? a : b
        );
        setActiveId(current.target.id);
      },
      { rootMargin: "-10% 0px -70% 0px", threshold: 0 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <nav className={styles.nav} aria-label="Page sections">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          className={`${styles.item}${activeId === s.id ? ` ${styles.active}` : ""}`}
          aria-current={activeId === s.id ? "true" : undefined}
          onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}
