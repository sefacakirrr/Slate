import { useThemeStore } from '@renderer/stores/themeStore'

export function BackgroundLayer() {
  const backgroundImage = useThemeStore((s) => s.backgroundImage)
  const backgroundOpacity = useThemeStore((s) => s.backgroundOpacity)
  const backgroundPosition = useThemeStore((s) => s.backgroundPosition)
  const backgroundScale = useThemeStore((s) => s.backgroundScale)

  if (!backgroundImage) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 bg-no-repeat"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: `${backgroundScale}%`,
        backgroundPosition: `center ${backgroundPosition}%`,
        opacity: backgroundOpacity,
      }}
    />
  )
}
