import logoUrl from '@renderer/assets/logo.ico'

/** The Slate app logo (`resources/icon.ico`, copied into renderer assets). */
export function Logo({ className }: { className?: string }) {
  return <img src={logoUrl} alt="Slate logo" className={className} draggable={false} />
}
