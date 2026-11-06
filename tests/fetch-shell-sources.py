"""Fetch the official versioned sources used by check:compat into /tmp."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess

root = Path('/tmp/activity-organizer-shell-sources')
files = ['js/ui/workspace.js', 'js/ui/windowPreview.js', 'js/ui/modalDialog.js',
         'js/ui/popupMenu.js', 'js/extensions/extension.js']


def fetch(item):
    version, name = item
    url = f'https://raw.githubusercontent.com/GNOME/gnome-shell/refs/heads/gnome-{version}/{name}'
    path = root / str(version) / Path(name).name
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['curl', '--fail', '--silent', '--show-error', '--retry', '3',
                    '--retry-all-errors', '--max-time', '40', '--location', url,
                    '--output', str(path)], check=True)


with ThreadPoolExecutor(max_workers=5) as pool:
    list(pool.map(fetch, [(version, name) for version in range(46, 51) for name in files]))
print(f'Official Shell 46–50 sources saved under {root}')
