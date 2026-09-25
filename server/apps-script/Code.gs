/** Studio Momentum telemetry DB. Reliability revision 2026-09-24.
 * Keep the existing deployment URL and JSON-array GET contract.
 * Admin control requests use a separate authenticated route; telemetry contract is unchanged.
 */
const DB_FILE_NAME = 'momentum_telemetry_db.json';
const DB_ID_PROPERTY = 'TELEMETRY_DB_FILE_ID';
const MAX_BODY_BYTES = 500000;
const MAX_BATCH_EVENTS = 1000;

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function findDbFile(create) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(DB_ID_PROPERTY);
  if (id) return DriveApp.getFileById(id); // Bad ID fails visibly; never creates an empty replacement.
  const files = DriveApp.getFilesByName(DB_FILE_NAME);
  if (files.hasNext()) {
    const file = files.next();
    if (files.hasNext()) throw new Error('Multiple telemetry DB files found; set TELEMETRY_DB_FILE_ID explicitly');
    props.setProperty(DB_ID_PROPERTY, file.getId());
    return file;
  }
  if (!create) return null;
  const file = DriveApp.createFile(DB_FILE_NAME, '[]', MimeType.PLAIN_TEXT);
  props.setProperty(DB_ID_PROPERTY, file.getId());
  return file;
}

function getOrCreateDbFile() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return findDbFile(true); } finally { lock.releaseLock(); }
}

function readDb(file) {
  if (!file) return [];
  const data = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if (!Array.isArray(data) || data.some(ev => !ev || typeof ev !== 'object' || Array.isArray(ev))) {
    throw new Error('Telemetry DB is malformed; original file has been preserved');
  }
  return data;
}

function eventKey(ev) {
  if (ev.event_id) return String(ev.event_id);
  // Legacy payloads from browser and ntfy backup share this identity.
  const moment = ev.time || ev.timestamp;
  if (moment) return [moment, ev.ref || '', ev.event || ''].join('_');
  if (ev._msg_id || ev.id || ev._id) return String(ev._msg_id || ev.id || ev._id);
  throw new Error('Event identity is missing');
}

function validateEvent(ev) {
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) throw new Error('Event must be an object');
  if (typeof ev.event !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(ev.event)) throw new Error('Invalid event type');
  if (ev.ref != null && (typeof ev.ref !== 'string' || ev.ref.length > 160)) throw new Error('Invalid event ref');
  if (ev.event_id != null && (typeof ev.event_id !== 'string' || ev.event_id.length > 160)) throw new Error('Invalid event ID');
  if (!ev.time && !ev.timestamp && !ev._msg_id && !ev.id && !ev._id && !ev.event_id) {
    throw new Error('Event timestamp or ID is required');
  }
  eventKey(ev);
  return ev;
}

function doPost(e) {
  // Only the explicit admin envelope enters the authenticated relay.
  try {
    const body = e && e.postData && e.postData.contents;
    if (typeof body === 'string' && body.length <= 12000) {
      const request = JSON.parse(body);
      if (request && request.route === 'momentum_admin') return jsonResponse(adminRoute_(request));
    }
  } catch (_) { /* Ordinary telemetry retains its existing validation below. */ }

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    const body = e && e.postData && e.postData.contents;
    if (typeof body !== 'string' || !body) throw new Error('JSON body is required');
    if (Utilities.newBlob(body).getBytes().length > MAX_BODY_BYTES) throw new Error('Request is too large');
    const parsed = JSON.parse(body);
    const incoming = Array.isArray(parsed) ? parsed : [parsed];
    if (incoming.length > MAX_BATCH_EVENTS) throw new Error('Too many events');
    incoming.forEach(validateEvent); // Validate the whole request before touching Drive.
    if (!incoming.length) return jsonResponse({status:'SUCCESS',added:0});
    lock.waitLock(10000); locked = true;
    const file = findDbFile(true);
    const db = readDb(file); // Parse failure never becomes [].
    const seen = new Set();
    db.forEach(ev => {
      try { seen.add(eventKey(ev)); } catch (_) { /* Preserve historical unkeyed records. */ }
    });
    let added = 0;
    incoming.forEach(ev => {
      const key = eventKey(ev);
      if (!seen.has(key)) { seen.add(key); db.push(ev); added++; }
    });
    if (added) file.setContent(JSON.stringify(db));
    return jsonResponse({status:'SUCCESS',added:added,total:db.length,timestamp:new Date().toISOString()});
  } catch (error) {
    console.error('Telemetry persistence rejected: ' + error.message);
    return jsonResponse({status:'ERROR',message:String(error.message)});
  } finally {
    if (locked) lock.releaseLock();
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.admin_health === '1') return jsonResponse({service:'momentum-admin-relay',version:1});

  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    lock.waitLock(10000); locked = true;
    return jsonResponse(readDb(findDbFile(false))); // Reading never creates or resets the DB.
  } catch (error) {
    console.error('Telemetry read failed: ' + error.message);
    return jsonResponse({status:'ERROR',message:String(error.message)});
  } finally {
    if (locked) lock.releaseLock();
  }
}
