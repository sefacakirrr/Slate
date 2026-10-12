import type { settings as en } from '../en/settings'
import type { Shape } from '../translate'

export const settings: Shape<typeof en> = {
  title: 'Ayarlar',
  theme: {
    heading: 'Tema',
    dark: 'Koyu',
    light: 'Açık',
    system: 'Sistem',
  },
  colorTheme: {
    heading: 'Editör renk teması',
    removeAria: '{name} temasını kaldır',
    removeTitle: 'İçe aktarılan temayı kaldır',
    import: 'Tema içe aktar (.json)',
    invalidFile: 'Geçersiz tema dosyası. JSON biçimini kontrol et.',
    parseError: 'Dosya JSON olarak okunamadı.',
    removeDialogTitle: 'Temayı kaldır',
    removeDialogMessage:
      'İçe aktarılan "{name}" teması kaldırılsın mı? Daha sonra yeniden içe aktarabilirsin.',
    removeDialogConfirm: 'Kaldır',
  },
  backgroundImage: {
    heading: 'Arka plan görseli',
    change: 'Görseli değiştir',
    select: 'Görsel seç',
    remove: 'Kaldır',
    tooLarge:
      'Bu görsel hatırlanamayacak kadar büyük — şimdilik gösteriliyor ama yeniden başlatınca kaybolacak. Kalıcı olması için daha küçük bir görsel seç.',
    opacity: 'Opaklık: %{percent}',
    reposition: 'Yeniden konumlandır',
  },
  vault: {
    heading: 'Kasa',
    none: 'Kasa seçilmedi',
    change: 'Değiştir',
  },
  import: {
    heading: 'İçe aktar',
    description:
      'Başka uygulamalardaki notlarını getir: .md/.txt/.html dosyalarından oluşan klasörler ya da bir Notion dışa aktarım zip dosyası. Orijinal dosyalar asla değiştirilmez.',
    button: 'Notları içe aktar',
  },
  editing: {
    heading: 'Düzenleme',
    autoSave: 'Otomatik kaydetme',
    autoSaveDescription:
      'Yazmayı bıraktığında etkin not otomatik olarak kaydedilir. {mod}+S ile yine anında kaydedebilirsin.',
    toggleAutoSave: 'Otomatik kaydetmeyi aç/kapat',
    fontSize: 'Yazı boyutu',
    fontSizeDescription: 'Editör ve tüm arayüz bu boyuta göre ölçeklenir. {mod}+= / {mod}+-',
  },
  background: {
    heading: 'Arka planda çalışma',
    launchAtLogin: 'Slate başlangıçta açılsın',
    launchAtLoginDescription:
      'Oturum açtığında sistem tepsisinde başlar; böylece Slate açık olmasa da hatırlatıcılar çalışır.',
    closeToTray:
      'Kapatınca sistem tepsisinde çalışmaya devam et — hatırlatıcılar çalışmayı sürdürür',
    closeToTrayDescription:
      'Pencereyi kapatınca Slate sistem tepsisine gizlenir. Tamamen çıkmak için tepsi menüsündeki çıkış seçeneğini kullan.',
  },
  password: {
    heading: 'Kasa parolası',
    description:
      'Tek tek notları kilitlemek için bir parola belirle. Parola kilitli notları şifreler ve hiçbir yerde saklanmaz — unutursan kurtarma yolu yoktur.',
    set: 'Kasa parolası belirle',
    unlocked: 'Kasa bu oturum için açık',
    locked: 'Kasa kilitli',
    lockNow: 'Kasayı şimdi kilitle',
    unlock: 'Kasanın kilidini aç',
  },
  shortcuts: {
    heading: 'Kısayollar',
    quickCapture: 'Hızlı not',
    search: 'Ara',
  },
  maintenance: {
    heading: 'Bakım',
    rebuilding: 'Yeniden oluşturuluyor…',
    rebuild: 'Arama dizinini yeniden oluştur',
    done: 'Tamamlandı',
    failed: 'Başarısız',
  },
  updates: {
    heading: 'Güncellemeler',
    currentVersion: 'Geçerli sürüm: v{version}',
    checking: 'Denetleniyor…',
    check: 'Güncellemeleri denetle',
    restartToUpdate: 'Güncellemek için yeniden başlat',
    openReleases: 'Sürümler sayfasını aç',
    upToDate: 'Uygulama güncel.',
    available: 'Yeni sürüm mevcut: {version}.',
    availableDownloading: 'Yeni sürüm mevcut: {version} — indiriliyor…',
    downloading: 'İndiriliyor… %{percent}',
    downloaded: 'Sürüm {version} indirildi — kurmak için yeniden başlat.',
    whatsNew: 'Yenilikler',
    devDisabled: 'Güncellemeler yalnızca kurulu uygulamada kullanılabilir.',
    error: 'Güncelleme denetimi başarısız: {error}',
    silentNote:
      'Güncellemeler sessizce kurulur — kurulum sihirbazı yok. Uygulama kendiliğinden yeniden başlar.',
  },
  updateBar: {
    ready: 'Güncelleme hazır — uygulamak için yeniden başlat',
    restartNow: 'Şimdi yeniden başlat',
  },
  backgroundModal: {
    title: 'Arka planı ayarla',
    apply: 'Uygula',
    dragHint: 'Konumlandırmak için sürükle',
    scrollHint: 'Yakınlaştırmak için kaydır',
    zoomOut: 'Uzaklaştır',
    zoomIn: 'Yakınlaştır',
    position: 'Konum: %{percent}',
    reset: 'Sıfırla',
  },
}
