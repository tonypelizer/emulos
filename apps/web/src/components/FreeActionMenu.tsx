import styles from "./FreeActionMenu.module.css";

export interface FreeActionItem {
  id: string;
  name: string;
  /** Short descriptor shown right-aligned (e.g. "300 mg PO", "~10 min") */
  meta?: string;
  category: string;
  /** True when already ordered / dispensed / performed */
  done?: boolean;
}

interface Props {
  items: FreeActionItem[];
  onSelect: (id: string) => void;
}

export function FreeActionMenu({ items, onSelect }: Props) {
  if (items.length === 0) {
    return <p className={styles.empty}>No items available.</p>;
  }

  // Group by category, preserving insertion order.
  const groups = new Map<string, FreeActionItem[]>();
  for (const item of items) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category)!.push(item);
  }

  return (
    <div className={styles.root}>
      {[...groups.entries()].map(([category, groupItems]) => (
        <div key={category} className={styles.group}>
          <p className={styles.groupLabel}>{category}</p>
          <ul className={styles.list} role="list">
            {groupItems.map((item) => (
              <li key={item.id}>
                <button
                  className={`${styles.itemBtn} ${item.done ? styles.done : ""}`}
                  onClick={() => onSelect(item.id)}
                  disabled={item.done}
                  aria-pressed={item.done}
                  aria-label={
                    item.done ? `${item.name} — already done` : item.name
                  }
                >
                  <span className={styles.itemName}>{item.name}</span>
                  {item.meta !== undefined && (
                    <span className={styles.itemMeta}>{item.meta}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
