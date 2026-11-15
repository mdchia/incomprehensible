// Command line arguments, the small way.
//
//   parseArgs(['6105', '--for', '2m', '--live'])
//     -> { _: ['6105'], for: '2m', live: true }

export function parseArgs(argv = process.argv.slice(2), flags = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const eq = name.indexOf('=');
      if (eq >= 0) out[name.slice(0, eq)] = name.slice(eq + 1);
      else if (flags.includes(name) || i + 1 >= argv.length || (argv[i + 1].startsWith('--') && argv[i + 1].length > 2)) out[name] = true;
      else out[name] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

export function fail(message) {
  process.stderr.write(message + '\n');
  process.exit(2);
}

export const kHz = (hz) => (hz / 1000).toFixed(2);
