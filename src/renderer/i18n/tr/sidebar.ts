import type { sidebar as en } from '../en/sidebar'
import type { Shape } from '../translate'

export const sidebar: Shape<typeof en> = {
  header: {
    label: 'Kenar çubuğu',
    notes: 'Notlar',
    trash: 'Çöp Kutusu',
    changeVault: 'Kasa klasörünü değiştir',
    newNote: 'Yeni not',
    newFolder: 'Yeni klasör',
    listView: 'Liste görünümü',
    treeView: 'Ağaç görünümü',
    calendar: 'Takvim',
    refresh: 'Yenile',
    settings: 'Ayarlar',
  },
  tree: {
    renameFolder: 'Klasörü yeniden adlandır',
    newNoteHere: 'Buraya yeni not',
    newSubfolder: 'Yeni alt klasör',
    deleteFolder: 'Klasörü sil',
    newFolderName: 'Yeni klasör adı',
    newNoteName: 'Yeni not adı',
    folderNamePlaceholder: 'Klasör adı',
    noteNamePlaceholder: 'Not adı',
    locked: 'Kilitli',
    pinAsSticky: 'Masaüstüne yapışkan not olarak sabitle',
    pinLabel: '{label} notunu yapışkan not olarak sabitle',
    renameNote: 'Notu yeniden adlandır',
    renameLabel: '{label} notunu yeniden adlandır',
    unlockNote: 'Notun kilidini aç (düz Markdown olarak çöz)',
    unlockLabel: '{label} notunun kilidini aç',
    lockNote: 'Notu kilitle (kasa parolasıyla şifrele)',
    lockLabel: '{label} notunu kilitle',
    deleteNote: 'Notu sil',
    deleteLabel: '{label} notunu sil',
    emptyVault: 'Bu kasada henüz not yok.',
    createFirstNote: 'İlk notunu oluştur',
    dropToRoot: 'köke bırak',
  },
  tags: {
    title: 'Etiketler',
    showAll: 'Tümünü göster ({count} tane daha)',
  },
  footer: {
    createdBy: 'Geliştiren: Sefa Çakır',
  },
  confirm: {
    deleteNoteTitle: 'Notu sil',
    deleteNoteMessage:
      '"{name}" silinsin mi? {osTrashTo} taşınacak; Slate Çöp Kutusu\'ndan da geri yükleyebilirsin.',
    deleteFolderTitle: 'Klasörü sil',
    deleteFolderMessage:
      '"{name}" ve tüm içeriği silinsin mi? {osTrashTo} taşınacak; Slate Çöp Kutusu\'ndan da geri yükleyebilirsin.',
  },
  notices: {
    saveBeforeDeleteNote:
      '"{path}" notundaki kaydedilmemiş değişiklikler kaydedilemedi, bu yüzden silinmedi.',
    saveBeforeDeleteFolder:
      '"{path}" klasöründeki kaydedilmemiş değişiklikler kaydedilemedi, bu yüzden silinmedi.',
    moveFailed: '"{name}" taşınamadı: {error}',
  },
  notesList: {
    empty: 'Henüz not yok.',
    locked: 'Kilitli',
  },
  tabs: {
    deletedOnDiskTitle: '{path} (diskten silindi — kaydedersen yeniden oluşturulur)',
    unsavedChanges: 'Kaydedilmemiş değişiklikler',
    locked: 'Kilitli',
    externalFile: 'Harici dosya',
    deletedOnDisk: 'Diskten silindi',
    closeTab: 'Sekmeyi kapat',
    closeLabel: '{name} sekmesini kapat',
    close: 'Kapat',
    closeOthers: 'Diğerlerini kapat',
    closeLeft: 'Soldakileri kapat',
    closeRight: 'Sağdakileri kapat',
    closeAll: 'Tümünü kapat',
  },
  trash: {
    info: 'Silinen öğeler ayrıca {osTrashTo} gider. Buradaki kopyalar 30 gün sonra kaldırılır.',
    emptyTrash: 'Çöp kutusunu boşalt',
    empty: 'Çöp kutusu boş. Silinen notlar ve klasörler burada görünür.',
    vaultRoot: 'Kasa kökü',
    yesterday: 'dün',
    restore: 'Geri yükle',
    deletePermanently: 'Kalıcı olarak sil',
    confirmItemOsTrashed:
      '"{name}" Slate Çöp Kutusu\'ndan kaldırılsın mı? Artık Slate\'ten geri yüklenemez; {osTrashIn} bulunan kopya korunur.',
    confirmItem:
      '"{name}" Slate Çöp Kutusu\'ndan kaldırılsın mı? {osTrashTo} gönderilir ve artık Slate\'ten geri yüklenemez.',
    confirmEmpty:
      "Slate Çöp Kutusu'ndaki {count} öğenin tümü kaldırılsın mı? Artık Slate'ten geri yüklenemezler; silinen notlar {osTrashIn} kalır.",
    delete: 'Sil',
  },
  trashToast: {
    movedToOsTrash: '"{name}" {osTrashTo} taşındı',
    movedToTrash: '"{name}" Çöp Kutusu\'na taşındı',
    deleteFailed: '"{name}" silinemedi ({error}). Hiçbir şey silinmedi.',
    undo: 'Geri al',
    dismiss: 'Kapat',
  },
  search: {
    close: 'Aramayı kapat',
    label: 'Notlarda ara',
    placeholder: 'Notlarda ara…',
    hint: 'Kasandaki tüm notlarda aramak için yazmaya başla.',
    searching: 'Aranıyor…',
    noResults: 'Sonuç yok.',
  },
}
