import type { errors as en } from '../en/errors'
import type { Shape } from '../translate'

export const errors: Shape<typeof en> = {
  vault: {
    fileExists: 'Burada bu adda bir not zaten var.',
    folderExists: 'Burada bu adda bir klasör zaten var.',
    invalidName: 'Adlar < > : " / \\ | ? * karakterlerini içeremez, nokta ya da boşlukla bitemez.',
    invalidExtension: 'Notların uzantısı .md, .markdown ya da .txt olmalı.',
    cannotMoveIntoSelf: 'Bir klasör kendi içine taşınamaz.',
    pathOutsideVault: 'Bu konum kasanın dışında.',
    noteLocked: 'Bu not kilitli. Açmak için kasanın kilidini aç.',
    vaultLocked: 'Önce kasanın kilidini aç.',
    lockVerifyFailed: 'Şifrelenmiş kopya doğrulanamadı. Not kilitlenmeden bırakıldı.',
    notFound: 'Bu öğe artık mevcut değil.',
    unknown: 'Bir şeyler ters gitti ({code}).',
  },
  save: {
    failed: '"{path}" kaydedilemedi: {reason}',
  },
  lock: {
    lockUnsaved:
      '"{path}" dosyasındaki kaydedilmemiş değişiklikler kaydedilemediği için not kilitlenmedi.',
    lockFailed: '"{path}" kilitlenemedi: {reason}',
    unlockUnsaved:
      '"{path}" dosyasındaki kaydedilmemiş değişiklikler kaydedilemediği için notun kilidi açılmadı.',
    unlockFailed: '"{path}" notunun kilidi açılamadı: {reason}',
    vaultLockUnsaved:
      '"{path}" dosyasındaki kaydedilmemiş değişiklikler kaydedilemedi; kasa kilitlenmedi.',
    wrongPassword: 'Parola yanlış. Tekrar dene.',
  },
  openFiles: {
    notFound: 'dosya bulunamadı',
    notAFile: 'bir dosya değil',
    tooLarge: 'dosya 10 MB sınırını aşıyor',
    binaryFile: 'ikili (binary) bir dosyaya benziyor',
    unsupportedEncoding: 'UTF-8 bir metin dosyası değil',
    unsupportedType: 'yalnızca .md, .markdown ve .txt dosyaları açılabilir',
    notAllowed: 'erişim reddedildi',
    unreadable: 'okunamadı',
    item: '"{name}": {reason}',
    failed: 'Açılamadı: {list}',
    droppedFailed: 'Bırakılan dosyalar açılamadı ({error})',
  },
}
