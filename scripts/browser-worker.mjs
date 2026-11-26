import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { processIdentity } = require('./browser-processes.cjs');

// The Windows owner joins a kill-on-close job before launching Node. Keeping
// the handle in this owner also closes descendants after an early worker exit.
const windowsOwner = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
public static class BrowserJobOwner {
  [StructLayout(LayoutKind.Sequential)] struct Limits {
    public long ProcessTime, JobTime;
    public uint Flags;
    public UIntPtr Minimum, Maximum;
    public uint Active;
    public UIntPtr Affinity;
    public uint Priority, Scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct Counters {
    public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
  }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
    public Limits Basic;
    public Counters IO;
    public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool SetInformationJobObject(IntPtr job, int kind, IntPtr info, uint size);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  public static void Run(string executable, string arguments, string directory, string ready, int ownerPid) {
    try {
      IntPtr job = CreateJobObject(IntPtr.Zero, null);
      if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
      ExtendedLimits limits = new ExtendedLimits();
      limits.Basic.Flags = 0x2000;
      int size = Marshal.SizeOf(limits);
      IntPtr memory = Marshal.AllocHGlobal(size);
      try {
        Marshal.StructureToPtr(limits, memory, false);
        if (!SetInformationJobObject(job, 9, memory, (uint)size)) throw new Win32Exception(Marshal.GetLastWin32Error());
      } finally { Marshal.FreeHGlobal(memory); }
      if (!AssignProcessToJobObject(job, GetCurrentProcess())) throw new Win32Exception(Marshal.GetLastWin32Error());
      Process owner = Process.GetProcessById(ownerPid);
      if (owner.Handle == IntPtr.Zero) throw new InvalidOperationException("Browser supervisor handle is unavailable.");
      System.IO.File.WriteAllText(ready, "owned");
      ProcessStartInfo info = new ProcessStartInfo(executable, arguments);
      info.WorkingDirectory = directory;
      info.UseShellExecute = false;
      info.CreateNoWindow = true;
      info.RedirectStandardInput = info.RedirectStandardOutput = info.RedirectStandardError = true;
      Process child = Process.Start(info);
      child.StandardInput.Close();
      Task output = child.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
      Task errors = child.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
      while (!child.WaitForExit(100)) {
        if (owner.HasExited) Environment.Exit(1);
      }
      if (!Task.WaitAll(new Task[] { output, errors }, 2500)) {
        Console.Error.WriteLine("Browser worker output pipes did not close.");
        Environment.Exit(1);
      }
      // Environment.Exit closes this owner's non-inherited job handle. Do not
      // dispose it earlier: the owner itself is a member of the job.
      Environment.Exit(child.ExitCode);
    } catch (Exception error) {
      Console.Error.WriteLine(error);
      Environment.Exit(1);
    }
  }
}
'@
$config = [Console]::ReadLine() | ConvertFrom-Json
[BrowserJobOwner]::Run([string]$config.executable, [string]$config.arguments, [string]$config.directory, [string]$config.ready, [int]$config.ownerPid)
`;

export function browserDeadline(value = 180000) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)
    throw new RangeError('Browser timeout must be a positive integer no greater than 2147483647 milliseconds.');

  return value;
}

function windowsArguments(args) {
  return args.map((value) => '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"').join(' ');
}

function stopUnixTree(pid, registry, owner) {
  const errors = [];
  const deadline = performance.now() + 2000;
  const remaining = () => {
    const milliseconds = Math.ceil(deadline - performance.now());

    if (milliseconds < 1) throw new Error('Browser process inspection exceeded its cleanup deadline.');

    return milliseconds;
  };

  const signal = (group, kind) => {
    try {
      process.kill(-group, kind);
    } catch (error) {
      if (error.code !== 'ESRCH') errors.push(error);
    }
  };

  signal(pid, 'SIGSTOP');
  const groups = new Set([pid]);
  let ownGroup;

  try {
    const linux = process.platform === 'linux';
    const supervisorStart = linux ? BigInt(processIdentity(process.pid, remaining())) : undefined;
    // One bounded snapshot on other Unix systems also includes inherited
    // environment markers, so native children remain discoverable after reparenting.
    const snapshot = spawnSync(
      'ps',
      linux ? ['-axo', 'pid=,ppid=,pgid='] : ['axeww', '-o', 'pid=,ppid=,pgid=,command='],
      {
        encoding: 'utf8',
        timeout: remaining(),
        maxBuffer: 32 * 1024 * 1024
      }
    );

    if (snapshot.error) throw snapshot.error;
    if (snapshot.status !== 0) throw new Error('Cannot inspect browser worker descendants: ' + snapshot.stderr);
    const rows = snapshot.stdout
      .trim()
      .split('\n')
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)(?:\s+(.*))?$/);

        if (!match) throw new Error('Cannot read browser process snapshot.');

        return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] || ''];
      });
    const owned = new Set([pid]);

    ownGroup = rows.find(([id]) => id === process.pid)?.[2];
    const syncFs = require('node:fs');
    const marker = 'GO_DEFAULTS_BROWSER_PROCESS_OWNER=' + owner;

    for (const [id, , group, command] of rows) {
      remaining();
      try {
        let marked, identity;

        if (linux) {
          const status = syncFs.readFileSync('/proc/' + id + '/status', 'utf8');
          const uid = status.match(/^Uid:\s+(\d+)\s+(\d+)/m);

          // Other users cannot inherit this worker's nonce and their private
          // environments need not be readable by this contributor account.
          if (!uid || ![Number(uid[1]), Number(uid[2])].includes(process.getuid())) continue;
          identity = processIdentity(id, remaining());
          // Processes that predate the supervisor cannot inherit its worker marker.
          if (identity === undefined || BigInt(identity) < supervisorStart) continue;

          marked = syncFs
            .readFileSync('/proc/' + id + '/environ', 'utf8')
            .split('\0')
            .includes(marker);
        } else {
          marked = command.split(/\s+/).includes(marker);
          if (marked) identity = processIdentity(id, remaining());
        }

        if (marked && identity !== undefined && processIdentity(id, remaining()) === identity) {
          owned.add(id);
          groups.add(group);
        }
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
      }
    }

    try {
      for (const line of require('node:fs').readFileSync(registry, 'utf8').trim().split('\n').filter(Boolean)) {
        const record = JSON.parse(line);

        if (processIdentity(record.pid, remaining()) === record.identity) owned.add(record.pid);
      }
    } catch (error) {
      errors.push(error);
    }

    for (const [id, , group] of rows) if (owned.has(id)) groups.add(group);
    let changed = true;

    while (changed) {
      changed = false;
      for (const [id, parent, group] of rows)
        if (owned.has(parent) && !owned.has(id)) {
          owned.add(id);
          groups.add(group);
          changed = true;
        }
    }
  } catch (error) {
    errors.push(error);
  }

  groups.delete(ownGroup);

  for (const group of [...groups].reverse()) if (group > 0) signal(group, 'SIGKILL');

  return errors;
}

export async function runBrowserWorker(
  args,
  { cwd = process.cwd(), env = process.env, timeoutMs = 180000, onStdout, onStderr } = {}
) {
  browserDeadline(timeoutMs);
  if (!Array.isArray(args) || !args.every((value) => typeof value === 'string'))
    throw new TypeError('Browser worker arguments must be strings.');
  const windows = process.platform === 'win32';
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'go-defaults-browser-processes-'));
  let result, failure;

  try {
    result = await superviseBrowserWorker(args, { cwd, env, timeoutMs, onStdout, onStderr }, temporary, windows);
  } catch (error) {
    failure = { error };
  }

  try {
    await fs.rm(temporary, { recursive: true, force: true });
  } catch (error) {
    if (failure)
      throw new AggregateError([failure.error, error], 'Browser verification and process-record cleanup failed.', {
        cause: error
      });
    throw error;
  }

  if (failure) throw failure.error;

  return result;
}

async function superviseBrowserWorker(args, { cwd, env, timeoutMs, onStdout, onStderr }, temporary, windows) {
  const registry = windows ? undefined : path.join(temporary, 'processes.jsonl');
  const owner = windows ? undefined : randomUUID();
  const ready = windows ? path.join(temporary, 'job.ready') : undefined;

  if (registry) {
    await fs.writeFile(registry, '');
    const preload = fileURLToPath(new URL('./browser-processes.cjs', import.meta.url));

    env = {
      ...env,
      GO_DEFAULTS_BROWSER_PROCESS_FILE: registry,
      GO_DEFAULTS_BROWSER_PROCESS_OWNER: owner,
      NODE_OPTIONS: ['--require ' + JSON.stringify(preload), env.NODE_OPTIONS].filter(Boolean).join(' ')
    };
  }

  const command = windows
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
    : process.execPath;
  const commandArgs = windows
    ? [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-InputFormat',
        'Text',
        '-OutputFormat',
        'Text',
        '-EncodedCommand',
        Buffer.from(windowsOwner, 'utf16le').toString('base64')
      ]
    : args;
  const child = spawn(command, commandArgs, {
    cwd,
    env,
    windowsHide: true,
    detached: !windows,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let stdout = '',
    stderr = '',
    bytes = 0,
    failure,
    stopping = false,
    closed = false,
    grace;
  const cleanupErrors = [];
  let resolveClose;
  const completion = new Promise((resolve) => (resolveClose = resolve));

  function stop() {
    if (stopping) {
      return;
    }

    stopping = true;
    if (child.pid) {
      if (windows) {
        if (child.exitCode === null && child.signalCode === null) {
          try {
            if (require('node:fs').existsSync(ready)) {
              if (!child.kill('SIGKILL')) cleanupErrors.push(new Error('Browser owner could not be terminated.'));
            } else {
              // Cover helper/compiler startup before the native job is established.
              const killed = spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 2000
              });

              if (killed.error || killed.status !== 0) {
                cleanupErrors.push(killed.error || new Error('Browser bootstrap cleanup failed: ' + killed.stderr));
                child.kill('SIGKILL');
              }
            }
          } catch (error) {
            cleanupErrors.push(error);
          }
        }
      } else cleanupErrors.push(...stopUnixTree(child.pid, registry, owner));
    }

    grace = setTimeout(() => {
      if (closed) {
        return;
      }

      cleanupErrors.push(new Error('Browser process cleanup exceeded its deadline.'));
      child.stdout.destroy();
      child.stderr.destroy();
      child.stdin.destroy();
      child.unref();
      resolveClose();
    }, 3000);
  }

  const timer = setTimeout(() => {
    const error = new Error('Browser tests timed out after ' + timeoutMs + ' milliseconds.');

    if (failure) cleanupErrors.push(error);
    else failure = { error };
    stop();
  }, timeoutMs);
  const interrupted = (signal) => {
    failure ??= { error: new Error('Browser verification interrupted by ' + signal + '.') };
    stop();
  };

  const interrupt = () => interrupted('SIGINT'),
    terminate = () => interrupted('SIGTERM');

  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  function output(kind, chunk) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 4 * 1024 * 1024) {
      failure ??= { error: new Error('Browser worker output exceeded 4 MiB.') };
      stop();

      return;
    }

    const text = chunk.toString();

    try {
      if (kind === 'stdout') {
        stdout += text;
        onStdout?.(text);
      } else {
        stderr += text;
        onStderr?.(text);
      }
    } catch (error) {
      failure ??= { error };
      stop();
    }
  }

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => output('stdout', chunk));
  child.stderr.on('data', (chunk) => output('stderr', chunk));
  child.stdin.on('error', (error) => {
    if (!closed) {
      failure ??= { error };
      stop();
    }
  });
  child.once('error', (error) => {
    failure ??= { error };
    stop();
  });
  child.once('exit', (code, signal) => {
    if (code !== 0) failure ??= { error: new Error('Browser worker failed with ' + (signal || 'exit ' + code) + '.') };
    stop();
  });
  child.once('close', () => {
    closed = true;
    resolveClose();
  });
  if (windows)
    child.stdin.end(
      JSON.stringify({
        executable: process.execPath,
        arguments: windowsArguments(args),
        directory: cwd,
        ready,
        ownerPid: process.pid
      }) + '\n'
    );
  else child.stdin.end();
  await completion;
  clearTimeout(timer);
  clearTimeout(grace);
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', terminate);
  let error = failure?.error;

  if (cleanupErrors.length)
    error = new AggregateError(
      [...(failure ? [error] : []), ...cleanupErrors],
      'Browser verification or process cleanup failed.',
      { cause: error }
    );
  if (failure || cleanupErrors.length) {
    if (error && Object.isExtensible(error))
      Object.defineProperties(error, { stdout: { value: stdout }, stderr: { value: stderr } });
    throw error;
  }

  return { stdout, stderr };
}
