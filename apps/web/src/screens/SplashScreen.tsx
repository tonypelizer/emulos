import styles from "./SplashScreen.module.css";

interface Props {
  onEnter: () => void;
}

export function SplashScreen({ onEnter }: Props) {
  return (
    <main className={styles.root}>
      <div className={styles.inner}>
        <div className={styles.logo} aria-hidden="true">
          <span className={styles.pulse}>♥</span>
        </div>
        <h1 className={styles.wordmark}>EMULOS</h1>
        <p className={styles.tagline}>Clinical Decision Simulation</p>
        <button className={styles.enterBtn} onClick={onEnter} autoFocus>
          Begin
        </button>
        <p className={styles.version}>v0.1.0 — MVP</p>
      </div>
    </main>
  );
}
