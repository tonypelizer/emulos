import styles from "./MainMenuScreen.module.css";

interface Props {
  onSelectCases: () => void;
}

export function MainMenuScreen({ onSelectCases }: Props) {
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <span className={styles.logo} aria-hidden="true">
          ♥
        </span>
        <h1 className={styles.title}>EMULOS</h1>
        <p className={styles.subtitle}>Clinical Decision Simulation</p>
      </header>

      <nav className={styles.menu} aria-label="Main menu">
        <button className={styles.menuItem} onClick={onSelectCases} autoFocus>
          <span className={styles.menuIcon} aria-hidden="true">
            📋
          </span>
          <span className={styles.menuLabel}>Patient Cases</span>
          <span className={styles.menuArrow} aria-hidden="true">
            ›
          </span>
        </button>
        <button className={styles.menuItem} disabled aria-disabled="true">
          <span className={styles.menuIcon} aria-hidden="true">
            📂
          </span>
          <span className={styles.menuLabel}>Continue Session</span>
          <span className={styles.menuBadge}>Soon</span>
        </button>
        <button className={styles.menuItem} disabled aria-disabled="true">
          <span className={styles.menuIcon} aria-hidden="true">
            🏆
          </span>
          <span className={styles.menuLabel}>Leaderboard</span>
          <span className={styles.menuBadge}>Soon</span>
        </button>
      </nav>

      <footer className={styles.footer}>
        <p>Emulos v0.1.0 — MVP</p>
      </footer>
    </main>
  );
}
