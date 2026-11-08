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
    log('Done\n');
    scrollToBottom();
    location.href = '.';
  } catch (error) {
    log(`Error: ${error.message}\n`);
    scrollToBottom();
    working = false;
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
