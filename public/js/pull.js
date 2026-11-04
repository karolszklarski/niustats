// Download page: signs in to Niu, downloads the scooters with their trips and stores them in the browser.
// md5() comes from md5.min.js, loaded as a classic script before this module.
import { downloadData, NiuError } from './niu.js';
import { saveData } from './storage.js';

const logs = document.getElementById('logs');
let working = false;

document.getElementById('gatherButton').addEventListener('click', async () => {
  if (working) return;
  working = true;
  document.getElementById('logsDiv').hidden = false;
  scrollToBottom();
  const login = document.getElementById('login').value.trim();
  const passwordHash = md5(document.getElementById('password').value);
  try {
    saveData(await downloadData(login, passwordHash, { log }));
    log('Finished\n');
    scrollToBottom();
    location.href = '.';
  } catch (error) {
    log(`error: ${error.message}\n`);
    scrollToBottom();
    working = false;
    // A NiuError is expected and fully reported in the log. Anything else is a bug in this page.
    if (!(error instanceof NiuError)) throw error;
  }
});

/** Appends text to the log as it is: messages from Niu are never read as HTML. */
function log(message) {
  logs.value += message;
  logs.scrollTop = logs.scrollHeight;
}

function scrollToBottom() {
  const scrollingElement = document.scrollingElement || document.body;
  scrollingElement.scrollTop = scrollingElement.scrollHeight;
}
