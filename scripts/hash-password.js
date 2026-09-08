import { hashPassword } from '../src/auth.js';

async function hiddenPrompt(label) {
  if (!process.stdin.isTTY) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    return input.split(/\r?\n/)[0];
  }
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    function finish() {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      resolve(value);
    }
    function onData(chunk) {
      for (const character of chunk) {
        if (character === '\u0003') {
          process.stdin.setRawMode(false);
          process.stdout.write('\n');
          reject(new Error('Cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') { finish(); return; }
        if (character === '\u007f' || character === '\b') {
          if (value) { value = value.slice(0, -1); process.stdout.write('\b \b'); }
        } else {
          value += character;
          process.stdout.write('*');
        }
      }
    }
    process.stdin.on('data', onData);
  });
}

const secret = await hiddenPrompt('Password (12+ characters): ');
if (process.stdin.isTTY) {
  const confirmation = await hiddenPrompt('Confirm password: ');
  if (secret !== confirmation) throw new Error('Passwords do not match.');
}
console.log(`TOURNAMENT_PASSWORD_HASH=${await hashPassword(secret)}`);
