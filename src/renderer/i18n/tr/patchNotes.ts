import type { patchNotes as en } from '../en/patchNotes'
import type { Shape } from '../translate'

export const patchNotes: Shape<typeof en> = {
  title: 'Yenilikler',
  gotIt: 'Anladım',
  v0116: {
    h01: 'Silinen notlar ve klasörler Geri Dönüşüm Kutusu’na gider; hemen geri alabilir ya da Slate Çöp Kutusu’ndan geri yükleyebilirsin',
    h02: '.md ve .txt dosyalarını Slate’e sürükleyerek veya “Birlikte aç” ile açabilirsin',
    h03: 'Dil ayarı: tüm uygulama için Türkçe veya İngilizce',
    h04: 'Hatırlatıcılar arka planda çalışmaya devam eder: Slate sistem tepsisinde kalır ve Windows ile başlayabilir',
    h05: 'Yapıştırılan kod, dili algılanarak kod bloğuna yerleştirilir (Ctrl+Shift+V düz metin yapıştırır)',
    h06: 'Yeni uygulama ikonu',
    h07: 'Klasörleri yeniden adlandırabilirsin; hatırlatıcılar ve yapışkan notlar taşınan notları takip eder',
    h08: 'Bir dosya Slate dışında değiştiyse seçim senin: üzerine yaz, yeniden yükle veya vazgeç',
    h09: 'Biçimlendirme, geri alma veya Backspace sonrası ham işaret bırakmıyor; Ctrl+I ve Ctrl+U yeniden çalışıyor',
    h10: 'Klasör taşırken veya silerken ya da çok sayıda sekme kapatırken kaydedilmemiş değişiklikler artık kaybolmuyor',
    h11: 'Kilitli notlar yeniden başlatmadan sonra kilitli kalır; sabitlenmiş bir notu kilitlemek açık metin bırakmaz',
    h12: 'Hızlı not taslağını saklar; tamamlanan yapılacaklar listenin sonuna iner',
    h13: 'Windows bir dosyayı kısa süre kilitlediğinde kayıt yeniden denenir ve kayıt hataları gösterilir',
    h14: 'Araç ipuçları butonun her yerinde görünür; ayrıca onlarca küçük düzeltme',
  },
  v0115: {
    h01: 'Takvim ve hatırlatıcılar: kenar çubuğunda aylık takvim, günlük notlar ve tarihe bağlı hatırlatıcılar',
    h02: 'Tekrarlayan hatırlatıcılar: her gün, her hafta veya her ay otomatik tekrar',
    h03: 'Bildirime tıklayınca uygulama öne gelir ve ilgili not açılır',
    h04: 'Slate kapalıyken kaçırılan hatırlatıcılar, uygulama açılır açılmaz bildirilir',
    h05: 'Yazı boyutu ayarı: Ayarlar’daki kaydırıcı, Ctrl+= / Ctrl+- ve Ctrl+fare tekerleğiyle yakınlaştırma',
    h06: 'Seçili metne yazı boyutu uygulama (araç çubuğundan, 12–48px)',
    h07: 'Tüm arayüz öğeleri yazı boyutuyla orantılı ölçeklenir',
    h08: 'Klasör okları açılıp kapanırken animasyonla döner',
    h09: 'Satır katlama okları büyütüldü ve animasyon eklendi',
    h10: 'Açılır listelerdeki oklar animasyonla döner',
    h11: 'Kasa değiştirilince etiketler doğru şekilde sıfırlanır',
    h12: 'Pencere kapanırken oluşan görüntü karesi (render frame) hatası düzeltildi',
  },
}
