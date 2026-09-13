import { UI_STRINGS } from '../ui-strings';

describe('UI_STRINGS', () => {
  it('keeps the required copy verbatim', () => {
    expect(UI_STRINGS).toEqual({
      swipeRight: 'Done',
      swipeLeft: 'Not tonight',
      reminderTitle: 'Still interested?',
      carryOverLabel: 'Mega Crush',
      carryOverReturn: 'Match made in heaven',
      todayList: 'Your matches',
      about: 'About',
      edit: 'Edit',
      reminderActions: {
        done: 'Done',
        notTonight: 'Not tonight',
        remindLater: 'Remind me later',
        changePriority: 'Change priority',
      },
      eventReminderActions: {
        open: 'Open',
        remindLater: 'Remind me later',
      },
    });
  });
});
