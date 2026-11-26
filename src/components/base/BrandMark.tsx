import clsx from 'clsx'
import styles from './BrandMark.module.css'

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return <span aria-hidden="true" className={clsx(styles.brand, compact && styles.compact, className)} />
}
