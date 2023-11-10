# GoogleCalendarMirror
A Google AppScript program to mirror events between multiple Google calendars.  This is especially useful if you have a "work" calendar and a "personal" calendar and each calendar to show events (with optional privacy) from the other calendars.

## Installation
1. Create a new Google AppScript project
1. Copy the contents of BatchRequests.gs and Code.gs to the project
1. Substitute your values for:
   * CALENDARS_TO_MERGE (cal#tag is used at prefix within the calendar event)
   * CLIENT_ID and _SECRET from Google API setup
1. Head down to "DEFINE THE SYNCHRONIZATION HERE"
   * each sync is one-way.
   * use the calendar tags from CALENDARS_TO_MERGE here
   * privacy (true/false) will remove description and location details and subtitute "DEFAULT_EVENT_TITLE" for the summary
1. Create a timer trigger in AppScript to run this at the desired frequency

### Note
> Each run of *SyncCalendars()* will create new events the *fromCalendar* and update existing *toCalendar* events (i.e changes only).  If you delete **GoogleCalendarMirror** events from the *toCalendar*, they will not be replaced with normal runs.  However, if you run *SyncCalendars()* between 0:00 and 0:10 in the morning, it will run a full update of all events, not just changed events, and replace deleted events.