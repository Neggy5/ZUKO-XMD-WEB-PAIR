const fs = require('fs');
const path = require('path');
const SETTINGS_PATH = path.join(__dirname, 'setting.json');
// Add to your Settings.js file
let botMode = 'public'; // 'public' or 'private'
let authorizedUsers = [];

function setBotMode(mode) {
    botMode = mode;
    setSetting('global', 'botMode', mode);
    return botMode;
}

function getBotMode() {
    const saved = getSetting('global', 'botMode', 'public');
    botMode = saved;
    return botMode;
}

function addAuthorizedUser(user) {
    if (!authorizedUsers.includes(user)) {
        authorizedUsers.push(user);
        setSetting('global', 'authorizedUsers', authorizedUsers);
        return true;
    }
    return false;
}

function removeAuthorizedUser(user) {
    const index = authorizedUsers.indexOf(user);
    if (index !== -1) {
        authorizedUsers.splice(index, 1);
        setSetting('global', 'authorizedUsers', authorizedUsers);
        return true;
    }
    return false;
}

function getAuthorizedUsers() {
    authorizedUsers = getSetting('global', 'authorizedUsers', []);
    return authorizedUsers;
}
let settings = {};
try {
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8') || '{}');
  } else {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({}, null, 2));
    settings = {};
  }
} catch (e) {
  console.error('Failed to load settings.json', e);
  settings = {};
}

function saveSettings() {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

/**
 * Get a setting for a user, group, or bot.
 * @param {string} jid - User JID, group JID, or 'bot' for global bot settings
 * @param {string} key - Setting key
 * @param {*} defaultValue - Default value if key doesn't exist
 */
function getSetting(jid, key, defaultValue = false) {
  if (!settings[jid]) return defaultValue;
  return settings[jid][key] !== undefined ? settings[jid][key] : defaultValue;
}

/**
 * Set a setting for a user, group, or bot.
 * @param {string} jid - User JID, group JID, or 'bot' for global bot settings
 * @param {string} key - Setting key
 * @param {*} value - Value to save
 */
function setSetting(jid, key, value) {
  if (!settings[jid]) settings[jid] = {};
  settings[jid][key] = value;
  saveSettings();
}

module.exports = { getSetting, setSetting, setBotMode, getBotMode, addAuthorizedUser, removeAuthorizedUser, getAuthorizedUsers };

