import type { capture as en } from '../en/capture'
import type { Shape } from '../translate'

export const capture: Shape<typeof en> = {
  quick: {
    heading: 'Hızlı not',
    draftRestored: 'Kaydedilmemiş taslak geri yüklendi',
    close: 'Kapat',
    placeholder:
      'Hızlıca bir not yaz... (kaydetmek için {mod}+S veya {mod}+Enter, kapatmak için Esc)',
    saveFailed: 'Kaydedilemedi: {error}',
    cancel: 'İptal',
    saving: 'Kaydediliyor...',
    save: 'Kaydet',
  },
  sticky: {
    close: 'Yapışkan notu kapat',
    lockedError: 'Bu not kilitli, burada gösterilemez.',
    genericError: 'Bu not gösterilemiyor.',
    closeButton: 'Kapat',
  },
}
