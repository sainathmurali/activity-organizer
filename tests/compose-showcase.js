import {readFileSync, writeFileSync} from 'node:fs';

const image = name => `data:image/png;base64,${readFileSync(new URL(`../docs/images/${name}.png`, import.meta.url)).toString('base64')}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="800" viewBox="0 0 1920 800">
<defs>
  <linearGradient id="background" x2="0" y2="1"><stop stop-color="#202028"/><stop offset="1" stop-color="#17171e"/></linearGradient>
  <linearGradient id="accent"><stop stop-color="#9958dc"/><stop offset="1" stop-color="#b28ade"/></linearGradient>
  <clipPath id="left"><rect x="32" y="224" width="864" height="486" rx="20"/></clipPath>
  <clipPath id="right"><rect x="1024" y="224" width="864" height="486" rx="20"/></clipPath>
</defs>
<rect width="1920" height="800" fill="url(#background)"/>
<g font-family="Adwaita Sans, sans-serif" text-anchor="middle" fill="#fff">
  <text x="960" y="96" font-size="68" font-weight="700">Activity Organizer</text>
  <rect x="284" y="144" width="360" height="58" rx="29" fill="url(#accent)"/>
  <rect x="1276" y="144" width="360" height="58" rx="29" fill="url(#accent)"/>
  <text x="464" y="183" font-size="32" font-weight="650">Default Activities</text>
  <text x="1456" y="183" font-size="32" font-weight="650">Organized by app</text>
</g>
<image href="${image('default-activities')}" x="32" y="224" width="864" height="486" clip-path="url(#left)"/>
<image href="${image('organized-activities')}" x="1024" y="224" width="864" height="486" clip-path="url(#right)"/>
<g fill="none" stroke="#ac79df" stroke-width="3">
  <rect x="32" y="224" width="864" height="486" rx="20"/>
  <rect x="1024" y="224" width="864" height="486" rx="20"/>
</g>
<path d="M938 467h44m-16-16 16 16-16 16" fill="none" stroke="#b47ee9" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
writeFileSync(new URL('../docs/images/showcase.svg', import.meta.url), svg);
