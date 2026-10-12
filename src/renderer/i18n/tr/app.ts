import type { app as en } from '../en/app'
import type { Shape } from '../translate'

export const app: Shape<typeof en> = {
  logoAlt: 'Slate logosu',
  titleBar: {
    minimize: 'Simge durumuna küçült',
    maximize: 'Ekranı kapla',
    restore: 'Önceki boyuta getir',
    close: 'Kapat',
  },
  emptyState: {
    heading: 'Kasa seçilmedi',
    body: 'Kasa olarak kullanmak için bir klasör seç. Slate Markdown dosyalarını orada okur ve yazar.',
    chooseFolder: 'Klasör seç',
  },
  contentPane: {
    selectNote: 'Görüntülemek için bir not seç.',
    external: 'Harici',
    lockedHeading: 'Bu not kilitli',
    lockedBody: 'Görüntülemek ve düzenlemek için kasa parolasını gir.',
    unlock: 'Kilidi aç',
  },
  confirmDialog: {
    cancel: 'İptal',
    confirm: 'Sil',
    discard: 'Kaydetme',
  },
  unsavedClose: {
    title: 'Kaydedilmemiş değişiklikler',
    message: '"{name}" notunda kaydedilmemiş değişiklikler var. Kapatmadan önce kaydedilsin mi?',
    save: 'Kaydet',
    discard: 'Kaydetme',
  },
  quit: {
    title: 'Kaydedilmemiş değişikliklerle çıkılsın mı?',
    message: {
      one: 'Kaydedilmemiş {count} not var. Yine de çıkılsın mı?',
      other: 'Kaydedilmemiş {count} not var. Yine de çıkılsın mı?',
    },
    confirm: 'Çık',
  },
  saveConflict: {
    title: 'Dosya diskte değişti',
    message:
      '"{name}" dosyası, Slate son yüklediğinden beri başka bir program tarafından değiştirildi. Kendi sürümünle üzerine yazmak mı, yoksa diskteki sürümü yeniden yükleyip düzenlemelerini atmak mı istersin?',
    overwrite: 'Üzerine yaz',
    reload: 'Yeniden yükle',
  },
  unlock: {
    cancel: 'İptal',
    ariaSet: 'Kasa parolası belirle',
    ariaUnlock: 'Kasanın kilidini aç',
    headingSet: 'Bir kasa parolası belirle',
    headingUnlock: 'Kasanın kilidini aç',
    introSet: 'Bu parola, kilitlediğin notları şifreler. Hiçbir yerde saklanmaz.',
    introUnlock: 'Bu oturumda kilitli notları açmak için kasa parolanı gir.',
    noRecoveryStrong: 'Kurtarma yolu yok.',
    noRecoveryBody:
      'Bu parolayı unutursan, onunla kilitlediğin notlar sonsuza dek kaybolur — sıfırlama yok, arka kapı yok.',
    passwordPlaceholder: 'Kasa parolası',
    confirmPlaceholder: 'Parolayı onayla',
    hintPlaceholder: 'Parola ipucu (isteğe bağlı)',
    mismatch: 'Parolalar eşleşmiyor.',
    hintLabel: 'İpucu:',
    acknowledge: 'Parolayı unutursam kilitli notlarımın kurtarılamayacağını anlıyorum.',
    working: 'İşleniyor…',
    setPassword: 'Parolayı belirle',
    unlock: 'Kilidi aç',
  },
  toast: {
    dismiss: 'Kapat',
  },
}
