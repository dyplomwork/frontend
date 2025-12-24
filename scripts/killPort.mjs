#!/usr/bin/env node
/*
  Cross-platform helper to free a TCP port before starting dev servers.
  Usage: node scripts/killPort.mjs 3001

  Windows  : netstat -> taskkill
  macOS/Linux: lsof -> kill

  Never exits with non-zero (so dev doesn't break if nothing to kill).
*/

import { execSync } from 'node:child_process'

const port = Number(process.argv[2])
if (!Number.isFinite(port) || port <= 0) {
  console.warn('[killPort] No valid port provided; skipping')
  process.exit(0)
}

const isWindows = process.platform === 'win32'

function run(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))]
}

try {
  if (isWindows) {
    // Example line: TCP    0.0.0.0:3001 ... ...  1234
    const out = run(`netstat -ano | findstr :${port}`)
    const pids = unique(
      out
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/).pop())
        .filter((pid) => /^\d+$/.test(pid))
    )

    if (!pids.length) process.exit(0)

    for (const pid of pids) {
      try {
        run(`taskkill /PID ${pid} /F`)
        console.log(`[killPort] Killed PID ${pid} on port ${port}`)
      } catch {
        // ignore
      }
    }
    process.exit(0)
  }

  // macOS/Linux
  let pids = []
  try {
    const out = run(`lsof -ti tcp:${port} || true`)
    pids = unique(out.split(/\r?\n/).map((x) => x.trim()))
  } catch {
    pids = []
  }

  if (!pids.length) process.exit(0)

  for (const pid of pids) {
    try {
      run(`kill -9 ${pid}`)
      console.log(`[killPort] Killed PID ${pid} on port ${port}`)
    } catch {
      // ignore
    }
  }
} catch (e) {
  console.warn(`[killPort] Could not free port ${port}:`, e?.message || e)
}

process.exit(0)
