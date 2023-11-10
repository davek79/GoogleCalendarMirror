// Calendars to merge from.
// "[X]" is what is placed in front of your calendar event in the shared calendar.
// Use "" if you want none.
const CALENDARS_TO_MERGE = {
  "cal1tag": "cal1@gmail.com",
  "cal2tag": "cal2@gmail.com",
}

// Number of days in the past and future to sync.
const SYNC_DAYS_IN_PAST = 3
const SYNC_DAYS_IN_FUTURE = 14

const COPIED_COLOR = "8"

const CLIENT_ID = "FROM_GOOGLE_CONSOLE"
const CLIENT_SECRET = "FROM_GOOGLE_CONSOLE"

// Default title for events that don't have a title.
const DEFAULT_EVENT_TITLE = "Busy"

// Unique character to use in the title of the event to identify it as a clone.
// This is used to delete the old events.
// https://unicode-table.com/en/200B/
const SEARCH_CHARACTER = "\u200B"

// ----------------------------------------------------------------------------
// DO NOT TOUCH FROM HERE ON
// ----------------------------------------------------------------------------

// Base endpoint for the calendar API
const ENDPOINT_BASE = "https://www.googleapis.com/calendar/v3/calendars"

function test(){
  const scriptProperties = PropertiesService.getUserProperties();
  const data = scriptProperties.getProperties();
  for (const key in data) {
    console.log('Key: %s, Value: %s', key, data[key]);
  }
  //scriptProperties.deleteAllProperties()
  console.log("test")
}

function SyncCalendars() {
  // Start time is today at midnight - SYNC_DAYS_IN_PAST
  const startTime = new Date()
  startTime.setHours(0, 0, 0, 0)
  startTime.setDate(startTime.getDate() - SYNC_DAYS_IN_PAST)

  // End time is today at midnight + SYNC_DAYS_IN_FUTURE
  const endTime = new Date()
  endTime.setHours(0, 0, 0, 0)
  endTime.setDate(endTime.getDate() + SYNC_DAYS_IN_FUTURE + 1)

  // ensure authorization for each calendar
  for (i in CALENDARS_TO_MERGE) {
    test_calendar = CALENDARS_TO_MERGE[i]
    var service = getService_(i);

    if (service.hasAccess()) {
      var url = `https://www.googleapis.com/calendar/v3/calendars/${test_calendar}`;
      var response = UrlFetchApp.fetch(url, {
      headers: {
        Authorization: 'Bearer ' + service.getAccessToken()
      }      
    });
      var result = JSON.parse(response.getContentText());
//      Logger.log(JSON.stringify(result, null, 2));
      // TODO: confirm access to desired calendar?
    } else {
      var authorizationUrl = service.getAuthorizationUrl({"calendarName":i});
      Logger.log('Open the following URL to log into %s and re-run the script: %s', i, authorizationUrl);
    }
  }

  /* 
   * DEFINE THE SYNCRHONIZATION HERE
   */
  syncEvents("cal1", "cal2", startTime, endTime, false)
  syncEvents("cal2", "cal1", startTime, endTime, true)
}

/**
 * Authorizes and makes a request to the Google Drive API.
 */
function syncEvents(fromCalendarName, toCalendarName, startTime, endTime, privacy) {

  let requestBody = []

  fromCalendarId = CALENDARS_TO_MERGE[fromCalendarName]
  toCalendarId = CALENDARS_TO_MERGE[toCalendarName]

  var fromService = getService_(fromCalendarName);
  var toService = getService_(toCalendarName);

  if (fromService.hasAccess() && toService.hasAccess()) {
    // get FROM events
    var url = `https://www.googleapis.com/calendar/v3/calendars/${fromCalendarId}/events?timeMin=${startTime.toISOString()}&timeMax=${endTime.toISOString()}&showDeleted=true&singleEvents=true`;
    var response = UrlFetchApp.fetch(url, {
      headers: {
        Authorization: 'Bearer ' + fromService.getAccessToken()
      }
    });
    var fromResult = JSON.parse(response.getContentText());
    //Logger.log(JSON.stringify(result, null, 2));

    // get TO events
    url = `https://www.googleapis.com/calendar/v3/calendars/${toCalendarId}/events?timeMin=${startTime.toISOString()}&timeMax=${endTime.toISOString()}&showDeleted=true&singleEvents=true`;
    response = UrlFetchApp.fetch(url, {
      headers: {
        Authorization: 'Bearer ' + toService.getAccessToken()
      }
    });
    var toResult = JSON.parse(response.getContentText());

    // for(i in toResult.items) { console.log("toResult[%d]:%s", i, toResult.items[i].id) }

    // iterate through TO calendar and delete events no longer in FROM calendar
    // TODO: don't need to do this, since deleted items are marked "cancelled"

    // iterate through items in FROM calendar - update found, add unfound
    for (i in fromResult.items) {

      var fromItem = fromResult.items[i]
      var originalSummary = fromItem.summary
      var itemFound = false

      console.log("Processing %s(%s)", fromItem.summary, fromItem.id)

      // Skip item if it's from CalendarSync 
      if(fromItem.summary && fromItem.summary[0] === SEARCH_CHARACTER){
        //console.log("Excluding %s (%s)", fromItem.summary, fromItem.id)
        continue
      }

      /* 
       * Special treatment for free time and cancelled events 
       */
      if(!fromItem.status) { // if there isn't a status, add one
          fromItem.status = "tentative"
      }
      if(!fromItem.transparency) { // if there isn't a transparency, add one
          fromItem.transparency = "opaque"
      }          

      if(fromItem.transparency === "transparent") { // treat "free" time like deleted
        fromItem.status = "cancelled"
      }

      // was this event declined? if so, mark as "cancelled"
      if(fromItem.attendees )
      {
        for( a in fromItem.attendees)
        {
          if(fromItem.attendees[a].self && fromItem.attendees[a].responseStatus == "declined") {
            fromItem.status = "cancelled"
          }
        }
      }

      // Hide details if privacy is true
      if(privacy) {
        fromItem.summary = DEFAULT_EVENT_TITLE
        fromItem.location = ""
        fromItem.description = ""
        fromItem.conferenceData = ""
      }

      var requestBodyContent = {}

      // look for matching IDs
      for (j in toResult.items) {
        var toItem = toResult.items[j]

        if(toItem.extendedProperties && toItem.extendedProperties.private && toItem.extendedProperties.private.id && fromItem.id == toItem.extendedProperties.private.id ){
        //if(fromItem.id == toItem.id ){
          console.log("match for %s with %s", fromItem.id, toItem.id)
          itemFound = true
          break
        }
      }

      // ensure the eventId is actually unique
      var response = []
      if (false) { //(!itemFound) {
        url = `https://www.googleapis.com/calendar/v3/calendars/${toCalendarId}/events/${fromItem.id}?showDeleted=true`;
      
        try {
          response = UrlFetchApp.fetch(url, {
            headers: {
              Authorization: 'Bearer ' + toService.getAccessToken()
            }
          });

          if( response )
          {
            var dupResult = JSON.parse(response.getContentText());
            // console.log(JSON.stringify(dupResult,null, 2))
            if( dupResult.summary ) {
              console.log("Result found by direct ID lookup %s(%s)", originalSummary, fromItem.id)
              toItem = dupResult
              itemFound = true;          
            }
          }        
        }
        catch (error)
        {
          //console.log(error)
        }
      }

      if( itemFound ) {
        // only update if there are changes
        var timeNow = new Date()

        // run full update at midnight, otherwise only do updated items
        if( (timeNow.getHours() == 0 && timeNow.getMinutes() < 10) || fromItem.updated > toItem.updated) {
        //if( true ) {  
        
          console.log("Updating: %s", fromItem.id)
          
          // do an update transaction
          requestBodyContent["method"] = "PUT"
          requestBodyContent["endpoint"] = `${ENDPOINT_BASE}/${toCalendarId}/events/${toItem.id}?conferenceDataVersion=1`
          
        }
        else {
          console.log("Skipping update for %s (%s)", originalSummary, fromItem.id)
        }
      }
      else {
        // item is still not found, so add it
          
        // Don't copy "free" events.
        if (fromItem.transparency && fromItem.transparency === "transparent") {
          console.log("skipping free-time event")
          continue
        }
        // Don't copy cancelled events
        if (fromItem.status && fromItem.status === "cancelled" ){
          console.log("skipping cancelled event")
          continue
        }
        // Don't copy declined events
        if (fromItem.status && fromItem.status === "cancelled" ){
          console.log("skipping declined event")
          continue
        }        

        console.log("adding %s (%s)", originalSummary, fromItem.id)

        // do an insert transaction (i.e. create new)
        requestBodyContent["iCalUID"] = fromItem.id
        requestBodyContent["method"] = "POST"
        requestBodyContent["endpoint"] = `${ENDPOINT_BASE}/${toCalendarId}/events?conferenceDataVersion=1`
          
      }

      // push to the list only if there is a method
      if(requestBodyContent["method"]) {
        // complete the request body
        requestBodyContent["requestBody"] = {
          summary: `${SEARCH_CHARACTER}[${fromCalendarName}] ${fromItem.summary}`,
          "extendedProperties" : {"private": {"id": fromItem.id}},
          location: fromItem.location,
          description: fromItem.description,
          start: fromItem.start,
          end: fromItem.end,
          conferenceData: fromItem.conferenceData,
          colorId: COPIED_COLOR,
          status: fromItem.status,
          transparency: fromItem.transparency,
          //recurrence: fromItem.recurrence,
          //items: fromItem.items, //TODO: what if this doesn't exist?
        }

        requestBody.push(requestBodyContent)
      } else {
        console.log("No action")
      }


    }
    
    console.log(`Trying to affect ${requestBody.length} events between ${startTime} and ${endTime}.`)

    if (requestBody && requestBody.length) {
      if( true ) {         
        var result = new BatchRequest({
          batchPath: "batch/calendar/v3",
          requests: requestBody,
          accessToken: toService.getAccessToken()
        })
        
        for( i in result) {
          if(result[i].error) { 
            console.log("ERROR: %d, \nREQUEST: %s\nRESULT:%s",i, JSON.stringify(requestBody[i]), JSON.stringify(result[i])) 
            }
        }
      }
      else { // break batch into individual requests

        for (req in requestBody) {
          var result = new BatchRequest({
            batchPath: "batch/calendar/v3",
            requests: [requestBody[req]],
            accessToken: toService.getAccessToken()
          })
          var temp_resp = requestBody[req]
          console.log(JSON.stringify(temp_resp))
          console.log(result)
          continue
          
        }
      }

    } else {
        console.log("No events to create.")
    }

  } else {
    Logger.log('Authorization Error during sync')
  }
}

function getService_(name) {
 return OAuth2.createService(name)
      // Set the endpoint URLs.
      .setAuthorizationBaseUrl('https://accounts.google.com/o/oauth2/v2/auth')
      .setTokenUrl('https://oauth2.googleapis.com/token')

      // Set the client ID and secret.
      .setClientId(CLIENT_ID)
      .setClientSecret(CLIENT_SECRET)

      // Set the name of the callback function that should be invoked to
      // complete the OAuth flow.
      .setCallbackFunction(`authCallback`)

      // Set the property store where authorized tokens should be persisted.
      .setPropertyStore(PropertiesService.getUserProperties())

      // Set the scope and additional Google-specific parameters.
      .setScope('https://www.googleapis.com/auth/calendar')
      .setParam('access_type', 'offline')
      .setParam('prompt', 'consent')
//      .setParam('login_hint', Session.getActiveUser().getEmail());
}

/**
 * Handles the OAuth callback.
 */
function authCallback(request) {
  var service = getService_(request.parameter.calendarName);
  var authorized = service.handleCallback(request);
  if (authorized) {
    return HtmlService.createHtmlOutput(`Success! for ${request.parameter.calendarName}`);
  } else {
    return HtmlService.createHtmlOutput(`Denied for ${request.parameter.calendarName}`);
  }
}

/**
 * Logs the redict URI to register in the Google Developers Console.
 */
function logRedirectUri() {
  Logger.log(OAuth2.getRedirectUri());
}
