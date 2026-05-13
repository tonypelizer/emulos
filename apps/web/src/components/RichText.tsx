import styles from "./RichText.module.css";

interface Props {
  text: string;
  className?: string | undefined;
}

// A line is a section heading if it consists only of uppercase letters,
// digits, spaces, hyphens/dashes, slashes, colons and is 3–60 chars long.
const HEADING_RE = /^[A-Z][A-Z0-9 \-–—\/\.:]{2,59}$/;
const SEPARATOR_RE = /^─{3,}$/;
const BULLET_RE = /^•\s*(.+)$/;

type Block =
  | { kind: "heading"; text: string }
  | { kind: "divider" }
  | { kind: "bullets"; items: string[] }
  | { kind: "para"; text: string };

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  let currentBullets: string[] | null = null;

  const flushBullets = () => {
    if (currentBullets) {
      blocks.push({ kind: "bullets", items: currentBullets });
      currentBullets = null;
    }
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();

    if (!line) {
      flushBullets();
      continue;
    }

    if (SEPARATOR_RE.test(line)) {
      flushBullets();
      blocks.push({ kind: "divider" });
      continue;
    }

    if (HEADING_RE.test(line)) {
      flushBullets();
      blocks.push({ kind: "heading", text: line });
      continue;
    }

    const bullet = line.match(BULLET_RE);
    if (bullet && bullet[1]) {
      if (!currentBullets) currentBullets = [];
      currentBullets.push(bullet[1]);
      continue;
    }

    flushBullets();
    blocks.push({ kind: "para", text: line });
  }

  flushBullets();
  return blocks;
}

/** Renders structured medical case text with headings, dividers, and bullets. */
export function RichText({ text, className }: Props) {
  const blocks = parse(text);

  return (
    <div className={[styles.root, className].filter(Boolean).join(" ")}>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "heading":
            return (
              <h4 key={i} className={styles.heading}>
                {block.text}
              </h4>
            );
          case "divider":
            return <hr key={i} className={styles.divider} />;
          case "bullets":
            return (
              <ul key={i} className={styles.bullets}>
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          case "para":
            return (
              <p key={i} className={styles.para}>
                {block.text}
              </p>
            );
        }
      })}
    </div>
  );
}
