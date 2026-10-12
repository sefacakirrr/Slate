import type { editor as en } from '../en/editor'
import type { Shape } from '../translate'

export const editor: Shape<typeof en> = {
  toolbar: {
    bold: 'Kalın ({shortcut})',
    italic: 'İtalik ({shortcut})',
    underline: 'Altı çizili ({shortcut})',
    strikethrough: 'Üstü çizili',
    inlineCode: 'Satır içi kod',
    toggleChecklist: 'Yapılacaklar listesini aç/kapat',
    alignLeft: 'Sola hizala ({shortcut})',
    alignCenter: 'Ortala ({shortcut})',
    alignRight: 'Sağa hizala ({shortcut})',
    textColor: 'Metin rengi',
    backgroundColor: 'Arka plan rengi',
    fontSize: 'Yazı boyutu',
    clearFormatting: 'Tüm biçimlendirmeyi kaldır',
    backgroundSwatch: 'Arka plan: {color}',
    textSwatch: 'Metin: {color}',
    backgroundSwatchLabel: 'Arka plan {color}',
    textSwatchLabel: 'Metin rengi {color}',
  },
  colors: {
    yellow: 'sarı',
    orange: 'turuncu',
    red: 'kırmızı',
    pink: 'pembe',
    purple: 'mor',
    blue: 'mavi',
    teal: 'camgöbeği',
    green: 'yeşil',
    gray: 'gri',
    white: 'beyaz',
  },
  attachments: {
    pastedFile: 'Yapıştırılan dosya',
    tooLarge: '"{name}" 10 MB ek sınırını aşıyor.',
    attachFailed: '"{name}" eklenemedi.',
  },
  image: {
    notFound: 'Görsel bulunamadı: {name}',
    fallbackName: 'ek',
    resizeHandle: 'Yeniden boyutlandırmak için sürükle — sıfırlamak için görsele çift tıkla',
  },
  themes: {
    defaultDark: 'Varsayılan koyu',
    defaultLight: 'Varsayılan açık',
  },
}
