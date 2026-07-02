# Slate

**Notların, senin bilgisayarında.** Kod ve hayat notları için yerel, hızlı ve özel bir masaüstü not uygulaması — Windows ve macOS.

Notlar buluta değil, bilgisayarındaki bir klasöre düz Markdown dosyaları olarak kaydedilir. İnternet gerekmez, hesap gerekmez, abonelik gerekmez.

**İndir:** [Son sürüm](https://github.com/sefacakirrr/Slate/releases/latest)

---

## Özellikler

### 📁 Notların sana ait
Vault'un bilgisayarında seçtiğin bir klasördür; her not okunabilir bir `.md` dosyası. Klasörü istediğin gibi yedekler, taşır, başka uygulamalarla açabilirsin — Slate'i silsen bile notların durur.

### ⚡ Anında arama
Tam metin arama (`Ctrl+Shift+F`) yüzlerce not arasında yazdığın anda sonuç getirir.

### ✍️ Akıllı düzenleyici
- Markdown yazarken biçimlendirme anında görünür: başlıklar, kalın/italik, listeler, onay kutuları
- Kod blokları dile göre renklendirilir — kod notları tutanlar için ideal
- Görselleri yapıştır ya da sürükle-bırak; köşesinden tutup yeniden boyutlandır, çift tıkla eski boyutuna dön
- Metni renkli vurgula, hizala, üstü çizili yap
- **Otomatik kayıt**: yazmayı bıraktığın an notun kaydedilir (`Ctrl+S` yine anında kaydeder)

### 🔒 Kilitli notlar
Bir notu vault parolanla kilitle — dosya diskte şifrelenir (scrypt + AES-256-GCM), arama dizininden çıkarılır ve parolasız açılamaz. Parola hiçbir yere gönderilmez ve saklanmaz; unutursan kurtarma yolu yoktur (bilinçli tasarım).

### 📌 Masaüstü yapışkan notları
Herhangi bir notu küçük, her zaman üstte duran bir pencere olarak ekrana sabitle. Konumu ve boyutu hatırlanır.

### ⚡ Hızlı yakalama
Hangi uygulamada olursan ol, `Ctrl+Shift+N` ile anında bir not penceresi aç, yaz, kapat.

### 📥 Kolay geçiş
Başka yerdeki notlarını tek seferde içeri al (Settings → Import):
- Markdown, düz metin, HTML, RTF, kod dosyaları, uzantısız notlar — klasör yapın korunarak
- Notion zip export'u, görselleriyle birlikte
- Apple Notes için: notları önce Exporter (Mac App Store) gibi bir araçla Markdown/HTML'e dök, sonra o klasörü içeri al
- Orijinal dosyalara asla dokunulmaz — import her zaman kopyalar

### 🗂️ Senin düzenin
- Klasörler ve sekmeli çalışma alanı
- `#etiket` yazman yeterli — etiketler kenar çubuğunda otomatik listelenir
- Kenar çubuğunda notları sürükleyerek istediğin sıraya koy; sıralama kalıcıdır

### 🎨 Ayrıntılar
- Koyu ve açık tema (ya da sisteme uy)
- Uygulama içi güncelleme — yeni sürümde nelerin değiştiğini de gösterir

---

## Kurulum Dosyaları

| Dosya | Platform |
|---|---|
| `Slate-x.x.x-setup-x64.exe` | Windows |
| `Slate-x.x.x-arm64.dmg` | Mac — Apple Silicon (M1/M2/M3) |
| `Slate-x.x.x-x64.dmg` | Mac — Intel |

### macOS — İlk Açılış

macOS "hasar görmüş" veya "geliştirici doğrulanamıyor" diyebilir (app Apple sertifikasıyla imzalanmamış). Tek seferlik çözüm:

```bash
xattr -cr /Applications/Slate.app
```

Veya: System Settings → Privacy & Security → sayfanın altında "Open Anyway" butonuna tıkla.

### Otomatik Güncelleme

Windows'ta yeni sürüm otomatik indirilir; yeniden başlatınca kurulur. macOS'te uygulama yeni sürümü haber verir ve Releases sayfasına yönlendirir (imzasız uygulamalar kendini güncelleyemez).

---

## Geliştirme

```bash
npm run setup     # bağımlılıkları kur + native modülleri Electron ABI'ye rebuild et
npm run dev       # uygulamayı geliştirme modunda başlat
```

> `npm run setup` her Node sürümünde (20, 22, 24+) ve her platformda (Windows, macOS, Linux) Python veya C++ compiler gerektirmeden çalışır. Normal `npm install` yerine bunu kullanın.

## Yeni Sürüm Yayınlama

1. `package.json` içindeki `"version"` numarasını artır (örn. `"0.1.2"` → `"0.1.3"`)
2. Değişikliği commit et ve push'la:

```bash
git add package.json
git commit -m "chore: bump version to 0.1.3"
git push
```

3. Tag oluştur ve push'la — bu adım GitHub Actions'ı tetikler:

```bash
git tag v0.1.3
git push origin v0.1.3
```

GitHub kendi sunucularında Mac (arm64 + x64) ve Windows (x64) için build alır, ~10 dakika sonra dosyalar şu adreste hazır olur:

**https://github.com/sefacakirrr/Slate/releases**

> Build durumunu canlı izlemek için: https://github.com/sefacakirrr/Slate/actions

4. Release'in açıklamasını (body) doldur — bu metin uygulama içindeki "What's new" kutusunda kullanıcılara gösterilir.
