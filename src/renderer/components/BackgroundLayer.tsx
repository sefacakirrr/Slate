import { useThemeStore } from '@renderer/stores/themeStore'

export function BackgroundLayer() {
  const backgroundImage = useThemeStore((s) => s.backgroundImage)
  const backgroundOpacity = useThemeStore((s) => s.backgroundOpacity)

  if (!backgroundImage) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        opacity: backgroundOpacity,
      }}
    />
  )
}
