#!/usr/bin/env python
"""Extract and pretty-print a TESTRESULT= / BOOTTRAP= / PROBE= / FOCUS= JSON blob
from a Chrome --dump-dom output file. Avoids PowerShell encoding traps.

Usage: parse-test-result.py <dump-dom.html> [marker] [out.json]
"""
import html
import json
import re
import sys

path = sys.argv[1]
marker = sys.argv[2] if len(sys.argv) > 2 else 'TESTRESULT'
out_path = sys.argv[3] if len(sys.argv) > 3 else None

with open(path, 'r', encoding='utf-8', errors='replace') as fh:
    raw = fh.read()

# Match the marker followed by real JSON. The harness's own inline source also
# contains the literal marker string, so requiring a JSON opener avoids matching
# the script text instead of the result.
patterns = [
    # Prefer the <pre> payload. The harness's own inline source contains the
    # literal marker text, so anchor on the shape of the real payload.
    r'<pre[^>]*>\s*' + re.escape(marker) + r'=(\{"total".*?\})\s*</pre>',
    r'<pre[^>]*>\s*' + re.escape(marker) + r'=(\[\{.*?\}\])\s*</pre>',
    r'<pre[^>]*>\s*' + re.escape(marker) + r'=(\{.*?\})\s*</pre>',
    # Fallback: the harness mirrors the payload into <title>.
    r'<title>' + re.escape(marker) + r'=(\{"total".*?\})</title>',
    r'<title>' + re.escape(marker) + r'=(\{.*?\}|\[.*?\])</title>',
]
match = None
for pattern in patterns:
    match = re.search(pattern, raw, re.S)
    if match:
        break
if not match:
    # Helpful diagnostics instead of a bare failure.
    print('marker %s not found in %s' % (marker, path))
    for probe in ('test-result', 'BOOTTRAP=', 'PROBE=', 'FOCUS=', 'TESTRESULT='):
        print('  contains %-14s %s' % (probe, probe in raw))
    print('  file size: %d bytes' % len(raw))
    sys.exit(1)

data = json.loads(html.unescape(match.group(1)))

if marker == 'TESTRESULT':
    total = data.get('total', 0)
    failed = data.get('failed', 0)
    lines = ['TOTAL %d   PASSED %d   FAILED %d' % (total, total - failed, failed), '--- FAILURES ---']
    bad = [r for r in data.get('results', []) if not r.get('pass')]
    if bad:
        for item in bad:
            lines.append('FAIL  %s\n        -> %s' % (item['name'], item.get('detail', '')))
    else:
        lines.append('NONE')
    lines.append('--- RUNTIME ERRORS ---')
    errs = data.get('errors') or []
    lines.append('\n'.join(errs) if errs else 'NONE')
    text = '\n'.join(lines)
else:
    text = json.dumps(data, ensure_ascii=False, indent=2)

# Write UTF-8 to a file when asked, so consoles with a legacy code page cannot
# mangle the Chinese strings.
if out_path:
    with open(out_path, 'w', encoding='utf-8') as fh:
        fh.write(text + '\n')
    print('wrote %s (%d chars)' % (out_path, len(text)))
else:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    print(text)
