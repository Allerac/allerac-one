export class TodayTool {
  execute() {
    const now = new Date();
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return {
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      datetime: now.toISOString(),
      weekday: weekdays[now.getDay()],
      timezone,
    };
  }
}
