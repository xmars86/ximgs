import { spawn } from 'node:child_process'

const child = spawn('pnpm', ['exec', 'electron-vite', 'dev'], {
  stdio: 'inherit',
  shell: true
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
