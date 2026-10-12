import type { calendar as en } from '../en/calendar'
import type { Shape } from '../translate'

export const calendar: Shape<typeof en> = {
  panel: {
    previousMonth: 'Önceki ay',
    nextMonth: 'Sonraki ay',
    monthYear: '{month} {year}',
    addReminderOnDay: 'Hatırlatıcı ekle',
    newReminder: 'Yeni hatırlatıcı',
    remindersList: 'Hatırlatıcılar',
    deleteReminder: 'Hatırlatıcıyı sil',
    deleteTitle: 'Hatırlatıcıyı sil',
    deleteMessage: '"{title}" silinsin mi?',
    deleteConfirm: 'Sil',
  },
  modal: {
    close: 'Kapat',
    heading: 'Hatırlatıcı oluştur',
    title: 'Başlık',
    titlePlaceholder: 'Neyi hatırlatalım?',
    date: 'Tarih',
    time: 'Saat',
    alertBefore: 'Uyarı',
    recurrence: 'Tekrar',
    linkNote: 'Açık nota bağla ({name})',
    cancel: 'İptal',
    submit: 'Hatırlatıcı oluştur',
    alert: {
      atTime: 'Tam zamanında',
      minutesBefore: { one: '{count} dakika önce', other: '{count} dakika önce' },
      hoursBefore: { one: '{count} saat önce', other: '{count} saat önce' },
      daysBefore: { one: '{count} gün önce', other: '{count} gün önce' },
    },
    repeat: {
      none: 'Tekrarlanmaz',
      daily: 'Her gün',
      weekly: 'Her hafta',
      monthly: 'Her ay',
    },
  },
  toast: {
    heading: 'Hatırlatıcı',
    dismiss: 'Kapat',
  },
}
