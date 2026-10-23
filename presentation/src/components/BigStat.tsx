import './BigStat.css'

/** A 160px mono figure with a 24px mono label beneath it. */
export function BigStat({ value, label, className = '' }: { value: string; label: string; className?: string }) {
  return (
    <div className={`bigstat ${className}`}>
      <div className="bigstat-figure mono">{value}</div>
      <div className="bigstat-label mono">{label}</div>
    </div>
  )
}
