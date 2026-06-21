# Slate

Personal local-first notes app for code and life. Markdown files on disk, WYSIWYG editing, full-text search, no cloud.

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

## Kurulum Dosyaları

| Dosya | Platform |
|---|---|
| `Slate-x.x.x-arm64.dmg` | Mac — Apple Silicon (M1/M2/M3) |
| `Slate-x.x.x-x64.dmg` | Mac — Intel |
| `Slate-x.x.x-setup-x64.exe` | Windows |

## macOS — İlk Açılış

macOS "hasar görmüş" veya "geliştirici doğrulanamıyor" diyebilir (app Apple sertifikasıyla imzalanmamış). Tek seferlik çözüm:

```bash
xattr -cr /Applications/Slate.app
```

Veya: System Settings → Privacy & Security → sayfanın altında "Open Anyway" butonuna tıkla.

## Otomatik Güncelleme

Uygulamayı kurmuş olan kullanıcılar yeni sürüm çıkınca otomatik bildirim alır ve uygulamayı yeniden başlatınca güncelleme uygulanır — tekrar kurulum gerekmez.
