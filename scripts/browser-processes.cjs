// Unix browser-worker preload: record Node-launched processes before callers
// can exit, including browsers that create their own process group/session.
const fs = require('node:fs');
const { ChildProcess, spawnSync } = require('node:child_process');

function processIdentity(pid, timeoutMs = 2000) {
  try {
    if (process.platform === 'linux') {
      const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
      const fields = stat
        .slice(stat.lastIndexOf(')') + 2)
        .trim()
        .split(/\s+/);

      return fields[0] === 'Z' ? undefined : fields[19];
    }

    const result = spawnSync('ps', ['-p', String(pid), '-o', 'stat=,lstart='], {
      encoding: 'utf8',
      timeout: timeoutMs,
      env: { ...process.env, LC_ALL: 'C' }
    });

    if (result.error) throw result.error;
    if (result.status !== 0 || !result.stdout.trim()) {
      return undefined;
    }

    const [state, ...birth] = result.stdout.trim().split(/\s+/);

    return state.startsWith('Z') ? undefined : birth.join(' ');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') {
      return undefined;
    }

    throw error;
  }
}

module.exports = { processIdentity };
const registry = process.env.GO_DEFAULTS_BROWSER_PROCESS_FILE;

if (registry && process.platform !== 'win32') {
  const original = ChildProcess.prototype.spawn;

  ChildProcess.prototype.spawn = function (...args) {
    const result = Reflect.apply(original, this, args);

    if (this.pid) {
      const pid = this.pid,
        identity = processIdentity(pid);

      if (identity !== undefined) fs.appendFileSync(registry, JSON.stringify({ pid, identity }) + '\n');
    }

    return result;
  };
}
