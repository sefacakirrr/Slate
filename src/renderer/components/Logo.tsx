import logoUrl from '@renderer/assets/logo.ico'
import { useT } from '@renderer/i18n'

/** The Slate app logo (`resources/icon.ico`, copied into renderer assets). */
export function Logo({ className }: { className?: string }) {
  const t = useT()
  return <img src={logoUrl} alt={t('app.logoAlt')} className={className} draggable={false} />
}
