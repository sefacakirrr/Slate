/** calendar strings (English source). */
export const calendar = {
  panel: {
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    monthYear: '{month} {year}',
    addReminderOnDay: 'Add reminder',
    newReminder: 'New reminder',
    remindersList: 'Reminders',
    deleteReminder: 'Delete reminder',
    deleteTitle: 'Delete reminder',
    deleteMessage: 'Delete "{title}"?',
    deleteConfirm: 'Delete',
  },
  modal: {
    close: 'Close',
    heading: 'Create reminder',
    title: 'Title',
    titlePlaceholder: 'What should we remind you of?',
    date: 'Date',
    time: 'Time',
    alertBefore: 'Alert',
    recurrence: 'Repeat',
    linkNote: 'Link to current note ({name})',
    cancel: 'Cancel',
    submit: 'Create reminder',
    alert: {
      atTime: 'At time of event',
      minutesBefore: { one: '{count} minute before', other: '{count} minutes before' },
      hoursBefore: { one: '{count} hour before', other: '{count} hours before' },
      daysBefore: { one: '{count} day before', other: '{count} days before' },
    },
    repeat: {
      none: 'Does not repeat',
      daily: 'Every day',
      weekly: 'Every week',
      monthly: 'Every month',
    },
  },
  toast: {
    heading: 'Reminder',
    dismiss: 'Dismiss',
  },
}
