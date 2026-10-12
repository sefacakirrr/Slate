import type { importer as en } from '../en/importer'
import type { Shape } from '../translate'

export const importer: Shape<typeof en> = {
  title: 'Notları içe aktar',
  pick: {
    intro:
      'Mevcut notlarını Slate’e getir. Orijinal dosyalar asla değiştirilmez — dosyalar kasana kopyalanır.',
    folderTitle: 'Not klasörü',
    folderDescription:
      'Her türlü metin dosyası — Markdown, .txt, HTML, RTF, kod, uzantısız notlar. Alt klasörler korunur.',
    notionTitle: 'Notion dışa aktarımı',
    notionDescription: 'Notion’daki "Export" ile alınan .zip dosyası (Markdown & CSV biçimi)',
    appleNotes:
      'Apple Notes mu? Toplu dışa aktarma özelliği yok — önce {exporter} (Mac App Store) gibi ücretsiz bir araçla notlarını Markdown ya da HTML dosyası olarak dışa aktar, sonra o klasörü buradan içe aktar.',
    exporterName: 'Exporter',
  },
  scanning: 'Kaynak taranıyor…',
  preview: {
    found: {
      one: '{source} içinde {total} not bulundu{details}',
      other: '{source} içinde {total} not bulundu{details}',
    },
    importInto: 'Şuraya aktar',
    vaultRoot: 'Kasanın kökü',
    importButton: { one: '{count} notu içe aktar', other: '{count} notu içe aktar' },
  },
  counts: {
    notion: ' (Notion dışa aktarımı).',
    list: ' ({list}).',
    none: '.',
    md: '{count} Markdown',
    txt: '{count} metin',
    html: '{count} HTML',
    rtf: '{count} RTF',
    other: '{count} diğer düz metin',
  },
  importing: 'İçe aktarılıyor…',
  done: {
    imported: {
      one: '{total} not içe aktarıldı{skipped}. Notlar dizinlendi ve artık aranabilir.',
      other: '{total} not içe aktarıldı{skipped}. Notlar dizinlendi ve artık aranabilir.',
    },
    importedInto: {
      one: '{total} not şu klasöre aktarıldı: {folder}{skipped}. Notlar dizinlendi ve artık aranabilir.',
      other:
        '{total} not şu klasöre aktarıldı: {folder}{skipped}. Notlar dizinlendi ve artık aranabilir.',
    },
    skipped: ' ({count} tanesi atlandı)',
  },
  error: {
    noNotes: 'Bu kaynakta içe aktarılabilecek not bulunamadı.',
    unsupported: 'Bu dosya türü desteklenmiyor — bir .zip dışa aktarımı seç.',
    noVault: 'Henüz bir kasa ayarlanmadı — önce bir kasa klasörü seç.',
    failed: 'İçe aktarma başarısız: {error}',
    tryAgain: 'Tekrar dene',
  },
}
