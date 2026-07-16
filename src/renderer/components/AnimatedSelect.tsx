import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

type AnimatedSelectProps = {
  value: string | number
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  children: React.ReactNode
  className?: string
}

export function AnimatedSelect({ value, onChange, children, className = '' }: AnimatedSelectProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => {
          onChange(e)
          setOpen(false)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`appearance-none pr-8 ${className}`}
      >
        {children}
      </select>
      <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
        <ChevronDown
          size={14}
          className={`text-accent-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </div>
    </div>
  )
}
